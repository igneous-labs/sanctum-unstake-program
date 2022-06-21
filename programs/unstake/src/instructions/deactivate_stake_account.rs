use anchor_lang::{prelude::*, solana_program::sysvar::SysvarId};
use anchor_spl::stake::{self, DeactivateStake, Stake, StakeAccount};

//use crate::errors::UnstakeError;
use crate::state::Pool;

#[derive(Accounts)]
pub struct DeactivateStakeAccount<'info> {
    /// The stake account to be deactivated
    #[account(
        mut,
        // TODO: check stake state and authority @ { WrongState, Unauthorized }
        // TODO: should we add utility function to anchor-spl::stake?
    )]
    pub stake_account: Account<'info, StakeAccount>,

    /// pool that SOL liquidity is being added to
    pub pool_account: Account<'info, Pool>,

    /// pool's SOL reserves
    #[account(
        mut,
        seeds = [&pool_account.key().to_bytes()],
        bump,
    )]
    pub pool_sol_reserves: SystemAccount<'info>,

    pub clock: Sysvar<'info, Clock>,
    pub stake_program: Program<'info, Stake>,
}

impl<'info> DeactivateStakeAccount<'info> {
    #[inline(always)]
    pub fn run(ctx: Context<Self>) -> Result<()> {
        let stake_account = &mut ctx.accounts.stake_account;
        let pool_account = &ctx.accounts.pool_account;
        let pool_sol_reserves = &ctx.accounts.pool_sol_reserves;
        let stake_program = &ctx.accounts.stake_program;
        let clock = &ctx.accounts.clock;

        // cpi to deactivate stake
        let deactivate_cpi_accs = DeactivateStake {
            stake: stake_account.to_account_info(),
            staker: pool_sol_reserves.to_account_info(),
            clock: clock.to_account_info(),
        };

        let seeds: &[&[u8]] = &[
            &pool_account.key().to_bytes(),
            &[*ctx
                .bumps
                .get("pool_sol_reserves")
                .ok_or(UnstakeError::PdaBumpNotCached)?],
        ];

        stake::deactivate_stake(CpiContext::new_with_signer(
            stake_program.to_account_info(),
            deactivate_cpi_accs,
            &[seeds],
        ))
    }
}
