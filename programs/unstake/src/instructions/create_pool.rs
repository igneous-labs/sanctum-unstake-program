use anchor_lang::prelude::*;

use crate::{anchor_len::AnchorLen, state::Fee};

#[derive(Accounts)]
#[instruction(fee: Fee)]
pub struct CreatePool<'info> {
    /// pubkey paying for new accounts' rent
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = Fee::LEN,
    )]
    pub fee_account: Account<'info, Fee>,

    pub system_program: Program<'info, System>,
}

impl<'info> CreatePool<'info> {
    #[inline(always)]
    pub fn run(&mut self, fee: Fee) -> Result<()> {
        self.fee_account.set_inner(fee);
        msg!("{:?}", self.fee_account.fee);
        Ok(())
    }
}
