import {
  Address,
  IdlAccounts,
  Program,
  ProgramAccount,
} from "@project-serum/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { Unstake } from "../idl/idl";
import { findFlashAccount, findPoolSolReserves } from "../pda";
import BN from "bn.js";
import { derivePoolLpMint } from "./utils";

export type RemoveLiquidityAccounts = {
  /**
   * Signer with authority over the LP token account to burn from
   */
  authority: Address;

  /**
   * The liquidity pool to add liquidity to
   */
  poolAccount: Address | ProgramAccount<IdlAccounts<Unstake>["pool"]>;

  /**
   * The LP token account to burn LP tokens from.
   * Defaults to ATA of `authority`.
   */
  from?: Address;

  /**
   * The LP mint of the liquidity pool.
   * Must be provided if `poolAccount` is `Address`.
   * Otherwise, uses the one read from `poolAccount`
   */
  lpMint?: Address;

  /**
   * The LP token account to mint tokens to.
   * Defaults to `authority`
   */
  sendLamportsTo?: Address;
};

/**
 *
 * @param program
 * @param accounts
 * @returns the created add_liquidity transaction
 */
export async function removeLiquidityTx(
  program: Program<Unstake>,
  amountLPAtomics: BN,
  {
    authority,
    poolAccount: poolAccountUnion,
    from: fromOption,
    lpMint: lpMintOption,
    sendLamportsTo: sendLamportsToOption,
  }: RemoveLiquidityAccounts
): Promise<Transaction> {
  const { lpMint, poolAccount } = derivePoolLpMint(
    poolAccountUnion,
    lpMintOption
  );
  const from =
    fromOption ??
    (await getAssociatedTokenAddress(
      new PublicKey(lpMint),
      new PublicKey(authority)
    ));
  const sendLamportsTo = sendLamportsToOption ?? authority;
  const [poolSolReserves] = await findPoolSolReserves(
    program.programId,
    new PublicKey(poolAccount)
  );
  const [flashAccount] = await findFlashAccount(
    program.programId,
    new PublicKey(poolAccount)
  );
  return program.methods
    .removeLiquidity(amountLPAtomics)
    .accounts({
      burnLpTokensFromAuthority: authority,
      to: sendLamportsTo,
      poolAccount,
      poolSolReserves,
      lpMint,
      burnLpTokensFrom: from,
      flashAccount,
    })
    .transaction();
}
