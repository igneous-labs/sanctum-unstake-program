use anchor_lang::prelude::*;

//use crate::errors::UnstakeError;

#[derive(Accounts)]
pub struct DeactivateStakeAccount {}

impl DeactivateStakeAccount {
    #[inline(always)]
    pub fn run(_ctx: Context<Self>) -> Result<()> {
        Ok(())
    }
}
