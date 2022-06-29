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
import { createAssociatedTokenAccount } from "@solana/spl-token";
import {
  findPoolFeeAccount,
  findPoolSolReserves,
  findStakeAccountRecordAccount,
} from "../ts/src/pda";
import { Unstake } from "../target/types/unstake";
import {
  airdrop,
  createDelegateStakeTx,
  fetchLpFacingTestParams,
  waitForEpochToPass,
} from "./utils";
import { expect, use as chaiUse } from "chai";
import chaiAsPromised from "chai-as-promised";
import { getStakeAccount, stakeAccountState } from "@soceanfi/solana-stake-sdk";

chaiUse(chaiAsPromised);

describe("integration", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.getProvider());
  const program = anchor.workspace.Unstake as anchor.Program<Unstake>;
  const provider = anchor.getProvider();

  // Upper bound for tolerable rounding error
  const EPSILON_UPPER_BOUND = 9; // TODO: confirm that the value is reasonable

  const payerKeypair = Keypair.generate();
  const lperKeypair = Keypair.generate();
  const poolKeypair = Keypair.generate();
  const lpMintKeypair = Keypair.generate();
  const unstakerKeypair = Keypair.generate();
  const stakeAccountKeypair = Keypair.generate();

  const liquidityAmount = new BN(0.1 * LAMPORTS_PER_SOL);

  let [poolSolReserves, poolSolReservesBump] = [null as PublicKey, 0];
  let [feeAccount, feeAccountBump] = [null as PublicKey, 0];
  let [stakeAccountRecordAccount, stakeAccountRecordAccountBump] = [
    null as PublicKey,
    0,
  ];
  let lperAta = null as PublicKey;

  before(async () => {
    console.log("airdropping to payer, lper, and unstaker");
    await airdrop(provider.connection, payerKeypair.publicKey);
    await airdrop(provider.connection, lperKeypair.publicKey);
    await airdrop(provider.connection, unstakerKeypair.publicKey);
    [poolSolReserves, poolSolReservesBump] = await findPoolSolReserves(
      program.programId,
      poolKeypair.publicKey
    );
    [feeAccount, feeAccountBump] = await findPoolFeeAccount(
      program.programId,
      poolKeypair.publicKey
    );
    [stakeAccountRecordAccount, stakeAccountRecordAccountBump] =
      await findStakeAccountRecordAccount(
        program.programId,
        poolKeypair.publicKey,
        stakeAccountKeypair.publicKey
      );
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

    console.log("preparing a stake account");
    const createStakeAuthTx = await createDelegateStakeTx({
      connection: provider.connection,
      stakeAccount: stakeAccountKeypair.publicKey,
      payer: unstakerKeypair.publicKey,
    });
    await sendAndConfirmTransaction(provider.connection, createStakeAuthTx, [
      unstakerKeypair,
      stakeAccountKeypair,
    ]);

    console.log("awaiting epoch to pass");
    await waitForEpochToPass(provider.connection);
  });

  it("it unstakes", async () => {
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
    const ownedLamportsPre = incomingStakePre.add(
      new BN(solReservesLamportsPre)
    );
    const liquidityConsumed =
      stakeAccountLamports +
      ownedLamportsPre.toNumber() -
      solReservesLamportsPre;

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
    const feeRatio = await program.account.fee.fetch(feeAccount).then(
      ({
        fee: {
          // @ts-ignore
          liquidityLinear: { params },
        },
      }) => {
        const zeroLiquidityRemaining =
          params.zeroLiqRemaining.num.toNumber() /
          params.zeroLiqRemaining.denom.toNumber();
        const maxLiquidityRemaining =
          params.maxLiqRemaining.num.toNumber() /
          params.maxLiqRemaining.denom.toNumber();
        const slope =
          (zeroLiquidityRemaining - maxLiquidityRemaining) /
          ownedLamportsPre.toNumber();
        return slope * liquidityConsumed + maxLiquidityRemaining;
      }
    );
    const feeLamportsExpected = Math.ceil(stakeAccountLamports * feeRatio);
    const feeLamportsCharged =
      stakeAccountLamports - (unstakerBalancePost - unstakerBalancePre);
    const epsilon = Math.abs(feeLamportsExpected - feeLamportsCharged);

    expect(stakerPost.equals(poolSolReserves)).to.be.true;
    expect(withdrawerPost.equals(poolSolReserves)).to.be.true;
    expect(epsilon).to.be.below(EPSILON_UPPER_BOUND);
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

    await program.methods
      .deactivateStakeAccount()
      .accounts({
        stakeAccount: stakeAccountKeypair.publicKey,
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
      stakeAccountKeypair.publicKey
    );
    const { epoch: deactivatingEpoch } =
      await provider.connection.getEpochInfo();
    expect(deactivatingEpoch).to.eq(activeEpoch);
    expect(
      stakeAccountState(stakeAccDeactivating.data, new BN(deactivatingEpoch))
    ).to.eq("deactivating");
  });

  it("it reclaims", async () => {
    // should follow it deactivates
    console.log("awaiting epoch to pass");
    await waitForEpochToPass(provider.connection);

    const stakeAcc = await getStakeAccount(
      provider.connection,
      stakeAccountKeypair.publicKey
    );
    const { epoch } = await provider.connection.getEpochInfo();
    expect(stakeAccountState(stakeAcc.data, new BN(epoch))).to.eq("inactive");

    const stakeAccLamportsPre = await provider.connection.getBalance(
      stakeAccountKeypair.publicKey
    );
    const stakeAccRecordLamports = await provider.connection.getBalance(
      stakeAccountRecordAccount
    );
    const { lamportsAtCreation } =
      await program.account.stakeAccountRecord.fetch(stakeAccountRecordAccount);
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
        stakeAccount: stakeAccountKeypair.publicKey,
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
      stakeAccountKeypair.publicKey
    );
    const { incomingStake: incomingStakePost } =
      await program.account.pool.fetch(poolKeypair.publicKey);
    const solReservesLamportsPost = await provider.connection.getBalance(
      poolSolReserves
    );
    const ownedLamportsPost = incomingStakePost.add(
      new BN(solReservesLamportsPost)
    );

    await expect(
      program.account.stakeAccountRecord.fetch(stakeAccountRecordAccount)
    ).to.be.rejectedWith("Account does not exist");
    expect(stakeAccLamportsPost).to.eq(0);
    expect(solReservesLamportsPost).to.eq(
      solReservesLamportsPre + stakeAccLamportsPre + stakeAccRecordLamports
    );
    expect(ownedLamportsPost.toNumber()).to.eq(
      ownedLamportsPre.toNumber() -
        lamportsAtCreation.toNumber() +
        stakeAccLamportsPre +
        stakeAccRecordLamports
    );
    expect(ownedLamportsPost.toNumber()).to.be.gt(ownedLamportsPre.toNumber());
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
