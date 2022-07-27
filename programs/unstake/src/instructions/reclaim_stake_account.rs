use anchor_lang::prelude::*;
use anchor_spl::stake::{self, Stake, StakeAccount, Withdraw};

use crate::{
    errors::UnstakeError,
    state::{Pool, StakeAccountRecord},
};

#[derive(Accounts)]
pub struct ReclaimStakeAccount<'info> {
    /// The stake account to be reclaimed.
    /// Should be inactive, rely on stake program CPI to verify.
    #[account(mut)]
    pub stake_account: Account<'info, StakeAccount>,

    /// pool that owns stake_account
    #[account(mut)]
    pub pool_account: Account<'info, Pool>,

    /// pool's SOL reserves. SOL will be reclaimed to here.
    #[account(
        mut,
        seeds = [&pool_account.key().to_bytes()],
        bump,
    )]
    pub pool_sol_reserves: SystemAccount<'info>,

    /// stake_account's stake account record
    /// Should have been created by a previous unstake instruction
    #[account(
        mut,
        close = pool_sol_reserves,
        seeds = [&pool_account.key().to_bytes(), &stake_account.key().to_bytes()],
        bump,
    )]
    pub stake_account_record_account: Account<'info, StakeAccountRecord>,

    pub clock: Sysvar<'info, Clock>,
    pub stake_history: Sysvar<'info, StakeHistory>,
    pub stake_program: Program<'info, Stake>,
}

impl<'info> ReclaimStakeAccount<'info> {
    #[inline(always)]
    pub fn run(ctx: Context<Self>) -> Result<()> {
        let stake_account = &mut ctx.accounts.stake_account;
        let pool_account = &mut ctx.accounts.pool_account;
        let pool_sol_reserves = &ctx.accounts.pool_sol_reserves;
        let stake_account_record_account = &ctx.accounts.stake_account_record_account;
        let clock = &ctx.accounts.clock;
        let stake_history = &ctx.accounts.stake_history;
        let stake_program = &ctx.accounts.stake_program;

        // CPI withdraw
        let stake_account_info = stake_account.to_account_info();
        let stake_account_lamports = stake_account_info.lamports();
        let withdraw_cpi_accs = Withdraw {
            stake: stake_account_info,
            withdrawer: pool_sol_reserves.to_account_info(),
            to: pool_sol_reserves.to_account_info(),
            clock: clock.to_account_info(),
            stake_history: stake_history.to_account_info(),
        };
        let seeds: &[&[u8]] = &[
            &pool_account.key().to_bytes(),
            &[*ctx
                .bumps
                .get("pool_sol_reserves")
                .ok_or(UnstakeError::PdaBumpNotCached)?],
        ];
        stake::withdraw(
            CpiContext::new_with_signer(
                stake_program.to_account_info(),
                withdraw_cpi_accs,
                &[seeds],
            ),
            stake_account_lamports,
            None,
        )?;

        // Update incoming_stake
        pool_account.incoming_stake = pool_account
            .incoming_stake
            .checked_sub(stake_account_record_account.lamports_at_creation)
            .ok_or(UnstakeError::InternalError)?;

        // emit analytics log
        // Log Format:
        //  "unstake-log: [instruction, stake_account_address, recorded_lamports, reclaimed_lamports]"
        msg!(
            "unstake-log: [1, {}, {}, {}]",
            stake_account.key(),
            stake_account_record_account.lamports_at_creation,
            stake_account_lamports
        );

        Ok(())
    }
}
