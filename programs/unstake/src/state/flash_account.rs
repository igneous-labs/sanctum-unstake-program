//! A hot potato u64 PDA that's used to track the number of lamports
//! that has been flash loaned so far in a transaction

use anchor_lang::prelude::*;

#[constant]
pub const FLASH_ACCOUNT_SEED_SUFFIX: &[u8] = b"flashaccount";

pub struct FlashAccount {
    pub lamports_borrowed: u64,
}

impl FlashAccount {
    pub fn deserialize(account_info: &AccountInfo) -> Result<Self> {
        let mut d = &**account_info.try_borrow_data()?;
        let lamports_borrowed = u64::deserialize(&mut d)?;
        Ok(Self { lamports_borrowed })
    }

    pub fn serialize(&self, account_info: &mut AccountInfo) -> Result<()> {
        let mut d = &mut **account_info.try_borrow_mut_data()?;
        self.lamports_borrowed.serialize(&mut d)?;
        Ok(())
    }

    pub fn account_len() -> u64 {
        8
    }
}
