import * as anchor from "@project-serum/anchor";
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  StakeProgram,
  LAMPORTS_PER_SOL,
  SYSVAR_CLOCK_PUBKEY,
} from "@solana/web3.js";
import { BN } from "bn.js";
import { expect, use as chaiUse } from "chai";
import chaiAsPromised from "chai-as-promised";
import {
  fetchLiquidityPoolStakeAccounts,
  findPoolFeeAccount,
  findPoolSolReserves,
  findStakeAccountRecordAccount,
  previewUnstake,
  unstakeTx,
  Unstake,
} from "../ts/src";
import {
  airdrop,
  createDelegateStakeTx,
  transferStakeAuthTx,
  waitForEpochToPass,
} from "./utils";

chaiUse(chaiAsPromised);

describe("ts bindings", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.getProvider());
  const program = anchor.workspace.Unstake as anchor.Program<Unstake>;
  const provider = anchor.getProvider();

  const payerKeypair = Keypair.generate();
  const poolKeypair = Keypair.generate();
  const lpMintKeypair = Keypair.generate();
  const lperKeypair = Keypair.generate();
  let lperAta = null as PublicKey;

  let [poolSolReserves, poolSolReservesBump] = [null as PublicKey, 0];
  let [feeAccount, feeAccountBump] = [null as PublicKey, 0];

  const liquidityAmount = new BN(0.1 * LAMPORTS_PER_SOL);

  before(async () => {
    console.log("airdropping to payer and lper");
    await Promise.all([
      airdrop(provider.connection, payerKeypair.publicKey),
      airdrop(provider.connection, lperKeypair.publicKey),
    ]);
    [poolSolReserves, poolSolReservesBump] = await findPoolSolReserves(
      program.programId,
      poolKeypair.publicKey
    );
    [feeAccount, feeAccountBump] = await findPoolFeeAccount(
      program.programId,
      poolKeypair.publicKey
    );
    console.log("setting up pool");
    await program.methods
      .createPool({
        fee: {
          liquidityLinear: {
            params: {
              maxLiqRemaining: {
                num: new BN(1),
                denom: new BN(1000),
              },
              zeroLiqRemaining: {
                num: new BN(1),
                denom: new BN(100),
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
      .rpc({ skipPreflight: true });
    console.log("adding some liquidity");
    lperAta = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        lperKeypair,
        lpMintKeypair.publicKey,
        lperKeypair.publicKey
      )
    ).address;
    await program.methods
      .addLiquidity(liquidityAmount)
      .accounts({
        from: lperKeypair.publicKey,
        poolAccount: poolKeypair.publicKey,
        poolSolReserves,
        lpMint: lpMintKeypair.publicKey,
        mintLpTokensTo: lperAta,
      })
      .signers([lperKeypair])
      .rpc({ skipPreflight: true });
  });

  describe("fetch", () => {
    const stakeAccKeypair = Keypair.generate();
    let stakeAccountRecordAccount = null as PublicKey;

    before(async () => {
      stakeAccountRecordAccount = (
        await findStakeAccountRecordAccount(
          program.programId,
          poolKeypair.publicKey,
          stakeAccKeypair.publicKey
        )
      )[0];
    });

    it("fetch empty", async () => {
      const fetched = await fetchLiquidityPoolStakeAccounts(
        program,
        poolKeypair.publicKey
      );
      expect(fetched.active).to.be.empty;
      expect(fetched.inactive).to.be.empty;
      expect(fetched.activating).to.be.empty;
      expect(fetched.deactivating).to.be.empty;
    });

    it("fetch filters stake acc with no record", async () => {
      const stakeAccNoRecordKeypair = Keypair.generate();
      const tx = await createDelegateStakeTx({
        connection: provider.connection,
        stakeAccount: stakeAccNoRecordKeypair.publicKey,
        payer: payerKeypair.publicKey,
      });
      tx.add(
        transferStakeAuthTx({
          authorizedPubkey: payerKeypair.publicKey,
          newAuthorizedPubkey: poolSolReserves,
          stakePubkey: stakeAccNoRecordKeypair.publicKey,
        })
      );
      await sendAndConfirmTransaction(provider.connection, tx, [
        payerKeypair,
        stakeAccNoRecordKeypair,
      ]);
      const fetched = await fetchLiquidityPoolStakeAccounts(
        program,
        poolKeypair.publicKey
      );
      expect(fetched.active).to.be.empty;
      expect(fetched.inactive).to.be.empty;
      expect(fetched.activating).to.be.empty;
      expect(fetched.deactivating).to.be.empty;
    });

    it("fetch single active", async () => {
      const tx = await createDelegateStakeTx({
        connection: provider.connection,
        stakeAccount: stakeAccKeypair.publicKey,
        payer: payerKeypair.publicKey,
      });
      await sendAndConfirmTransaction(provider.connection, tx, [
        payerKeypair,
        stakeAccKeypair,
      ]);
      console.log("awaiting epoch to pass");
      await waitForEpochToPass(provider.connection);
      await program.methods
        .unstake()
        .accounts({
          payer: payerKeypair.publicKey,
          unstaker: payerKeypair.publicKey,
          stakeAccount: stakeAccKeypair.publicKey,
          destination: payerKeypair.publicKey,
          poolAccount: poolKeypair.publicKey,
          poolSolReserves,
          feeAccount,
          stakeAccountRecordAccount,
          clock: SYSVAR_CLOCK_PUBKEY,
          stakeProgram: StakeProgram.programId,
        })
        .signers([payerKeypair])
        .rpc({ skipPreflight: true });
      const fetched = await fetchLiquidityPoolStakeAccounts(
        program,
        poolKeypair.publicKey
      );
      expect(fetched.active.length).to.eq(1);
      expect(fetched.inactive).to.be.empty;
      expect(fetched.activating).to.be.empty;
      expect(fetched.deactivating).to.be.empty;
    });

    it("fetch single deactivating", async () => {
      await program.methods
        .deactivateStakeAccount()
        .accounts({
          stakeAccount: stakeAccKeypair.publicKey,
          poolAccount: poolKeypair.publicKey,
          poolSolReserves,
          clock: SYSVAR_CLOCK_PUBKEY,
          stakeProgram: StakeProgram.programId,
        })
        .rpc({ skipPreflight: true });
      const fetched = await fetchLiquidityPoolStakeAccounts(
        program,
        poolKeypair.publicKey
      );
      expect(fetched.active).to.be.empty;
      expect(fetched.inactive).to.be.empty;
      expect(fetched.activating).to.be.empty;
      expect(fetched.deactivating.length).to.eq(1);
    });

    it("fetch single inactive", async () => {
      console.log("awaiting epoch to pass");
      await waitForEpochToPass(provider.connection);
      const fetched = await fetchLiquidityPoolStakeAccounts(
        program,
        poolKeypair.publicKey
      );
      expect(fetched.active).to.be.empty;
      expect(fetched.inactive.length).to.eq(1);
      expect(fetched.activating).to.be.empty;
      expect(fetched.deactivating).to.be.empty;
    });
  });

  describe("previewUnstake and unstakeTx", () => {
    const testCases = 4;
    const stakeAccKeypairs = [...Array(testCases).keys()].map(() =>
      Keypair.generate()
    );
    const unstakerKeypair = Keypair.generate();
    const destinationKeypair = Keypair.generate();

    let unstakerPayerDestination: number = 0;
    let unstakerNotPayerDestination: number = 0;
    let unstakerPayerNotDestination: number = 0;
    let unstakerNotPayerNotDestination: number = 0;

    before(async () => {
      await airdrop(program.provider.connection, unstakerKeypair.publicKey);
      await Promise.all(
        stakeAccKeypairs.map((stakeAccKeypair) =>
          createDelegateStakeTx({
            connection: provider.connection,
            stakeAccount: stakeAccKeypair.publicKey,
            payer: unstakerKeypair.publicKey,
          }).then((tx) =>
            sendAndConfirmTransaction(provider.connection, tx, [
              unstakerKeypair,
              stakeAccKeypair,
            ])
          )
        )
      );
      console.log("awaiting epoch to pass");
      await waitForEpochToPass(program.provider.connection);
    });

    it("unstaker == payer == destination", async () => {
      const stakeAccKeypair = stakeAccKeypairs[0];
      const accounts = {
        poolAccount: poolKeypair.publicKey,
        stakeAccount: stakeAccKeypair.publicKey,
        unstaker: unstakerKeypair.publicKey,
      };
      unstakerPayerDestination = await previewUnstake(program, accounts);
      const unstakerPre = await program.provider.connection.getBalance(
        unstakerKeypair.publicKey
      );
      const tx = await unstakeTx(program, accounts);
      await sendAndConfirmTransaction(program.provider.connection, tx, [
        unstakerKeypair,
      ]);
      const unstakerPost = await program.provider.connection.getBalance(
        unstakerKeypair.publicKey
      );
      expect(unstakerPayerDestination).to.be.eq(unstakerPost - unstakerPre);
      expect(unstakerPayerDestination).to.be.gt(0);
    });

    it("unstaker == destination != payer", async () => {
      const stakeAccKeypair = stakeAccKeypairs[1];
      const accounts = {
        poolAccount: poolKeypair.publicKey,
        stakeAccount: stakeAccKeypair.publicKey,
        unstaker: unstakerKeypair.publicKey,
        payer: payerKeypair.publicKey,
      };
      unstakerNotPayerDestination = await previewUnstake(program, accounts);
      const unstakerPre = await program.provider.connection.getBalance(
        unstakerKeypair.publicKey
      );
      const tx = await unstakeTx(program, accounts);
      tx.feePayer = payerKeypair.publicKey;
      await sendAndConfirmTransaction(program.provider.connection, tx, [
        payerKeypair,
        unstakerKeypair,
      ]);
      const unstakerPost = await program.provider.connection.getBalance(
        unstakerKeypair.publicKey
      );
      expect(unstakerNotPayerDestination).to.be.eq(unstakerPost - unstakerPre);
      // unstaker doesnt pay for fees, so should be gt
      expect(unstakerNotPayerDestination).to.be.gt(unstakerPayerDestination);
    });

    it("unstaker != destination == payer", async () => {
      const stakeAccKeypair = stakeAccKeypairs[2];
      const accounts = {
        poolAccount: poolKeypair.publicKey,
        stakeAccount: stakeAccKeypair.publicKey,
        unstaker: unstakerKeypair.publicKey,
        destination: destinationKeypair.publicKey,
      };
      unstakerPayerNotDestination = await previewUnstake(program, accounts);
      const destinationPre = await program.provider.connection.getBalance(
        destinationKeypair.publicKey
      );
      const tx = await unstakeTx(program, accounts);
      await sendAndConfirmTransaction(program.provider.connection, tx, [
        unstakerKeypair,
      ]);
      const destinationPost = await program.provider.connection.getBalance(
        destinationKeypair.publicKey
      );
      expect(unstakerPayerNotDestination).to.be.eq(
        destinationPost - destinationPre
      );
      // destination doesnt pay for fees, so should be same as unstakerNotPayerDestination
      expect(unstakerPayerNotDestination).to.be.eq(unstakerNotPayerDestination);
    });

    it("unstaker != destination != payer", async () => {
      const stakeAccKeypair = stakeAccKeypairs[3];
      const accounts = {
        poolAccount: poolKeypair.publicKey,
        stakeAccount: stakeAccKeypair.publicKey,
        unstaker: unstakerKeypair.publicKey,
        payer: payerKeypair.publicKey,
        destination: destinationKeypair.publicKey,
      };
      unstakerNotPayerNotDestination = await previewUnstake(program, accounts);
      const destinationPre = await program.provider.connection.getBalance(
        destinationKeypair.publicKey
      );
      const tx = await unstakeTx(program, accounts);
      tx.feePayer = payerKeypair.publicKey;
      await sendAndConfirmTransaction(program.provider.connection, tx, [
        payerKeypair,
        unstakerKeypair,
      ]);
      const destinationPost = await program.provider.connection.getBalance(
        destinationKeypair.publicKey
      );
      expect(unstakerNotPayerNotDestination).to.be.eq(
        destinationPost - destinationPre
      );
      // destination doesnt pay for fees, so should be same as unstakerNotPayerDestination
      expect(unstakerNotPayerNotDestination).to.be.eq(
        unstakerNotPayerDestination
      );
    });
  });
});
