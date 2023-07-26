use borsh::{BorshDeserialize, BorshSerialize};
#[derive(Clone, Debug, BorshDeserialize, BorshSerialize)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct DataV2LpToken {
    pub name: String,
    pub symbol: String,
    pub uri: String,
}
#[derive(Clone, Debug, BorshDeserialize, BorshSerialize)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Rational {
    pub num: u64,
    pub denom: u64,
}
#[derive(Clone, Debug, BorshDeserialize, BorshSerialize)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct LiquidityLinearParams {
    pub max_liq_remaining: Rational,
    pub zero_liq_remaining: Rational,
}
#[derive(Clone, Debug, BorshDeserialize, BorshSerialize)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum FeeEnum {
    Flat { ratio: Rational },
    LiquidityLinear { params: LiquidityLinearParams },
}
