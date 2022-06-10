use anchor_lang::prelude::*;

use crate::state::Pool;

#[derive(Accounts)]
pub struct Unstake<'info> {
    pub unstaker: Signer<'info>,
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        // TODO: constraint -> must be owned by the unstaker
        // TODO: constraint -> must not be locked
    )]
    pub stake_account: Account<'info, StakeAccount>,
    pub system_program: Program<'info, System>,
}

// This is just a placeholder
// TODO: resolve this by either
//  - research how to add account struct from a non-anchor program
//  - check and follow the stake-pool program (where they marked the ported code as "copid from stake program")
#[account]
pub struct StakeAccount;

impl<'info> Unstake<'info> {
    const _SIMPLE_FLAT_FEE: u64 = 1_000_000_000;

    #[inline(always)]
    pub fn run(_ctx: Context<Self>) -> Result<()> {
        Ok(())
    }
}
