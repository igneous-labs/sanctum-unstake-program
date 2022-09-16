import * as anchor from "@project-serum/anchor";
import { IdlAccounts, ProgramAccount } from "@project-serum/anchor";
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
  Transaction,
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
  ProtocolFeeAccount,
  findProtocolFeeAccount,
  applyProtocolFee,
  previewUnstakeWsol,
  applyFee,
} from "../ts/src";
import {
  airdrop,
  createDelegateStakeTx,
  EPSILON_FLOAT_UPPER_BOUND,
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
  let protocolFeeAddr = null as PublicKey;
  let protocolFee = null as ProgramAccount<ProtocolFeeAccount>;

  const liquidityAmountSol = 0.1;
  const liquidityAmountLamports = new BN(liquidityAmountSol * LAMPORTS_PER_SOL);

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
    [protocolFeeAddr] = await findProtocolFeeAccount(program.programId);
    protocolFee = {
      publicKey: protocolFeeAddr,
      account: await program.account.protocolFee.fetch(protocolFeeAddr),
    };
    console.log("setting up zero-fee pool");
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
      .addLiquidity(liquidityAmountLamports)
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
      await sendAndConfirmTransaction(
        provider.connection,
        tx,
        [payerKeypair, stakeAccNoRecordKeypair],
        { skipPreflight: true }
      );
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
      await sendAndConfirmTransaction(
        provider.connection,
        tx,
        [payerKeypair, stakeAccKeypair],
        { skipPreflight: true }
      );
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
          protocolFeeAccount: protocolFee.publicKey,
          protocolFeeDestination: protocolFee.account.destination,
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

  describe("fee calculation", () => {
    it("applyFee liquidity linear from maxLiqRemaining", () => {
      const zeroLiqRemainingRatio = 0.01;
      const maxLiqRemainingRatio = 0.0003;
      const solReservesLamportsNumber = 14000_000_000_000;
      const stakeAccountLamportsNumber = 1_000_000_000;
      const feeLamports = applyFee(
        {
          fee: {
            liquidityLinear: {
              params: {
                // need to round to avoid loss of precision
                // 0.0003 * 10_000 -> 2.99999996
                maxLiqRemaining: {
                  num: new BN(Math.round(maxLiqRemainingRatio * 10_000)),
                  denom: new BN(10_000),
                },
                zeroLiqRemaining: {
                  num: new BN(Math.round(zeroLiqRemainingRatio * 100)),
                  denom: new BN(100),
                },
              },
            },
          },
        },
        {
          poolIncomingStake: new BN(0),
          solReservesLamports: new BN(solReservesLamportsNumber),
          stakeAccountLamports: new BN(stakeAccountLamportsNumber),
        }
      );
      const feeRatio = feeLamports.toNumber() / stakeAccountLamportsNumber;
      expect(feeRatio).to.be.gt(maxLiqRemainingRatio);
      expect(feeRatio).to.be.lt(zeroLiqRemainingRatio);
      expect(feeRatio).to.be.closeTo(
        maxLiqRemainingRatio +
          (stakeAccountLamportsNumber / solReservesLamportsNumber) *
            (zeroLiqRemainingRatio - maxLiqRemainingRatio),
        EPSILON_FLOAT_UPPER_BOUND
      );
    });
  });

  describe("transaction generation", () => {
    const stakeAccKeypair = Keypair.generate();
    const unstakerKeypair = Keypair.generate();
    let unstakerWSolAccount = null as PublicKey;
    let poolProgramAccount = null as ProgramAccount<
      IdlAccounts<Unstake>["pool"]
    >;

    before(async () => {
      await airdrop(program.provider.connection, unstakerKeypair.publicKey);
      await createDelegateStakeTx({
        connection: provider.connection,
        stakeAccount: stakeAccKeypair.publicKey,
        payer: unstakerKeypair.publicKey,
      }).then((tx) =>
        sendAndConfirmTransaction(
          provider.connection,
          tx,
          [unstakerKeypair, stakeAccKeypair],
          { skipPreflight: true }
        )
      );
      unstakerWSolAccount = await createAssociatedTokenAccount(
        provider.connection,
        unstakerKeypair,
        NATIVE_MINT,
        unstakerKeypair.publicKey
      );
      poolProgramAccount = {
        publicKey: poolKeypair.publicKey,
        account: await program.account.pool.fetch(poolKeypair.publicKey),
      };
    });

    describe("Admin facing", () => {
      it("it generates CreatePool tx", async () => {
        const expectedAccountsLength = program.idl.instructions.find(
          (ix) => ix.name === "createPool"
        ).accounts.length;

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
            feeAuthority: payerKeypair.publicKey,
            poolAccount: poolKeypair.publicKey,
            lpMint: lpMintKeypair.publicKey,
          }
        );
        expect(tx instanceof Transaction).to.be.true;
        expect(tx.instructions.length).to.eq(1);
        expect(tx.instructions[0].programId.equals(program.programId)).to.be
          .true;
        expect(tx.instructions[0].keys.length).to.eq(expectedAccountsLength);
      });

      it("it generates SetFee tx", async () => {
        const expectedAccountsLength = program.idl.instructions.find(
          (ix) => ix.name === "setFee"
        ).accounts.length;

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
            poolAccount: poolKeypair.publicKey,
            feeAuthority: payerKeypair.publicKey,
          }
        );
        expect(tx instanceof Transaction).to.be.true;
        expect(tx.instructions.length).to.eq(1);
        expect(tx.instructions[0].programId.equals(program.programId)).to.be
          .true;
        expect(tx.instructions[0].keys.length).to.eq(expectedAccountsLength);
      });

      it("it generates SetFeeAuthority tx", async () => {
        const newFeeAuthority = Keypair.generate().publicKey;
        const expectedAccountsLength = program.idl.instructions.find(
          (ix) => ix.name === "setFeeAuthority"
        ).accounts.length;

        // case 1 (trivial): poolAccount is Address type
        const tx1 = await setFeeAuthorityTx(program, {
          poolAccount: poolKeypair.publicKey,
          feeAuthority: payerKeypair.publicKey,
          newFeeAuthority,
        });
        expect(tx1 instanceof Transaction).to.be.true;
        expect(tx1.instructions.length).to.eq(1);
        expect(tx1.instructions[0].programId.equals(program.programId)).to.be
          .true;
        expect(tx1.instructions[0].keys.length).to.eq(expectedAccountsLength);

        // case 2: poolAccount is ProgramAccount type and feeAuthority is given
        const tx2 = await setFeeAuthorityTx(program, {
          poolAccount: poolProgramAccount,
          feeAuthority: payerKeypair.publicKey,
          newFeeAuthority,
        });
        expect(tx2 instanceof Transaction).to.be.true;
        expect(tx2.instructions.length).to.eq(1);
        expect(tx2.instructions[0].programId.equals(program.programId)).to.be
          .true;
        expect(tx2.instructions[0].keys.length).to.eq(expectedAccountsLength);

        // case 3: poolAccount is ProgramAccount type and feeAuthority is not given
        const tx3 = await setFeeAuthorityTx(program, {
          poolAccount: poolProgramAccount,
          newFeeAuthority,
        });
        expect(tx3 instanceof Transaction).to.be.true;
        expect(tx3.instructions.length).to.eq(1);
        expect(tx3.instructions[0].programId.equals(program.programId)).to.be
          .true;
        expect(tx3.instructions[0].keys.length).to.eq(expectedAccountsLength);
      });
    });

    describe("Crank facing", () => {
      it("it generates DeactivateStakeAccount tx", async () => {
        const expectedAccountsLength = program.idl.instructions.find(
          (ix) => ix.name === "deactivateStakeAccount"
        ).accounts.length;

        const tx = await deactivateStakeAccountTx(program, {
          poolAccount: poolKeypair.publicKey,
          stakeAccount: stakeAccKeypair.publicKey,
        });
        expect(tx instanceof Transaction).to.be.true;
        expect(tx.instructions.length).to.eq(1);
        expect(tx.instructions[0].programId.equals(program.programId)).to.be
          .true;
        expect(tx.instructions[0].keys.length).to.eq(expectedAccountsLength);
      });

      it("it generates ReclaimStakeAccount tx", async () => {
        const expectedAccountsLength = program.idl.instructions.find(
          (ix) => ix.name === "reclaimStakeAccount"
        ).accounts.length;

        const tx = await reclaimStakeAccountTx(program, {
          poolAccount: poolKeypair.publicKey,
          stakeAccount: stakeAccKeypair.publicKey,
        });
        expect(tx instanceof Transaction).to.be.true;
        expect(tx.instructions.length).to.eq(1);
        expect(tx.instructions[0].programId.equals(program.programId)).to.be
          .true;
        expect(tx.instructions[0].keys.length).to.eq(expectedAccountsLength);
      });
    });

    describe("LP facing", () => {
      it("it generates AddLiquidity tx", async () => {
        const amountLamports = new BN(1);
        const expectedAccountsLength = program.idl.instructions.find(
          (ix) => ix.name === "addLiquidity"
        ).accounts.length;

        // case 1 (trivial): poolAccount is Address type
        const tx1 = await addLiquidityTx(program, amountLamports, {
          from: lperKeypair.publicKey,
          poolAccount: poolKeypair.publicKey,
          lpMint: lpMintKeypair.publicKey,
          mintLpTokensTo: lperAta,
        });
        expect(tx1 instanceof Transaction).to.be.true;
        expect(tx1.instructions.length).to.eq(1);
        expect(tx1.instructions[0].programId.equals(program.programId)).to.be
          .true;
        expect(tx1.instructions[0].keys.length).to.eq(expectedAccountsLength);

        // case 2: poolAccount is ProgramAccount type lpMint is given
        const tx2 = await addLiquidityTx(program, amountLamports, {
          from: lperKeypair.publicKey,
          poolAccount: poolProgramAccount,
          lpMint: lpMintKeypair.publicKey,
          mintLpTokensTo: lperAta,
        });
        expect(tx2 instanceof Transaction).to.be.true;
        expect(tx2.instructions.length).to.eq(1);
        expect(tx2.instructions[0].programId.equals(program.programId)).to.be
          .true;
        expect(tx2.instructions[0].keys.length).to.eq(expectedAccountsLength);

        // case 3: poolAccount is ProgramAccount type lpMint is not given
        const tx3 = await addLiquidityTx(program, amountLamports, {
          from: lperKeypair.publicKey,
          poolAccount: poolProgramAccount,
          mintLpTokensTo: lperAta,
        });
        expect(tx3 instanceof Transaction).to.be.true;
        expect(tx3.instructions.length).to.eq(1);
        expect(tx3.instructions[0].programId.equals(program.programId)).to.be
          .true;
        expect(tx3.instructions[0].keys.length).to.eq(expectedAccountsLength);
      });

      it("it generates RemoveLiquidity tx", async () => {
        const amountLPAtomics = new BN(1);
        const expectedAccountsLength = program.idl.instructions.find(
          (ix) => ix.name === "removeLiquidity"
        ).accounts.length;

        // case 1 (trivial): poolAccount is Address type
        const tx1 = await removeLiquidityTx(program, amountLPAtomics, {
          authority: lperKeypair.publicKey,
          poolAccount: poolKeypair.publicKey,
          lpMint: lpMintKeypair.publicKey,
        });
        expect(tx1 instanceof Transaction).to.be.true;
        expect(tx1.instructions.length).to.eq(1);
        expect(tx1.instructions[0].programId.equals(program.programId)).to.be
          .true;
        expect(tx1.instructions[0].keys.length).to.eq(expectedAccountsLength);

        // case 2: poolAccount is ProgramAccount type lpMint is given
        const tx2 = await removeLiquidityTx(program, amountLPAtomics, {
          authority: lperKeypair.publicKey,
          poolAccount: poolProgramAccount,
          lpMint: lpMintKeypair.publicKey,
        });
        expect(tx2 instanceof Transaction).to.be.true;
        expect(tx2.instructions.length).to.eq(1);
        expect(tx2.instructions[0].programId.equals(program.programId)).to.be
          .true;
        expect(tx2.instructions[0].keys.length).to.eq(expectedAccountsLength);

        // case 3: poolAccount is ProgramAccount type lpMint is not given
        const tx3 = await removeLiquidityTx(program, amountLPAtomics, {
          authority: lperKeypair.publicKey,
          poolAccount: poolProgramAccount,
        });
        expect(tx3 instanceof Transaction).to.be.true;
        expect(tx3.instructions.length).to.eq(1);
        expect(tx3.instructions[0].programId.equals(program.programId)).to.be
          .true;
        expect(tx3.instructions[0].keys.length).to.eq(expectedAccountsLength);
      });
    });

    describe("User facing", () => {
      it("it generates Unstake tx", async () => {
        const expectedAccountsLength = program.idl.instructions.find(
          (ix) => ix.name === "unstake"
        ).accounts.length;

        const tx = await unstakeTx(program, {
          poolAccount: poolKeypair.publicKey,
          stakeAccount: stakeAccKeypair.publicKey,
          unstaker: unstakerKeypair.publicKey,
          protocolFee,
        });
        expect(tx instanceof Transaction).to.be.true;
        expect(tx.instructions.length).to.eq(1);
        expect(tx.instructions[0].programId.equals(program.programId)).to.be
          .true;
        expect(tx.instructions[0].keys.length).to.eq(expectedAccountsLength);
      });

      it("it generates Unstake tx with referrer", async () => {
        const expectedReferrer = Keypair.generate().publicKey;
        const expectedAccountsLength =
          program.idl.instructions.find((ix) => ix.name === "unstake").accounts
            .length + 1;

        const tx = await unstakeTx(program, {
          poolAccount: poolKeypair.publicKey,
          stakeAccount: stakeAccKeypair.publicKey,
          unstaker: unstakerKeypair.publicKey,
          protocolFee,
          referrer: expectedReferrer,
        });
        expect(tx instanceof Transaction).to.be.true;
        expect(tx.instructions.length).to.eq(1);
        expect(tx.instructions[0].programId.equals(program.programId)).to.be
          .true;
        const keys = tx.instructions[0].keys;
        expect(keys.length).to.eq(expectedAccountsLength);
        const referrerMeta = keys[keys.length - 1];
        expect(referrerMeta.pubkey.toString()).to.eq(
          expectedReferrer.toString()
        );
        expect(referrerMeta.isSigner).to.be.false;
        expect(referrerMeta.isWritable).to.be.true;
      });

      it("it generates UnstakeWsol tx", async () => {
        const expectedAccountsLength = program.idl.instructions.find(
          (ix) => ix.name === "unstakeWsol"
        ).accounts.length;

        const tx = await unstakeWsolTx(program, {
          poolAccount: poolKeypair.publicKey,
          stakeAccount: stakeAccKeypair.publicKey,
          unstaker: unstakerKeypair.publicKey,
          protocolFee,
        });
        expect(tx instanceof Transaction).to.be.true;
        expect(tx.instructions.length).to.eq(1);
        expect(tx.instructions[0].programId.equals(program.programId)).to.be
          .true;
        expect(tx.instructions[0].keys.length).to.eq(expectedAccountsLength);
      });

      it("it generates UnstakeWsol tx with referrer", async () => {
        const expectedReferrer = Keypair.generate().publicKey;
        const expectedAccountsLength =
          program.idl.instructions.find((ix) => ix.name === "unstakeWsol")
            .accounts.length + 1;

        const tx = await unstakeWsolTx(program, {
          poolAccount: poolKeypair.publicKey,
          stakeAccount: stakeAccKeypair.publicKey,
          unstaker: unstakerKeypair.publicKey,
          protocolFee,
          referrer: expectedReferrer,
        });
        expect(tx instanceof Transaction).to.be.true;
        expect(tx.instructions.length).to.eq(1);
        expect(tx.instructions[0].programId.equals(program.programId)).to.be
          .true;
        const keys = tx.instructions[0].keys;
        expect(keys.length).to.eq(expectedAccountsLength);
        const referrerMeta = keys[keys.length - 1];
        expect(referrerMeta.pubkey.toString()).to.eq(
          expectedReferrer.toString()
        );
        expect(referrerMeta.isSigner).to.be.false;
        expect(referrerMeta.isWritable).to.be.true;
      });
    });
  });

  describe("previewUnstake, unstakeTx, unstakeWsolTx", () => {
    const testCases = 7;
    const stakeAccKeypairs = [...Array(testCases).keys()].map(() =>
      Keypair.generate()
    );
    const unstakerKeypair = Keypair.generate();
    const destinationKeypair = Keypair.generate();
    const referrer = Keypair.generate().publicKey;
    let unstakerWSol = null as PublicKey;

    let unstakerPayerDestination: number = 0;
    let unstakerNotPayerDestination: number = 0;
    let unstakerPayerNotDestination: number = 0;
    let unstakerNotPayerNotDestination: number = 0;

    before(async () => {
      await Promise.all([
        airdrop(program.provider.connection, unstakerKeypair.publicKey),
        airdrop(program.provider.connection, referrer),
      ]);
      await Promise.all(
        stakeAccKeypairs.map((stakeAccKeypair) =>
          createDelegateStakeTx({
            connection: provider.connection,
            stakeAccount: stakeAccKeypair.publicKey,
            payer: unstakerKeypair.publicKey,
          }).then((tx) =>
            sendAndConfirmTransaction(
              provider.connection,
              tx,
              [unstakerKeypair, stakeAccKeypair],
              { skipPreflight: true }
            )
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
        protocolFee,
      };
      unstakerPayerDestination = await previewUnstake(program, accounts);
      const unstakerPre = await program.provider.connection.getBalance(
        unstakerKeypair.publicKey
      );
      const tx = await unstakeTx(program, accounts);
      await sendAndConfirmTransaction(
        program.provider.connection,
        tx,
        [unstakerKeypair],
        { skipPreflight: true }
      );
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
        protocolFee,
      };
      unstakerNotPayerDestination = await previewUnstake(program, accounts);
      const unstakerPre = await program.provider.connection.getBalance(
        unstakerKeypair.publicKey
      );
      const tx = await unstakeTx(program, accounts);
      tx.feePayer = payerKeypair.publicKey;
      await sendAndConfirmTransaction(
        program.provider.connection,
        tx,
        [payerKeypair, unstakerKeypair],
        { skipPreflight: true }
      );
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
        protocolFee,
      };
      unstakerPayerNotDestination = await previewUnstake(program, accounts);
      const destinationPre = await program.provider.connection.getBalance(
        destinationKeypair.publicKey
      );
      const tx = await unstakeTx(program, accounts);
      await sendAndConfirmTransaction(
        program.provider.connection,
        tx,
        [unstakerKeypair],
        { skipPreflight: true }
      );
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
        protocolFee,
      };
      unstakerNotPayerNotDestination = await previewUnstake(program, accounts);
      const destinationPre = await program.provider.connection.getBalance(
        destinationKeypair.publicKey
      );
      const tx = await unstakeTx(program, accounts);
      tx.feePayer = payerKeypair.publicKey;
      await sendAndConfirmTransaction(
        program.provider.connection,
        tx,
        [payerKeypair, unstakerKeypair],
        { skipPreflight: true }
      );
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
        protocolFee,
      };
      const destinationPre = (
        await getAccount(provider.connection, unstakerWSol)
      ).amount;
      const tx = await unstakeWsolTx(program, accounts);
      await sendAndConfirmTransaction(
        program.provider.connection,
        tx,
        [unstakerKeypair],
        { skipPreflight: true }
      );
      const destinationPost = (
        await getAccount(provider.connection, unstakerWSol)
      ).amount;
      // wSOL account doesnt pay for fees, so should be the same as unstakerNotPayerNotDestination
      expect(unstakerNotPayerNotDestination).to.be.eq(
        Number(destinationPost - destinationPre)
      );
    });

    // ideally this + 2 referrer tests below should be separate
    // but wanna save one epoch's worth of time
    it("set fee to non-zero", async () => {
      const tx = await setFeeTx(
        program,
        {
          fee: {
            flat: {
              ratio: {
                // 3 bps
                num: new BN(3),
                denom: new BN(10000),
              },
            },
          },
        },
        {
          poolAccount: poolKeypair.publicKey,
          feeAuthority: payerKeypair.publicKey,
        }
      );
      await sendAndConfirmTransaction(provider.connection, tx, [payerKeypair], {
        skipPreflight: true,
      });
    });

    it("unstake with referrer", async () => {
      const stakeAccKeypair = stakeAccKeypairs[5];
      const stakeAccBalance = await provider.connection.getBalance(
        stakeAccKeypair.publicKey
      );
      const accounts = {
        poolAccount: poolKeypair.publicKey,
        stakeAccount: stakeAccKeypair.publicKey,
        unstaker: unstakerKeypair.publicKey,
        payer: payerKeypair.publicKey,
        destination: unstakerKeypair.publicKey,
        protocolFee,
        referrer,
      };
      const expectedReceive = await previewUnstake(program, accounts);
      const expectedFee = stakeAccBalance - expectedReceive;
      const { referrerLamports: expectedReferralBonus } = applyProtocolFee(
        protocolFee.account,
        new BN(expectedFee)
      );
      const destinationPre = await provider.connection.getBalance(
        unstakerKeypair.publicKey
      );
      const referrerPre = await provider.connection.getBalance(referrer);
      const tx = await unstakeTx(program, accounts);
      await sendAndConfirmTransaction(
        program.provider.connection,
        tx,
        [payerKeypair, unstakerKeypair],
        { skipPreflight: true }
      );
      const destinationPost = await provider.connection.getBalance(
        unstakerKeypair.publicKey
      );
      const referrerPost = await provider.connection.getBalance(referrer);
      expect(expectedReceive).to.be.eq(
        Number(destinationPost - destinationPre)
      );
      expect(expectedReferralBonus.toNumber()).to.be.gt(0);
      expect(expectedReferralBonus.toNumber()).to.be.eq(
        referrerPost - referrerPre
      );
    });

    it("unstake wSOL with referrer", async () => {
      const stakeAccKeypair = stakeAccKeypairs[6];
      const stakeAccBalance = await provider.connection.getBalance(
        stakeAccKeypair.publicKey
      );
      const accounts = {
        poolAccount: poolKeypair.publicKey,
        stakeAccount: stakeAccKeypair.publicKey,
        unstaker: unstakerKeypair.publicKey,
        payer: unstakerKeypair.publicKey,
        destination: unstakerWSol,
        protocolFee,
        referrer,
      };
      const expectedReceive = await previewUnstakeWsol(program, accounts);
      const expectedFee = stakeAccBalance - expectedReceive;
      const { referrerLamports: expectedReferralBonus } = applyProtocolFee(
        protocolFee.account,
        new BN(expectedFee)
      );
      const destinationPre = (
        await getAccount(provider.connection, unstakerWSol)
      ).amount;
      const referrerPre = await provider.connection.getBalance(referrer);
      const tx = await unstakeWsolTx(program, accounts);
      await sendAndConfirmTransaction(
        program.provider.connection,
        tx,
        [unstakerKeypair],
        { skipPreflight: true }
      );
      const destinationPost = (
        await getAccount(provider.connection, unstakerWSol)
      ).amount;
      const referrerPost = await provider.connection.getBalance(referrer);
      expect(expectedReceive).to.be.eq(
        Number(destinationPost - destinationPre)
      );
      expect(expectedReferralBonus.toNumber()).to.be.gt(0);
      expect(expectedReferralBonus.toNumber()).to.be.eq(
        referrerPost - referrerPre
      );
    });
  });
});
