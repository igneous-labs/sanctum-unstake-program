use anchor_lang::{prelude::*, system_program};
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount};
use std::convert::TryFrom;

use crate::{
    errors::UnstakeError,
    state::{Pool, FLASH_ACCOUNT_SEED_SUFFIX},
    utils::calc_pool_owned_lamports,
};

#[derive(Accounts)]
pub struct RemoveLiquidity<'info> {
    /// signer thas has authority over burn_lp_tokens_from token account
    pub burn_lp_tokens_from_authority: Signer<'info>,

    /// SOL account to remove SOL liquidity to
    #[account(mut)]
    pub to: SystemAccount<'info>,

    /// pool that SOL liquidity is being removed from
    #[account(
        mut,
        has_one = lp_mint
    )]
    pub pool_account: Account<'info, Pool>,

    /// pool's SOL reserves. SOL liquidity deducted from here
    #[account(
        mut,
        seeds = [&pool_account.key().to_bytes()],
        bump,
    )]
    pub pool_sol_reserves: SystemAccount<'info>,

    /// pool's LP mint
    #[account(mut)]
    pub lp_mint: Account<'info, Mint>,

    /// lp token account to redeem/burn lp tokens from
    #[account(
        mut,
        constraint = burn_lp_tokens_from.mint == lp_mint.key() @ UnstakeError::InvalidLpTokenAccount
    )]
    pub burn_lp_tokens_from: Account<'info, TokenAccount>,

    /// amount taken for all active flash loans of the pool
    /// CHECK: PDA checked
    #[account(
        mut,
        seeds = [&pool_account.key().to_bytes(), FLASH_ACCOUNT_SEED_SUFFIX],
        bump,
    )]
    pub flash_account: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> RemoveLiquidity<'info> {
    #[inline(always)]
    pub fn run(ctx: Context<Self>, amount_lp: u64) -> Result<()> {
        let burn_lp_tokens_from_authority = &ctx.accounts.burn_lp_tokens_from_authority;
        let to = &ctx.accounts.to;
        let pool_account = &mut ctx.accounts.pool_account;
        let pool_sol_reserves = &ctx.accounts.pool_sol_reserves;
        let lp_mint = &ctx.accounts.lp_mint;
        let burn_lp_tokens_from = &ctx.accounts.burn_lp_tokens_from;
        let flash_account = &ctx.accounts.flash_account;
        let token_program = &ctx.accounts.token_program;
        let system_program = &ctx.accounts.system_program;

        // order matters, must calculate first before mutation
        let pool_owned_lamports =
            calc_pool_owned_lamports(pool_sol_reserves, pool_account, flash_account)?;
        let to_return = calc_lamports_to_return(pool_owned_lamports, lp_mint.supply, amount_lp)?;

        // transfer SOL
        let transfer_cpi_accs = system_program::Transfer {
            from: pool_sol_reserves.to_account_info(),
            to: to.to_account_info(),
        };
        let seeds: &[&[u8]] = &[
            &pool_account.key().to_bytes(),
            &[*ctx
                .bumps
                .get("pool_sol_reserves")
                .ok_or(UnstakeError::PdaBumpNotCached)?],
        ];
        system_program::transfer(
            CpiContext::new_with_signer(
                system_program.to_account_info(),
                transfer_cpi_accs,
                &[seeds],
            ),
            to_return,
        )?;

        // burn LP tokens
        let burn_cpi_accs = Burn {
            mint: lp_mint.to_account_info(),
            from: burn_lp_tokens_from.to_account_info(),
            authority: burn_lp_tokens_from_authority.to_account_info(),
        };
        token::burn(
            CpiContext::new(token_program.to_account_info(), burn_cpi_accs),
            amount_lp,
        )
    }
}

fn calc_lamports_to_return(
    pool_owned_lamports: u64,
    lp_mint_supply: u64,
    amount_lp_to_burn: u64,
) -> std::result::Result<u64, UnstakeError> {
    // 0 edge-cases: return 0
    if pool_owned_lamports == 0 || lp_mint_supply == 0 {
        return Ok(0);
    }
    // return = amount_lp_to_burn * owned_lamports BEFORE BURN / lp_mint.supply BEFORE BURN
    u128::from(amount_lp_to_burn)
        .checked_mul(u128::from(pool_owned_lamports))
        .and_then(|v| v.checked_div(u128::from(lp_mint_supply)))
        .and_then(|v| u64::try_from(v).ok())
        .ok_or(UnstakeError::InternalError)
}
