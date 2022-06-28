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
        owned_lamports: u64,
        sol_reserves_lamports: u64,
        stake_account_lamports: u64,
    ) -> Option<u64> {
        self.fee.apply(
            owned_lamports,
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
        owned_lamports: u64,
        sol_reserves_lamports: u64,
        stake_account_lamports: u64,
    ) -> Option<u64> {
        let fee_lamports = match self {
            FeeEnum::Flat { ratio } => PreciseNumber::new(stake_account_lamports as u128)?
                .checked_mul(&ratio.into_precise_number()?)?,
            FeeEnum::LiquidityLinear { params } => {
                // linear interpolation from max_liq_remaining to zero_liq_remaining where y-intercept at max_liq_remaining
                // x-axis is ratio of liquidity consumed
                // y-axis is lamports
                let liq_consumed = (stake_account_lamports as u128)
                    .checked_add(owned_lamports as u128)?
                    .checked_sub(sol_reserves_lamports as u128)
                    .and_then(PreciseNumber::new)?;

                let zero_liq_fee = params.zero_liq_remaining.into_precise_number()?;
                let max_liq_fee = params.max_liq_remaining.into_precise_number()?;
                // NOTE: assuming zero_liq_fee > max_liq_fee
                // TODO: invariant and validation
                let slope = zero_liq_fee
                    .checked_sub(&max_liq_fee)?
                    .checked_div(&PreciseNumber::new(owned_lamports as u128)?)?;

                slope
                    .checked_mul(&liq_consumed)?
                    .checked_add(&max_liq_fee)?
            }
        };

        fee_lamports
            .to_imprecise()
            .and_then(|v| u64::try_from(v).ok())
    }
}
