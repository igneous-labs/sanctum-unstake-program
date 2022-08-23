import BN from "bn.js";
import * as anchor from "@project-serum/anchor";
import {
  sendAndConfirmTransaction,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  StakeProgram,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_STAKE_HISTORY_PUBKEY,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccount,
  getAccount,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  applyFee,
  Fee,
  findPoolFeeAccount,
  findPoolSolReserves,
  findProtocolFeeAccount,
  findStakeAccountRecordAccount,
  LiquidityLinearFeeInner,
  ProtocolFeeAccount,
} from "../ts/src";
import { Unstake } from "../target/types/unstake";
import {
  airdrop,
  createDelegateStakeTx,
  EPSILON_UPPER_BOUND,
  fetchLpFacingTestParams,
  waitForEpochToPass,
} from "./utils";
import { expect, use as chaiUse } from "chai";
import chaiAsPromised from "chai-as-promised";
import { getStakeAccount, stakeAccountState } from "@soceanfi/solana-stake-sdk";
import { ProgramAccount } from "@project-serum/anchor";

chaiUse(chaiAsPromised);

describe("integration", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.getProvider());
  const program = anchor.workspace.Unstake as anchor.Program<Unstake>;
  const provider = anchor.getProvider();

  const payerKeypair = Keypair.generate();
  const lperKeypair = Keypair.generate();
  const poolKeypair = Keypair.generate();
  const lpMintKeypair = Keypair.generate();
  const unstakerKeypair = Keypair.generate();
  const stakeAccountKeypair = Keypair.generate();
  const stakeAccountWSolKeypair = Keypair.generate();

  const liquidityAmount = new BN(0.1 * LAMPORTS_PER_SOL);

  let [poolSolReserves] = [null as PublicKey, 0];
  let [feeAccount] = [null as PublicKey, 0];
  let lperAta = null as PublicKey;
  let unstakerWSol = null as PublicKey;
  let protocolFeeAddr = null as PublicKey;
  let protocolFee = null as ProgramAccount<ProtocolFeeAccount>;

  before(async () => {
    console.log("airdropping to payer, lper, and unstaker");
    await Promise.all(
      [payerKeypair, lperKeypair, unstakerKeypair].map((kp) =>
        airdrop(provider.connection, kp.publicKey)
      )
    );
    [poolSolReserves] = await findPoolSolReserves(
      program.programId,
      poolKeypair.publicKey
    );
    [feeAccount] = await findPoolFeeAccount(
      program.programId,
      poolKeypair.publicKey
    );
    [protocolFeeAddr] = await findProtocolFeeAccount(program.programId);
    protocolFee = {
      publicKey: protocolFeeAddr,
      account: await program.account.protocolFee.fetch(protocolFeeAddr),
    };
    console.log("creating a new pool");
    await program.methods
      .createPool({
        fee: {
          liquidityLinear: {
            params: {
              maxLiqRemaining: {
                num: new BN(15),
                denom: new BN(1000),
              },
              zeroLiqRemaining: {
                num: new BN(42),
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

    console.log("create lper's ATA");
    lperAta = await createAssociatedTokenAccount(
      provider.connection,
      lperKeypair,
      lpMintKeypair.publicKey,
      lperKeypair.publicKey
    );

    console.log("adding some liquidity");
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

    console.log("creating unstaker wSOL acc");
    unstakerWSol = await createAssociatedTokenAccount(
      provider.connection,
      payerKeypair,
      NATIVE_MINT,
      unstakerKeypair.publicKey
    );

    console.log("preparing stake accounts");
    await Promise.all(
      [stakeAccountKeypair, stakeAccountWSolKeypair].map((kp) =>
        createDelegateStakeTx({
          connection: provider.connection,
          stakeAccount: kp.publicKey,
          payer: unstakerKeypair.publicKey,
        }).then((tx) =>
          sendAndConfirmTransaction(provider.connection, tx, [
            unstakerKeypair,
            kp,
          ])
        )
      )
    );

    console.log("awaiting epoch to pass");
    await waitForEpochToPass(provider.connection);
  });

  it("it unstakes", async () => {
    const [stakeAccountRecordAccount] = await findStakeAccountRecordAccount(
      program.programId,
      poolKeypair.publicKey,
      stakeAccountKeypair.publicKey
    );
    const stakeAccountLamports = await provider.connection.getBalance(
      stakeAccountKeypair.publicKey
    );
    const unstakerBalancePre = await provider.connection.getBalance(
      unstakerKeypair.publicKey
    );

    const { incomingStake: incomingStakePre } =
      await program.account.pool.fetch(poolKeypair.publicKey);
    const solReservesLamportsPre = await provider.connection.getBalance(
      poolSolReserves
    );

    await program.methods
      .unstake()
      .accounts({
        payer: payerKeypair.publicKey,
        unstaker: unstakerKeypair.publicKey,
        stakeAccount: stakeAccountKeypair.publicKey,
        destination: unstakerKeypair.publicKey,
        poolAccount: poolKeypair.publicKey,
        poolSolReserves,
        feeAccount,
        stakeAccountRecordAccount,
        protocolFeeAccount: protocolFee.publicKey,
        protocolFeeDestination: protocolFee.account.destination,
        clock: SYSVAR_CLOCK_PUBKEY,
        stakeProgram: StakeProgram.programId,
      })
      .signers([payerKeypair, unstakerKeypair])
      .rpc({ skipPreflight: true });

    const [stakerPost, withdrawerPost] = await getStakeAccount(
      provider.connection,
      stakeAccountKeypair.publicKey
    ).then(
      ({
        data: {
          info: {
            meta: {
              authorized: { staker, withdrawer },
            },
          },
        },
      }) => [staker, withdrawer]
    );
    const unstakerBalancePost = await provider.connection.getBalance(
      unstakerKeypair.publicKey
    );

    // TODO: this depends on tsBindings (applyFee) being correct, should write less coupled tests
    const [
      feeLamportsExpected,
      minFeeLamportsExpected,
      maxFeeLamportsExpected,
    ] = await program.account.fee.fetch(feeAccount).then((fee) => {
      const feeCasted = fee as unknown as Fee;
      const {
        liquidityLinear: {
          params: { zeroLiqRemaining, maxLiqRemaining },
        },
      } = feeCasted.fee as LiquidityLinearFeeInner;

      return [
        applyFee(feeCasted, {
          poolIncomingStake: incomingStakePre,
          solReservesLamports: new BN(solReservesLamportsPre),
          stakeAccountLamports: new BN(stakeAccountLamports),
        }).toNumber(),
        Math.ceil(
          (maxLiqRemaining.num.toNumber() / maxLiqRemaining.denom.toNumber()) *
            stakeAccountLamports
        ),
        Math.ceil(
          (zeroLiqRemaining.num.toNumber() /
            zeroLiqRemaining.denom.toNumber()) *
            stakeAccountLamports
        ),
      ];
    });
    const feeLamportsCharged =
      stakeAccountLamports - (unstakerBalancePost - unstakerBalancePre);
    const epsilon = Math.abs(feeLamportsExpected - feeLamportsCharged);
    expect(feeLamportsExpected).to.be.gt(0);
    expect(feeLamportsCharged).to.be.gt(0);
    expect(epsilon).to.be.below(EPSILON_UPPER_BOUND);
    expect(feeLamportsCharged).to.be.gt(minFeeLamportsExpected);
    expect(feeLamportsCharged).to.be.lt(maxFeeLamportsExpected);

    expect(stakerPost.equals(poolSolReserves)).to.be.true;
    expect(withdrawerPost.equals(poolSolReserves)).to.be.true;
  });

  it("it unstakesWSol", async () => {
    const [stakeAccountRecordAccount] = await findStakeAccountRecordAccount(
      program.programId,
      poolKeypair.publicKey,
      stakeAccountWSolKeypair.publicKey
    );
    const stakeAccountLamports = await provider.connection.getBalance(
      stakeAccountWSolKeypair.publicKey
    );
    const unstakerWSolBalancePre = (
      await getAccount(provider.connection, unstakerWSol)
    ).amount;

    const { incomingStake: incomingStakePre } =
      await program.account.pool.fetch(poolKeypair.publicKey);
    const solReservesLamportsPre = await provider.connection.getBalance(
      poolSolReserves
    );

    await program.methods
      .unstakeWsol()
      .accounts({
        payer: payerKeypair.publicKey,
        unstaker: unstakerKeypair.publicKey,
        stakeAccount: stakeAccountWSolKeypair.publicKey,
        destination: unstakerWSol,
        poolAccount: poolKeypair.publicKey,
        poolSolReserves,
        feeAccount,
        stakeAccountRecordAccount,
        protocolFeeAccount: protocolFee.publicKey,
        protocolFeeDestination: protocolFee.account.destination,
        clock: SYSVAR_CLOCK_PUBKEY,
        stakeProgram: StakeProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([payerKeypair, unstakerKeypair])
      .rpc({ skipPreflight: true });

    const [stakerPost, withdrawerPost] = await getStakeAccount(
      provider.connection,
      stakeAccountKeypair.publicKey
    ).then(
      ({
        data: {
          info: {
            meta: {
              authorized: { staker, withdrawer },
            },
          },
        },
      }) => [staker, withdrawer]
    );
    const unstakerWSolBalancePost = (
      await getAccount(provider.connection, unstakerWSol)
    ).amount;

    // TODO: this depends on tsBindings (applyFee) being correct, should write less coupled tests
    const [
      feeLamportsExpected,
      minFeeLamportsExpected,
      maxFeeLamportsExpected,
    ] = await program.account.fee.fetch(feeAccount).then((fee) => {
      const feeCasted = fee as unknown as Fee;
      const {
        liquidityLinear: {
          params: { zeroLiqRemaining, maxLiqRemaining },
        },
      } = feeCasted.fee as LiquidityLinearFeeInner;

      return [
        applyFee(feeCasted, {
          poolIncomingStake: incomingStakePre,
          solReservesLamports: new BN(solReservesLamportsPre),
          stakeAccountLamports: new BN(stakeAccountLamports),
        }).toNumber(),
        Math.ceil(
          (maxLiqRemaining.num.toNumber() / maxLiqRemaining.denom.toNumber()) *
            stakeAccountLamports
        ),
        Math.ceil(
          (zeroLiqRemaining.num.toNumber() /
            zeroLiqRemaining.denom.toNumber()) *
            stakeAccountLamports
        ),
      ];
    });
    const feeLamportsCharged =
      stakeAccountLamports -
      (Number(unstakerWSolBalancePost) - Number(unstakerWSolBalancePre));
    const epsilon = Math.abs(feeLamportsExpected - feeLamportsCharged);
    expect(feeLamportsExpected).to.be.gt(0);
    expect(feeLamportsCharged).to.be.gt(0);
    expect(epsilon).to.be.below(EPSILON_UPPER_BOUND);
    expect(feeLamportsCharged).to.be.gt(minFeeLamportsExpected);
    expect(feeLamportsCharged).to.be.lt(maxFeeLamportsExpected);

    expect(stakerPost.equals(poolSolReserves)).to.be.true;
    expect(withdrawerPost.equals(poolSolReserves)).to.be.true;
  });

  it("it deactivates", async () => {
    const stakeAccActive = await getStakeAccount(
      provider.connection,
      stakeAccountKeypair.publicKey
    );
    const { epoch: activeEpoch } = await provider.connection.getEpochInfo();
    expect(stakeAccountState(stakeAccActive.data, new BN(activeEpoch))).to.eq(
      "active"
    );

    await Promise.all(
      [stakeAccountKeypair, stakeAccountWSolKeypair].map(async (sakp) => {
        await program.methods
          .deactivateStakeAccount()
          .accounts({
            stakeAccount: sakp.publicKey,
            poolAccount: poolKeypair.publicKey,
            poolSolReserves,
            // idk why anchor can't infer clock sysvar
            clock: SYSVAR_CLOCK_PUBKEY,
            // anchor can't infer stake_prog
            stakeProgram: StakeProgram.programId,
          })
          .rpc({ skipPreflight: true });

        const stakeAccDeactivating = await getStakeAccount(
          provider.connection,
          sakp.publicKey
        );
        const { epoch: deactivatingEpoch } =
          await provider.connection.getEpochInfo();
        expect(deactivatingEpoch).to.eq(activeEpoch);
        expect(
          stakeAccountState(
            stakeAccDeactivating.data,
            new BN(deactivatingEpoch)
          )
        ).to.eq("deactivating");
      })
    );
  });

  it("it reclaims", async () => {
    // reclaims the stake accs deactivated in "it deactivates"
    // should follow immediately
    console.log("awaiting epoch to pass");
    await waitForEpochToPass(provider.connection);

    // must be ran sequentially
    let ownedLamportsPost: BN;
    let solReservesLamportsPost: number;
    for (const sakp of [stakeAccountKeypair, stakeAccountWSolKeypair]) {
      const [stakeAccountRecordAccount] = await findStakeAccountRecordAccount(
        program.programId,
        poolKeypair.publicKey,
        sakp.publicKey
      );
      const stakeAcc = await getStakeAccount(
        provider.connection,
        sakp.publicKey
      );
      const { epoch } = await provider.connection.getEpochInfo();
      expect(stakeAccountState(stakeAcc.data, new BN(epoch))).to.eq("inactive");

      const stakeAccLamportsPre = await provider.connection.getBalance(
        sakp.publicKey
      );
      const stakeAccRecordLamports = await provider.connection.getBalance(
        stakeAccountRecordAccount
      );
      const { lamportsAtCreation } =
        await program.account.stakeAccountRecord.fetch(
          stakeAccountRecordAccount
        );
      const { incomingStake: incomingStakePre } =
        await program.account.pool.fetch(poolKeypair.publicKey);
      const solReservesLamportsPre = await provider.connection.getBalance(
        poolSolReserves
      );
      const ownedLamportsPre = incomingStakePre.add(
        new BN(solReservesLamportsPre)
      );

      await program.methods
        .reclaimStakeAccount()
        .accounts({
          stakeAccount: sakp.publicKey,
          poolAccount: poolKeypair.publicKey,
          poolSolReserves,
          stakeAccountRecordAccount,
          // idk why anchor can't infer clock and stake history sysvar
          clock: SYSVAR_CLOCK_PUBKEY,
          stakeHistory: SYSVAR_STAKE_HISTORY_PUBKEY,
          // anchor can't infer stake_prog
          stakeProgram: StakeProgram.programId,
        })
        .rpc({ skipPreflight: true });

      const stakeAccLamportsPost = await provider.connection.getBalance(
        sakp.publicKey
      );
      expect(stakeAccLamportsPost).to.eq(0);
      await expect(
        program.account.stakeAccountRecord.fetch(stakeAccountRecordAccount)
      ).to.be.rejectedWith("Account does not exist");

      const { incomingStake: incomingStakePost } =
        await program.account.pool.fetch(poolKeypair.publicKey);

      solReservesLamportsPost = await provider.connection.getBalance(
        poolSolReserves
      );
      ownedLamportsPost = incomingStakePost.add(
        new BN(solReservesLamportsPost)
      );

      expect(solReservesLamportsPost).to.eq(
        solReservesLamportsPre + stakeAccLamportsPre + stakeAccRecordLamports
      );
      expect(ownedLamportsPost.toNumber()).to.eq(
        ownedLamportsPre.toNumber() -
          lamportsAtCreation.toNumber() +
          stakeAccLamportsPre +
          stakeAccRecordLamports
      );
      expect(ownedLamportsPost.toNumber()).to.be.gt(
        ownedLamportsPre.toNumber()
      );
    }

    // since there are no other stake accs, the 2 values should be equivalent after reclaim
    expect(ownedLamportsPost.toNumber()).to.eq(solReservesLamportsPost);
  });

  it("it removes all liquidity with gains", async () => {
    const {
      lperAtaAmount: lperAtaPre,
      incomingStake: incomingStakePre,
      lperLamports: lperLamportsPre,
      reserveLamports: reservesLamportsPre,
    } = await fetchLpFacingTestParams({
      program,
      lper: lperKeypair.publicKey,
      lperAta,
      poolSolReserves,
      pool: poolKeypair.publicKey,
    });
    const ownedLamportsPre = incomingStakePre.add(new BN(reservesLamportsPre));

    await program.methods
      .removeLiquidity(new BN(lperAtaPre.toString()))
      .accounts({
        burnLpTokensFromAuthority: lperKeypair.publicKey,
        to: lperKeypair.publicKey,
        poolAccount: poolKeypair.publicKey,
        poolSolReserves,
        lpMint: lpMintKeypair.publicKey,
        burnLpTokensFrom: lperAta,
      })
      .signers([lperKeypair])
      .rpc({ skipPreflight: true });

    const {
      lperAtaAmount: lperAtaPost,
      incomingStake: incomingStakePost,
      lperLamports: lperLamportsPost,
      reserveLamports: reservesLamportsPost,
    } = await fetchLpFacingTestParams({
      program,
      lper: lperKeypair.publicKey,
      lperAta,
      poolSolReserves,
      pool: poolKeypair.publicKey,
    });
    const ownedLamportsPost = incomingStakePost.add(
      new BN(reservesLamportsPost)
    );

    const lamportsReceived = lperLamportsPost - lperLamportsPre;

    expect(ownedLamportsPre.toNumber()).to.be.gt(0);
    expect(reservesLamportsPre).to.be.gt(0);
    expect(Number(lperAtaPost)).to.eq(0);
    expect(ownedLamportsPost.toNumber()).to.eq(0);
    expect(reservesLamportsPost).to.eq(0);
    expect(lamportsReceived).to.be.gt(liquidityAmount.toNumber());
  });
});
