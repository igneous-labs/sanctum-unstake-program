use anchor_lang::prelude::*;

/// A ratio. Denom should not = 0
#[derive(Debug, PartialEq, Clone, Copy, AnchorSerialize, AnchorDeserialize)]
pub struct Rational {
    num: u64,
    denom: u64,
}
