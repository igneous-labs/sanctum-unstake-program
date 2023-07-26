use anchor_lang::{prelude::*, system_program};
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};
use std::convert::TryFrom;

use crate::{
    errors::UnstakeError,
    state::{Pool, FLASH_ACCOUNT_SEED_SUFFIX},
    utils::calc_pool_owned_lamports,
};

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

impl<'info> AddLiquidity<'info> {
    #[inline(always)]
    pub fn run(ctx: Context<Self>, amount: u64) -> Result<()> {
        let from = &ctx.accounts.from;
        let pool_account = &mut ctx.accounts.pool_account;
        let pool_sol_reserves = &ctx.accounts.pool_sol_reserves;
        let lp_mint = &ctx.accounts.lp_mint;
        let mint_lp_tokens_to = &ctx.accounts.mint_lp_tokens_to;
        let flash_account = &ctx.accounts.flash_account;
        let token_program = &ctx.accounts.token_program;
        let system_program = &ctx.accounts.system_program;

        // order matters, must calculate first before mutation
        let pool_owned_lamports =
            calc_pool_owned_lamports(pool_sol_reserves, pool_account, flash_account)?;
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
    let to_mint = match pool_owned_lamports == 0 || lp_mint_supply == 0 {
        // 0-edge cases: should all result in pool.owned_lamports 1:1 lp_mint.supply
        // 0 liquidity, 0 supply. mint = amount_to_add
        // 0 liquidity, non-zero supply. mint = amount_to_add - supply (note: amount_to_add must > supply in this case)
        // non-zero liquidity, 0 supply. mint = amount_to_add + owned_lamports
        true => amount_to_add
            .checked_add(pool_owned_lamports)
            .and_then(|v| v.checked_sub(lp_mint_supply))
            .ok_or(UnstakeError::InternalError)?,

        // mint = amount * supply BEFORE TRANSFER / owned_lamports BEFORE TRANSFER
        false => u128::from(amount_to_add)
            .checked_mul(u128::from(lp_mint_supply))
            .and_then(|v| v.checked_div(u128::from(pool_owned_lamports)))
            .and_then(|v| u64::try_from(v).ok())
            .ok_or(UnstakeError::InternalError)?,
    };
    if to_mint == 0 {
        return Err(UnstakeError::LiquidityToAddTooLittle);
    }
    Ok(to_mint)
}

#[cfg(test)]
mod tests {
    use proptest::prelude::*;
    use spl_math::uint::U256;
    use std::cmp::{max, min};

    use super::*;

    prop_compose! {
        fn owned_lamports_to_add_sum_lte_u64_max()
            (amount_to_add in 1..=u64::MAX)
            (amount_to_add in Just(amount_to_add), pool_owned_lamports in 0..=u64::MAX - amount_to_add)
        -> (u64, u64) {
            (pool_owned_lamports, amount_to_add)
        }
    }

    proptest! {
        #[test]
        fn test_lp_mint_supply_zero_results_in_one_to_one(
            (pool_owned_lamports, amount_to_add) in owned_lamports_to_add_sum_lte_u64_max()
        ) {
            let to_mint = calc_lp_tokens_to_mint(pool_owned_lamports, 0, amount_to_add).unwrap();
            prop_assert!(to_mint == pool_owned_lamports + amount_to_add);
        }
    }

    prop_compose! {
        fn to_add_gte_supply()
            (amount_to_add in 1..=u64::MAX)
            (amount_to_add in Just(amount_to_add), lp_mint_supply in 0..=amount_to_add)
        -> (u64, u64) {
            (lp_mint_supply, amount_to_add)
        }
    }

    proptest! {
        #[test]
        fn test_pool_owned_lamports_zero_results_in_one_to_one(
            (lp_mint_supply, amount_to_add) in to_add_gte_supply()
        ) {
            let to_mint = calc_lp_tokens_to_mint(0, lp_mint_supply, amount_to_add).unwrap();
            prop_assert!(to_mint + lp_mint_supply == amount_to_add);
        }
    }

    prop_compose! {
        fn normal_cases()
            (amount_to_add in 1..=u64::MAX, lp_mint_supply in 1..=u64::MAX)
            (
                amount_to_add in Just(amount_to_add),
                lp_mint_supply in Just(lp_mint_supply),
                pool_owned_lamports in
                    u64::try_from(
                        max(1u128, amount_to_add as u128 * lp_mint_supply as u128 / u64::MAX as u128)
                    ).unwrap()
                    ..=
                    u64::try_from(
                        min(u64::MAX as u128, amount_to_add as u128 * lp_mint_supply as u128)
                    ).unwrap()
            )
        -> (u64, u64, u64) {
            (pool_owned_lamports, lp_mint_supply, amount_to_add)
        }
    }

    proptest! {
        #[test]
        fn test_normal_cases_proportional(
            (pool_owned_lamports, lp_mint_supply, amount_to_add) in normal_cases()
        ) {
            // to_mint / (lp_mint_supply + to_mint) <= amount_to_add / (pool_owned_lamports + amount_to_add) ->
            // to_mint * (pool_owned_lamports + amount_to_add) <= amount_to_add * (lp_mint_supply + to_mint)

            let to_mint = calc_lp_tokens_to_mint(pool_owned_lamports, lp_mint_supply, amount_to_add).unwrap();
            let lhs = (U256::from(to_mint)) * (U256::from(pool_owned_lamports) + U256::from(amount_to_add));
            let rhs = (U256::from(amount_to_add)) * (U256::from(lp_mint_supply) + U256::from(to_mint));
            // TODO: there should be an error bound on the ineq, not sure what it is
            prop_assert!(lhs <= rhs);
        }
    }

    proptest! {
        #[test]
        fn test_amount_to_add_zero_results_in_error(
            pool_owned_lamports in 0..=u64::MAX,
            lp_mint_supply in 0..=u64::MAX,
        ) {
            let err = calc_lp_tokens_to_mint(pool_owned_lamports, lp_mint_supply, 0).unwrap_err();
            prop_assert!(err == UnstakeError::LiquidityToAddTooLittle || err == UnstakeError::InternalError);
        }
    }
}
