import { Address, Program } from "@project-serum/anchor";
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
  poolAccount: Address;

  /**
   * The stake account to unstake
   */
  stakeAccount: Address;

  /**
   * `stakeAcc`'s withdraw authority
   */
  unstaker: Address;

  /**
   * The SOL account paying for the transaction and rent.
   * Defaults to `unstaker` if unspecified
   */
  payer?: Address;

  /**
   * The SOL account to receive the unstaked SOL.
   * Defaults to `unstaker` if unspecified
   */
  destination?: Address;
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

  const poolAccountPk = new PublicKey(poolAccount);
  const stakeAccountPk = new PublicKey(stakeAccount);
  const [poolSolReserves] = await findPoolSolReserves(
    program.programId,
    poolAccountPk
  );
  const [feeAccount] = await findPoolFeeAccount(
    program.programId,
    poolAccountPk
  );
  const [stakeAccountRecordAccount] = await findStakeAccountRecordAccount(
    program.programId,
    poolAccountPk,
    stakeAccountPk
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
