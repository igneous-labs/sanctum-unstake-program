import BN from "bn.js";
import * as anchor from "@project-serum/anchor";
import {
  sendAndConfirmTransaction,
  Keypair,
  PublicKey,
  Lockup,
  LAMPORTS_PER_SOL,
  StakeProgram,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_STAKE_HISTORY_PUBKEY,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccount,
  getAssociatedTokenAddress,
  getMint,
} from "@solana/spl-token";
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
import { getStakeAccount, stakeAccountState } from "./stake";

chaiUse(chaiAsPromised);

describe("unstake", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.getProvider());
  const program = anchor.workspace.Unstake as anchor.Program<Unstake>;
  const provider = anchor.getProvider();

  describe("internals", () => {
    const payerKeypair = Keypair.generate();
    const poolKeypair = Keypair.generate();
    const lpMintKeypair = Keypair.generate();
    const lperKeypair = Keypair.generate();

    let [poolSolReserves, poolSolReservesBump] = [null as PublicKey, 0];
    let [feeAccount, feeAccountBump] = [null as PublicKey, 0];
    let lperAta = null as PublicKey;

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
      lperAta = await getAssociatedTokenAddress(
        lpMintKeypair.publicKey,
        lperKeypair.publicKey
      );
    });

    it("it rejects to initializes a liquidity pool when the fee violates invariants", async () => {
      const lpMint = lpMintKeypair.publicKey;
      await expect(
        program.methods
          .createPool({
            fee: {
              liquidityLinear: {
                params: {
                  maxLiqRemaining: {
                    num: new BN(69),
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
            lpMint,
            poolSolReserves,
            feeAccount,
          })
          .signers([payerKeypair, poolKeypair, lpMintKeypair])
          .rpc({ skipPreflight: true })
      ).to.be.eventually.rejected.then(function (err) {
        expect(err.code).to.eql(6011);
        expect(err.msg).to.eql(
          "The provided description of fee violates the invariants"
        );
      });
    });

    it("it initializes a liquidity pool", async () => {
      const lpMint = lpMintKeypair.publicKey;
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
          lpMint,
          poolSolReserves,
          feeAccount,
        })
        .signers([payerKeypair, poolKeypair, lpMintKeypair])
        .rpc({ skipPreflight: true });
      const mint = await getMint(provider.connection, lpMint);
      expect(mint.decimals).to.eq(9);
      expect(mint.supply).to.eq(BigInt(0));
    });

    describe("LP facing", () => {
      const AMOUNT = new BN(0.1 * LAMPORTS_PER_SOL);

      before(async () => {
        // create lper ata
        await createAssociatedTokenAccount(
          provider.connection,
          lperKeypair,
          lpMintKeypair.publicKey,
          lperKeypair.publicKey
        );
      });

      it("it add liquidity from zero", async () => {
        const {
          lperAtaAmount: lperAtaPre,
          poolOwnedLamports: ownedLamportsPre,
          lperLamports: lperLamportsPre,
          reserveLamports: reservesLamportsPre,
        } = await fetchLpFacingTestParams({
          program,
          lper: lperKeypair.publicKey,
          lperAta,
          poolSolReserves,
          pool: poolKeypair.publicKey,
        });

        await program.methods
          .addLiquidity(AMOUNT)
          .accounts({
            from: lperKeypair.publicKey,
            poolAccount: poolKeypair.publicKey,
            poolSolReserves,
            lpMint: lpMintKeypair.publicKey,
            mintLpTokensTo: lperAta,
          })
          .signers([lperKeypair])
          .rpc({ skipPreflight: true });

        const {
          lperAtaAmount: lperAtaPost,
          poolOwnedLamports: ownedLamportsPost,
          lperLamports: lperLamportsPost,
          reserveLamports: reservesLamportsPost,
        } = await fetchLpFacingTestParams({
          program,
          lper: lperKeypair.publicKey,
          lperAta,
          poolSolReserves,
          pool: poolKeypair.publicKey,
        });

        expect(lperAtaPre).to.eq(BigInt(0));
        expect(ownedLamportsPre.toString()).to.eq(new BN(0).toString());
        expect(reservesLamportsPre).to.eq(0);
        expect(lperAtaPost).to.eq(lperAtaPre + BigInt(AMOUNT.toString()));
        expect(lperLamportsPost).to.eq(lperLamportsPre - AMOUNT.toNumber());
        expect(reservesLamportsPost).to.eq(
          reservesLamportsPre + AMOUNT.toNumber()
        );
        expect(ownedLamportsPost.toString()).to.eq(
          ownedLamportsPre.add(AMOUNT).toString()
        );
      });

      it("it add liquidity from non-zero", async () => {
        // add AMOUNT liquidity to existing AMOUNT -> LP tokens and liquidity should double
        const {
          lperAtaAmount: lperAtaPre,
          poolOwnedLamports: ownedLamportsPre,
          lperLamports: lperLamportsPre,
          reserveLamports: reservesLamportsPre,
        } = await fetchLpFacingTestParams({
          program,
          lper: lperKeypair.publicKey,
          lperAta,
          poolSolReserves,
          pool: poolKeypair.publicKey,
        });

        await program.methods
          .addLiquidity(AMOUNT)
          .accounts({
            from: lperKeypair.publicKey,
            poolAccount: poolKeypair.publicKey,
            poolSolReserves,
            lpMint: lpMintKeypair.publicKey,
            mintLpTokensTo: lperAta,
          })
          .signers([lperKeypair])
          .rpc({ skipPreflight: true });

        const {
          lperAtaAmount: lperAtaPost,
          poolOwnedLamports: ownedLamportsPost,
          lperLamports: lperLamportsPost,
          reserveLamports: reservesLamportsPost,
        } = await fetchLpFacingTestParams({
          program,
          lper: lperKeypair.publicKey,
          lperAta,
          poolSolReserves,
          pool: poolKeypair.publicKey,
        });

        expect(Number(lperAtaPre)).to.be.gt(0);
        expect(lperAtaPost).to.eq(BigInt(2) * lperAtaPre);
        expect(lperLamportsPost).to.eq(lperLamportsPre - AMOUNT.toNumber());
        expect(reservesLamportsPost).to.eq(2 * reservesLamportsPre);
        expect(ownedLamportsPost.toNumber()).to.eq(
          2 * ownedLamportsPre.toNumber()
        );
      });

      it("it remove liquidity to non-zero", async () => {
        // remove AMOUNT liquidity from existing 2*AMOUNT -> LP tokens and liquidity should half
        const {
          lperAtaAmount: lperAtaPre,
          poolOwnedLamports: ownedLamportsPre,
          lperLamports: lperLamportsPre,
          reserveLamports: reservesLamportsPre,
        } = await fetchLpFacingTestParams({
          program,
          lper: lperKeypair.publicKey,
          lperAta,
          poolSolReserves,
          pool: poolKeypair.publicKey,
        });

        await program.methods
          .removeLiquidity(AMOUNT)
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
          poolOwnedLamports: ownedLamportsPost,
          lperLamports: lperLamportsPost,
          reserveLamports: reservesLamportsPost,
        } = await fetchLpFacingTestParams({
          program,
          lper: lperKeypair.publicKey,
          lperAta,
          poolSolReserves,
          pool: poolKeypair.publicKey,
        });

        expect(Number(lperAtaPre)).to.be.gt(0);
        expect(lperAtaPost).to.eq(lperAtaPre / BigInt(2));
        expect(lperLamportsPost).to.eq(lperLamportsPre + AMOUNT.toNumber());
        expect(reservesLamportsPost).to.eq(reservesLamportsPre / 2);
        expect(ownedLamportsPost.toNumber()).to.eq(
          ownedLamportsPre.toNumber() / 2
        );
      });

      it("it remove liquidity to zero", async () => {
        const {
          lperAtaAmount: lperAtaPre,
          poolOwnedLamports: ownedLamportsPre,
          lperLamports: lperLamportsPre,
          reserveLamports: reservesLamportsPre,
        } = await fetchLpFacingTestParams({
          program,
          lper: lperKeypair.publicKey,
          lperAta,
          poolSolReserves,
          pool: poolKeypair.publicKey,
        });

        await program.methods
          .removeLiquidity(AMOUNT)
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
          poolOwnedLamports: ownedLamportsPost,
          lperLamports: lperLamportsPost,
          reserveLamports: reservesLamportsPost,
        } = await fetchLpFacingTestParams({
          program,
          lper: lperKeypair.publicKey,
          lperAta,
          poolSolReserves,
          pool: poolKeypair.publicKey,
        });

        expect(lperAtaPost).to.eq(lperAtaPre - BigInt(AMOUNT.toString()));
        expect(lperLamportsPost).to.eq(lperLamportsPre + AMOUNT.toNumber());
        expect(reservesLamportsPost).to.eq(
          reservesLamportsPre - AMOUNT.toNumber()
        );
        expect(ownedLamportsPost.toString()).to.eq(
          ownedLamportsPre.sub(AMOUNT).toString()
        );
        expect(lperAtaPost).to.eq(BigInt(0));
        expect(ownedLamportsPost.toString()).to.eq(new BN(0).toString());
        expect(reservesLamportsPost).to.eq(0);
      });
    });

    describe("Admin facing", () => {
      it("it sets fee", async () => {
        // NOTE: assuming the fee account isn't previously set to Flat 69% fee
        // set Flat fee
        const FLAT_FEE = {
          flat: {
            ratio: {
              num: new BN(69),
              denom: new BN(100),
            },
          },
        };

        await program.methods
          .setFee({ fee: FLAT_FEE })
          .accounts({
            feeAuthority: payerKeypair.publicKey,
            poolAccount: poolKeypair.publicKey,
            feeAccount,
          })
          .signers([payerKeypair])
          .rpc({ skipPreflight: true });

        await program.account.fee.fetch(feeAccount).then(({ fee }) => {
          // NOTE: work around for BN's internal state differences
          expect(JSON.stringify(fee)).to.eql(JSON.stringify(FLAT_FEE));
        });

        // set LiquidityLinear fee
        const LIQUIDITY_LINEAR_FEE = {
          liquidityLinear: {
            params: {
              maxLiqRemaining: {
                num: new BN(25),
                denom: new BN(1000),
              },
              zeroLiqRemaining: {
                num: new BN(42),
                denom: new BN(1000),
              },
            },
          },
        };

        await program.methods
          .setFee({ fee: LIQUIDITY_LINEAR_FEE })
          .accounts({
            feeAuthority: payerKeypair.publicKey,
            poolAccount: poolKeypair.publicKey,
            feeAccount,
          })
          .signers([payerKeypair])
          .rpc({ skipPreflight: true });

        await program.account.fee.fetch(feeAccount).then(({ fee }) => {
          // NOTE: work around for BN's internal state differences
          expect(JSON.stringify(fee)).to.eql(
            JSON.stringify(LIQUIDITY_LINEAR_FEE)
          );
        });
      });

      it("it rejects to set fee when the authority does not match", async () => {
        const rando = Keypair.generate();
        await expect(
          program.methods
            .setFee({
              fee: {
                liquidityLinear: {
                  params: {
                    maxLiqRemaining: {
                      num: new BN(10),
                      denom: new BN(1000),
                    },
                    zeroLiqRemaining: {
                      num: new BN(15),
                      denom: new BN(1000),
                    },
                  },
                },
              },
            })
            .accounts({
              feeAuthority: rando.publicKey,
              poolAccount: poolKeypair.publicKey,
              feeAccount,
            })
            .signers([rando])
            .rpc({ skipPreflight: true })
        ).to.be.eventually.rejected;
        // NOTE: This sill fails to resolve to a proper error sometimes
        //).to.be.eventually.rejected.then(function (err) {
        //  expect(err.code).to.eql(6006);
        //  expect(err.msg).to.eql("The provided fee authority does not have the authority over the provided pool account");
        //});
      });

      it("it rejects to set fee when the fee violates invariants", async () => {
        await expect(
          program.methods
            .setFee({
              fee: {
                flat: {
                  ratio: {
                    num: new BN(69),
                    denom: new BN(42),
                  },
                },
              },
            })
            .accounts({
              feeAuthority: payerKeypair.publicKey,
              poolAccount: poolKeypair.publicKey,
              feeAccount,
            })
            .signers([payerKeypair])
            .rpc({ skipPreflight: true })
        ).to.be.eventually.rejected.then(function (err) {
          expect(err.code).to.eql(6011);
          expect(err.msg).to.eql(
            "The provided description of fee violates the invariants"
          );
        });

        await expect(
          program.methods
            .setFee({
              fee: {
                flat: {
                  ratio: {
                    num: new BN(69),
                    denom: new BN(0),
                  },
                },
              },
            })
            .accounts({
              feeAuthority: payerKeypair.publicKey,
              poolAccount: poolKeypair.publicKey,
              feeAccount,
            })
            .signers([payerKeypair])
            .rpc({ skipPreflight: true })
        ).to.be.eventually.rejected.then(function (err) {
          expect(err.code).to.eql(6011);
          expect(err.msg).to.eql(
            "The provided description of fee violates the invariants"
          );
        });

        await expect(
          program.methods
            .setFee({
              fee: {
                liquidityLinear: {
                  params: {
                    maxLiqRemaining: {
                      num: new BN(69),
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
              feeAuthority: payerKeypair.publicKey,
              poolAccount: poolKeypair.publicKey,
              feeAccount,
            })
            .signers([payerKeypair])
            .rpc({ skipPreflight: true })
        ).to.be.eventually.rejected.then(function (err) {
          expect(err.code).to.eql(6011);
          expect(err.msg).to.eql(
            "The provided description of fee violates the invariants"
          );
        });

        await expect(
          program.methods
            .setFee({
              fee: {
                liquidityLinear: {
                  params: {
                    maxLiqRemaining: {
                      num: new BN(69),
                      denom: new BN(0),
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
              feeAuthority: payerKeypair.publicKey,
              poolAccount: poolKeypair.publicKey,
              feeAccount,
            })
            .signers([payerKeypair])
            .rpc({ skipPreflight: true })
        ).to.be.eventually.rejected.then(function (err) {
          expect(err.code).to.eql(6011);
          expect(err.msg).to.eql(
            "The provided description of fee violates the invariants"
          );
        });
      });
    });

    describe("User facing", () => {
      before(async () => {
        // add some liquidity to the pool
        // NOTE: assuming the pool has been initialized with lpMintKeypair and lperAta is initialized
        await airdrop(provider.connection, lperKeypair.publicKey);

        await program.methods
          .addLiquidity(new BN(0.1 * LAMPORTS_PER_SOL))
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

      it("it rejects to unstake a locked up stake account", async () => {
        const unstakerKeypair = Keypair.generate();
        await airdrop(provider.connection, unstakerKeypair.publicKey);

        const custodian = Keypair.generate();
        const { epoch: currentEpoch } =
          await provider.connection.getEpochInfo();
        const currentUnixEpoch = Math.floor(new Date().getTime() / 1000);

        const lockup = new Lockup(
          currentUnixEpoch + 1000,
          currentEpoch + 10,
          custodian.publicKey
        );

        const stakeAccountKeypair = Keypair.generate();
        const createStakeAuthTx = await createDelegateStakeTx({
          connection: provider.connection,
          stakeAccount: stakeAccountKeypair.publicKey,
          payer: unstakerKeypair.publicKey,
          lockup,
        });
        await sendAndConfirmTransaction(
          provider.connection,
          createStakeAuthTx,
          [unstakerKeypair, stakeAccountKeypair]
        );

        await waitForEpochToPass(provider.connection);

        const [stakeAccountRecordAccount, stakeAccountRecordAccountBump] =
          await findStakeAccountRecordAccount(
            program.programId,
            poolKeypair.publicKey,
            stakeAccountKeypair.publicKey
          );

        await expect(
          program.methods
            .unstake()
            .accounts({
              payer: unstakerKeypair.publicKey,
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
            .signers([unstakerKeypair])
            .rpc({ skipPreflight: true })
        ).to.be.eventually.rejected.then(function (err) {
          expect(err.code).to.eql(6010);
          expect(err.msg).to.eql("The provided statke account is locked up");
        });
      });

      it("it charges Flat fee on unstake", async () => {
        await program.methods
          .setFee({
            fee: {
              flat: {
                ratio: {
                  num: new BN(69),
                  denom: new BN(1000),
                },
              },
            },
          })
          .accounts({
            feeAuthority: payerKeypair.publicKey,
            poolAccount: poolKeypair.publicKey,
            feeAccount,
          })
          .signers([payerKeypair])
          .rpc({ skipPreflight: true });

        const unstakerKeypair = Keypair.generate();
        await airdrop(provider.connection, unstakerKeypair.publicKey);

        const stakeAccountKeypair = Keypair.generate();
        const createStakeAuthTx = await createDelegateStakeTx({
          connection: provider.connection,
          stakeAccount: stakeAccountKeypair.publicKey,
          payer: unstakerKeypair.publicKey,
        });
        await sendAndConfirmTransaction(
          provider.connection,
          createStakeAuthTx,
          [unstakerKeypair, stakeAccountKeypair]
        );

        await waitForEpochToPass(provider.connection);

        const stakeAccLamports = await provider.connection.getBalance(
          stakeAccountKeypair.publicKey
        );
        const unstakerBalancePre = await provider.connection.getBalance(
          unstakerKeypair.publicKey
        );

        const [stakeAccountRecordAccount, stakeAccountRecordAccountBump] =
          await findStakeAccountRecordAccount(
            program.programId,
            poolKeypair.publicKey,
            stakeAccountKeypair.publicKey
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
            clock: SYSVAR_CLOCK_PUBKEY,
            stakeProgram: StakeProgram.programId,
          })
          .signers([payerKeypair, unstakerKeypair])
          .rpc({ skipPreflight: true });

        const unstakerBalancePost = await provider.connection.getBalance(
          unstakerKeypair.publicKey
        );

        const flatFeeRatio = await program.account.fee.fetch(feeAccount).then(
          ({
            fee: {
              flat: { ratio },
            },
          }) => ratio.num.toNumber() / ratio.denom.toNumber()
        );
        const feeLamportExpected = await program.account.stakeAccountRecord
          .fetch(stakeAccountRecordAccount)
          .then(({ lamportsAtCreation }) =>
            Math.ceil(lamportsAtCreation * flatFeeRatio)
          );
        const feeLamportCharged =
          stakeAccLamports - (unstakerBalancePost - unstakerBalancePre);

        expect(feeLamportCharged).to.eql(feeLamportExpected);
      });

      it("it charges LiquidityLinear fee on unstake", async () => {
        await program.methods
          .setFee({
            fee: {
              liquidityLinear: {
                params: {
                  maxLiqRemaining: {
                    num: new BN(25),
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
            feeAuthority: payerKeypair.publicKey,
            poolAccount: poolKeypair.publicKey,
            feeAccount,
          })
          .signers([payerKeypair])
          .rpc({ skipPreflight: true });

        const unstakerKeypair = Keypair.generate();
        await airdrop(provider.connection, unstakerKeypair.publicKey);

        const stakeAccountKeypair = Keypair.generate();
        const createStakeAuthTx = await createDelegateStakeTx({
          connection: provider.connection,
          stakeAccount: stakeAccountKeypair.publicKey,
          payer: unstakerKeypair.publicKey,
        });
        await sendAndConfirmTransaction(
          provider.connection,
          createStakeAuthTx,
          [unstakerKeypair, stakeAccountKeypair]
        );

        await waitForEpochToPass(provider.connection);

        const [stakeAccountRecordAccount, stakeAccountRecordAccountBump] =
          await findStakeAccountRecordAccount(
            program.programId,
            poolKeypair.publicKey,
            stakeAccountKeypair.publicKey
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
            clock: SYSVAR_CLOCK_PUBKEY,
            stakeProgram: StakeProgram.programId,
          })
          .signers([payerKeypair, unstakerKeypair])
          .rpc({ skipPreflight: true });

        // TODO: assert the amount of fee charged
        throw new Error("Not yet implemented");
      });
    });
  });

  describe("integration", () => {
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
      await program.methods
        .unstake()
        .accounts({
          payer: unstakerKeypair.publicKey,
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
        .signers([unstakerKeypair])
        .rpc({ skipPreflight: true });

      // TODO: assert the stake account ownership is transfered
      // TODO: assert the charged fee amount (idk what is a good test mechanism for this yet)
    });

    it("it deactivates", async () => {
      const stakeAccActive = await getStakeAccount(
        provider.connection,
        stakeAccountKeypair.publicKey
      );
      const { epoch: activeEpoch } = await provider.connection.getEpochInfo();
      expect(stakeAccountState(stakeAccActive, new BN(activeEpoch))).to.eq(
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
        stakeAccountState(stakeAccDeactivating, new BN(deactivatingEpoch))
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
      expect(stakeAccountState(stakeAcc, new BN(epoch))).to.eq("inactive");

      const stakeAccLamportsPre = await provider.connection.getBalance(
        stakeAccountKeypair.publicKey
      );
      const stakeAccRecordLamports = await provider.connection.getBalance(
        stakeAccountRecordAccount
      );
      const { lamportsAtCreation } =
        await program.account.stakeAccountRecord.fetch(
          stakeAccountRecordAccount
        );
      const { ownedLamports: ownedLamportsPre } =
        await program.account.pool.fetch(poolKeypair.publicKey);
      const solReservesLamportsPre = await provider.connection.getBalance(
        poolSolReserves
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
      const { ownedLamports: ownedLamportsPost } =
        await program.account.pool.fetch(poolKeypair.publicKey);
      const solReservesLamportsPost = await provider.connection.getBalance(
        poolSolReserves
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
      expect(ownedLamportsPost.toNumber()).to.be.gt(
        ownedLamportsPre.toNumber()
      );
      // since there are no other stake accs, the 2 values should be equivalent after reclaim
      expect(ownedLamportsPost.toNumber()).to.eq(solReservesLamportsPost);
    });

    it("it removes all liquidity with gains", async () => {
      const {
        lperAtaAmount: lperAtaPre,
        poolOwnedLamports: ownedLamportsPre,
        lperLamports: lperLamportsPre,
        reserveLamports: reservesLamportsPre,
      } = await fetchLpFacingTestParams({
        program,
        lper: lperKeypair.publicKey,
        lperAta,
        poolSolReserves,
        pool: poolKeypair.publicKey,
      });

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
        poolOwnedLamports: ownedLamportsPost,
        lperLamports: lperLamportsPost,
        reserveLamports: reservesLamportsPost,
      } = await fetchLpFacingTestParams({
        program,
        lper: lperKeypair.publicKey,
        lperAta,
        poolSolReserves,
        pool: poolKeypair.publicKey,
      });

      const lamportsReceived = lperLamportsPost - lperLamportsPre;

      expect(ownedLamportsPre.toNumber()).to.be.gt(0);
      expect(reservesLamportsPre).to.be.gt(0);
      expect(Number(lperAtaPost)).to.eq(0);
      expect(ownedLamportsPost.toNumber()).to.eq(0);
      expect(reservesLamportsPost).to.eq(0);
      expect(lamportsReceived).to.be.gt(liquidityAmount.toNumber());
    });
  });
});
