import { Keypair } from "@solana/web3.js";
import { readFileSync } from "fs";

export function keypairFromFile(path: string): Keypair {
  return Keypair.fromSecretKey(
    Buffer.from(JSON.parse(readFileSync(path, { encoding: "utf-8" })))
  );
}
