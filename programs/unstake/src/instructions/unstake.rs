use anchor_lang::{prelude::*, solana_program::stake::state::StakeAuthorize, system_program};
use anchor_spl::stake::{self, Authorize, Stake, StakeAccount};
use std::{collections::HashSet, convert::TryFrom};

use crate::{
    anchor_len::AnchorLen,
    errors::UnstakeError,
    rational::Rational,
    state::{Fee, FeeEnum, Pool, StakeAccountRecord, FEE_SEED_SUFFIX},
};

#[derive(Accounts)]
pub struct Unstake<'info> {
    /// stake account owner
    #[account(mut)]
    pub unstaker: Signer<'info>,

    /// stake account to be unstaked
    // Rely on stake program CPI call to verify
    #[account(
        mut,
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
        payer = unstaker,
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

        let fee_ratio = calc_fee_ratio(fee_account);
        let stake_account_lamports = stake_account.to_account_info().lamports();
        let lamports_to_transfer = calc_lamports_to_transfer(stake_account_lamports, fee_ratio)
            .ok_or(UnstakeError::InternalError)?;
        let pool_account_new_lamports = pool_account
            .owned_lamports
            .checked_sub(lamports_to_transfer)
            .and_then(|v| v.checked_add(stake_account_lamports))
            .ok_or(UnstakeError::InternalError)?;

        // pay out from the pool reserves
        // NOTE: rely on CPI call as the contraint
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

        // populate the stake_account_record and update pool_account
        stake_account_record_account.lamports_at_creation = stake_account_lamports;
        pool_account.owned_lamports = pool_account_new_lamports;

        Ok(())
    }
}

// TODO: impl fee selection; this needs to look at both pool_account and requested amount
// just a mock func for now
fn calc_fee_ratio(fee_account: &Fee) -> Rational {
    match fee_account.fee {
        FeeEnum::LiquidityLinear { params } => params.max_liq_remaining,
    }
}

fn calc_lamports_to_transfer(lamports: u64, fee_ratio: Rational) -> Option<u64> {
    let lamports = lamports as u128;
    lamports
        .checked_mul(fee_ratio.num as u128)
        .and_then(|v| v.checked_div(fee_ratio.denom as u128))
        .and_then(|fee| lamports.checked_sub(fee))
        .and_then(|v| u64::try_from(v).ok())
}
