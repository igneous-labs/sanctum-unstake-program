import { KeyedStakeAccountInfo, StakeState } from "@soceanfi/solana-stake-sdk";
import BN from "bn.js";

export type LiquidityPoolStakeAccounts = {
  [k in StakeState]: KeyedStakeAccountInfo[];
};

export type Rational = {
  num: BN;
  denom: BN;
};

export type LiquidityLinearFeeInner = {
  liquidityLinear: {
    params: {
      maxLiqRemaining: Rational;
      zeroLiqRemaining: Rational;
    };
  };
};

export type FlatFeeInner = {
  flat: {
    ratio: Rational;
  };
};

// IdlAccounts<Unstake>["fee"] returns { fee: never },
// probably due to anchor not handling enums properly
export type Fee = {
  fee: LiquidityLinearFeeInner | FlatFeeInner;
};
