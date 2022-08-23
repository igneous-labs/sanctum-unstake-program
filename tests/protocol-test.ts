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
import { readFileSync } from "fs";
import { BN } from "bn.js";

chaiUse(chaiAsPromised);

const readKeypairFromFile = (path: string): Keypair =>
  Keypair.fromSecretKey(
    Buffer.from(JSON.parse(readFileSync(path, { encoding: "utf-8" })))
  );

describe("protocol-level", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.getProvider());
  const program = anchor.workspace.Unstake as anchor.Program<Unstake>;
  const provider = anchor.getProvider();

  const payerKeypair = Keypair.generate();
  const protocolFeeAuthorityKeypair = readKeypairFromFile(
    "./tests/local-testing-protocol-fee-authority.json"
  );
  const protocolFeeDestinationKeypair = readKeypairFromFile(
    "./tests/local-testing-protocol-fee-destination.json"
  );

  let protocolFeeAccount = null as PublicKey;

  before(async () => {
    console.log("airdropping to payer");
    await airdrop(provider.connection, payerKeypair.publicKey);
    [protocolFeeAccount] = await findProtocolFeeAccount(program.programId);

    console.log("airdropping to authority");
    await airdrop(provider.connection, protocolFeeAuthorityKeypair.publicKey);
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

    expect(destination.equals(protocolFeeDestinationKeypair.publicKey)).to.be
      .true;
    expect(authority.equals(protocolFeeAuthorityKeypair.publicKey)).to.be.true;
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

  it("it sets protocol fee destination and authority", async () => {
    const tempDestination = Keypair.generate();
    const tempAuthority = Keypair.generate();

    const currentProtocolFee = await program.account.protocolFee.fetch(
      protocolFeeAccount
    );
    const newProtocolFee = {
      ...currentProtocolFee,
      destination: tempDestination.publicKey,
      authority: tempAuthority.publicKey,
    };
    const tx1 = await program.methods
      .setProtocolFee(newProtocolFee)
      .accounts({
        authority: protocolFeeAuthorityKeypair.publicKey,
        protocolFeeAccount,
      })
      .transaction();

    await sendAndConfirmTransaction(
      program.provider.connection,
      tx1,
      [protocolFeeAuthorityKeypair],
      { skipPreflight: true }
    );

    await program.account.protocolFee
      .fetch(protocolFeeAccount)
      .then(({ destination, authority, feeRatio, referrerFeeRatio }) => {
        expect(destination.equals(tempDestination.publicKey)).to.be.true;
        expect(authority.equals(tempAuthority.publicKey)).to.be.true;
        expect(feeRatio.num.toNumber()).to.eq(
          currentProtocolFee.feeRatio.num.toNumber()
        );
        expect(feeRatio.denom.toNumber()).to.eq(
          currentProtocolFee.feeRatio.denom.toNumber()
        );
        expect(referrerFeeRatio.num.toNumber()).to.eq(
          currentProtocolFee.referrerFeeRatio.num.toNumber()
        );
        expect(referrerFeeRatio.denom.toNumber()).to.eq(
          currentProtocolFee.referrerFeeRatio.denom.toNumber()
        );
      });

    // revert the changes
    await airdrop(provider.connection, tempAuthority.publicKey);
    const tx2 = await program.methods
      .setProtocolFee(currentProtocolFee)
      .accounts({
        authority: tempAuthority.publicKey,
        protocolFeeAccount,
      })
      .transaction();

    await sendAndConfirmTransaction(
      program.provider.connection,
      tx2,
      [tempAuthority],
      { skipPreflight: true }
    );

    await program.account.protocolFee
      .fetch(protocolFeeAccount)
      .then(({ destination, authority, feeRatio, referrerFeeRatio }) => {
        expect(destination.equals(protocolFeeDestinationKeypair.publicKey)).to
          .be.true;
        expect(authority.equals(protocolFeeAuthorityKeypair.publicKey)).to.be
          .true;
        expect(feeRatio.num.toNumber()).to.eq(
          currentProtocolFee.feeRatio.num.toNumber()
        );
        expect(feeRatio.denom.toNumber()).to.eq(
          currentProtocolFee.feeRatio.denom.toNumber()
        );
        expect(referrerFeeRatio.num.toNumber()).to.eq(
          currentProtocolFee.referrerFeeRatio.num.toNumber()
        );
        expect(referrerFeeRatio.denom.toNumber()).to.eq(
          currentProtocolFee.referrerFeeRatio.denom.toNumber()
        );
      });
  });

  after(async () => {
    const { destination } = await program.account.protocolFee.fetch(
      protocolFeeAccount
    );
    // airdrop to protocol fee destination so that we dont
    // run into below rent-exempt-min errors
    // when protocol fees transfers are small
    // for the other tests
    console.log("airdropping to protocol fee destination");
    await airdrop(provider.connection, destination);
  });
});
