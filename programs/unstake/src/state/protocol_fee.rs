use anchor_lang::prelude::Pubkey;

use anchor_lang::prelude::*;

use crate::{errors::UnstakeError, rational::Rational};

#[constant]
pub const PROTOCOL_FEE_SEED: &[u8] = b"protocol-fee";

/// Global singleton containing protocol fee parameters
#[account]
#[derive(Debug)]
pub struct ProtocolFee {
    /// Protocol-owned account to receive the protocol fees to
    pub destination: Pubkey,

    /// Signer that is authorized to modify this account
    pub authority: Pubkey,

    /// The proportion of unstake fees that go to the protocol
    pub fee_ratio: Rational,

    /// The proprtion of the protocol fees that go to the referrer
    pub referrer_fee_ratio: Rational,
}

mod default_destination {
    use anchor_lang::declare_id;

    // the keypair used for automated testing on localnet
    #[cfg(feature = "local-testing")]
    declare_id!("6h64tjnsZDcvEta2uZvf2CqoPLf2Q8h79ES74ghjNk8D");

    // Left Curve's wSOL token account
    #[cfg(not(feature = "local-testing"))]
    declare_id!("GnRGTBrFuEwb85Zs4zeZWUzQYfTwmPxCPYmQQodDzYUK");
}

mod default_authority {
    use anchor_lang::declare_id;

    // the keypair used for automated testing on localnet
    #[cfg(feature = "local-testing")]
    declare_id!("Cp4BZrED56eBpv5c6zdJmoCiKMrYDURjAWU8KeQhYjM8");

    // LEFT CURVE DAO's unstake program upgrade authority
    #[cfg(not(feature = "local-testing"))]
    declare_id!("4e3CRid3ugjAFRjSnmbbLie1CaeU41CBYhk4saKQgwBB");
}

impl Default for ProtocolFee {
    fn default() -> Self {
        Self {
            destination: default_destination::id(),
            authority: default_authority::id(),
            // 10%
            fee_ratio: Rational { num: 1, denom: 10 },
            // 50%
            referrer_fee_ratio: Rational { num: 1, denom: 2 },
        }
    }
}

impl ProtocolFee {
    pub fn validate(&self) -> Result<()> {
        if !self.fee_ratio.validate()
            || !self.fee_ratio.is_lte_one()
            || !self.referrer_fee_ratio.validate()
            || !self.referrer_fee_ratio.is_lte_one()
        {
            return Err(UnstakeError::InvalidFee.into());
        }

        Ok(())
    }

    /// Applies the protocol fee on a given fee amount
    ///
    /// Returns the number of lamports to be levied as the protocol fee
    /// and to subtract from `fee_lamports`
    ///
    /// Invariants:
    /// - return <= `fee_lamports`
    pub fn apply(&self, fee_lamports: u64) -> Option<u64> {
        self.fee_ratio.floor_mul(fee_lamports)
    }

    /// Applies the referrer fee on a given protocol fee amount
    ///
    /// Returns the number of lamports to be levied as the referrer fee
    /// and to subtract from `protocol_fee_lamports`
    ///
    /// Invariants:
    /// - return <= `protocol_fee_lamports`
    pub fn apply_referrer_fee(&self, protocol_fee_lamports: u64) -> Option<u64> {
        self.referrer_fee_ratio.floor_mul(protocol_fee_lamports)
    }
}
