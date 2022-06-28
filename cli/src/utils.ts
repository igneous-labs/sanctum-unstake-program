import { Rational } from "@soceanfi/unstake";
import { Keypair } from "@solana/web3.js";
import { BN } from "bn.js";
import { readFileSync } from "fs";

export function readJsonFile(path: string): Object {
  return JSON.parse(readFileSync(path, { encoding: "utf-8" }));
}

export function keypairFromFile(path: string): Keypair {
  return Keypair.fromSecretKey(Buffer.from(readJsonFile(path) as number[]));
}

export function numberToPositiveRationalChecked(n: number): Rational {
  if (n < 0) {
    throw new Error(`Only positive numbers allowed, ${n} given`);
  }
  const s = n.toString();
  const dpi = s.indexOf(".");
  if (dpi === -1) {
    return {
      num: new BN(n),
      denom: new BN(1),
    };
  }
  const dps = s.length - dpi - 1;
  if (dps < 0) {
    throw new Error(`Could not convert ${n} to rational`);
  }
  const num = new BN(s.substring(0, dpi) + s.substring(dpi + 1));
  const denom = new BN(10 ** dps);
  return { num, denom };
}
