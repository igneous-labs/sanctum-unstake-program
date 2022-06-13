import { PublicKey } from "@solana/web3.js";

export function findPoolSolReserves(
  unstakeProg: PublicKey,
  pool: PublicKey
): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddress([pool.toBuffer()], unstakeProg);
}

export function findPoolFeeAccount(
  unstakeProg: PublicKey,
  pool: PublicKey
): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddress(
    [pool.toBuffer(), Buffer.from("fee")],
    unstakeProg
  );
}
