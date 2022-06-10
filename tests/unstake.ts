import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Unstake } from "../target/types/unstake";

describe("unstake", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.getProvider());

  const program = anchor.workspace.Unstake as Program<Unstake>;

  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.rpc.initialize({});
    console.log("Your transaction signature", tx);
  });
});
