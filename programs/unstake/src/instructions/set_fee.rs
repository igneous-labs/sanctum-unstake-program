use anchor_lang::prelude::*;

use crate::{
    errors::UnstakeError,
    state::{Fee, Pool, FEE_SEED_SUFFIX},
};

#[derive(Accounts)]
pub struct SetFee<'info> {
    /// pool's fee_authority
    pub fee_authority: Signer<'info>,

    /// pool account for the fee account
    #[account(
        has_one = fee_authority @ UnstakeError::InvalidFeeAuthority
    )]
    pub pool_account: Account<'info, Pool>,

    /// fee account to be modified
    #[account(
        mut,
        seeds = [&pool_account.key().to_bytes(), FEE_SEED_SUFFIX],
        bump,
    )]
    pub fee_account: Account<'info, Fee>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

impl<'info> SetFee<'info> {
    #[inline(always)]
    pub fn validate(fee: &Fee) -> Result<()> {
        fee.validate()
    }

    #[inline(always)]
    pub fn run(ctx: Context<Self>, fee: Fee) -> Result<()> {
        let fee_account = &mut ctx.accounts.fee_account;

        fee_account.set_inner(fee);
        Ok(())
    }
}
