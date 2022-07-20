import { Address, Program } from "@project-serum/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import { Unstake } from "../idl/idl";
import { findPoolFeeAccount } from "../pda";
import { Fee } from "../types";

export type SetFeeAccounts = {
  /**
   * The liquidity pool to set fee of
   */
  poolAccount: Address;

  /**
   * The liquidityt pool's fee authority
   */
  feeAuthority: Address;
};

/**
 *
 * @param program
 * @param newFee
 * @param accounts
 * @returns the created set_fee transaction
 */
export async function setFeeTx(
  program: Program<Unstake>,
  newFee: Fee,
  { poolAccount, feeAuthority }: SetFeeAccounts
): Promise<Transaction> {
  const [feeAccount] = await findPoolFeeAccount(
    program.programId,
    new PublicKey(poolAccount)
  );

  return program.methods
    .setFee(newFee)
    .accounts({
      feeAuthority,
      poolAccount,
      feeAccount,
    })
    .transaction();
}
