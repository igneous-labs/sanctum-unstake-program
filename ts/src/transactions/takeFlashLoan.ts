import { Address, Program, ProgramAccount } from "@project-serum/anchor";
import {
  PublicKey,
  Transaction,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";
import { Unstake } from "../idl/idl";
import {
  findFlashAccount,
  findFlashLoanFeeAccount,
  findPoolSolReserves,
  findProtocolFeeAccount,
} from "../pda";
import BN from "bn.js";
import { deriveProtocolFeeAddresses } from "./utils";
import { ProtocolFeeAccount } from "@/types";

export type TakeFlashLoan = {
  /**
   * The SOL account receiving and repaying the flash loan lamports
   */
  to: Address;

  /**
   * The liquidity pool to take and repay flash loan fee to
   */
  poolAccount: Address;

  /**
   * The program's protocol fee account
   */
  protocolFee?: ProgramAccount<ProtocolFeeAccount>;

  /**
   * The protocol fee payment destination.
   * Must be provided if `protocolFee` is not provided.
   * Otherwise, uses the one read from `protocolFee`
   */
  protocolFeeDestination?: Address;
};

/**
 *
 * @param program
 * @param amount in lamports
 * @param transaction to execute between taking and repaying flash loan
 * @param accounts
 * @returns the created transaction that takes a flash loan, executes passed transaction, and repays the flash loan
 */
export async function takeFlashLoanTx(
  program: Program<Unstake>,
  amountLamports: BN,
  transaction: Transaction,
  {
    to,
    poolAccount,
    protocolFee: protocolFeeOption,
    protocolFeeDestination: protocolFeeDestinationOption,
  }: TakeFlashLoan
): Promise<Transaction> {
  const [poolSolReserves] = await findPoolSolReserves(
    program.programId,
    new PublicKey(poolAccount)
  );
  const [flashAccount] = await findFlashAccount(
    program.programId,
    new PublicKey(poolAccount)
  );
  const takeFlashLoanIx = await program.methods
    .takeFlashLoan(amountLamports)
    .accounts({
      receiver: to,
      poolAccount,
      poolSolReserves,
      flashAccount,
      instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
    })
    .instruction();

  const [flashLoanFeeAccount] = await findFlashLoanFeeAccount(
    program.programId,
    new PublicKey(poolAccount)
  );

  const { protocolFeeAccount, protocolFeeDestination } =
    deriveProtocolFeeAddresses(
      protocolFeeOption ?? (await findProtocolFeeAccount(program.programId))[0],
      protocolFeeDestinationOption
    );

  const repayFlashLoanIx = await program.methods
    .repayFlashLoan()
    .accounts({
      repayer: to,
      poolAccount,
      poolSolReserves,
      flashAccount,
      flashLoanFeeAccount,
      protocolFeeAccount,
      protocolFeeDestination,
    })
    .instruction();

  transaction.instructions.unshift(takeFlashLoanIx);
  transaction.instructions.push(repayFlashLoanIx);
  return transaction;
}
