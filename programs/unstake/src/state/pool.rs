use anchor_lang::prelude::*;

#[account]
#[derive(Debug)]
pub struct Pool {
    /// The authority authorized to set fees
    pub fee_authority: Pubkey,

    /// The pool's lp token mint
    pub lp_mint: Pubkey,

    /// The last known value of total number of lamports in stake accounts
    /// owned by the pool that have not been reclaimed yet.
    /// The total SOL owned by a pool accounted for can be calculated by taking
    /// incoming_stake + pool_sol_reserves.lamports
    pub incoming_stake: u64,
}
