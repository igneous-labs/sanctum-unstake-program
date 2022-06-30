use anchor_lang::prelude::*;

#[derive(PartialEq)]
#[error_code]
pub enum UnstakeError {
    #[msg("The provided LP token account is invalid")]
    InvalidLpTokenAccount, // 0x1770

    #[msg("Could not find PDA bump")]
    PdaBumpNotCached, // 0x1771

    #[msg("The provided fee authority does not have the authority over the provided pool account")]
    InvalidFeeAuthority, // 0x1772

    #[msg("The Authorized of the given stake account is None (possibly an uninitialized stake account was given)")]
    StakeAccountAuthorizedNotRetrievable, // 0x1773

    #[msg("The Lockup of the given stake account is None (possibly an uninitialized stake account was given)")]
    StakeAccountLockupNotRetrievable, // 0x1774

    #[msg("The provided stake account is locked up")]
    StakeAccountLockupInForce, // 0x1775

    #[msg("The provided description of fee violates the invariants")]
    InvalidFee, // 0x1776

    #[msg("Internal Error")]
    InternalError, // 0x1777

    #[msg("Not enough liquidity to service this unstake")]
    NotEnoughLiquidity, // 0x1778

    #[msg("Liquidity to add too little")]
    LiquidityToAddTooLittle, // 0x1779
}
