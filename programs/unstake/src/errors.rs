use anchor_lang::prelude::*;

#[error_code]
pub enum UnstakeError {
    #[msg("The provided LP token account is invalid")]
    InvalidLpTokenAccount, // 0x1770

    #[msg("Failed to calculate amount of LP tokens to mint")]
    LpMintCalculationFailure, // 0x1771

    #[msg("Overflow attempting to add SOL liquidity")]
    AddLiquiditySolOverflow, // 0x1772

    #[msg("Could not find PDA bump")]
    PdaBumpNotCached, // 0x1773

    #[msg("Failed to calculate amount of SOL liquidity to remove")]
    RemoveSolCalculationFailure, // 0x1774

    #[msg("Overflow attempting to remove SOL liquidity")]
    RemoveLiquiditySolOverflow, // 0x1775
}
