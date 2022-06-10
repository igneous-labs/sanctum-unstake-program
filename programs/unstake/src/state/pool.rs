use anchor_lang::prelude::*;

#[account]
pub struct Pool {
    /// The authority authorized to set fees
    pub fee_authority: Pubkey,

    /// The total number of lamports owned by the pool
    /// Should be == balance in SOL reserves account + sum of staked_lamports
    /// of all owned staked accounts
    pub owned_lamports: u64,
}
