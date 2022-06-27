import BN from "bn.js";
import { Program } from "@project-serum/anchor";
import {
  PublicKey,
  StakeProgram,
  SYSVAR_CLOCK_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import { Unstake } from "../idl/idl";
import {
  findPoolFeeAccount,
  findPoolSolReserves,
  findStakeAccountRecordAccount,
} from "../pda";

export type UnstakeAccounts = {
  /**
   * The liquidity pool to unstake from
   */
  poolAccount: PublicKey;

  /**
   * The stake account to unstake
   */
  stakeAccount: PublicKey;

  /**
   * `stakeAcc`'s withdraw authority
   */
  unstaker: PublicKey;

  /**
   * The SOL account paying for the transaction.
   * Defaults to `unstaker` if unspecified
   */
  payer?: PublicKey;

  /**
   * The SOL account to receive the unstaked SOL.
   * Defaults to `unstaker` if unspecified
   */
  destination?: PublicKey;
};

/**
 *
 * @param program
 * @param accounts
 * @returns the created unstake transaction
 */
export async function unstakeTx(
  program: Program<Unstake>,
  {
    poolAccount,
    stakeAccount,
    unstaker,
    payer: payerOption,
    destination: destinationOption,
  }: UnstakeAccounts
): Promise<Transaction> {
  const payer = payerOption ?? unstaker;
  const destination = destinationOption ?? unstaker;

  const [poolSolReserves] = await findPoolSolReserves(
    program.programId,
    poolAccount
  );
  const [feeAccount] = await findPoolFeeAccount(program.programId, poolAccount);
  const [stakeAccountRecordAccount] = await findStakeAccountRecordAccount(
    program.programId,
    poolAccount,
    stakeAccount
  );

  return program.methods
    .unstake()
    .accounts({
      payer,
      unstaker,
      stakeAccount,
      destination,
      poolAccount,
      poolSolReserves,
      feeAccount,
      stakeAccountRecordAccount,
      clock: SYSVAR_CLOCK_PUBKEY,
      stakeProgram: StakeProgram.programId,
    })
    .transaction();
}
