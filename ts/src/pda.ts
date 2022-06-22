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

export function findStakeAccountRecordAccount(
  unstakeProg: PublicKey,
  pool: PublicKey,
  stakeAccount: PublicKey
): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddress(
    [pool.toBuffer(), stakeAccount.toBuffer()],
    unstakeProg
  );
}
