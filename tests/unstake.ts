import * as anchor from "@project-serum/anchor";
import { BN, Program } from "@project-serum/anchor";
import { Keypair } from "@solana/web3.js";
import { findPoolFeeAccount, findPoolSolReserves } from "../ts/src/pda";
import { Unstake } from "../target/types/unstake";
import { airdrop } from "./utils";

describe("unstake", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.getProvider());

  const program = anchor.workspace.Unstake as Program<Unstake>;

  it("Is initialized!", async () => {
    const provider = anchor.getProvider();
    const payerKeypair = Keypair.generate();
    const poolKeypair = Keypair.generate();
    const lpMintKeypair = Keypair.generate();

    await airdrop(provider.connection, payerKeypair.publicKey);

    const [poolSolReserves] = await findPoolSolReserves(
      program.programId,
      poolKeypair.publicKey
    );
    const [feeAccount] = await findPoolFeeAccount(
      program.programId,
      poolKeypair.publicKey
    );

    const sig = await program.methods
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
        lpMint: lpMintKeypair.publicKey,
        poolSolReserves,
        feeAccount,
      })
      .signers([payerKeypair, poolKeypair, lpMintKeypair])
      .rpc();
    console.log("Your transaction signature", sig);
  });
});
