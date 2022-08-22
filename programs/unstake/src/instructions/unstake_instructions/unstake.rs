use anchor_lang::prelude::*;
use anchor_spl::stake::{Stake, StakeAccount};

use crate::{
    anchor_len::AnchorLen,
    errors::UnstakeError,
    state::{Fee, Pool, ProtocolFee, StakeAccountRecord, FEE_SEED_SUFFIX, PROTOCOL_FEE_SEED},
};

use super::unstake_accounts::UnstakeAccounts;

#[derive(Accounts)]
pub struct Unstake<'info> {
    /// pubkey paying for a new StakeAccountRecord account's rent
    #[account(mut)]
    pub payer: Signer<'info>,

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

    /// Solana native wallet pubkey to receive the unstaked amount
    #[account(mut)]
    pub destination: SystemAccount<'info>,

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
    #[account(
        init,
        payer = payer,
        space = StakeAccountRecord::LEN,
        seeds = [&pool_account.key().to_bytes(), &stake_account.key().to_bytes()],
        bump,
    )]
    pub stake_account_record_account: Account<'info, StakeAccountRecord>,

    #[account(
        seeds = [PROTOCOL_FEE_SEED],
        bump,
    )]
    pub protocol_fee_account: Account<'info, ProtocolFee>,

    /// CHECK: address-check checks that its the correct
    /// destination specified in `protocol_fee_account`
    #[account(
        mut,
        address = protocol_fee_account.destination @ UnstakeError::WrongProtocolFee,
    )]
    pub protocol_fee_destination: AccountInfo<'info>,

    pub clock: Sysvar<'info, Clock>,
    pub stake_program: Program<'info, Stake>,
    pub system_program: Program<'info, System>,
}

impl_unstake_accounts!(Unstake, 0);

impl<'info> Unstake<'info> {
    #[inline(always)]
    pub fn run(mut ctx: Context<Self>) -> Result<()> {
        let unstake_result = Self::run_unstake(&mut ctx)?;

        // emit analytics log
        Self::log_successful_unstake(&ctx, unstake_result);

        Ok(())
    }
}
