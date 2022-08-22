use anchor_lang::prelude::*;
use spl_math::precise_number::PreciseNumber;

use std::{convert::TryInto, fmt};

/// A ratio. Denom should not = 0
#[derive(Debug, PartialEq, Clone, Copy, AnchorSerialize, AnchorDeserialize)]
pub struct Rational {
    pub num: u64,
    pub denom: u64,
}

impl Rational {
    pub fn validate(&self) -> bool {
        self.denom != 0
    }

    pub fn into_precise_number(self) -> Option<PreciseNumber> {
        PreciseNumber::new(self.num as u128)?.checked_div(&PreciseNumber::new(self.denom as u128)?)
    }

    pub fn is_lte_one(&self) -> bool {
        self.num <= self.denom
    }

    pub fn apply_floor(&self, value: u64) -> Option<u64> {
        u128::from(value)
            .checked_mul(self.num.into())
            .and_then(|product| product.checked_div(self.denom.into()))
            .and_then(|result| result.try_into().ok())
    }
}

impl fmt::Display for Rational {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}/{}", self.num, self.denom)
    }
}
