//! A global run-once permissionless crank for initializing the global protocol fee account to the defaults

use anchor_lang::prelude::*;

use crate::{
    anchor_len::AnchorLen,
    state::{ProtocolFee, PROTOCOL_FEE_SEED},
};

#[derive(Accounts)]
pub struct InitProtocolFee<'info> {
    /// pubkey paying for protocol fee account's rent
    #[account(mut)]
    pub payer: Signer<'info>,

    /// protocol fee account to be created
    #[account(
        init,
        payer = payer,
        space = ProtocolFee::LEN,
        seeds = [PROTOCOL_FEE_SEED],
        bump,
    )]
    pub protocol_fee_account: Account<'info, ProtocolFee>,

    pub system_program: Program<'info, System>,
}

impl<'info> InitProtocolFee<'info> {
    #[inline(always)]
    pub fn run(ctx: Context<Self>) -> Result<()> {
        ctx.accounts
            .protocol_fee_account
            .set_inner(ProtocolFee::default());
        Ok(())
    }
}
