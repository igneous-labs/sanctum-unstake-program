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

use instructions::*;
use state::*;

#[program]
pub mod unstake {
    use super::*;

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

    pub fn deactivate_stake_account(ctx: Context<DeactivateStakeAccount>) -> Result<()> {
        DeactivateStakeAccount::run(ctx)
    }

    pub fn reclaim_stake_account(ctx: Context<ReclaimStakeAccount>) -> Result<()> {
        ReclaimStakeAccount::run(ctx)
    }

    pub fn unstake(ctx: Context<Unstake>) -> Result<()> {
        Unstake::run(ctx)
    }

    pub fn unstake_wsol(ctx: Context<UnstakeWSOL>) -> Result<()> {
        UnstakeWSOL::run(ctx)
    }
}
