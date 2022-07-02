import BN from "bn.js";
import { Fee } from "../types";
import { ApplyFeeArgs } from "./args";
import { applyFlatFee } from "./flat";
import { applyLiquidityLinearFee } from "./liquidityLinear";

export * from "./flat";
export * from "./liquidityLinear";

/**
 *
 * @param fee
 * @param args
 * @returns the fee in lamports to be charged for unstaking a stake account
 *          with lamports = stakeAccountLamports
 */
export function applyFee({ fee }: Fee, args: ApplyFeeArgs): BN {
  if ("liquidityLinear" in fee) {
    return applyLiquidityLinearFee(fee, args);
  } else if ("flat" in fee) {
    return applyFlatFee(fee, args);
  }
  throw new Error(`Unknown fee type: ${fee}`);
}
