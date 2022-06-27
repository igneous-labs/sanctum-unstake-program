import * as anchor from "@project-serum/anchor";
import {
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
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
              // TODO: flip the 2 when fee is fixed
              maxLiqRemaining: {
                num: new BN(1),
                denom: new BN(100),
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
});
