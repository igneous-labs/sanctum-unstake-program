import {
  Address,
  IdlAccounts,
  Program,
  ProgramAccount,
} from "@project-serum/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { Unstake } from "../idl/idl";
import { findPoolSolReserves } from "../pda";
import BN from "bn.js";
import { derivePoolLpMint } from "./utils";

export type AddLiquidityAccounts = {
  /**
   * The SOL account adding liquidity
   */
  from: Address;

  /**
   * The liquidity pool to add liquidity to
   */
  poolAccount: Address | ProgramAccount<IdlAccounts<Unstake>["pool"]>;

  /**
   * The LP mint of the liquidity pool.
   * Must be provided if `poolAccount` is `Address`.
   * Otherwise, uses the one read from `poolAccount`
   */
  lpMint?: Address;

  /**
   * The LP token account to mint tokens to.
   * Defaults to `from`'s ATA.
   */
  mintLpTokensTo?: Address;
};

/**
 *
 * @param program
 * @param accounts
 * @returns the created add_liquidity transaction
 */
export async function addLiquidityTx(
  program: Program<Unstake>,
  amountLamports: BN,
  {
    from,
    poolAccount: poolAccountUnion,
    lpMint: lpMintOption,
    mintLpTokensTo: mintLpTokensToOption,
  }: AddLiquidityAccounts
): Promise<Transaction> {
  const { lpMint, poolAccount } = derivePoolLpMint(
    poolAccountUnion,
    lpMintOption
  );
  const [poolSolReserves] = await findPoolSolReserves(
    program.programId,
    new PublicKey(poolAccount)
  );
  const mintLpTokensTo =
    mintLpTokensToOption ??
    (await getAssociatedTokenAddress(
      new PublicKey(lpMint),
      new PublicKey(from)
    ));
  return program.methods
    .addLiquidity(amountLamports)
    .accounts({
      from,
      poolAccount,
      poolSolReserves,
      lpMint,
      mintLpTokensTo,
    })
    .transaction();
}
