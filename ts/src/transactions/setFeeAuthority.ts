import {
  Address,
  IdlAccounts,
  Program,
  ProgramAccount,
} from "@project-serum/anchor";
import { Transaction } from "@solana/web3.js";
import { Unstake } from "../idl/idl";
import { derivePoolFeeAuthority } from "./utils";

export type SetFeeAuthorityAccounts = {
  /**
   * The liquidity pool's fee authority
   * Must be provided if `poolAccount` is `Address`.
   * Otherwise, uses the one read from `poolAccount`
   */
  feeAuthority?: Address;

  /**
   * The liquidity pool to set fee authority of
   */
  poolAccount: Address | ProgramAccount<IdlAccounts<Unstake>["pool"]>;

  /**
   * The new fee authority to update the fee authority with
   */
  newFeeAuthority: Address;
};

/**
 *
 * @param program
 * @param accounts
 * @returns the created set_fee_authority transaction
 */
export async function setFeeAuthorityTx(
  program: Program<Unstake>,
  {
    feeAuthority: feeAuthorityOption,
    poolAccount: poolAccountUnion,
    newFeeAuthority,
  }: SetFeeAuthorityAccounts
): Promise<Transaction> {
  const { feeAuthority, poolAccount } = derivePoolFeeAuthority(
    poolAccountUnion,
    feeAuthorityOption
  );

  return program.methods
    .setFeeAuthority()
    .accounts({
      feeAuthority,
      poolAccount,
      newFeeAuthority,
    })
    .transaction();
}
