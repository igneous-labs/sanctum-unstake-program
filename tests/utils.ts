import { Program, Provider } from "@project-serum/anchor";
import { getAccount } from "@solana/spl-token";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
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
