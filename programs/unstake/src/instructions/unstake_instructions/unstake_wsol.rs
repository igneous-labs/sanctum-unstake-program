use anchor_lang::prelude::*;
use anchor_spl::{
    stake::{Stake, StakeAccount},
    token::{self, spl_token, SyncNative, Token, TokenAccount},
};

use crate::{
    errors::UnstakeError,
    state::{Fee, Pool, ProtocolFee, FEE_SEED_SUFFIX, PROTOCOL_FEE_SEED},
};

use super::unstake_accounts::UnstakeAccounts;

#[derive(Accounts)]
pub struct UnstakeWsol<'info> {
    /// stake account owner
    pub unstaker: Signer<'info>,

    /// stake account to be unstaked
    /// rely on stake program CPI call to ensure owned by unstaker
    #[account(
        mut,
        // this also checks that a stake account is either
        // Initialized or Stake
        // NOTE: https://github.com/igneous-labs/unstake/issues/63
        //  - if lockup is not in force then the custodian cannot do anything
        //  - since the instruction updates both staker and withdrawer, lockup
        //    cannot be updated by the custodian or unstaker after the instruction
        //    resolves
        constraint = !stake_account.lockup()
            .ok_or(UnstakeError::StakeAccountLockupNotRetrievable)?
            .is_in_force(&clock, None)
            @ UnstakeError::StakeAccountLockupInForce,
    )]
    pub stake_account: Account<'info, StakeAccount>,

    /// wSOL token account to receive the unstaked amount
    #[account(
        mut,
        constraint = destination.mint == spl_token::native_mint::id() @ UnstakeError::DestinationNotWSol
    )]
    pub destination: Account<'info, TokenAccount>,

    /// pool account that SOL reserves belong to
    #[account(mut)]
    pub pool_account: Account<'info, Pool>,

    /// pool's SOL reserves
    #[account(
        mut,
        seeds = [&pool_account.key().to_bytes()],
        bump,
    )]
    pub pool_sol_reserves: SystemAccount<'info>,

    /// pool's fee account
    #[account(
        seeds = [&pool_account.key().to_bytes(), FEE_SEED_SUFFIX],
        bump,
    )]
    pub fee_account: Account<'info, Fee>,

    /// stake account record to be created
    /// CHECK: PDA checks address. Manually initialized and serialized in processor.
    #[account(
        mut,
        seeds = [&pool_account.key().to_bytes(), &stake_account.key().to_bytes()],
        bump,
    )]
    pub stake_account_record_account: UncheckedAccount<'info>, //  Account<'info, StakeAccountRecord>

    #[account(
        seeds = [PROTOCOL_FEE_SEED],
        bump,
    )]
    pub protocol_fee_account: Account<'info, ProtocolFee>,

    /// CHECK: address-check checks that its the correct
    /// destination specified in `protocol_fee_account`
    #[account(
        mut,
        address = protocol_fee_account.destination @ UnstakeError::WrongProtocolFeeDestination,
    )]
    pub protocol_fee_destination: AccountInfo<'info>,

    pub clock: Sysvar<'info, Clock>,
    pub stake_program: Program<'info, Stake>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

impl_unstake_accounts!(UnstakeWsol, 2);

impl<'info> UnstakeWsol<'info> {
    #[inline(always)]
    pub fn run(mut ctx: Context<'_, '_, '_, 'info, Self>) -> Result<()> {
        let unstake_result = Self::run_unstake(&mut ctx)?;

        token::sync_native(CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            SyncNative {
                account: ctx.accounts.destination_account_info(),
            },
        ))?;

        // emit analytics log
        Self::log_successful_unstake(&ctx, unstake_result);

        Ok(())
    }
}
