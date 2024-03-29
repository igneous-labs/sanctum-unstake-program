#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

#[cfg(feature = "local-testing")]
declare_id!("6KBz9djJAH3gRHscq9ujMpyZ5bCK9a27o3ybDtJLXowz");

#[cfg(not(feature = "local-testing"))]
declare_id!("unpXTU2Ndrc7WWNyEhQWe4udTzSibLPi25SXv2xbCHQ");

pub mod anchor_len;
pub mod consts;
pub mod errors;
pub mod instructions;
pub mod rational;
pub mod state;
pub mod utils;

use instructions::*;
use state::*;

#[program]
pub mod unstake {
    use super::*;

    pub fn init_protocol_fee(ctx: Context<InitProtocolFee>) -> Result<()> {
        InitProtocolFee::run(ctx)
    }

    pub fn set_protocol_fee(ctx: Context<SetProtocolFee>, protocol_fee: ProtocolFee) -> Result<()> {
        SetProtocolFee::validate(&protocol_fee)?;
        SetProtocolFee::run(ctx, protocol_fee)
    }

    pub fn create_pool(ctx: Context<CreatePool>, fee: Fee) -> Result<()> {
        CreatePool::validate(&fee)?;
        CreatePool::run(ctx, fee)
    }

    pub fn add_liquidity(ctx: Context<AddLiquidity>, amount: u64) -> Result<()> {
        AddLiquidity::run(ctx, amount)
    }

    pub fn remove_liquidity(ctx: Context<RemoveLiquidity>, amount_lp: u64) -> Result<()> {
        RemoveLiquidity::run(ctx, amount_lp)
    }

    pub fn set_fee(ctx: Context<SetFee>, fee: Fee) -> Result<()> {
        SetFee::validate(&fee)?;
        SetFee::run(ctx, fee)
    }

    pub fn set_fee_authority(ctx: Context<SetFeeAuthority>) -> Result<()> {
        SetFeeAuthority::run(ctx)
    }

    pub fn set_lp_token_metadata(
        ctx: Context<SetLpTokenMetadata>,
        data: DataV2LpToken,
    ) -> Result<()> {
        SetLpTokenMetadata::run(ctx, data)
    }

    pub fn deactivate_stake_account(ctx: Context<DeactivateStakeAccount>) -> Result<()> {
        DeactivateStakeAccount::run(ctx)
    }

    pub fn reclaim_stake_account(ctx: Context<ReclaimStakeAccount>) -> Result<()> {
        ReclaimStakeAccount::run(ctx)
    }

    pub fn unstake<'info>(ctx: Context<'_, '_, '_, 'info, Unstake<'info>>) -> Result<()> {
        Unstake::run(ctx)
    }

    pub fn unstake_wsol<'info>(ctx: Context<'_, '_, '_, 'info, UnstakeWsol<'info>>) -> Result<()> {
        UnstakeWsol::run(ctx)
    }

    pub fn set_flash_loan_fee<'info>(
        ctx: Context<'_, '_, '_, 'info, SetFlashLoanFee<'info>>,
        flash_loan_fee: FlashLoanFee,
    ) -> Result<()> {
        SetFlashLoanFee::validate(&flash_loan_fee)?;
        SetFlashLoanFee::run(ctx, flash_loan_fee)
    }

    pub fn take_flash_loan<'info>(
        ctx: Context<'_, '_, '_, 'info, TakeFlashLoan<'info>>,
        lamports: u64,
    ) -> Result<()> {
        TakeFlashLoan::run(ctx, lamports)
    }

    pub fn repay_flash_loan<'info>(
        ctx: Context<'_, '_, '_, 'info, RepayFlashLoan<'info>>,
    ) -> Result<()> {
        RepayFlashLoan::run(ctx)
    }
}
