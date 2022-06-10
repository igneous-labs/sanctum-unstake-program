use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token};

use crate::{
    anchor_len::AnchorLen,
    consts::SOL_DECIMALS,
    state::{Fee, Pool, FEE_SEED_SUFFIX},
};

#[derive(Accounts)]
pub struct CreatePool<'info> {
    /// pubkey paying for new accounts' rent
    #[account(mut)]
    pub payer: Signer<'info>,

    /// pool's fee_authority
    pub fee_authority: Signer<'info>,

    /// pool account to be created
    #[account(
        init,
        payer = payer,
        space = Pool::LEN,
    )]
    pub pool_account: Account<'info, Pool>,

    /// pool SOL reserves and authority
    #[account(
        seeds = [&pool_account.key().to_bytes()],
        bump,
    )]
    pub pool_sol_reserves: SystemAccount<'info>,

    /// fee account to be created
    #[account(
        init,
        payer = payer,
        space = Fee::LEN,
        seeds = [&pool_account.key().to_bytes(), FEE_SEED_SUFFIX],
        bump,
    )]
    pub fee_account: Account<'info, Fee>,

    /// the LP token mint to be created
    #[account(
        init,
        payer = payer,
        mint::authority = pool_sol_reserves,
        mint::decimals = SOL_DECIMALS,
    )]
    pub lp_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

impl<'info> CreatePool<'info> {
    #[inline(always)]
    pub fn run(ctx: Context<Self>, fee: Fee) -> Result<()> {
        let fee_account = &mut ctx.accounts.fee_account;
        let fee_authority = &ctx.accounts.fee_authority;
        let pool_account = &mut ctx.accounts.pool_account;

        fee_account.set_inner(fee);
        pool_account.set_inner(Pool {
            fee_authority: fee_authority.key(),
            owned_lamports: 0,
        });
        Ok(())
    }
}
