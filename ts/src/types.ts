import { KeyedStakeAccountInfo, StakeState } from "@soceanfi/solana-stake-sdk";
import BN from "bn.js";

export type LiquidityPoolStakeAccounts = {
  [k in StakeState]: KeyedStakeAccountInfo[];
};

// IdlAccounts<Unstake>["fee"] returns { fee: never },
// probably due to anchor not handling enums properly
export type Fee = {
  fee:
    | {
        liquidityLinear: {
          params: {
            maxLiqRemaining: {
              num: BN;
              denom: BN;
            };
            zeroLiqRemaining: {
              num: BN;
              denom: BN;
            };
          };
        };
      }
    | {
        flat: {
          ratio: {
            num: BN;
            denom: BN;
          };
        };
      };
};
