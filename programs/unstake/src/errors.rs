use anchor_lang::prelude::*;

#[error_code]
pub enum UnstakeError {
    #[msg("The provided LP token account is invalid")]
    InvalidLpTokenAccount, // 0x1770

    #[msg("Failed to calculate amount of LP tokens to mint")]
    LpMintCalculationFailure, // 0x1771 TODO: REMOVE

    #[msg("Overflow attempting to add SOL liquidity")]
    AddLiquiditySolOverflow, // 0x1772 TODO: REMOVE

    #[msg("Could not find PDA bump")]
    PdaBumpNotCached, // 0x1773

    #[msg("Failed to calculate amount of SOL liquidity to remove")]
    RemoveSolCalculationFailure, // 0x1774 TODO: REMOVE

    #[msg("Overflow attempting to remove SOL liquidity")]
    RemoveLiquiditySolOverflow, // 0x1775

    #[msg("The provided fee authority does not have the authority over the provided pool account")]
    InvalidFeeAuthority, // 0x1776

    #[msg("The Authorized of the given stake account is None (possibly an uninitialized stake account was given)")]
    StakeAccountAuthorizedNotRetrievable, // 0x1777

    #[msg("The Lockup of the given stake account is None (possibly an uninitialized stake account was given)")]
    StakeAccountLockupNotRetrievable, // 0x1778

    #[msg("The provided statke account is not owned by the unstaker")]
    StakeAccountNotOwned, // 0x1779

    #[msg("The provided statke account is locked up")]
    StakeAccountLockupInForce, // 0x177a

    #[msg("The provided description of fee violates the invariants")]
    InvalidFee, // 0x177b

    #[msg("Internal Error")]
    InternalError, // 0x177c

    #[msg("Not enough liquidity to service this unstake")]
    NotEnoughLiquidity, // 0x177d
}
