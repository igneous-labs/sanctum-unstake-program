use anchor_lang::{prelude::*, solana_program::sysvar::SysvarId};
use anchor_spl::stake::{self, DeactivateStake, Stake, StakeAccount};

use crate::consts::STAKE_AUTHORITY_SEED;
//use crate::errors::UnstakeError;

#[derive(Accounts)]
pub struct DeactivateStakeAccount<'info> {
    /// The stake account to be deactivated
    #[account(
        mut,
        // TODO: check stake state and authority @ { WrongState, Unauthorized }
        // TODO: should we add utility function to anchor-spl::stake?
    )]
    pub stake_account: Account<'info, StakeAccount>,

    // TODO
    // - unstake ix sets it
    // - TBD how many authorities do we need? Just single one for every stake account? Per pool (then we need to accept pool acc)?
    ///
    /// CHECK: this will be retyped
    #[account(
        seeds = [STAKE_AUTHORITY_SEED],
        bump,
    )]
    pub stake_authority: UncheckedAccount<'info>,

    #[account(
        // TODO: Do we need a check here? A new Error?
        constraint = Clock::check_id(clock.key),
    )]
    /// CHECK: need to check this
    pub clock: UncheckedAccount<'info>,
    pub stake_program: Program<'info, Stake>,
}

impl<'info> DeactivateStakeAccount<'info> {
    #[inline(always)]
    pub fn run(ctx: Context<Self>) -> Result<()> {
        let stake_account = &mut ctx.accounts.stake_account;
        let stake_authority = &ctx.accounts.stake_authority;
        let stake_program = &ctx.accounts.stake_program;
        let clock = &ctx.accounts.clock;

        // cpi to deactivate stake
        let deactivate_cpi_accs = DeactivateStake {
            stake: stake_account.to_account_info(),
            staker: stake_authority.to_account_info(),
            clock: clock.to_account_info(),
        };

        // TODO: the actual seeds TBD
        let seeds: &[&[u8]] = &[STAKE_AUTHORITY_SEED];

        stake::deactivate_stake(CpiContext::new_with_signer(
            stake_program.to_account_info(),
            deactivate_cpi_accs,
            &[seeds],
        ))
    }
}
