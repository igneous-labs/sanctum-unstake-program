import * as anchor from "@project-serum/anchor";
import {
  createAssociatedTokenAccount,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  NATIVE_MINT,
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
  previewUnstake,
  unstakeTx,
  unstakeWsolTx,
  addLiquidityTx,
  createPoolTx,
  deactivateStakeAccountTx,
  reclaimStakeAccountTx,
  removeLiquidityTx,
  setFeeTx,
  setFeeAuthorityTx,
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
          flat: {
            ratio: {
              num: new BN(0),
              denom: new BN(1000),
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

  describe("transaction generation", () => {
    describe("Admin facing", () => {
      it("it generates CreatePool tx", async () => {
        const feeAuthority = Keypair.generate().publicKey;
        const poolAccount = Keypair.generate().publicKey;
        const lpMint = Keypair.generate().publicKey;

        const tx = await createPoolTx(
          program,
          {
            fee: {
              flat: {
                ratio: {
                  num: new BN(0),
                  denom: new BN(1000),
                },
              },
            },
          },
          {
            feeAuthority,
            poolAccount,
            lpMint,
          }
        );
        console.log("CreatePool tx:", JSON.stringify(tx));
      });

      it("it generates SetFee tx", async () => {
        const poolAccount = Keypair.generate().publicKey;
        const feeAuthority = Keypair.generate().publicKey;

        const tx = await setFeeTx(
          program,
          {
            fee: {
              flat: {
                ratio: {
                  num: new BN(0),
                  denom: new BN(1000),
                },
              },
            },
          },
          {
            poolAccount,
            feeAuthority,
          }
        );
        console.log("SetFee tx:", tx);
      });

      it("it generates SetFeeAuthority tx", async () => {
        const poolAccount = Keypair.generate().publicKey;
        const feeAuthority = Keypair.generate().publicKey;
        const newFeeAuthority = Keypair.generate().publicKey;

        // case 1 (trivial): poolAccount is Address type
        const tx = await setFeeAuthorityTx(program, {
          poolAccount,
          feeAuthority,
          newFeeAuthority,
        });
        console.log("SetFeeAuthority tx:", tx);

        // case 2: poolAccount is ProgramAccount type and feeAuthority is given
        // case 3: poolAccount is ProgramAccount type and feeAuthority is not given
      });
    });

    describe("Crank facing", () => {
      it("it generates DeactivateStakeAccount tx", async () => {
        const poolAccount = Keypair.generate().publicKey;
        const stakeAccount = Keypair.generate().publicKey;

        const tx = await deactivateStakeAccountTx(program, {
          poolAccount,
          stakeAccount,
        });
        console.log("DeactivateStakeAccount tx:", tx);
      });

      it("it generates ReclaimStakeAccount tx", async () => {
        const poolAccount = Keypair.generate().publicKey;
        const stakeAccount = Keypair.generate().publicKey;

        const tx = await reclaimStakeAccountTx(program, {
          poolAccount,
          stakeAccount,
        });
        console.log("ReclaimStakeAccount tx:", tx);
      });
    });

    describe("LP facing", () => {
      it("it generates AddLiquidity tx", async () => {
        const amountLamports = new BN(1);
        const from = Keypair.generate().publicKey;
        const poolAccount = Keypair.generate().publicKey;
        const lpMint = Keypair.generate().publicKey;
        const mintLpTokensTo = Keypair.generate().publicKey;

        // case 1 (trivial): poolAccount is Address type
        const tx = await addLiquidityTx(program, amountLamports, {
          from,
          poolAccount,
          lpMint,
          mintLpTokensTo,
        });
        console.log("AddLiquidity tx:", tx);

        // case 2: poolAccount is ProgramAccount type lpMint is given
        // case 3: poolAccount is ProgramAccount type lpMint is not given
      });

      it("it generates RemoveLiquidity tx", async () => {
        const amountLPAtomics = new BN(1);
        const authority = Keypair.generate().publicKey;
        const poolAccount = Keypair.generate().publicKey;
        const lpMint = Keypair.generate().publicKey;

        // case 1 (trivial): poolAccount is Address type
        const tx = await removeLiquidityTx(program, amountLPAtomics, {
          authority,
          poolAccount,
          lpMint,
        });
        console.log("RemoveLiquidity tx:", tx);

        // case 2: poolAccount is ProgramAccount type lpMint is given
        // case 3: poolAccount is ProgramAccount type lpMint is not given
      });
    });

    describe("User facing", () => {
      it("it generates Unstake tx", async () => {
        const poolAccount = Keypair.generate().publicKey;
        const stakeAccount = Keypair.generate().publicKey;
        const unstaker = Keypair.generate().publicKey;

        const tx = await unstakeTx(program, {
          poolAccount,
          stakeAccount,
          unstaker,
        });
        console.log("Unstake tx:", tx);
      });

      it("it generates UnstakeWsol tx", async () => {
        const poolAccount = Keypair.generate().publicKey;
        const stakeAccount = Keypair.generate().publicKey;
        const unstaker = Keypair.generate().publicKey;

        const tx = await unstakeWsolTx(program, {
          poolAccount,
          stakeAccount,
          unstaker,
        });
        console.log("UnstakeWsol tx:", tx);
      });
    });
  });

  describe("previewUnstake, unstakeTx, unstakeWsolTx", () => {
    const testCases = 5;
    const stakeAccKeypairs = [...Array(testCases).keys()].map(() =>
      Keypair.generate()
    );
    const unstakerKeypair = Keypair.generate();
    const destinationKeypair = Keypair.generate();
    let unstakerWSol = null as PublicKey;

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
      unstakerWSol = await createAssociatedTokenAccount(
        provider.connection,
        unstakerKeypair,
        NATIVE_MINT,
        unstakerKeypair.publicKey
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

    it("unstake wSOL", async () => {
      const stakeAccKeypair = stakeAccKeypairs[4];
      const accounts = {
        poolAccount: poolKeypair.publicKey,
        stakeAccount: stakeAccKeypair.publicKey,
        unstaker: unstakerKeypair.publicKey,
        payer: unstakerKeypair.publicKey,
        destination: unstakerWSol,
      };
      const destinationPre = (
        await getAccount(provider.connection, unstakerWSol)
      ).amount;
      const tx = await unstakeWsolTx(program, accounts);
      await sendAndConfirmTransaction(program.provider.connection, tx, [
        unstakerKeypair,
      ]);
      const destinationPost = (
        await getAccount(provider.connection, unstakerWSol)
      ).amount;
      // wSOL account doesnt pay for fees, so should be the same as unstakerNotPayerNotDestination
      expect(unstakerNotPayerNotDestination).to.be.eq(
        Number(destinationPost - destinationPre)
      );
    });
  });
});
