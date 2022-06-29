use anchor_lang::prelude::*;
use spl_math::precise_number::PreciseNumber;

/// A ratio. Denom should not = 0
#[derive(Debug, PartialEq, Clone, Copy, AnchorSerialize, AnchorDeserialize)]
pub struct Rational {
    pub num: u64,
    pub denom: u64, // maybe enforce non-zero with NonZeroU64? https://doc.rust-lang.org/stable/std/num/struct.NonZeroU64.html
}

impl Rational {
    pub fn validate(&self) -> bool {
        self.denom != 0
    }

    pub fn into_precise_number(self) -> Option<PreciseNumber> {
        PreciseNumber::new(self.num as u128)?.checked_div(&PreciseNumber::new(self.denom as u128)?)
    }
}
