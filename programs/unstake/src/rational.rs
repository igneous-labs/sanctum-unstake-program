use anchor_lang::prelude::*;
use serde::Deserialize;

use std::fmt;

/// A ratio. Denom should not = 0
#[derive(Debug, PartialEq, Clone, Copy, AnchorSerialize, AnchorDeserialize, Deserialize)]
pub struct Rational {
    pub num: u64,
    pub denom: u64,
}

// TODO: remove once we unify the types and remove anchor
impl From<Rational> for unstake_interface::Rational {
    fn from(Rational { num, denom }: Rational) -> Self {
        Self { num, denom }
    }
}

impl fmt::Display for Rational {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}/{}", self.num, self.denom)
    }
}
