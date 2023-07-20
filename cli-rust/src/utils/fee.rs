use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct LiquidityLinearFeeParams {
    pub max_liq_remaining: f64,
    pub zero_liq_remaining: f64,
}

#[derive(Debug, Deserialize)]
struct LiquidityLinearFeeArg(LiquidityLinearFeeParams);

#[derive(Debug, Deserialize)]
struct FlatFeeArg(f64);

#[derive(Debug, Deserialize)]
enum FeeArg {
    #[serde(rename = "liquidity_linear")]
    LiquidityLinear(LiquidityLinearFeeArg),
    #[serde(rename = "flat")]
    Flat(FlatFeeArg),
}

fn number_to_positive_rational_checked(n: f64) -> unstake_interface::Rational {
    if n < 0.0 {
        panic!("Only positive numbers allowed, {} given", n);
    }
    let s = n.to_string();
    let dpi = s.find('.').unwrap_or(s.len());
    if dpi == s.len() {
        return unstake_interface::Rational {
            num: n as u64,
            denom: 1,
        };
    }
    let dps = (s.len() - dpi - 1) as isize;
    if dps < 0 {
        panic!("Could not convert {} to rational", n);
    }
    let num = s[..dpi].to_string() + &s[dpi + 1..];
    let denom = 10_i64.pow(dps as u32) as u64;
    unstake_interface::Rational {
        num: num.parse().unwrap(),
        denom,
    }
}

fn to_fee_checked(fee_arg: &FeeArg) -> unstake_interface::Fee {
    match fee_arg {
        FeeArg::LiquidityLinear(fee) => to_liquidity_linear_fee_checked(fee),
        FeeArg::Flat(fee) => to_flat_fee_checked(fee),
    }
}

fn to_liquidity_linear_fee_checked(
    liquidity_linear: &LiquidityLinearFeeArg,
) -> unstake_interface::Fee {
    if liquidity_linear.0.max_liq_remaining > liquidity_linear.0.zero_liq_remaining {
        panic!("maxLiqRemaining should be <= zeroLiqRemaining");
    }
    let max_liq_remaining =
        number_to_positive_rational_checked(liquidity_linear.0.max_liq_remaining);
    let zero_liq_remaining =
        number_to_positive_rational_checked(liquidity_linear.0.zero_liq_remaining);
    unstake_interface::Fee {
        fee: unstake_interface::FeeEnum::LiquidityLinear {
            params: unstake_interface::LiquidityLinearParams {
                max_liq_remaining,
                zero_liq_remaining,
            },
        },
    }
}

fn to_flat_fee_checked(flat: &FlatFeeArg) -> unstake_interface::Fee {
    unstake_interface::Fee {
        fee: unstake_interface::FeeEnum::Flat {
            ratio: number_to_positive_rational_checked(flat.0),
        },
    }
}

pub fn convert_fee(fee_path: &str) -> unstake_interface::Fee {
    let fee_string = std::fs::read_to_string(fee_path).unwrap();
    let fee: FeeArg = serde_json::from_str(&fee_string).unwrap();

    to_fee_checked(&fee)
}
