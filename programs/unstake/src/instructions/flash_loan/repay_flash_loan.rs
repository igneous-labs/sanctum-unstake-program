//! TODO

use anchor_lang::prelude::*;

use crate::{
    errors::UnstakeError,
    state::{
        FlashLoanFee, Pool, ProtocolFee, FLASH_ACCOUNT_SEED_SUFFIX, FLASH_LOAN_FEE_SEED_SUFFIX,
        PROTOCOL_FEE_SEED,
    },
};

#[derive(Accounts)]
pub struct RepayFlashLoan<'info> {
    /// system account paying back the flash loan lamports
    #[account(mut)]
    pub repayer: Signer<'info>,

    pub pool_account: Account<'info, Pool>,

    /// pool's SOL reserves
    #[account(
        mut,
        seeds = [&pool_account.key().to_bytes()],
        bump,
    )]
    pub pool_sol_reserves: SystemAccount<'info>,

    /// CHECK: PDA checked
    /// CHECK: checks valid u64 in processor below
    #[account(
        mut,
        seeds = [&pool_account.key().to_bytes(), FLASH_ACCOUNT_SEED_SUFFIX],
        bump,
    )]
    pub flash_account: UncheckedAccount<'info>,

    /// flash loan fee account to initialize
    #[account(
        seeds = [&pool_account.key().to_bytes(), FLASH_LOAN_FEE_SEED_SUFFIX],
        bump,
    )]
    pub flash_loan_fee_account: Account<'info, FlashLoanFee>,

    #[account(
        seeds = [PROTOCOL_FEE_SEED],
        bump,
    )]
    pub protocol_fee_account: Account<'info, ProtocolFee>,

    /// CHECK: address-check checks that its the correct
    /// destination specified in `protocol_fee_account`
    #[account(
        mut,
        address = protocol_fee_account.destination @ UnstakeError::WrongProtocolFeeDestination,
    )]
    pub protocol_fee_destination: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> RepayFlashLoan<'info> {
    #[inline(always)]
    pub fn validate() -> Result<()> {
        Ok(())
    }

    #[inline(always)]
    pub fn run(_ctx: Context<Self>) -> Result<()> {
        Ok(())
    }
}
