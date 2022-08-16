use anchor_lang::prelude::*;
use spl_math::precise_number::PreciseNumber;
use std::convert::TryFrom;
use std::fmt;

use crate::{errors::UnstakeError, rational::Rational};

pub const FEE_SEED_SUFFIX: &[u8] = b"fee";

// Anchor can't derive account for enum, so wrap it in a struct
#[account]
pub struct Fee {
    pub fee: FeeEnum,
}

impl Fee {
    pub fn validate(&self) -> Result<()> {
        self.fee.validate()
    }

    pub fn apply(
        &self,
        pool_incoming_stake: u64,
        sol_reserves_lamports: u64,
        stake_account_lamports: u64,
    ) -> Option<u64> {
        self.fee.apply(
            pool_incoming_stake,
            sol_reserves_lamports,
            stake_account_lamports,
        )
    }
}

#[derive(Debug, Clone, Copy, AnchorDeserialize, AnchorSerialize)]
#[repr(C)]
pub enum FeeEnum {
    /// Charges a flat fee based on a set fee ratio
    /// applied to the size of a given swap
    ///
    /// Invariants:
    ///  - ratio is a valid Rational
    ///  - ratio <= 1
    Flat { ratio: Rational },

    /// Charges a fee based on how much liquidity
    /// a swap leaves in the liquidity pool,
    /// increasing linearly as less liquidity is left
    ///
    /// Invariants:
    ///  - max_liq_remaining is a valid Rational
    ///  - max_liq_remaining <= 1
    ///  - zero_liq_remaining is a valid Rational
    ///  - zero_liq_remaining <= 1
    ///  - max_liq_remaining <= zero_liq_remaining
    LiquidityLinear { params: LiquidityLinearParams },
}

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
    pub fn validate(&self) -> Result<()> {
        match self {
            FeeEnum::Flat { ratio } => {
                if !ratio.validate() || !ratio.is_lte_one() {
                    return Err(UnstakeError::InvalidFee.into());
                }
            }
            FeeEnum::LiquidityLinear { params } => {
                if !params.zero_liq_remaining.validate()
                    || !params.zero_liq_remaining.is_lte_one()
                    || !params.max_liq_remaining.validate()
                    || !params.max_liq_remaining.is_lte_one()
                {
                    return Err(UnstakeError::InvalidFee.into());
                }
                let zero_liq_fee = params
                    .zero_liq_remaining
                    .into_precise_number()
                    .ok_or(UnstakeError::InternalError)?;
                let max_liq_fee = params
                    .max_liq_remaining
                    .into_precise_number()
                    .ok_or(UnstakeError::InternalError)?;
                if max_liq_fee.greater_than(&zero_liq_fee) {
                    return Err(UnstakeError::InvalidFee.into());
                }
            }
        }

        Ok(())
    }

    /// Applies swap fee to given swap amount and pool's liquidity
    pub fn apply(
        &self,
        pool_incoming_stake: u64,
        sol_reserves_lamports: u64,
        stake_account_lamports: u64,
    ) -> Option<u64> {
        let fee_ratio = match self {
            FeeEnum::Flat { ratio } => ratio.into_precise_number()?,
            FeeEnum::LiquidityLinear { params } => {
                // linear interpolation from max_liq_remaining to zero_liq_remaining where y-intercept at max_liq_remaining
                // x-axis is liquidity consumed in lamports
                // y-axis is fee ratio (e.g. 0.01 is 1% fees)
                //
                // let I = pool_incoming_stake, S = stake_account_lamports,
                // m = slope, c = y-intercept at max_liq_remaining
                // new liquidity consumed after unstake = I + (1 - y)S
                // y = m(I + (1 - y)S) + c
                // y = mI + mS - mSy + c
                // y(1 + mS) = m(I + S) + c
                // y = (m(I + S) + c) / (1 + mS)
                //
                // since m <<< 1, use 1/m where possible to preserve precision
                // y = m(I + S + c/m) / m(1/m + S)
                // y = (I + S + c/m) / (1/m + S)
                // TODO: check overflow conditions due to large numbers
                //
                // note: fee_ratio can go >zero_liq_remaining
                // if I + (1 - y)S > pool_owned_lamports

                let zero_liq_fee = params.zero_liq_remaining.into_precise_number()?;
                let max_liq_fee = params.max_liq_remaining.into_precise_number()?;
                let owned_lamports =
                    (pool_incoming_stake as u128).checked_add(sol_reserves_lamports as u128)?;

                let slope_num = zero_liq_fee.checked_sub(&max_liq_fee)?;
                let slope_denom = PreciseNumber::new(owned_lamports)?;

                let incoming_plus_stake =
                    (pool_incoming_stake as u128).checked_add(stake_account_lamports as u128)?;
                let num = slope_denom
                    .checked_mul(&max_liq_fee)?
                    .checked_div(&slope_num)?
                    .checked_add(&PreciseNumber::new(incoming_plus_stake)?)?;
                let denom = slope_denom
                    .checked_div(&slope_num)?
                    .checked_add(&PreciseNumber::new(stake_account_lamports as u128)?)?;
                num.checked_div(&denom)?
            }
        };

        PreciseNumber::new(stake_account_lamports as u128)?
            .checked_mul(&fee_ratio)?
            .ceiling()?
            .to_imprecise()
            .and_then(|v| u64::try_from(v).ok())
    }
}

// used for analytics log emission
//
// Log Format:
//  - Flat: "[0, ratio]"
//  - LiquidityLinear: "[1, max_liq_remaining, zero_liq_remaining]"
impl fmt::Display for FeeEnum {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            FeeEnum::Flat { ratio } => write!(f, "[0, {}]", ratio),
            FeeEnum::LiquidityLinear { params } => write!(
                f,
                "[1, {}, {}]",
                params.max_liq_remaining, params.zero_liq_remaining
            ),
        }
    }
}
