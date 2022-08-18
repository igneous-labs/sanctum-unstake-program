use anchor_lang::{prelude::*, solana_program::stake::state::StakeAuthorize, system_program};
use anchor_spl::stake::{self, Authorize, Stake, StakeAccount};

use crate::{
    errors::UnstakeError,
    state::{Fee, Pool, StakeAccountRecord},
};

pub struct UnstakeResult {
    pub stake_account_lamports: u64,
    pub lamports_to_transfer: u64,
    pub fee_lamports: u64,
}

pub trait UnstakeAccounts<'info>
where
    Self: Sized,
{
    const LOG_IX_TAG: u8;

    fn destination_account_info(&self) -> AccountInfo<'info>;

    fn unstaker(&self) -> &Signer<'info>;

    fn stake_account(&self) -> &Account<'info, StakeAccount>;

    fn pool_account(&mut self) -> &mut Account<'info, Pool>;

    fn pool_sol_reserves(&self) -> &SystemAccount<'info>;

    fn fee_account(&self) -> &Account<'info, Fee>;

    fn stake_account_record_account(&mut self) -> &mut Account<'info, StakeAccountRecord>;

    fn clock(&self) -> &Sysvar<'info, Clock>;

    fn stake_program(&self) -> &Program<'info, Stake>;

    fn system_program(&self) -> &Program<'info, System>;

    fn run_unstake(ctx: &mut Context<Self>) -> Result<UnstakeResult> {
        let stake_account_lamports = ctx.accounts.stake_account().to_account_info().lamports();
        let pool_sol_reserves_lamports = ctx.accounts.pool_sol_reserves().lamports();

        // authorize pool_sol_reserves as staker and withdrawer of the stake_account
        stake::authorize(
            CpiContext::new(
                ctx.accounts.stake_program().to_account_info(),
                Authorize {
                    stake: ctx.accounts.stake_account().to_account_info(),
                    authorized: ctx.accounts.unstaker().to_account_info(),
                    new_authorized: ctx.accounts.pool_sol_reserves().to_account_info(),
                    clock: ctx.accounts.clock().to_account_info(),
                },
            ),
            StakeAuthorize::Staker,
            None, // custodian
        )?;
        stake::authorize(
            CpiContext::new(
                ctx.accounts.stake_program().to_account_info(),
                Authorize {
                    stake: ctx.accounts.stake_account().to_account_info(),
                    authorized: ctx.accounts.unstaker().to_account_info(),
                    new_authorized: ctx.accounts.pool_sol_reserves().to_account_info(),
                    clock: ctx.accounts.clock().to_account_info(),
                },
            ),
            StakeAuthorize::Withdrawer,
            None, // custodian
        )?;

        let incoming_stake = ctx.accounts.pool_account().incoming_stake;
        let fee_lamports = ctx
            .accounts
            .fee_account()
            .apply(
                incoming_stake,
                pool_sol_reserves_lamports,
                stake_account_lamports,
            )
            .ok_or(UnstakeError::InternalError)?;
        let lamports_to_transfer = stake_account_lamports
            .checked_sub(fee_lamports)
            .ok_or(UnstakeError::InternalError)?;

        if lamports_to_transfer > pool_sol_reserves_lamports {
            return Err(UnstakeError::NotEnoughLiquidity.into());
        }

        // pay the unstaker from the pool reserves
        // NOTE: rely on CPI call as the constraint
        let transfer_cpi_accs = system_program::Transfer {
            from: ctx.accounts.pool_sol_reserves().to_account_info(),
            to: ctx.accounts.destination_account_info(),
        };
        let seeds: &[&[u8]] = &[
            &ctx.accounts.pool_account().key().to_bytes(),
            &[*ctx
                .bumps
                .get("pool_sol_reserves")
                .ok_or(UnstakeError::PdaBumpNotCached)?],
        ];
        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program().to_account_info(),
                transfer_cpi_accs,
                &[seeds],
            ),
            lamports_to_transfer,
        )?;

        // populate the stake_account_record
        ctx.accounts
            .stake_account_record_account()
            .lamports_at_creation = stake_account_lamports;

        // update pool_account incoming_stake
        ctx.accounts.pool_account().incoming_stake = ctx
            .accounts
            .pool_account()
            .incoming_stake
            .checked_add(stake_account_lamports)
            .ok_or(UnstakeError::InternalError)?;

        Ok(UnstakeResult {
            stake_account_lamports,
            lamports_to_transfer,
            fee_lamports,
        })
    }

    fn log_successful_unstake(ctx: &Context<Self>, unstake_result: UnstakeResult) {
        // emit analytics log
        let (voter_pubkey, activation_epoch) =
            ctx.accounts.stake_account().delegation().map_or_else(
                || (String::from(""), String::from("")),
                |delegation| {
                    (
                        delegation.voter_pubkey.to_string(),
                        delegation.activation_epoch.to_string(),
                    )
                },
            );

        // Log Format:
        //  "unstake-log: [instruction, unstaker, stake_account_address, stake_account_voter, stake_account_activation_epoch, FEE, recorded_lamports, paid_lamports, fee_lamports]"
        //
        // Fee Format (see SPEC.md or fee.rs for details):
        //  "[fee_type; FEE_DETAILS]"
        msg!(
            "unstake-log: [{}, {}, {}, {}, {}, {}, {}, {}, {}]",
            Self::LOG_IX_TAG,
            ctx.accounts.unstaker().key(),
            ctx.accounts.stake_account().key(),
            voter_pubkey,
            activation_epoch,
            ctx.accounts.fee_account().fee,
            unstake_result.stake_account_lamports,
            unstake_result.lamports_to_transfer,
            unstake_result.fee_lamports,
        );
    }
}

macro_rules! impl_unstake_accounts {
    ($struct: ident, $log_ix_tag: expr) => {
        impl<'info>
            crate::instructions::unstake_instructions::unstake_accounts::UnstakeAccounts<'info>
            for $struct<'info>
        {
            const LOG_IX_TAG: u8 = $log_ix_tag;

            fn destination_account_info(&self) -> anchor_lang::prelude::AccountInfo<'info> {
                self.destination.to_account_info()
            }

            fn unstaker(&self) -> &anchor_lang::prelude::Signer<'info> {
                &self.unstaker
            }

            fn stake_account(
                &self,
            ) -> &anchor_lang::prelude::Account<'info, anchor_spl::stake::StakeAccount> {
                &self.stake_account
            }

            fn pool_account(
                &mut self,
            ) -> &mut anchor_lang::prelude::Account<'info, crate::state::Pool> {
                &mut self.pool_account
            }

            fn pool_sol_reserves(&self) -> &anchor_lang::prelude::SystemAccount<'info> {
                &self.pool_sol_reserves
            }

            fn fee_account(&self) -> &anchor_lang::prelude::Account<'info, crate::state::Fee> {
                &self.fee_account
            }

            fn stake_account_record_account(
                &mut self,
            ) -> &mut anchor_lang::prelude::Account<'info, crate::state::StakeAccountRecord> {
                &mut self.stake_account_record_account
            }

            fn clock(&self) -> &anchor_lang::prelude::Sysvar<'info, anchor_lang::prelude::Clock> {
                &self.clock
            }

            fn stake_program(
                &self,
            ) -> &anchor_lang::prelude::Program<'info, anchor_spl::stake::Stake> {
                &self.stake_program
            }

            fn system_program(
                &self,
            ) -> &anchor_lang::prelude::Program<'info, anchor_lang::prelude::System> {
                &self.system_program
            }
        }
    };
}
