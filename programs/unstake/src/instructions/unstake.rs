use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Unstake<'info> {
    pub unstaker: Signer<'info>,
    pub system_program: Program<'info, System>,
}

impl<'info> Unstake<'info> {
    const SIMPLE_FLAT_FEE: u64 = 1_000_000_000;

    #[inline(always)]
    pub fn run(ctx: Context<Self>) -> Result<()> {
        Ok(())
    }
}
