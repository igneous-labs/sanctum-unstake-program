import { Program } from "@project-serum/anchor";
import { getAccount } from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { readFileSync } from "fs";
import BN from "bn.js";
import { Unstake } from "../target/types/unstake";

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
  poolOwnedLamports: BN;
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
  const [lperAtaAmount, poolOwnedLamports, lperLamports, reserveLamports] =
    await Promise.all([
      getAccount(connection, lperAta).then((account) => account.amount),
      program.account.pool.fetch(pool).then((pool) => pool.ownedLamports),
      provider.connection.getBalance(lper),
      provider.connection.getBalance(poolSolReserves),
    ]);
  return {
    lperAtaAmount,
    poolOwnedLamports,
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
