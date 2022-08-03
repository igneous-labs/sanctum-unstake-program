import { Fee } from "@unstake-it/sol";
import { numberToPositiveRationalChecked } from "./utils";

export type LiquidityLinearFeeArg = {
  liquidityLinear: {
    maxLiqRemaining: number;
    zeroLiqRemaining: number;
  };
};

export type FlatFeeArg = {
  flat: number;
};

export type FeeArg = LiquidityLinearFeeArg | FlatFeeArg;

export function isLiquidityLinearFeeArg(
  arg: FeeArg
): arg is LiquidityLinearFeeArg {
  return "liquidityLinear" in arg;
}

export function isFlatFeeArg(arg: FeeArg): arg is FlatFeeArg {
  return "flat" in arg;
}

export function toFeeChecked(feeArg: FeeArg): Fee {
  if (isLiquidityLinearFeeArg(feeArg)) {
    return toLiquidityLinearFeeChecked(feeArg);
  } else if (isFlatFeeArg(feeArg)) {
    return toFlatFeeChecked(feeArg);
  }
  throw new Error(`Unknown fee type: ${feeArg}`);
}

function toLiquidityLinearFeeChecked({
  liquidityLinear: { maxLiqRemaining: maxN, zeroLiqRemaining: zeroN },
}: LiquidityLinearFeeArg): Fee {
  if (maxN > zeroN) {
    throw new Error("maxLiqRemaining should be <= zeroLiqRemaining");
  }
  const maxLiqRemaining = numberToPositiveRationalChecked(maxN);
  const zeroLiqRemaining = numberToPositiveRationalChecked(zeroN);
  return {
    fee: {
      liquidityLinear: {
        params: {
          maxLiqRemaining,
          zeroLiqRemaining,
        },
      },
    },
  };
}

function toFlatFeeChecked({ flat: flatN }: FlatFeeArg): Fee {
  return {
    fee: {
      flat: {
        ratio: numberToPositiveRationalChecked(flatN),
      },
    },
  };
}
