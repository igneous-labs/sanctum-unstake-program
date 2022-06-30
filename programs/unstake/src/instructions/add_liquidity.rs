use anchor_lang::{prelude::*, system_program};
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};
use std::convert::TryFrom;

use crate::{errors::UnstakeError, state::Pool};

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    /// SOL SystemAccount that's adding liquidity
    #[account(mut)]
    pub from: Signer<'info>,

    /// pool that SOL liquidity is being added to
    #[account(
        mut,
        has_one = lp_mint
    )]
    pub pool_account: Account<'info, Pool>,

    /// pool's SOL reserves
    #[account(
        mut,
        seeds = [&pool_account.key().to_bytes()],
        bump,
    )]
    pub pool_sol_reserves: SystemAccount<'info>,

    /// pool's LP mint
    #[account(mut)]
    pub lp_mint: Account<'info, Mint>,

    /// lp token account to mint lp tokens to
    #[account(
        mut,
        constraint = mint_lp_tokens_to.mint == lp_mint.key() @ UnstakeError::InvalidLpTokenAccount
    )]
    pub mint_lp_tokens_to: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> AddLiquidity<'info> {
    #[inline(always)]
    pub fn run(ctx: Context<Self>, amount: u64) -> Result<()> {
        let from = &ctx.accounts.from;
        let pool_account = &mut ctx.accounts.pool_account;
        let pool_sol_reserves = &ctx.accounts.pool_sol_reserves;
        let lp_mint = &ctx.accounts.lp_mint;
        let mint_lp_tokens_to = &ctx.accounts.mint_lp_tokens_to;
        let token_program = &ctx.accounts.token_program;
        let system_program = &ctx.accounts.system_program;

        // order matters, must calculate first before mutation
        let pool_owned_lamports = pool_sol_reserves
            .lamports()
            .checked_add(pool_account.incoming_stake)
            .ok_or(UnstakeError::InternalError)?;
        let to_mint = calc_lp_tokens_to_mint(pool_owned_lamports, lp_mint.supply, amount)?;

        // transfer SOL
        let transfer_cpi_accs = system_program::Transfer {
            from: from.to_account_info(),
            to: pool_sol_reserves.to_account_info(),
        };
        system_program::transfer(
            CpiContext::new(system_program.to_account_info(), transfer_cpi_accs),
            amount,
        )?;

        // mint LP tokens
        let mint_cpi_accs = MintTo {
            mint: lp_mint.to_account_info(),
            to: mint_lp_tokens_to.to_account_info(),
            authority: pool_sol_reserves.to_account_info(),
        };
        let seeds: &[&[u8]] = &[
            &pool_account.key().to_bytes(),
            &[*ctx
                .bumps
                .get("pool_sol_reserves")
                .ok_or(UnstakeError::PdaBumpNotCached)?],
        ];
        token::mint_to(
            CpiContext::new_with_signer(token_program.to_account_info(), mint_cpi_accs, &[seeds]),
            to_mint,
        )
    }
}

fn calc_lp_tokens_to_mint(
    pool_owned_lamports: u64,
    lp_mint_supply: u64,
    amount_to_add: u64,
) -> std::result::Result<u64, UnstakeError> {
    // 0-edge cases: should all result in pool.owned_lamports 1:1 lp_mint.supply
    // 0 liquidity, 0 supply. mint = amount_to_add
    // 0 liquidity, non-zero supply. mint = amount_to_add - supply
    // non-zero liquidity, 0 supply. mint = amount_to_add + owned_lamports
    if pool_owned_lamports == 0 || lp_mint_supply == 0 {
        return amount_to_add
            .checked_add(pool_owned_lamports)
            .and_then(|v| v.checked_sub(lp_mint_supply))
            .ok_or(UnstakeError::InternalError);
    }
    // mint = amount * supply BEFORE TRANSFER / owned_lamports BEFORE TRANSFER
    u128::from(amount_to_add)
        .checked_mul(u128::from(lp_mint_supply))
        .and_then(|v| v.checked_div(u128::from(pool_owned_lamports)))
        .and_then(|v| u64::try_from(v).ok())
        .ok_or(UnstakeError::InternalError)
}
