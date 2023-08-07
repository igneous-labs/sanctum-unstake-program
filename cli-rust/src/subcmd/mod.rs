use clap::Subcommand;

mod add_liquidity;
mod create_pool;
mod deactivate_all;
mod deactivate_stake_account;
mod fetch_protocol_fee;
mod init_protocol_fee;
mod reclaim_all;
mod reclaim_stake_account;
mod remove_liquidity;
mod set_fee;
mod set_fee_authority;
mod set_flash_loan_fee;
mod set_lp_token_metadata;
// mod unstakes;
mod view_pool;

pub use add_liquidity::*;
pub use create_pool::*;
pub use deactivate_all::*;
pub use deactivate_stake_account::*;
pub use fetch_protocol_fee::*;
pub use init_protocol_fee::*;
pub use reclaim_all::*;
pub use reclaim_stake_account::*;
pub use remove_liquidity::*;
pub use set_fee::*;
pub use set_fee_authority::*;
pub use set_flash_loan_fee::*;
pub use set_lp_token_metadata::*;
// pub use unstakes::*;
pub use view_pool::*;

#[derive(Debug, Subcommand)]
pub enum Subcmd {
    AddLiquidity(AddLiquidityArgs),
    CreatePool(CreatePoolArgs),
    DeactivateAll(DeactivateAllArgs),
    DeactivateStakeAccount(DeactivateStakeAccountArgs),
    FetchProtocolFee(FetchProtocolFeeArgs),
    InitProtocolFee(InitProtocolFeeArgs),
    ReclaimAll(ReclaimAllArgs),
    ReclaimStakeAccount(ReclaimStakeAccountArgs),
    RemoveLiquidity(RemoveLiquidityArgs),
    SetFlashLoanFee(SetFlashLoanFeeArgs),
    SetFee(SetFeeArgs),
    SetFeeAuthority(SetFeeAuthorityArgs),
    SetLpTokenMetadata(SetLpTokenMetadataArgs),
    // Unstakes(UnstakesArgs),
    ViewPool(ViewPoolArgs),
}

pub trait SubcmdExec {
    fn process_cmd(&self, args: &crate::Args);
}

impl SubcmdExec for Subcmd {
    fn process_cmd(&self, args: &crate::Args) {
        match self {
            Self::AddLiquidity(a) => a.process_cmd(args),
            Self::CreatePool(a) => a.process_cmd(args),
            Self::DeactivateAll(a) => a.process_cmd(args),
            Self::DeactivateStakeAccount(a) => a.process_cmd(args),
            Self::FetchProtocolFee(a) => a.process_cmd(args),
            Self::InitProtocolFee(a) => a.process_cmd(args),
            Self::ReclaimAll(a) => a.process_cmd(args),
            Self::ReclaimStakeAccount(a) => a.process_cmd(args),
            Self::RemoveLiquidity(a) => a.process_cmd(args),
            Self::SetFlashLoanFee(a) => a.process_cmd(args),
            Self::SetFee(a) => a.process_cmd(args),
            Self::SetFeeAuthority(a) => a.process_cmd(args),
            Self::SetLpTokenMetadata(a) => a.process_cmd(args),
            // Self::Unstakes(a) => a.process_cmd(args),
            Self::ViewPool(a) => a.process_cmd(args),
        }
    }
}
