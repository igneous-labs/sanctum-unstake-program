import BN from "bn.js";
import { Fee, ProtocolFeeAccount } from "../types";
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

export type ProtocolFeesLevied = {
  protocolLamports: BN;
  referrerLamports: BN;
};

/**
 *
 * @param protocolFeeAccount - the fetched protocol fee account
 * @param feeLamports - the fee in lamports to be charged for unstaking a stake account,
 *                      probably obtained from calling `applyFee()`
 * @returns the amount in lamports to be deducted from `feeLamports` as protocol fees
 */
export function applyProtocolFee(
  { feeRatio, referrerFeeRatio }: ProtocolFeeAccount,
  feeLamports: BN
): ProtocolFeesLevied {
  const totalProtocolFees = feeRatio.num.mul(feeLamports).div(feeRatio.denom);
  const referrerLamports = referrerFeeRatio.num
    .mul(totalProtocolFees)
    .div(referrerFeeRatio.denom);
  return {
    protocolLamports: totalProtocolFees.sub(referrerLamports),
    referrerLamports,
  };
}
