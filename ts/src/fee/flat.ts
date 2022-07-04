import BN from "bn.js";
import { FlatFeeInner } from "../types";
import { ApplyFeeArgs } from "./args";

export function applyFlatFee(
  {
    flat: {
      ratio: { num, denom },
    },
  }: FlatFeeInner,
  { stakeAccountLamports }: ApplyFeeArgs
): BN {
  const ratio = num.toNumber() / denom.toNumber();
  return new BN(Math.ceil(stakeAccountLamports.toNumber() * ratio));
}
