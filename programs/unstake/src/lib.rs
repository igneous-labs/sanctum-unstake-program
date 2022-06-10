use anchor_lang::prelude::*;

#[cfg(feature = "local-testing")]
declare_id!("6KBz9djJAH3gRHscq9ujMpyZ5bCK9a27o3ybDtJLXowz");

// TODO: replace with real deployment key
#[cfg(not(feature = "local-testing"))]
declare_id!("3zSwHpEF8svwihadvnx7q2EagTyW1tvwn354gzvF5Zh4");

#[program]
pub mod unstake {
    use super::*;
    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
