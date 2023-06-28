//! A hot potato u64 PDA that's used to track the number of lamports
//! that has been flash loaned so far in a transaction

use anchor_lang::constant;

#[constant]
pub const FLASH_ACCOUNT_SEED_SUFFIX: &[u8] = b"flashaccount";
