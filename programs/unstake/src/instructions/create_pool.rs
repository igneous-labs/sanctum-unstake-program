use anchor_lang::prelude::*;

use crate::{
    anchor_len::AnchorLen,
    state::{Fee, Pool, FEE_SEED_SUFFIX},
};

#[derive(Accounts)]
pub struct CreatePool<'info> {
    /// pubkey paying for new accounts' rent
    #[account(mut)]
    pub payer: Signer<'info>,

    /// pool account to be created
    #[account(
        init,
        payer = payer,
        space = Pool::LEN,
    )]
    pub pool_account: Account<'info, Pool>,

    /// fee account to be created
    #[account(
        init,
        payer = payer,
        space = Fee::LEN,
        seeds = [&pool_account.key().to_bytes(), FEE_SEED_SUFFIX],
        bump,
    )]
    pub fee_account: Account<'info, Fee>,

    pub system_program: Program<'info, System>,
}

impl<'info> CreatePool<'info> {
    #[inline(always)]
    pub fn run(ctx: Context<Self>, fee: Fee) -> Result<()> {
        ctx.accounts.fee_account.set_inner(fee);
        msg!("{:?}", ctx.accounts.fee_account.fee);
        Ok(())
    }
}
