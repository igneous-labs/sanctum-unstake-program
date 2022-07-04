import { Program } from "@project-serum/anchor";
import { getAccount } from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  StakeProgram,
  Transaction,
  Lockup,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { readFileSync } from "fs";
import BN from "bn.js";
import { Unstake } from "../target/types/unstake";

// Anchor at the current v0.24.2, is throwing two different shapes of object
// for program errors. This closure returns a predicate that checks if a given
// error object matches either type and has the correct error code and message.
// Intended to be used to generate matcher functions for `satisfy` method from chai.
export const checkAnchorError = (errorCode: number, errorMessage: string) => {
  return (err) => {
    if (err.code != undefined) {
      // first error type
      return err.code === errorCode && err.msg === errorMessage;
    } else {
      // second error type
      return (
        err.error.errorCode.number === errorCode &&
        err.error.errorMessage === errorMessage
      );
    }
  };
};

export async function airdrop(
  connection: Connection,
  address: PublicKey,
  amountSol: number = 1.0
): Promise<ReturnType<Connection["confirmTransaction"]>> {
  return connection.confirmTransaction(
    await connection.requestAirdrop(address, amountSol * LAMPORTS_PER_SOL),
    "confirmed"
  );
}

type LpFacingTestParams = {
  lperAtaAmount: bigint;
  incomingStake: BN;
  lperLamports: number;
  reserveLamports: number;
};

interface FechLpFacingTestParamsArgs {
  program: Program<Unstake>;
  lper: PublicKey;
  lperAta: PublicKey;
  poolSolReserves: PublicKey;
  pool: PublicKey;
}

export async function fetchLpFacingTestParams({
  program,
  lper,
  lperAta,
  poolSolReserves,
  pool,
}: FechLpFacingTestParamsArgs): Promise<LpFacingTestParams> {
  const provider = program.provider;
  const connection = provider.connection;
  const [lperAtaAmount, incomingStake, lperLamports, reserveLamports] =
    await Promise.all([
      getAccount(connection, lperAta).then((account) => account.amount),
      program.account.pool.fetch(pool).then((pool) => pool.incomingStake),
      provider.connection.getBalance(lper),
      provider.connection.getBalance(poolSolReserves),
    ]);
  return {
    lperAtaAmount,
    incomingStake,
    lperLamports,
    reserveLamports,
  };
}

export function keypairFromFile(path: string): Keypair {
  return Keypair.fromSecretKey(
    Buffer.from(JSON.parse(readFileSync(path, { encoding: "utf-8" })))
  );
}

export function testValidator(): PublicKey {
  return keypairFromFile(".anchor/test-ledger/validator-keypair.json")
    .publicKey;
}

export function testVoteAccount(): PublicKey {
  return keypairFromFile(".anchor/test-ledger/vote-account-keypair.json")
    .publicKey;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForEpochToPass(
  connection: Connection
): Promise<void> {
  const SLOT_DURATION_MS = 400;
  // console.log("waiting for epoch to pass...");
  const { epoch: startingEpoch } = await connection.getEpochInfo();
  let currentEpoch = startingEpoch;
  while (currentEpoch === startingEpoch) {
    await sleep(SLOT_DURATION_MS);
    const { epoch } = await connection.getEpochInfo();
    currentEpoch = epoch;
  }
}

export async function stakeAccMinLamports(
  connection: Connection
): Promise<number> {
  return (await connection.getMinimumBalanceForRentExemption(200)) + 1;
}

type CreateDelegateStakeTxArgs = {
  connection: Connection;
  stakeAccount: PublicKey;
  payer: PublicKey;
  lockup?: Lockup;
  lamports?: number;
};

export async function createDelegateStakeTx({
  connection,
  stakeAccount,
  payer,
  lockup,
  lamports,
}: CreateDelegateStakeTxArgs): Promise<Transaction> {
  const votePubkey = testVoteAccount();
  const stakeAccLamports = lamports ?? (await stakeAccMinLamports(connection));
  const createStakeAuthTx = StakeProgram.createAccount({
    authorized: {
      staker: payer,
      withdrawer: payer,
    },
    fromPubkey: payer,
    lamports: stakeAccLamports,
    stakePubkey: stakeAccount,
    lockup,
  });
  createStakeAuthTx.add(
    StakeProgram.delegate({
      authorizedPubkey: payer,
      stakePubkey: stakeAccount,
      votePubkey,
    })
  );
  return createStakeAuthTx;
}

type TransferStakeAuthTxArgs = {
  authorizedPubkey: PublicKey;
  newAuthorizedPubkey: PublicKey;
  stakePubkey: PublicKey;
};

export function transferStakeAuthTx({
  authorizedPubkey,
  newAuthorizedPubkey,
  stakePubkey,
}: TransferStakeAuthTxArgs): Transaction {
  const tx = StakeProgram.authorize({
    authorizedPubkey,
    newAuthorizedPubkey,
    stakeAuthorizationType: { index: 0 },
    stakePubkey,
  });
  tx.add(
    StakeProgram.authorize({
      authorizedPubkey,
      newAuthorizedPubkey,
      stakeAuthorizationType: { index: 1 },
      stakePubkey,
    })
  );
  return tx;
}
