import { Address, Program } from "@project-serum/anchor";
import {
  Transaction,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  StakeProgram,
} from "@solana/web3.js";
import { Unstake } from "../idl/idl";
import { findPoolSolReserves } from "../pda";

export type DeactivateStakeAccountAccounts = {
  poolAccount: Address;
  stakeAccount: Address;
};

export async function deactivateStakeAccountTx(
  program: Program<Unstake>,
  { poolAccount, stakeAccount }: DeactivateStakeAccountAccounts
): Promise<Transaction> {
  const [poolSolReserves] = await findPoolSolReserves(
    program.programId,
    new PublicKey(poolAccount)
  );
  return program.methods
    .deactivateStakeAccount()
    .accounts({
      stakeAccount,
      poolAccount,
      poolSolReserves,
      clock: SYSVAR_CLOCK_PUBKEY,
      stakeProgram: StakeProgram.programId,
    })
    .transaction();
}
