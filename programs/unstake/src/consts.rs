use anchor_lang::prelude::Pubkey;

pub const SOL_DECIMALS: u8 = 9;

/// b58: So11111111111111111111111111111111111111112
pub const WRAPPED_SOL_MINT: Pubkey = Pubkey::new_from_array([
    6, 155, 136, 87, 254, 171, 129, 132, 251, 104, 127, 99, 70, 24, 192, 53, 218, 196, 57, 220, 26,
    235, 59, 85, 152, 160, 240, 0, 0, 0, 0, 1,
]);
