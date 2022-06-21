// copied from
// - https://github.com/solana-labs/solana/blob/master/explorer/src/validators/pubkey.ts
// - https://github.com/solana-labs/solana/blob/master/explorer/src/validators/bignum.ts
// - https://github.com/solana-labs/solana/blob/master/explorer/src/validators/accounts/stake.ts

/* eslint-disable @typescript-eslint/no-redeclare */
import BN from "bn.js";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  coerce,
  create,
  enums,
  Infer,
  instance,
  nullable,
  number,
  string,
  type,
} from "superstruct";

export const PublicKeyFromString = coerce(
  instance(PublicKey),
  string(),
  (value) => new PublicKey(value)
);

export const BigNumFromString = coerce(instance(BN), string(), (value) => {
  if (typeof value === "string") return new BN(value, 10);
  throw new Error("invalid big num");
});

export type StakeAccountType = Infer<typeof StakeAccountType>;
export const StakeAccountType = enums([
  "uninitialized",
  "initialized",
  "delegated",
  "rewardsPool",
]);

export type StakeMeta = Infer<typeof StakeMeta>;
export const StakeMeta = type({
  rentExemptReserve: BigNumFromString,
  authorized: type({
    staker: PublicKeyFromString,
    withdrawer: PublicKeyFromString,
  }),
  lockup: type({
    unixTimestamp: number(),
    epoch: number(),
    custodian: PublicKeyFromString,
  }),
});

export type StakeAccountInfo = Infer<typeof StakeAccountInfo>;
export const StakeAccountInfo = type({
  meta: StakeMeta,
  stake: nullable(
    type({
      delegation: type({
        voter: PublicKeyFromString,
        stake: BigNumFromString,
        activationEpoch: BigNumFromString,
        deactivationEpoch: BigNumFromString,
        warmupCooldownRate: number(),
      }),
      creditsObserved: number(),
    })
  ),
});

export type StakeAccount = Infer<typeof StakeAccount>;
export const StakeAccount = type({
  type: StakeAccountType,
  info: StakeAccountInfo,
});

export type StakeState = "inactive" | "activating" | "active" | "deactivating";

export function stakeAccountState(
  { type, info: { stake } }: StakeAccount,
  currentEpoch: BN
): StakeState {
  if (type !== "delegated" || stake === null) {
    return "inactive";
  }

  const activationEpoch = new BN(stake.delegation.activationEpoch);
  const deactivationEpoch = new BN(stake.delegation.deactivationEpoch);

  if (activationEpoch.gt(currentEpoch)) {
    return "inactive";
  }
  if (activationEpoch.eq(currentEpoch)) {
    // if you activate then deactivate in the same epoch,
    // deactivationEpoch === activationEpoch.
    // if you deactivate then activate again in the same epoch,
    // the deactivationEpoch will be reset to EPOCH_MAX
    if (deactivationEpoch.eq(activationEpoch)) return "inactive";
    return "activating";
  }
  // activationEpoch < currentEpoch
  if (deactivationEpoch.gt(currentEpoch)) return "active";
  if (deactivationEpoch.eq(currentEpoch)) return "deactivating";
  return "inactive";
}

export async function getStakeAccount(
  connection: Connection,
  pubkey: PublicKey
): Promise<StakeAccount> {
  const { value: account } = await connection.getParsedAccountInfo(pubkey);
  if (!("parsed" in account.data))
    throw new Error(`Could not parse stake acc ${pubkey.toString()}`);
  return create(account.data.parsed, StakeAccount);
}
