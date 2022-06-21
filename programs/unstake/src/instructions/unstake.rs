use anchor_lang::{prelude::*, solana_program::stake::state::StakeAuthorize, system_program};
use anchor_spl::stake::{self, Authorize, Stake, StakeAccount};
use std::collections::HashSet;

use crate::{
    anchor_len::AnchorLen,
    errors::UnstakeError,
    state::{Pool, StakeAccountRecord},
};

#[derive(Accounts)]
pub struct Unstake<'info> {
    /// stake account owner
    #[account(mut)]
    pub unstaker: Signer<'info>,

    /// stake account to be unstaked
    #[account(
        mut,
        // TODO: constraint -> must be owned by the unstaker
        // TODO: constraint -> must not be locked (Deligated or Initialized)
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

    /// stake account record to be created
    #[account(
        init,
        payer = unstaker,
        space = StakeAccountRecord::LEN,
        seeds = [&pool_account.key().to_bytes(), &stake_account.key().to_bytes()],
        bump,
    )]
    pub stake_account_record: Account<'info, StakeAccountRecord>,

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
        let stake_account_record = &mut ctx.accounts.stake_account_record;
        let clock = &ctx.accounts.clock;
        let stake_program = &ctx.accounts.stake_program;
        let system_program = &ctx.accounts.system_program;

        let authorized = stake_account
            .authorized()
            .ok_or(UnstakeError::StakeAccountAuthorizedNotRetrievable)?;
        // NOTE: check for withdrawer authority only since withdrawer can change both
        authorized
            .check(&HashSet::from([unstaker.key()]), StakeAuthorize::Withdrawer)
            .map_err(|_| UnstakeError::StakeAccountNotOwned)?;

        // cpi to stake::Authorize
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

        let lamports = stake_account.to_account_info().lamports();

        // pay out from the pool reserves
        // TODO: fee collection
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
            lamports,
        )
        .map_err(|_| UnstakeError::NotEnoughLiquidity)?;

        // populate the stake_account_record
        stake_account_record.lamports_at_creation = lamports;

        // update pool_account
        pool_account.owned_lamports += lamports;

        Ok(())
    }
}
