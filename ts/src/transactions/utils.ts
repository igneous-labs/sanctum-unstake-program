import { Address, IdlAccounts, ProgramAccount } from "@project-serum/anchor";
import { Unstake } from "../idl/idl";

type DerivedPoolAccounts = {
  lpMint: Address;
  poolAccount: Address;
};

export function derivePoolAccounts(
  poolAccountUnion: Address | ProgramAccount<IdlAccounts<Unstake>["pool"]>,
  lpMintOption?: Address
): DerivedPoolAccounts {
  const isPoolAccountAddress =
    typeof poolAccountUnion === "string" || !("account" in poolAccountUnion);
  let lpMint: Address;
  let poolAccount: Address;
  if (isPoolAccountAddress) {
    if (!lpMintOption) {
      throw new Error(
        "LP mint must be provided if poolAccount is not a ProgramAccount"
      );
    }
    lpMint = lpMintOption;
    poolAccount = poolAccountUnion;
  } else {
    lpMint = poolAccountUnion.account.lpMint;
    poolAccount = poolAccountUnion.publicKey;
  }
  return {
    lpMint,
    poolAccount,
  };
}
