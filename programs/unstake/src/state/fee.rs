use anchor_lang::prelude::*;
use spl_math::precise_number::PreciseNumber;
use std::convert::TryFrom;

use crate::rational::Rational;

pub const FEE_SEED_SUFFIX: &[u8] = b"fee";

// Anchor can't derive account for enum, so wrap it in a struct
#[derive(Debug)]
#[account]
pub struct Fee {
    pub fee: FeeEnum,
}

#[derive(Debug, Clone, Copy, AnchorDeserialize, AnchorSerialize)]
#[repr(C)]
pub enum FeeEnum {
    LiquidityLinear { params: LiquidityLinearParams },
}

/// Charges a fee based on how much liquidity
/// a swap leaves in the liquidity pool,
/// increasing linearly as less liquidity is left
#[derive(Debug, Clone, Copy, AnchorDeserialize, AnchorSerialize)]
pub struct LiquidityLinearParams {
    /// The fee applied to a swap that leaves
    /// 100% of all liquidity in the SOL reserves account
    max_liq_remaining: Rational,

    /// The fee applied to a swap that leaves
    /// no liquidity remaining in the SOL reserves account
    zero_liq_remaining: Rational,
}

impl FeeEnum {
    /// applies the fee to the swap amount
    pub fn apply(
        &self,
        owned_lamports: u64,
        sol_reserves_lamports: u64,
        stake_account_lamports: u64,
    ) -> Option<u64> {
        match self {
            FeeEnum::LiquidityLinear { params } => {
                // linear interpolation from zero_liq_remaining to max_liq_remaining where y-intercept at zero_liq_remaining
                let liq_consumed = (stake_account_lamports as u128)
                    .checked_add(owned_lamports as u128)?
                    .checked_sub(sol_reserves_lamports as u128)
                    .and_then(PreciseNumber::new)?;
                let max_liq = params.max_liq_remaining.into_precise_number()?;
                let min_liq = params.zero_liq_remaining.into_precise_number()?;
                let slope = max_liq
                    .checked_sub(&min_liq)?
                    .checked_div(&PreciseNumber::new(owned_lamports as u128)?)?;
                slope
                    .checked_mul(&liq_consumed)?
                    .checked_add(&min_liq)?
                    .to_imprecise()
                    .and_then(|v| u64::try_from(v).ok())
            }
        }
    }
}
