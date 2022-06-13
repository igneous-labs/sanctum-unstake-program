use anchor_lang::prelude::*;
use anchor_spl::stake::StakeAccount;

use crate::anchor_len::AnchorLen;
use crate::state::{Pool, StakeAccountRecord};

#[derive(Accounts)]
pub struct Unstake<'info> {
    ///
    #[account(mut)]
    pub unstaker: Signer<'info>,

    ///
    pub pool: Account<'info, Pool>,

    ///
    #[account(
        mut,
        // TODO: constraint -> must be owned by the unstaker
        // TODO: constraint -> must not be locked (Deligated or Initialized)
    )]
    pub stake_account: Account<'info, StakeAccount>,

    /// (PDA)
    #[account(
        init,
        payer = unstaker,
        space = StakeAccountRecord::LEN,
    )]
    pub stake_account_record: Account<'info, StakeAccountRecord>,

    /// Solana native wallet pubkey to receive the unstaked amount
    /// CHECK: payment destination that can accept sol transfer
    pub destination: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> Unstake<'info> {
    const _SIMPLE_FLAT_FEE: u64 = 1_000_000_000;

    #[inline(always)]
    pub fn run(ctx: Context<Self>) -> Result<()> {
        // access the given stake account data
        let _stake_account = &mut ctx.accounts.stake_account;

        // populate the stake_account_record
        //
        Ok(())
    }

    // TODO: predicate that validates given the state StakeAccount
    pub fn validate_stake_account_state(&self) -> bool {
        true
    }
}
