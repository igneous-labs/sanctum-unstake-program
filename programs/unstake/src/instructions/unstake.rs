use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Unstake<'info> {
    pub unstaker: Signer<'info>,
    pub system_program: Program<'info, System>,
}

impl<'info> Unstake<'info> {
    #[inline(always)]
    pub fn run(_ctx: Context<Self>) -> Result<()> {
        Ok(())
    }
}
