use anchor_lang::prelude::*;

use crate::rational::Rational;

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
