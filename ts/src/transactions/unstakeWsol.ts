import { Address, Program, ProgramAccount } from "@project-serum/anchor";
import {
  getAssociatedTokenAddress,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
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
import { ProtocolFeeAccount } from "../types";

export type UnstakeWSolAccounts = {
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
   * The program's fetched protocol fee account
   */
  protocolFee: ProgramAccount<ProtocolFeeAccount>;

  /**
   * The SOL account paying for the transaction and rent.
   * Defaults to `unstaker` if unspecified
   */
  payer?: Address;

  /**
   * The wSOL account to receive the unstaked wSOL.
   * Defaults to wSOL ATA of `unstaker` if unspecified
   */
  destination?: Address;
};

/**
 *
 * @param program
 * @param accounts
 * @returns the created unstake transaction
 */
export async function unstakeWsolTx(
  program: Program<Unstake>,
  {
    poolAccount,
    stakeAccount,
    unstaker,
    payer: payerOption,
    destination: destinationOption,
    protocolFee: {
      publicKey: protocolFeeAccount,
      account: { destination: protocolFeeDestination },
    },
  }: UnstakeWSolAccounts
): Promise<Transaction> {
  const poolAccountPk = new PublicKey(poolAccount);
  const stakeAccountPk = new PublicKey(stakeAccount);
  const unstakerPk = new PublicKey(unstaker);

  const payer = payerOption ?? unstaker;
  const destination =
    destinationOption ??
    (await getAssociatedTokenAddress(NATIVE_MINT, unstakerPk));

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
    .unstakeWsol()
    .accounts({
      payer,
      unstaker,
      stakeAccount,
      destination,
      poolAccount,
      poolSolReserves,
      feeAccount,
      stakeAccountRecordAccount,
      protocolFeeAccount,
      protocolFeeDestination,
      clock: SYSVAR_CLOCK_PUBKEY,
      stakeProgram: StakeProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .transaction();
}
