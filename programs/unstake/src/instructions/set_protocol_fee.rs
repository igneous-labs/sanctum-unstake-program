//! A protocol owner facing instruction for updating the global protocol fee account

use anchor_lang::prelude::*;

use crate::{
    errors::UnstakeError,
    state::{ProtocolFee, PROTOCOL_FEE_SEED},
};

#[derive(Accounts)]
pub struct SetProtocolFee<'info> {
    /// protocol fee authority
    pub authority: Signer<'info>,

    /// protocol fee account to update
    #[account(
        mut,
        has_one = authority @ UnstakeError::InvalidProtocolFeeAuthority,
        seeds = [PROTOCOL_FEE_SEED],
        bump,
    )]
    pub protocol_fee_account: Account<'info, ProtocolFee>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

impl<'info> SetProtocolFee<'info> {
    #[inline(always)]
    pub fn validate(_protocol_fee: &ProtocolFee) -> Result<()> {
        // TODO
        Ok(())
    }

    #[inline(always)]
    pub fn run(ctx: Context<Self>, protocol_fee: ProtocolFee) -> Result<()> {
        let protocol_fee_account = &mut ctx.accounts.protocol_fee_account;

        protocol_fee_account.set_inner(protocol_fee);
        Ok(())
    }
}
