use anchor_lang::prelude::*;

/// A ratio. Denom should not = 0
#[derive(Debug, PartialEq, Clone, Copy, AnchorSerialize, AnchorDeserialize)]
pub struct Rational {
    pub num: u64,
    pub denom: u64,
}
