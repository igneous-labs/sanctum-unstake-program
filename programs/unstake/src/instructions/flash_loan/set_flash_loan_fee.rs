use anchor_lang::prelude::*;

use crate::{
    anchor_len::AnchorLen,
    errors::UnstakeError,
    state::{FlashLoanFee, Pool, FLASH_LOAN_FEE_SEED_SUFFIX},
};

#[derive(Accounts)]
pub struct SetFlashLoanFee<'info> {
    /// pubkey paying for new accounts' rent
    #[account(mut)]
    pub payer: Signer<'info>,

    /// pool's fee_authority
    pub fee_authority: Signer<'info>,

    /// pool account for the fee account
    #[account(
        has_one = fee_authority @ UnstakeError::InvalidFeeAuthority
    )]
    pub pool_account: Account<'info, Pool>,

    /// flash loan fee account to initialize
    #[account(
        init_if_needed,
        payer = payer,
        space = FlashLoanFee::LEN,
        seeds = [&pool_account.key().to_bytes(), FLASH_LOAN_FEE_SEED_SUFFIX],
        bump,
    )]
    pub flash_loan_fee_account: Account<'info, FlashLoanFee>,

    pub system_program: Program<'info, System>,
}

impl<'info> SetFlashLoanFee<'info> {
    #[inline(always)]
    pub fn validate(flash_loan_fee: &FlashLoanFee) -> Result<()> {
        flash_loan_fee.validate()
    }

    #[inline(always)]
    pub fn run(ctx: Context<Self>, flash_loan_fee: FlashLoanFee) -> Result<()> {
        let flash_loan_fee_account = &mut ctx.accounts.flash_loan_fee_account;

        flash_loan_fee_account.set_inner(flash_loan_fee);
        Ok(())
    }
}
