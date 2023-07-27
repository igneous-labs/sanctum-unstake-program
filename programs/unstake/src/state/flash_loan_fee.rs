use anchor_lang::prelude::*;

use crate::{errors::UnstakeError, rational::Rational};

#[constant]
pub const FLASH_LOAN_FEE_SEED_SUFFIX: &[u8] = b"flashloanfee";

#[account]
pub struct FlashLoanFee {
    /// The proportion of the flash loan amount that is levied as fees
    pub fee_ratio: Rational,
}

impl FlashLoanFee {
    pub fn validate(&self) -> Result<()> {
        match self.fee_ratio.validate() {
            true => Ok(()),
            false => Err(UnstakeError::InvalidFee.into()),
        }
    }

    pub fn apply(&self, flash_loan_amount: u64) -> Option<u64> {
        self.fee_ratio.ceil_mul(flash_loan_amount)
    }
}
