import { Address, Program } from "@project-serum/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import { Unstake } from "../idl/idl";
import { findPoolFeeAccount, findPoolSolReserves } from "../pda";
import { Fee } from "../types";

export type CreatePoolAccounts = {
  /**
   * The feeAuthority of the new liquidity pool
   */
  feeAuthority: Address;

  /**
   * The liquidity pool to be created.
   */
  poolAccount: Address;

  /**
   * The LP mint of the liquidity pool to be created.
   */
  lpMint: Address;

  /**
   * The SOL account paying for the transaction and rent.
   * Defaults to feeAuthority if not provided
   */
  payer?: Address;
};

/**
 *
 * @param program
 * @param accounts
 * @returns the created create_pool transaction
 */
export async function createPoolTx(
  program: Program<Unstake>,
  fee: Fee,
  { feeAuthority, poolAccount, lpMint, payer: payerOption }: CreatePoolAccounts
): Promise<Transaction> {
  const payer = payerOption ?? feeAuthority;

  const poolAccountPk = new PublicKey(poolAccount);
  const [poolSolReserves] = await findPoolSolReserves(
    program.programId,
    poolAccountPk
  );
  const [feeAccount] = await findPoolFeeAccount(
    program.programId,
    poolAccountPk
  );

  return program.methods
    .createPool(fee)
    .accounts({
      payer,
      feeAuthority,
      poolAccount,
      lpMint,
      poolSolReserves,
      feeAccount,
    })
    .transaction();
}
