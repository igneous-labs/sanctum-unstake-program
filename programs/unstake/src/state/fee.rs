use anchor_lang::prelude::*;
use serde::Deserialize;
use std::fmt;
use unstake_lib::{ApplyFeeArgs, PoolBalance, UnstakeFeeCalc};

use crate::{errors::UnstakeError, rational::Rational};

#[constant]
pub const FEE_SEED_SUFFIX: &[u8] = b"fee";

// Anchor can't derive account for enum, so wrap it in a struct
#[account]
#[derive(Debug, Deserialize)]
pub struct Fee {
    pub fee: FeeEnum,
}

impl Fee {
    pub fn validate(&self) -> Result<()> {
        let f: unstake_interface::FeeEnum = self.fee.into();
        match f.is_valid() {
            true => Ok(()),
            false => Err(UnstakeError::InvalidFee.into()),
        }
    }

    /// Applies the contained fee model to the unstake parameters
    /// Returns number of lamports to collect/retain as fees
    pub fn apply(
        &self,
        pool_incoming_stake: u64,
        sol_reserves_lamports: u64,
        stake_account_lamports: u64,
    ) -> Option<u64> {
        let f: unstake_interface::FeeEnum = self.fee.into();
        f.apply(ApplyFeeArgs {
            pool_balance: PoolBalance {
                pool_incoming_stake,
                sol_reserves_lamports,
            },
            stake_account_lamports,
        })
    }
}

#[derive(Debug, Clone, Copy, AnchorDeserialize, AnchorSerialize, Deserialize)]
#[repr(C)]
pub enum FeeEnum {
    /// Charges a flat fee based on a set fee ratio
    /// applied to the size of a given swap.
    /// E.g. num: 1, denom: 10_000 => 1bps fee
    ///
    /// Invariants:
    ///  - ratio is a valid Rational
    ///  - ratio <= 1
    Flat { ratio: Rational },

    /// Charges a fee based on how much liquidity
    /// a swap leaves in the liquidity pool,
    /// increasing linearly as less liquidity is left.
    /// See diagram in apply() below for details
    ///
    /// Invariants:
    ///  - max_liq_remaining is a valid Rational
    ///  - max_liq_remaining <= 1
    ///  - zero_liq_remaining is a valid Rational
    ///  - zero_liq_remaining <= 1
    ///  - max_liq_remaining <= zero_liq_remaining
    LiquidityLinear { params: LiquidityLinearParams },
}

// TODO: remove once we unify the types and remove anchor
impl From<FeeEnum> for unstake_interface::FeeEnum {
    fn from(value: FeeEnum) -> Self {
        match value {
            FeeEnum::Flat { ratio } => Self::Flat {
                ratio: ratio.into(),
            },
            FeeEnum::LiquidityLinear { params } => Self::LiquidityLinear {
                params: params.into(),
            },
        }
    }
}

#[derive(Debug, Clone, Copy, AnchorDeserialize, AnchorSerialize, Deserialize)]
pub struct LiquidityLinearParams {
    /// The fee applied to a swap that leaves
    /// 100% of all liquidity in the SOL reserves account
    pub max_liq_remaining: Rational,

    /// The fee applied to a swap that leaves
    /// no liquidity remaining in the SOL reserves account
    pub zero_liq_remaining: Rational,
}

// TODO: remove once we unify the types and remove anchor
impl From<LiquidityLinearParams> for unstake_interface::LiquidityLinearParams {
    fn from(
        LiquidityLinearParams {
            max_liq_remaining,
            zero_liq_remaining,
        }: LiquidityLinearParams,
    ) -> Self {
        Self {
            max_liq_remaining: max_liq_remaining.into(),
            zero_liq_remaining: zero_liq_remaining.into(),
        }
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
