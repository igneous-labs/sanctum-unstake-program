import { Address, Program } from "@project-serum/anchor";
import {
  Transaction,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_STAKE_HISTORY_PUBKEY,
  StakeProgram,
} from "@solana/web3.js";
import { Unstake } from "../idl/idl";
import { findPoolSolReserves, findStakeAccountRecordAccount } from "../pda";

export type ReclaimStakeAccountAccounts = {
  poolAccount: Address;
  stakeAccount: Address;
};

export async function reclaimStakeAccountTx(
  program: Program<Unstake>,
  { poolAccount, stakeAccount }: ReclaimStakeAccountAccounts
): Promise<Transaction> {
  const poolAccountPk = new PublicKey(poolAccount);
  const [poolSolReserves] = await findPoolSolReserves(
    program.programId,
    poolAccountPk
  );
  const [stakeAccountRecordAccount] = await findStakeAccountRecordAccount(
    program.programId,
    poolAccountPk,
    new PublicKey(stakeAccount)
  );
  return program.methods
    .reclaimStakeAccount()
    .accounts({
      stakeAccount,
      poolAccount,
      poolSolReserves,
      stakeAccountRecordAccount,
      clock: SYSVAR_CLOCK_PUBKEY,
      stakeHistory: SYSVAR_STAKE_HISTORY_PUBKEY,
      stakeProgram: StakeProgram.programId,
    })
    .transaction();
}
