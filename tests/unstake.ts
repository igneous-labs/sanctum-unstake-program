import BN from "bn.js";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  createAssociatedTokenAccount,
  getAccount,
  getAssociatedTokenAddress,
  getMint,
} from "@solana/spl-token";
import { findPoolFeeAccount, findPoolSolReserves } from "../ts/src/pda";
import { Unstake } from "../target/types/unstake";
import { airdrop } from "./utils";
import { expect } from "chai";

describe("unstake", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.getProvider());
  const program = anchor.workspace.Unstake as Program<Unstake>;
  const provider = anchor.getProvider();
  const payerKeypair = Keypair.generate();
  const poolKeypair = Keypair.generate();
  const lpMintKeypair = Keypair.generate();
  const lperKeypair = Keypair.generate();

  let [poolSolReserves, poolSolReservesBump] = [null as PublicKey, 0];
  let [feeAccount, feeAccountBump] = [null as PublicKey, 0];
  let lperAta = null as PublicKey;

  before(async () => {
    console.log("airdropping to payer and lper");
    await airdrop(provider.connection, payerKeypair.publicKey);
    await airdrop(provider.connection, lperKeypair.publicKey);
    [poolSolReserves, poolSolReservesBump] = await findPoolSolReserves(
      program.programId,
      poolKeypair.publicKey
    );
    [feeAccount, feeAccountBump] = await findPoolFeeAccount(
      program.programId,
      poolKeypair.publicKey
    );
    lperAta = await getAssociatedTokenAddress(
      lpMintKeypair.publicKey,
      lperKeypair.publicKey
    );
  });

  it("it initializes a liquidity pool", async () => {
    const lpMint = lpMintKeypair.publicKey;
    await program.methods
      .createPool({
        fee: {
          liquidityLinear: {
            params: {
              maxLiqRemaining: {
                num: new BN(0),
                denom: new BN(69),
              },
              zeroLiqRemaining: {
                num: new BN(1),
                denom: new BN(1000),
              },
            },
          },
        },
      })
      .accounts({
        payer: payerKeypair.publicKey,
        feeAuthority: payerKeypair.publicKey,
        poolAccount: poolKeypair.publicKey,
        lpMint,
        poolSolReserves,
        feeAccount,
      })
      .signers([payerKeypair, poolKeypair, lpMintKeypair])
      .rpc({ skipPreflight: true });
    const mint = await getMint(provider.connection, lpMint);
    expect(mint.decimals).to.eq(9);
    expect(mint.supply).to.eq(BigInt(0));
  });

  it("it add liquidity", async () => {
    const amount = new BN(0.1 * LAMPORTS_PER_SOL);

    // create lper ata
    await createAssociatedTokenAccount(
      provider.connection,
      lperKeypair,
      lpMintKeypair.publicKey,
      lperKeypair.publicKey
    );

    const lperAtaPre = (await getAccount(provider.connection, lperAta)).amount;
    const lperLamportsPre = await provider.connection.getBalance(
      lperKeypair.publicKey
    );
    const reservesLamportsPre = await provider.connection.getBalance(
      poolSolReserves
    );
    const ownedLamportsPre = (
      await program.account.pool.fetch(poolKeypair.publicKey)
    ).ownedLamports;
    await program.methods
      .addLiquidity(amount)
      .accounts({
        from: lperKeypair.publicKey,
        poolAccount: poolKeypair.publicKey,
        poolSolReserves,
        lpMint: lpMintKeypair.publicKey,
        mintLpTokensTo: lperAta,
      })
      .signers([lperKeypair])
      .rpc({ skipPreflight: true });
    const lperAtaPost = (await getAccount(provider.connection, lperAta)).amount;
    const lperLamportsPost = await provider.connection.getBalance(
      lperKeypair.publicKey
    );
    const reservesLamportsPost = await provider.connection.getBalance(
      poolSolReserves
    );
    const ownedLamportsPost = (
      await program.account.pool.fetch(poolKeypair.publicKey)
    ).ownedLamports;

    expect(lperAtaPost).to.eq(lperAtaPre + BigInt(amount.toString()));
    expect(lperLamportsPost).to.eq(lperLamportsPre - amount.toNumber());
    expect(reservesLamportsPost).to.eq(reservesLamportsPre + amount.toNumber());
    expect(ownedLamportsPost.toString()).to.eq(
      ownedLamportsPre.add(amount).toString()
    );
  });
});
