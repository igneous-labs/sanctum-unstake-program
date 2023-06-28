//! TODO

use anchor_lang::{prelude::*, solana_program::sysvar};

use crate::{
    errors::UnstakeError,
    state::{Pool, FLASH_ACCOUNT_SEED_SUFFIX},
};

#[derive(Accounts)]
pub struct TakeFlashLoan<'info> {
    /// pubkey paying for new accounts' rent
    /// CHECK: flash loan lamports will just be transferred here,
    ///        it's the responsibility of the user to ensure this
    ///        is the correct receiver account
    #[account(mut)]
    pub receiver: UncheckedAccount<'info>,

    pub pool_account: Account<'info, Pool>,

    /// pool's SOL reserves
    #[account(
        mut,
        seeds = [&pool_account.key().to_bytes()],
        bump,
    )]
    pub pool_sol_reserves: SystemAccount<'info>,

    /// CHECK: PDA checked
    /// CHECK: init_if_needed of hot potato occurs in ix processor below
    #[account(
        mut,
        seeds = [&pool_account.key().to_bytes(), FLASH_ACCOUNT_SEED_SUFFIX],
        bump,
    )]
    pub flash_account: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,

    /// Solana Instructions Sysvar
    /// CHECK: Checked using address
    #[account(address = sysvar::instructions::ID @ UnstakeError::InvalidInstructionsSysvar)]
    pub instructions: UncheckedAccount<'info>,
}

impl<'info> TakeFlashLoan<'info> {
    #[inline(always)]
    pub fn validate() -> Result<()> {
        Ok(())
    }

    #[inline(always)]
    pub fn run(_ctx: Context<Self>, _lamports: u64) -> Result<()> {
        Ok(())
    }
}
