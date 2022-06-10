use anchor_lang::prelude::*;

use crate::state::Fee;

#[derive(Accounts)]
#[instruction(fee: Fee)]
pub struct CreatePool<'info> {
    /// pubkey paying for new accounts' rent
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = fee.account_space(),
    )]
    pub fee_account: Account<'info, Fee>,

    pub system_program: Program<'info, System>,
}

impl<'info> CreatePool<'info> {
    #[inline(always)]
    pub fn run(&mut self, fee: Fee) -> Result<()> {
        msg!("{:?}", fee);
        Ok(())
    }
}
