use anchor_lang::prelude::*;

#[account]
pub struct StakeAccountRecord {
    /// The stake account's lamports in the associated stake account
    /// at time of Unstake.
    /// Note: this is the account's total lamports not staked lamports
    /// Solana enforces this to be at least rent exempt balance + 1 lamport
    pub lamports_at_creation: u64,
}
