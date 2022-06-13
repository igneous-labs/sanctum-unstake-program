import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

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
