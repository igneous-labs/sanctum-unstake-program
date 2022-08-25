import { Address, IdlAccounts, ProgramAccount } from "@project-serum/anchor";
import { Unstake } from "../idl/idl";
import { ProtocolFeeAccount } from "../types";

type PoolAccountUnion = Address | ProgramAccount<IdlAccounts<Unstake>["pool"]>;

function isAddress<T>(union: Address | T): union is Address {
  return typeof union === "string" || "_bn" in union;
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

type DerivedProtocolFeeAddresses = {
  protocolFeeAccount: Address;
  protocolFeeDestination: Address;
};

export function deriveProtocolFeeAddresses(
  protocolFeeAccountUnion: Address | ProgramAccount<ProtocolFeeAccount>,
  protocolFeeDestinationOption?: Address
): DerivedProtocolFeeAddresses {
  if (isAddress(protocolFeeAccountUnion)) {
    if (!protocolFeeDestinationOption) {
      throw new Error(
        "protocol fee destination must be provided if protocolFee is not a ProgramAccount"
      );
    }
    return {
      protocolFeeAccount: protocolFeeAccountUnion,
      protocolFeeDestination: protocolFeeDestinationOption,
    };
  }
  return {
    protocolFeeAccount: protocolFeeAccountUnion.publicKey,
    protocolFeeDestination: protocolFeeAccountUnion.account.destination,
  };
}
