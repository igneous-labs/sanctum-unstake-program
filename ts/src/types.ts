import { KeyedStakeAccountInfo, StakeState } from "@soceanfi/solana-stake-sdk";

export type LiquidityPoolStakeAccounts = {
  [k in StakeState]: KeyedStakeAccountInfo[];
};
