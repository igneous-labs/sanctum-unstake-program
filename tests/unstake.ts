import * as anchor from "@project-serum/anchor";
import { BN, Program } from "@project-serum/anchor";
import { Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Unstake } from "../target/types/unstake";

describe("unstake", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.getProvider());

  const program = anchor.workspace.Unstake as Program<Unstake>;

  it("Is initialized!", async () => {
    const provider = anchor.getProvider();
    const payerKeypair = Keypair.generate();
    const feeKeypair = Keypair.generate();

    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        payerKeypair.publicKey,
        1 * LAMPORTS_PER_SOL
      ),
      "confirmed"
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
        feeAccount: feeKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([payerKeypair, feeKeypair])
      .rpc();
    console.log("Your transaction signature", sig);
  });
});
