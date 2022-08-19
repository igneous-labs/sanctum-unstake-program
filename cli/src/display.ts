import { IdlAccounts } from "@project-serum/anchor";
import { Rational, Unstake } from "@unstake-it/sol";
import { parseLamportsToSol } from "./utils";

type PoolHr = {
  feeAuthority: string;
  lpMint: string;
  incomingStake: string;
};

export function poolToHr(pool: IdlAccounts<Unstake>["pool"]): PoolHr {
  return {
    feeAuthority: pool.feeAuthority.toString(),
    lpMint: pool.lpMint.toString(),
    incomingStake: `${parseLamportsToSol(pool.incomingStake)} SOL`,
  };
}

type ProtocolFeeHr = {
  destination: string;
  authority: string;
  feeRatio: string;
  referrerFeeRatio: string;
};

export function protocolFeeToHr({
  destination,
  authority,
  feeRatio,
  referrerFeeRatio,
}: IdlAccounts<Unstake>["protocolFee"]): ProtocolFeeHr {
  return {
    destination: destination.toString(),
    authority: authority.toString(),
    feeRatio: rationalToHr(feeRatio),
    referrerFeeRatio: rationalToHr(referrerFeeRatio),
  };
}

type LiqLinearFeeHr = {
  maxLiqRemaining: string;
  zeroLiqRemaining: string;
};

type FeeHr =
  | {
      liquidityLinear: LiqLinearFeeHr;
    }
  | {
      flat: string;
    };

function rationalToHr({ num, denom }: Rational): string {
  const rate = num.toNumber() / denom.toNumber();
  return `${rate * 100}% (num: ${num.toString()}, denom: ${denom.toString()})`;
}

export function feeToHr({ fee }: IdlAccounts<Unstake>["fee"]): FeeHr {
  if ("liquidityLinear" in fee) {
    const {
      liquidityLinear: {
        params: { maxLiqRemaining, zeroLiqRemaining },
      },
    } = fee;
    return {
      liquidityLinear: {
        maxLiqRemaining: rationalToHr(maxLiqRemaining),
        zeroLiqRemaining: rationalToHr(zeroLiqRemaining),
      },
    };
  } else if ("flat" in fee) {
    const {
      flat: { ratio },
    } = fee;
    return {
      flat: rationalToHr(ratio),
    };
  }
  throw new Error(`Unknown fee type: ${fee}`);
}
