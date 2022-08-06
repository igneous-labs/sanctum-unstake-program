import { Rational } from "@unstake-it/sol";
import { Keypair } from "@solana/web3.js";
import BN from "bn.js";
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

function parsePosDecimalsToAtomics(
  decimalsString: string,
  tokenDecimals: number
): BN {
  const match = decimalsString.match(/^([0-9]+)(\.[0-9]+)?$/);
  if (match === null) {
    throw new Error(`Invalid positive decimals string ${decimalsString}`);
  }
  const wholeString = match[1];
  let fractionalString = match[2] ? match[2].substring(1) : "";
  if (fractionalString.length > tokenDecimals) {
    throw new Error(
      `${fractionalString.length} decimal places give, but token's decimals is ${tokenDecimals}`
    );
  }
  fractionalString = fractionalString.padEnd(tokenDecimals, "0");
  return new BN(`${wholeString}${fractionalString}`, 10);
}

const SOL_DECIMALS = 9;

/**
 * Use this for handling LP token amounts too since they're 9 d.p. too
 * @param sol
 * @returns
 */
export function parsePosSolToLamports(sol: number): BN {
  return parsePosDecimalsToAtomics(sol.toString(), SOL_DECIMALS);
}

export function parseLamportsToSol(lamports: number | BN) {
  const lamportsBn = new BN(lamports);
  return tokenAtomicsToDecimalString(lamportsBn, SOL_DECIMALS);
}

function tokenAtomicsToDecimalString(
  tokenAtomics: BN,
  decimals: number
): string {
  const s = tokenAtomics.toString().padStart(decimals + 1, "0");
  const decIndex = s.length - decimals;
  return `${s.substring(0, decIndex)}.${s.substring(decIndex)}`;
}
