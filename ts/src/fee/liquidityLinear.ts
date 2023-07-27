import BN from "bn.js";
import { LiquidityLinearFeeInner } from "../types";
import { ApplyFeeArgs } from "./args";

// TODO: this const is currently hardcoded, change if rent params changed
const STAKE_ACCOUNT_RECORD_ACCOUNT_RENT_EXEMPT_LAMPORTS: BN = new BN(1_002_240);

/**
 * Note: inaccurate if stake_account_record_account has lamports in it before executing the transaction
 * @param param0
 * @param param1
 * @returns
 */
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
  // need to subtract STAKE_ACCOUNT_RECORD_ACCOUNT_RENT_EXEMPT_LAMPORTS because
  // that SOL is transferred from reserves to make stake_account_record_account rent-exempt before levying fees
  const ownedLamports = poolIncomingStake
    .add(solReservesLamports)
    .sub(STAKE_ACCOUNT_RECORD_ACCOUNT_RENT_EXEMPT_LAMPORTS);
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
