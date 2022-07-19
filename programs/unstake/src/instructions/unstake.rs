use anchor_lang::{prelude::*, solana_program::stake::state::StakeAuthorize, system_program};
use anchor_spl::stake::{self, Authorize, Stake, StakeAccount};

use crate::{
    anchor_len::AnchorLen,
    errors::UnstakeError,
    state::{Fee, Pool, StakeAccountRecord, FEE_SEED_SUFFIX},
};

#[derive(Accounts)]
pub struct Unstake<'info> {
    /// pubkey paying for a new StakeAccountRecord account's rent
    #[account(mut)]
    pub payer: Signer<'info>,

    /// stake account owner
    pub unstaker: Signer<'info>,

    /// stake account to be unstaked
    /// rely on stake program CPI call to ensure owned by unstaker
    #[account(
        mut,
        // this also checks that a stake account is either
        // Initialized or Stake
        // NOTE: https://github.com/igneous-labs/unstake/issues/63
        //  - if lockup is not in force then the custodian cannot do anything
        //  - since the instruction updates both staker and withdrawer, lockup
        //    cannot be updated by the custodian or unstaker after the instruction
        //    resolves
        constraint = !stake_account.lockup()
            .ok_or(UnstakeError::StakeAccountLockupNotRetrievable)?
            .is_in_force(&clock, None)
            @ UnstakeError::StakeAccountLockupInForce,
    )]
    pub stake_account: Account<'info, StakeAccount>,

    /// Solana native wallet pubkey to receive the unstaked amount
    #[account(mut)]
    pub destination: SystemAccount<'info>,

    /// pool account that SOL reserves belong to
    #[account(mut)]
    pub pool_account: Account<'info, Pool>,

    /// pool's SOL reserves
    #[account(
        mut,
        seeds = [&pool_account.key().to_bytes()],
        bump,
    )]
    pub pool_sol_reserves: SystemAccount<'info>,

    /// pool's fee account
    #[account(
        seeds = [&pool_account.key().to_bytes(), FEE_SEED_SUFFIX],
        bump,
    )]
    pub fee_account: Account<'info, Fee>,

    /// stake account record to be created
    #[account(
        init,
        payer = payer,
        space = StakeAccountRecord::LEN,
        seeds = [&pool_account.key().to_bytes(), &stake_account.key().to_bytes()],
        bump,
    )]
    pub stake_account_record_account: Account<'info, StakeAccountRecord>,

    pub clock: Sysvar<'info, Clock>,
    pub stake_program: Program<'info, Stake>,
    pub system_program: Program<'info, System>,
}

impl<'info> Unstake<'info> {
    #[inline(always)]
    pub fn run(ctx: Context<Self>) -> Result<()> {
        let unstaker = &ctx.accounts.unstaker;
        let stake_account = &mut ctx.accounts.stake_account;
        let destination = &ctx.accounts.destination;
        let pool_account = &mut ctx.accounts.pool_account;
        let pool_sol_reserves = &ctx.accounts.pool_sol_reserves;
        let fee_account = &ctx.accounts.fee_account;
        let stake_account_record_account = &mut ctx.accounts.stake_account_record_account;
        let clock = &ctx.accounts.clock;
        let stake_program = &ctx.accounts.stake_program;
        let system_program = &ctx.accounts.system_program;

        let stake_account_lamports = stake_account.to_account_info().lamports();
        let pool_sol_reserves_lamports = pool_sol_reserves.lamports();

        // authorize pool_sol_reserves as staker and withdrawer of the stake_account
        stake::authorize(
            CpiContext::new(
                stake_program.to_account_info(),
                Authorize {
                    stake: stake_account.to_account_info(),
                    authorized: unstaker.to_account_info(),
                    new_authorized: pool_sol_reserves.to_account_info(),
                    clock: clock.to_account_info(),
                },
            ),
            StakeAuthorize::Staker,
            None, // custodian
        )?;
        stake::authorize(
            CpiContext::new(
                stake_program.to_account_info(),
                Authorize {
                    stake: stake_account.to_account_info(),
                    authorized: unstaker.to_account_info(),
                    new_authorized: pool_sol_reserves.to_account_info(),
                    clock: clock.to_account_info(),
                },
            ),
            StakeAuthorize::Withdrawer,
            None, // custodian
        )?;

        let fee_lamports = fee_account
            .apply(
                pool_account.incoming_stake,
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
            from: pool_sol_reserves.to_account_info(),
            to: destination.to_account_info(),
        };
        let seeds: &[&[u8]] = &[
            &pool_account.key().to_bytes(),
            &[*ctx
                .bumps
                .get("pool_sol_reserves")
                .ok_or(UnstakeError::PdaBumpNotCached)?],
        ];

        system_program::transfer(
            CpiContext::new_with_signer(
                system_program.to_account_info(),
                transfer_cpi_accs,
                &[seeds],
            ),
            lamports_to_transfer,
        )?;

        // populate the stake_account_record
        stake_account_record_account.lamports_at_creation = stake_account_lamports;

        // update pool_account incoming_stake
        pool_account.incoming_stake = pool_account
            .incoming_stake
            .checked_add(stake_account_lamports)
            .ok_or(UnstakeError::InternalError)?;

        // emit analytics log
        let (voter_pubkey, activation_epoch) = stake_account.delegation().map_or_else(
            || (String::from(""), String::from("")),
            |delegation| {
                (
                    delegation.voter_pubkey.to_string(),
                    delegation.activation_epoch.to_string(),
                )
            },
        );
        // log format:
        //  "unstake-log: (instruction; unstaker; stake_account_lamports; stake_account_voter_pubkey; stake_account_activation_epoch; lamports_paid; fee_type; fee_amount)"
        msg!(
            "unstake-log: (0; {}; {}; {}; {}; {}; {:?}; {})",
            unstaker.key(),
            stake_account_lamports,
            voter_pubkey,
            activation_epoch,
            lamports_to_transfer,
            fee_account.fee,
            fee_lamports,
        );

        Ok(())
    }
}
