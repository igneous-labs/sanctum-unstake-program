use spl_math::precise_number::PreciseNumber;
use unstake_interface::{FeeEnum, LiquidityLinearParams, Rational};

use crate::RationalQty;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct PoolBalance {
    pub pool_incoming_stake: u64,
    pub sol_reserves_lamports: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ApplyFeeArgs {
    pub pool_balance: PoolBalance,
    pub stake_account_lamports: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ReverseFeeArgs {
    pub pool_balance: PoolBalance,
    pub lamports_after_fee: u64,
}

pub trait UnstakeFeeCalc {
    fn is_valid(&self) -> bool;

    /// Returns the number of lamports to deduct from
    /// `stake_account_lamports` as the fee charged.
    ///
    /// Returns None if any calculation errors occurred
    fn apply(&self, args: ApplyFeeArgs) -> Option<u64>;

    /// Returns a possible `stake_account_lamports` value that was fed
    /// into `self.apply()` s.t.
    /// `stake_account_lamports - self.apply(stake_account_lamports) = lamports_after_fee`
    ///
    /// Returns None if any calculation errors occured
    fn pseudo_reverse(&self, args: ReverseFeeArgs) -> Option<u64>;
}

impl<T: UnstakeFeeCalc + ?Sized> UnstakeFeeCalc for &T {
    fn is_valid(&self) -> bool {
        (*self).is_valid()
    }

    fn apply(&self, args: ApplyFeeArgs) -> Option<u64> {
        (*self).apply(args)
    }

    fn pseudo_reverse(&self, args: ReverseFeeArgs) -> Option<u64> {
        (*self).pseudo_reverse(args)
    }
}

impl UnstakeFeeCalc for FeeEnum {
    fn is_valid(&self) -> bool {
        match self {
            Self::Flat { ratio } => is_flat_fee_valid(ratio),
            Self::LiquidityLinear { params } => is_liq_linear_fee_valid(params),
        }
    }

    fn apply(&self, args: ApplyFeeArgs) -> Option<u64> {
        let fee_ratio = match self {
            FeeEnum::Flat { ratio } => ratio.to_precise_number()?,
            FeeEnum::LiquidityLinear { params } => params.to_fee_ratio(args)?,
        };

        PreciseNumber::new(args.stake_account_lamports as u128)?
            .checked_mul(&fee_ratio)?
            .ceiling()?
            .to_imprecise()
            .and_then(|v| u64::try_from(v).ok())
    }

    fn pseudo_reverse(&self, args: ReverseFeeArgs) -> Option<u64> {
        let fee_ratio = match self {
            FeeEnum::Flat { ratio } => ratio.to_precise_number()?,
            FeeEnum::LiquidityLinear { params } => params.pseudo_reverse_to_fee_ratio(args)?,
        };
        let invert_by = PreciseNumber::new(1)?.checked_sub(&fee_ratio)?;

        PreciseNumber::new(args.lamports_after_fee as u128)?
            .checked_div(&invert_by)?
            .ceiling()?
            .to_imprecise()
            .and_then(|v| u64::try_from(v).ok())
    }
}

pub fn is_flat_fee_valid(ratio: &Rational) -> bool {
    ratio.is_valid() && ratio.is_lte_one()
}

pub fn is_liq_linear_fee_valid(params: &LiquidityLinearParams) -> bool {
    if !params.zero_liq_remaining.is_valid()
        || !params.zero_liq_remaining.is_lte_one()
        || !params.max_liq_remaining.is_valid()
        || !params.max_liq_remaining.is_lte_one()
    {
        return false;
    }
    let zero: u128 = params.zero_liq_remaining.num as u128 * params.max_liq_remaining.denom as u128;
    let max: u128 = params.max_liq_remaining.num as u128 * params.zero_liq_remaining.denom as u128;
    max <= zero
}

#[derive(Clone, Debug, PartialEq)]
pub struct LiqLinearParams {
    /// y-intercept of the fee ratio line
    pub max_liq_fee: PreciseNumber,
    pub slope_num: PreciseNumber,
    pub slope_denom: PreciseNumber,
}

pub trait LiqLinearFeeRatio {
    fn liq_linear_params(&self, pool_balance: PoolBalance) -> Option<LiqLinearParams>;

    fn to_fee_ratio(&self, args: ApplyFeeArgs) -> Option<PreciseNumber>;

    fn pseudo_reverse_to_fee_ratio(&self, args: ReverseFeeArgs) -> Option<PreciseNumber>;
}

impl<T: LiqLinearFeeRatio + ?Sized> LiqLinearFeeRatio for &T {
    fn liq_linear_params(&self, pool_balance: PoolBalance) -> Option<LiqLinearParams> {
        (*self).liq_linear_params(pool_balance)
    }

    fn to_fee_ratio(&self, args: ApplyFeeArgs) -> Option<PreciseNumber> {
        (*self).to_fee_ratio(args)
    }

    fn pseudo_reverse_to_fee_ratio(&self, args: ReverseFeeArgs) -> Option<PreciseNumber> {
        (*self).pseudo_reverse_to_fee_ratio(args)
    }
}

impl LiqLinearFeeRatio for LiquidityLinearParams {
    fn liq_linear_params(
        &self,
        PoolBalance {
            pool_incoming_stake,
            sol_reserves_lamports,
        }: PoolBalance,
    ) -> Option<LiqLinearParams> {
        let zero_liq_fee = self.zero_liq_remaining.to_precise_number()?;
        let max_liq_fee = self.max_liq_remaining.to_precise_number()?;
        let owned_lamports =
            (pool_incoming_stake as u128).checked_add(sol_reserves_lamports as u128)?;

        let slope_num = zero_liq_fee.checked_sub(&max_liq_fee)?;
        let slope_denom = PreciseNumber::new(owned_lamports)?;
        Some(LiqLinearParams {
            max_liq_fee,
            slope_num,
            slope_denom,
        })
    }

    fn to_fee_ratio(
        &self,
        ApplyFeeArgs {
            pool_balance,
            stake_account_lamports,
        }: ApplyFeeArgs,
    ) -> Option<PreciseNumber> {
        // linear interpolation from max_liq_remaining to zero_liq_remaining where y-intercept at max_liq_remaining
        // x-axis is liquidity consumed in lamports
        // y-axis is fee ratio (e.g. 0.01 is 1% fees)
        // let I = pool_incoming_stake, S = stake_account_lamports,
        //
        //                  fee ratio
        //   zero_liq_remaining -^------------/
        //                       |           /|
        //                       |          / |
        //         charge y here-|---------/  |
        //                       |        /|  |
        //                       |       / |  |
        //                       |      /  |  |
        //                       |     /   |  |
        //                       |    /    |  |
        //                       |   /     |  |
        //                       |  /      |  |
        //                       | /|      |  |
        //                       |/ |      |  |
        // c (max_liq_remaining)-|  |      |  |
        //                       |  |      |  |
        //         --------------|--|------|--|-------------------> liquidity consumed
        //                          I I+(1-y)S total amount of lamports in pool
        //
        // m = slope, c = y-intercept at max_liq_remaining
        // new liquidity consumed after unstake = I + (1 - y)S
        // y = m(I + (1 - y)S) + c
        // y = mI + mS - mSy + c
        // y(1 + mS) = m(I + S) + c
        // y = (m(I + S) + c) / (1 + mS)
        //
        // since m <<< 1, use 1/m where possible to preserve precision
        // y = m(I + S + c/m) / m(1/m + S)
        // y = (I + S + c/m) / (1/m + S)
        // TODO: check overflow conditions due to large numbers
        //
        // note: fee_ratio can go >zero_liq_remaining
        // if I + (1 - y)S > pool_owned_lamports

        let LiqLinearParams {
            max_liq_fee,
            slope_num,
            slope_denom,
        } = self.liq_linear_params(pool_balance)?;

        let incoming_plus_stake = (pool_balance.pool_incoming_stake as u128)
            .checked_add(stake_account_lamports as u128)?;
        let num = slope_denom
            .checked_mul(&max_liq_fee)?
            .checked_div(&slope_num)?
            .checked_add(&PreciseNumber::new(incoming_plus_stake)?)?;
        let denom = slope_denom
            .checked_div(&slope_num)?
            .checked_add(&PreciseNumber::new(stake_account_lamports as u128)?)?;
        num.checked_div(&denom)
    }

    fn pseudo_reverse_to_fee_ratio(
        &self,
        ReverseFeeArgs {
            pool_balance,
            lamports_after_fee,
        }: ReverseFeeArgs,
    ) -> Option<PreciseNumber> {
        // From above:
        // let z = lamports_after_fee = (1 - y)S
        // y = m(I + (1 - y)S) + c
        // y = m(I + z) + c

        let LiqLinearParams {
            max_liq_fee,
            slope_num,
            slope_denom,
        } = self.liq_linear_params(pool_balance)?;

        let incoming_plus_after_fee =
            (pool_balance.pool_incoming_stake as u128).checked_add(lamports_after_fee as u128)?;

        let num = slope_num.checked_mul(&PreciseNumber::new(incoming_plus_after_fee)?)?;
        num.checked_div(&slope_denom)
            .and_then(|x| x.checked_add(&max_liq_fee))
    }
}

#[cfg(test)]
mod tests {
    use proptest::prelude::*;

    use super::*;

    prop_compose! {
        fn pool_balances()
            (pool_incoming_stake in any::<u64>())
            (sol_reserves_lamports in 0..=(u64::MAX - pool_incoming_stake), pool_incoming_stake in Just(pool_incoming_stake)) -> PoolBalance {
                PoolBalance { pool_incoming_stake, sol_reserves_lamports }
            }
    }

    prop_compose! {
        fn valid_ratio_lte_one()
            (denom in 1..=u64::MAX)
            (num in 0..=denom, denom in Just(denom)) -> Rational {
                Rational { num, denom }
            }
    }

    prop_compose! {
        fn flat_fees()
            (ratio in valid_ratio_lte_one()) -> FeeEnum {
                FeeEnum::Flat { ratio }
            }
    }

    prop_compose! {
        fn liq_linear_fees()
            (r1 in valid_ratio_lte_one(), r2 in valid_ratio_lte_one()) -> FeeEnum {
                let c1: u128 = r1.num as u128 * r2.denom as u128;
                let c2: u128 = r2.num as u128 * r1.denom as u128;
                if c1 >= c2 {
                    FeeEnum::LiquidityLinear { params: LiquidityLinearParams { max_liq_remaining: r2, zero_liq_remaining: r1 } }
                } else {
                    FeeEnum::LiquidityLinear { params: LiquidityLinearParams { max_liq_remaining: r1, zero_liq_remaining: r2 } }
                }
            }
    }

    proptest! {
        #[test]
        fn flat_fee_pseudo_reverse_round_trip(pool_balance in pool_balances(), fee in flat_fees(), stake_account_lamports: u64) {
            let fee_lamports = fee.apply(ApplyFeeArgs {
                pool_balance,
                stake_account_lamports,
            }).unwrap();
            let lamports_after_fee = stake_account_lamports - fee_lamports;
            if lamports_after_fee > 0 {
                let reversed = fee.pseudo_reverse(ReverseFeeArgs { pool_balance, lamports_after_fee }).unwrap();
                let reversed_fee = fee.apply(ApplyFeeArgs { pool_balance, stake_account_lamports: reversed }).unwrap();
                prop_assert_eq!(lamports_after_fee, reversed - reversed_fee);
            }
        }
    }

    proptest! {
        #[test]
        fn liq_linear_pseudo_reverse_round_trip(pool_balance in pool_balances(), fee in liq_linear_fees(), stake_account_lamports: u64) {
            let fee_lamports = fee.apply(ApplyFeeArgs {
                pool_balance,
                stake_account_lamports,
            }).unwrap();
            let lamports_after_fee = stake_account_lamports - fee_lamports;
            if lamports_after_fee > 0 {
                let reversed = fee.pseudo_reverse(ReverseFeeArgs { pool_balance, lamports_after_fee }).unwrap();
                let reversed_fee = fee.apply(ApplyFeeArgs { pool_balance, stake_account_lamports: reversed }).unwrap();
                prop_assert_eq!(lamports_after_fee, reversed - reversed_fee);
            }
        }
    }
}
