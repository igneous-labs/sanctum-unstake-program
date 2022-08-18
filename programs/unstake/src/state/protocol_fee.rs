use anchor_lang::prelude::Pubkey;

use anchor_lang::prelude::*;

use crate::rational::Rational;

pub const PROTOCOL_FEE_SEED: &[u8] = b"protocol-fee";

/// Global singleton containing protocol fee parameters
#[account]
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

    // devnet upgrade authority
    #[cfg(feature = "local-testing")]
    declare_id!("2NB9TSbKzqEHY9kUuTpnjS3VrsZhEooAWADLHe3WeL3E");

    // Socean DAO's wSOL token account
    #[cfg(not(feature = "local-testing"))]
    declare_id!("3Gdk8hMa76JF8p5jonMP7vYPZuXRTJDtLmysYabB6WEE");
}

mod default_authority {
    use anchor_lang::declare_id;

    // devnet upgrade authority's non-ATA wSOL account
    #[cfg(feature = "local-testing")]
    declare_id!("J6T4Cwe5PkiRidMJMap4f8EBd5kiQ6JrrwF5XsXzFy8t");

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
