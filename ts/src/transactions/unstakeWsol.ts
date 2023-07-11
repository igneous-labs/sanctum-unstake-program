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
  findProtocolFeeAccount,
  findStakeAccountRecordAccount,
} from "../pda";
import { ProtocolFeeAccount } from "../types";
import { deriveProtocolFeeAddresses } from "./utils";

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
   * The program's protocol fee account
   */
  protocolFee?: ProgramAccount<ProtocolFeeAccount>;

  /**
   * The protocol fee payment destination.
   * Must be provided if `protocolFee` is not provided.
   * Otherwise, uses the one read from `protocolFee`
   */
  protocolFeeDestination?: Address;

  /**
   * The referrer for this unstake.
   * SOL is transferred directly to this account. Please make sure
   * that this is already initialized and rent-exempt
   */
  referrer?: Address;

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
    destination: destinationOption,
    protocolFee: protocolFeeOption,
    protocolFeeDestination: protocolFeeDestinationOption,
    referrer: referrerOption,
  }: UnstakeWSolAccounts
): Promise<Transaction> {
  const poolAccountPk = new PublicKey(poolAccount);
  const stakeAccountPk = new PublicKey(stakeAccount);
  const unstakerPk = new PublicKey(unstaker);

  const { protocolFeeAccount, protocolFeeDestination } =
    deriveProtocolFeeAddresses(
      protocolFeeOption ?? (await findProtocolFeeAccount(program.programId))[0],
      protocolFeeDestinationOption
    );

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

  let builder = program.methods.unstakeWsol().accounts({
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
  });

  if (referrerOption) {
    builder = builder.remainingAccounts([
      {
        pubkey: new PublicKey(referrerOption),
        isSigner: false,
        isWritable: true,
      },
    ]);
  }

  return builder.transaction();
}
