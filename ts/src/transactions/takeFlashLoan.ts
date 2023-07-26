import { Address, Program } from "@project-serum/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import { Unstake } from "../idl/idl";
import {
  findFlashAccount,
  findFlashLoanFeeAccount,
  findPoolSolReserves,
  findProtocolFeeAccount,
} from "../pda";
import BN from "bn.js";

export type TakeFlashLoan = {
  /**
   * The SOL account receiving and repaying the flash loan lamports
   */
  to: Address;

  /**
   * The liquidity pool to take and repay flash loan fee to
   */
  poolAccount: Address;
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
  { to, poolAccount }: TakeFlashLoan
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
    })
    .instruction();

  const [flashLoanFeeAccount] = await findFlashLoanFeeAccount(
    program.programId,
    new PublicKey(poolAccount)
  );
  const [protocolFeeAccount] = await findProtocolFeeAccount(program.programId);
  const { destination: protocolFeeDestination } =
    await program.account.protocolFee.fetch(protocolFeeAccount);

  const repayFlashLoanIx = await program.methods
    .repayFlashLoan(amountLamports)
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

  const bh = await program.provider.connection.getLatestBlockhash();
  const feePayer = typeof to === "string" ? new PublicKey(to) : to;

  return new Transaction({ ...bh, feePayer })
    .add(takeFlashLoanIx)
    .add(transaction)
    .add(repayFlashLoanIx);
}
