use anchor_lang::prelude::*;
use spl_math::precise_number::PreciseNumber;
use std::convert::TryFrom;

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
    ///  - zero_liq_remaining is a valid Rational
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
                if !ratio.validate() || ratio.num > ratio.denom {
                    return Err(UnstakeError::InvalidFee.into());
                }
            }
            FeeEnum::LiquidityLinear { params } => {
                if !params.zero_liq_remaining.validate() || !params.max_liq_remaining.validate() {
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
                // note: fee_ratio can go >zero_liq_remaining
                // if I + (1 - y)S > pool_owned_lamports

                let zero_liq_fee = params.zero_liq_remaining.into_precise_number()?;
                let max_liq_fee = params.max_liq_remaining.into_precise_number()?;
                let owned_lamports =
                    (pool_incoming_stake as u128).checked_add(sol_reserves_lamports as u128)?;
                let slope = zero_liq_fee
                    .checked_sub(&max_liq_fee)?
                    .checked_div(&PreciseNumber::new(owned_lamports)?)?;

                let incoming_plus_stake =
                    (pool_incoming_stake as u128).checked_add(stake_account_lamports as u128)?;
                let num = slope
                    .checked_mul(&PreciseNumber::new(incoming_plus_stake)?)?
                    .checked_add(&max_liq_fee)?;
                let denom = slope
                    .checked_mul(&PreciseNumber::new(stake_account_lamports as u128)?)?
                    .checked_add(&PreciseNumber::new(1u128)?)?;
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
