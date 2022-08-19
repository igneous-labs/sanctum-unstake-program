/**
 * Tests for protocol-wide features e.g. protocol fees
 * Have to run before all the other tests since all of them use the same program instance
 * TODO: figure out a less coupled & hacky way
 */

import * as anchor from "@project-serum/anchor";
import { Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import { expect, use as chaiUse } from "chai";
import chaiAsPromised from "chai-as-promised";
import { findProtocolFeeAccount } from "../ts/src";
import { Unstake } from "../target/types/unstake";
import { airdrop, checkSystemError } from "./utils";

chaiUse(chaiAsPromised);

describe("protocol-level", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.getProvider());
  const program = anchor.workspace.Unstake as anchor.Program<Unstake>;
  const provider = anchor.getProvider();

  const payerKeypair = Keypair.generate();

  let protocolFeeAccount = null as PublicKey;

  before(async () => {
    console.log("airdropping to payer");
    await airdrop(provider.connection, payerKeypair.publicKey);
    [protocolFeeAccount] = await findProtocolFeeAccount(program.programId);
  });

  it("it initializes protocol fee", async () => {
    await program.methods
      .initProtocolFee()
      .accounts({
        payer: payerKeypair.publicKey,
        protocolFeeAccount,
      })
      .signers([payerKeypair])
      .rpc({ skipPreflight: true });
    const { destination, authority, feeRatio, referrerFeeRatio } =
      await program.account.protocolFee.fetch(protocolFeeAccount);
    expect(destination.toString()).to.eq(
      "J6T4Cwe5PkiRidMJMap4f8EBd5kiQ6JrrwF5XsXzFy8t"
    );
    expect(authority.toString()).to.eq(
      "2NB9TSbKzqEHY9kUuTpnjS3VrsZhEooAWADLHe3WeL3E"
    );
    expect(feeRatio.num.toNumber()).to.eq(1);
    expect(feeRatio.denom.toNumber()).to.eq(10);
    expect(referrerFeeRatio.num.toNumber()).to.eq(1);
    expect(referrerFeeRatio.denom.toNumber()).to.eq(2);
  });

  it("it rejects to initialize already-initialized protocol fee", async () => {
    // idk how but anchor.rpc() seems to deduplicate transaction replays and resolves to the
    // previously confirmed signature if called shortly after the previous rpc() call.
    // Have to use transaction() to explicitly replay
    const tx = await program.methods
      .initProtocolFee()
      .accounts({
        payer: payerKeypair.publicKey,
        protocolFeeAccount,
      })
      .transaction();
    await expect(
      sendAndConfirmTransaction(
        program.provider.connection,
        tx,
        [payerKeypair],
        { skipPreflight: true }
      )
    ).to.be.eventually.rejected.and.satisfy(checkSystemError(0));
  });
});
