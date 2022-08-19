import { Address, IdlAccounts, ProgramAccount } from "@project-serum/anchor";
import { Unstake } from "../idl/idl";

type PoolAccountUnion = Address | ProgramAccount<IdlAccounts<Unstake>["pool"]>;

function isAddress(
  poolAccountUnion: PoolAccountUnion
): poolAccountUnion is Address {
  return (
    typeof poolAccountUnion === "string" || !("account" in poolAccountUnion)
  );
}

type DerivedPoolLpMint = {
  lpMint: Address;
  poolAccount: Address;
};

export function derivePoolLpMint(
  poolAccountUnion: PoolAccountUnion,
  lpMintOption?: Address
): DerivedPoolLpMint {
  if (isAddress(poolAccountUnion)) {
    if (!lpMintOption) {
      throw new Error(
        "LP mint must be provided if poolAccount is not a ProgramAccount"
      );
    }
    return {
      lpMint: lpMintOption,
      poolAccount: poolAccountUnion,
    };
  }
  return {
    lpMint: poolAccountUnion.account.lpMint,
    poolAccount: poolAccountUnion.publicKey,
  };
}

type DerivedPoolFeeAuthority = {
  feeAuthority: Address;
  poolAccount: Address;
};

export function derivePoolFeeAuthority(
  poolAccountUnion: PoolAccountUnion,
  feeAuthorityOption?: Address
): DerivedPoolFeeAuthority {
  if (isAddress(poolAccountUnion)) {
    if (!feeAuthorityOption) {
      throw new Error(
        "fee authority must be provided if poolAccount is not a ProgramAccount"
      );
    }
    return {
      feeAuthority: feeAuthorityOption,
      poolAccount: poolAccountUnion,
    };
  }
  return {
    feeAuthority: poolAccountUnion.account.feeAuthority,
    poolAccount: poolAccountUnion.publicKey,
  };
}
