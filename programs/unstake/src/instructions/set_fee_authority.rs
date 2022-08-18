use anchor_lang::prelude::*;

use crate::{errors::UnstakeError, state::Pool};

#[derive(Accounts)]
pub struct SetFeeAuthority<'info> {
    /// pool's current fee_authority
    pub fee_authority: Signer<'info>,

    /// pool account to be modified
    #[account(
        mut,
        has_one = fee_authority @ UnstakeError::InvalidFeeAuthority
    )]
    pub pool_account: Account<'info, Pool>,

    /// new fee_authority to replace the current authority with
    /// CHECK: Double check this account since a mistake here CAN BRICK THE FEE AUTHORITY FOR THE POOL FOREVER.
    pub new_fee_authority: UncheckedAccount<'info>,
}

impl<'info> SetFeeAuthority<'info> {
    #[inline(always)]
    pub fn run(ctx: Context<Self>) -> Result<()> {
        let new_fee_authority = &ctx.accounts.new_fee_authority;
        let pool_account = &mut ctx.accounts.pool_account;

        pool_account.fee_authority = new_fee_authority.key();

        Ok(())
    }
}
