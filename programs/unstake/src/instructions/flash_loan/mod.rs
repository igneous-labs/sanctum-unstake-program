//! Flash loan module
//!
//! TakeFlashLoan checks
//! - using instructions sysvar that a RepayFlashLoan ix occurs sometime later in the same tx
//! - increments lamports loaned to u64 stored in FlashAccount PDA, initializing the hot-potato if required.
//!
//! RepayFlashLoan
//! - transfer lamports loaned stored in FlashAccountPda + fees - protocol fees back to pool_sol_reserves
//! - transfers protocol fees to protocol fee destination
//! - deletes FlashAccount hot-potato

mod repay_flash_loan;
mod set_flash_loan_fee;
mod take_flash_loan;

pub use repay_flash_loan::*;
pub use set_flash_loan_fee::*;
pub use take_flash_loan::*;
