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

    #[msg("The provided fee authority does not have the authority over the provided pool account")]
    InvalidFeeAuthority, // 0x1776

    #[msg("The Authorized of the given stake account is None (possibly an uninitialized stake account was given)")]
    StakeAccountAuthorizedNotRetrievable, // 0x1777

    #[msg("The provided statke account is not owned by the unstaker")]
    StakeAccountNotOwned, // 0x1778

    #[msg("The pool does not have enough liquidity to service the unstaking")]
    NotEnoughLiquidity, // 0x1779

    #[msg("Internal Error")]
    InternalError, // 0x1780
}
