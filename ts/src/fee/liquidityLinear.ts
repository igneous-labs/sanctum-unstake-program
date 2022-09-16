import BN from "bn.js";
import { LiquidityLinearFeeInner } from "../types";
import { ApplyFeeArgs } from "./args";

export function applyLiquidityLinearFee(
  {
    liquidityLinear: {
      params: { maxLiqRemaining, zeroLiqRemaining },
    },
  }: LiquidityLinearFeeInner,
  { poolIncomingStake, solReservesLamports, stakeAccountLamports }: ApplyFeeArgs
): BN {
  const stakeAccountLamportsNumber = stakeAccountLamports.toNumber();
  const zeroLiqRemainingRatio =
    zeroLiqRemaining.num.toNumber() / zeroLiqRemaining.denom.toNumber();
  const maxLiqRemainingRatio =
    maxLiqRemaining.num.toNumber() / maxLiqRemaining.denom.toNumber();
  const ownedLamports = poolIncomingStake.add(solReservesLamports);
  // TODO: using number means max value of ownedLamports ~= 9M SOL. Change to smth like BigNumber or
  // decimal when required
  const slopeNum = zeroLiqRemainingRatio - maxLiqRemainingRatio;
  const slopeDenom = ownedLamports.toNumber();
  const incomingPlusStake = poolIncomingStake
    .add(stakeAccountLamports)
    .toNumber();
  const num =
    (slopeDenom * maxLiqRemainingRatio) / slopeNum + incomingPlusStake;
  const denom = slopeDenom / slopeNum + stakeAccountLamportsNumber;
  const ratio = num / denom;
  return new BN(Math.ceil(stakeAccountLamportsNumber * ratio));
}
