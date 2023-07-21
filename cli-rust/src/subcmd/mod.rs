use clap::Subcommand;

mod add_liquidity;
mod create_pool;
mod fetch_protocol_fee;
// mod init_protocol_fee;
// mod remove_liquidity;
mod set_fee;
// mod set_fee_authority;
// mod set_flash_loan_fee;
// mod unstakes;
mod view_pool;

pub use add_liquidity::*;
pub use create_pool::*;
pub use fetch_protocol_fee::*;
// pub use init_protocol_fee::*;
// pub use remove_liquidity::*;
pub use set_fee::*;
// pub use set_fee_authority::*;
// pub use set_flash_loan_fee::*;
// pub use unstakes::*;
pub use view_pool::*;

#[derive(Debug, Subcommand)]
pub enum Subcmd {
    AddLiquidity(AddLiquidityArgs),
    CreatePool(CreatePoolArgs),
    FetchProtocolFee(FetchProtocolFeeArgs),
    // InitProtocolFee(InitProtocolFeeArgs),
    // RemoveLiquidity(RemoveLiquidityArgs),
    SetFee(SetFeeArgs),
    // SetFeeAuthority(SetFeeAuthorityArgs),
    // SetFlashLoanFee(SetFlashLoanFeeArgs),
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
            Self::FetchProtocolFee(a) => a.process_cmd(args),
            // Self::InitProtocolFee(a) => a.process_cmd(args),
            // Self::RemoveLiquidity(a) => a.process_cmd(args),
            Self::SetFee(a) => a.process_cmd(args),
            // Self::SetFeeAuthority(a) => a.process_cmd(args),
            // Self::SetFlashLoanFee(a) => a.process_cmd(args),
            // Self::Unstakes(a) => a.process_cmd(args),
            Self::ViewPool(a) => a.process_cmd(args),
        }
    }
}
