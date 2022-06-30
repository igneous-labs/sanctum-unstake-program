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

chaiUse(chaiAsPromised);

// TODO: move this to util
const checkAnchorError = (errorCode: number, errorMessage: string) => {
  return (err) => {
    if (err.code != undefined) {
      // first error type
      return err.code === errorCode && err.msg === errorMessage;
    } else {
      // second error type
      return (
        err.error.errorCode.number === errorCode &&
        err.error.errorMessage === errorMessage
      );
    }
  };
};

describe("internals", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.getProvider());
  const program = anchor.workspace.Unstake as anchor.Program<Unstake>;
  const provider = anchor.getProvider();

  // Upper bound for tolerable rounding error
  const EPSILON_UPPER_BOUND = 9; // TODO: confirm that the value is reasonable

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
    ).to.be.eventually.rejected.and.satisfy(
      checkAnchorError(
        6006,
        "The provided description of fee violates the invariants"
      )
    );
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
      const ownedLamportsPre = incomingStakePre.add(
        new BN(reservesLamportsPre)
      );

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
      const ownedLamportsPre = incomingStakePre.add(
        new BN(reservesLamportsPre)
      );

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
      const ownedLamportsPre = incomingStakePre.add(
        new BN(reservesLamportsPre)
      );

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
      const ownedLamportsPre = incomingStakePre.add(
        new BN(reservesLamportsPre)
      );

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
      ).to.be.eventually.rejected.and.satisfy(
        checkAnchorError(
          6002,
          "The provided fee authority does not have the authority over the provided pool account"
        )
      );
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
      ).to.be.eventually.rejected.and.satisfy(
        checkAnchorError(
          6006,
          "The provided description of fee violates the invariants"
        )
      );

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
      ).to.be.eventually.rejected.and.satisfy(
        checkAnchorError(
          6006,
          "The provided description of fee violates the invariants"
        )
      );

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
      ).to.be.eventually.rejected.and.satisfy(
        checkAnchorError(
          6006,
          "The provided description of fee violates the invariants"
        )
      );

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
      ).to.be.eventually.rejected.and.satisfy(
        checkAnchorError(
          6006,
          "The provided description of fee violates the invariants"
        )
      );
    });
  });

  describe("User facing", () => {
    const lockedUpStakeAcc = Keypair.generate();
    const notEnoughLiquidityStakeAcc = Keypair.generate();
    const flatFeeStakeAcc = Keypair.generate();
    const liquidityLinearFeeStakeAcc = Keypair.generate();

    const lockedUpUnstaker = Keypair.generate();
    const notEnoughLiquidityUnstaker = Keypair.generate();
    const flatFeeUnstaker = Keypair.generate();
    const liquidityLinearFeeUnstaker = Keypair.generate();

    const liquidityLamports = new BN(0.1 * LAMPORTS_PER_SOL);

    before(async () => {
      // airdrop to lper and unstakers
      await Promise.all(
        [
          lperKeypair,
          lockedUpUnstaker,
          notEnoughLiquidityUnstaker,
          flatFeeUnstaker,
          liquidityLinearFeeUnstaker,
        ].map((kp) => airdrop(provider.connection, kp.publicKey))
      );

      // add some liquidity to the pool
      // NOTE: assuming the pool has been initialized with lpMintKeypair and has 0 liquidity, and lperAta is initialized
      await program.methods
        .addLiquidity(liquidityLamports)
        .accounts({
          from: lperKeypair.publicKey,
          poolAccount: poolKeypair.publicKey,
          poolSolReserves,
          lpMint: lpMintKeypair.publicKey,
          mintLpTokensTo: lperAta,
        })
        .signers([lperKeypair])
        .rpc({ skipPreflight: true });

      // Set up active stake accounts
      const custodian = Keypair.generate();
      const { epoch: currentEpoch } = await provider.connection.getEpochInfo();
      const currentUnixEpoch = Math.floor(new Date().getTime() / 1000);

      const lockup = new Lockup(
        currentUnixEpoch + 1000,
        currentEpoch + 10,
        custodian.publicKey
      );

      const stakeAccInitParams: [
        Keypair,
        Keypair,
        Lockup | undefined,
        number | undefined
      ][] = [
        [lockedUpStakeAcc, lockedUpUnstaker, lockup, undefined],
        [
          notEnoughLiquidityStakeAcc,
          notEnoughLiquidityUnstaker,
          undefined,
          liquidityLamports.add(new BN(1)).toNumber(),
        ],
        [flatFeeStakeAcc, flatFeeUnstaker, undefined, undefined],
        [
          liquidityLinearFeeStakeAcc,
          liquidityLinearFeeUnstaker,
          undefined,
          undefined,
        ],
      ];
      await Promise.all(
        stakeAccInitParams.map(
          ([stakeAccountKeypair, unstakerKeypair, lockup, lamports]) =>
            createDelegateStakeTx({
              connection: provider.connection,
              stakeAccount: stakeAccountKeypair.publicKey,
              payer: unstakerKeypair.publicKey,
              lamports,
              lockup,
            }).then((tx) =>
              sendAndConfirmTransaction(provider.connection, tx, [
                unstakerKeypair,
                stakeAccountKeypair,
              ])
            )
        )
      );
      await waitForEpochToPass(provider.connection);
    });

    it("it rejects to unstake a locked up stake account", async () => {
      const [stakeAccountRecordAccount] = await findStakeAccountRecordAccount(
        program.programId,
        poolKeypair.publicKey,
        lockedUpStakeAcc.publicKey
      );

      await expect(
        program.methods
          .unstake()
          .accounts({
            payer: lockedUpUnstaker.publicKey,
            unstaker: lockedUpUnstaker.publicKey,
            stakeAccount: lockedUpStakeAcc.publicKey,
            destination: lockedUpUnstaker.publicKey,
            poolAccount: poolKeypair.publicKey,
            poolSolReserves,
            feeAccount,
            stakeAccountRecordAccount,
            clock: SYSVAR_CLOCK_PUBKEY,
            stakeProgram: StakeProgram.programId,
          })
          .signers([lockedUpUnstaker])
          .rpc({ skipPreflight: true })
      ).to.be.eventually.rejected.and.satisfy(
        checkAnchorError(6005, "The provided stake account is locked up")
      );
    });

    it("it fails to unstake not enough liquidity", async () => {
      const [stakeAccountRecordAccount] = await findStakeAccountRecordAccount(
        program.programId,
        poolKeypair.publicKey,
        notEnoughLiquidityStakeAcc.publicKey
      );

      await expect(
        program.methods
          .unstake()
          .accounts({
            payer: notEnoughLiquidityUnstaker.publicKey,
            unstaker: notEnoughLiquidityUnstaker.publicKey,
            stakeAccount: notEnoughLiquidityStakeAcc.publicKey,
            destination: notEnoughLiquidityUnstaker.publicKey,
            poolAccount: poolKeypair.publicKey,
            poolSolReserves,
            feeAccount,
            stakeAccountRecordAccount,
            clock: SYSVAR_CLOCK_PUBKEY,
            stakeProgram: StakeProgram.programId,
          })
          .signers([notEnoughLiquidityUnstaker])
          .rpc({ skipPreflight: true })
      ).to.be.eventually.rejected.and.satisfy(
        checkAnchorError(6008, "Not enough liquidity to service this unstake")
      );
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

      const stakeAccountLamports = await provider.connection.getBalance(
        flatFeeStakeAcc.publicKey
      );
      const unstakerBalancePre = await provider.connection.getBalance(
        flatFeeUnstaker.publicKey
      );

      const [stakeAccountRecordAccount] = await findStakeAccountRecordAccount(
        program.programId,
        poolKeypair.publicKey,
        flatFeeStakeAcc.publicKey
      );

      await program.methods
        .unstake()
        .accounts({
          payer: payerKeypair.publicKey,
          unstaker: flatFeeUnstaker.publicKey,
          stakeAccount: flatFeeStakeAcc.publicKey,
          destination: flatFeeUnstaker.publicKey,
          poolAccount: poolKeypair.publicKey,
          poolSolReserves,
          feeAccount,
          stakeAccountRecordAccount,
          clock: SYSVAR_CLOCK_PUBKEY,
          stakeProgram: StakeProgram.programId,
        })
        .signers([payerKeypair, flatFeeUnstaker])
        .rpc({ skipPreflight: true });

      const unstakerBalancePost = await provider.connection.getBalance(
        flatFeeUnstaker.publicKey
      );

      const flatFeeRatio = await program.account.fee.fetch(feeAccount).then(
        ({
          fee: {
            // @ts-ignore
            flat: { ratio },
          },
        }) => ratio.num.toNumber() / ratio.denom.toNumber()
      );
      const feeLamportsExpected = Math.ceil(
        stakeAccountLamports * flatFeeRatio
      );
      const feeLamportsCharged =
        stakeAccountLamports - (unstakerBalancePost - unstakerBalancePre);

      expect(feeLamportsCharged).to.eql(feeLamportsExpected);
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

      const stakeAccountLamports = await provider.connection.getBalance(
        liquidityLinearFeeStakeAcc.publicKey
      );
      const unstakerBalancePre = await provider.connection.getBalance(
        liquidityLinearFeeUnstaker.publicKey
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

      const [stakeAccountRecordAccount] = await findStakeAccountRecordAccount(
        program.programId,
        poolKeypair.publicKey,
        liquidityLinearFeeStakeAcc.publicKey
      );

      await program.methods
        .unstake()
        .accounts({
          payer: payerKeypair.publicKey,
          unstaker: liquidityLinearFeeUnstaker.publicKey,
          stakeAccount: liquidityLinearFeeStakeAcc.publicKey,
          destination: liquidityLinearFeeUnstaker.publicKey,
          poolAccount: poolKeypair.publicKey,
          poolSolReserves,
          feeAccount,
          stakeAccountRecordAccount,
          clock: SYSVAR_CLOCK_PUBKEY,
          stakeProgram: StakeProgram.programId,
        })
        .signers([payerKeypair, liquidityLinearFeeUnstaker])
        .rpc({ skipPreflight: true });

      const unstakerBalancePost = await provider.connection.getBalance(
        liquidityLinearFeeUnstaker.publicKey
      );
      const liquidityLinearFeeRatio = await program.account.fee
        .fetch(feeAccount)
        .then(
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
      const feeLamportsExpected = Math.ceil(
        stakeAccountLamports * liquidityLinearFeeRatio
      );
      const feeLamportsCharged =
        stakeAccountLamports - (unstakerBalancePost - unstakerBalancePre);

      const epsilon = Math.abs(feeLamportsExpected - feeLamportsCharged);
      expect(epsilon).to.be.below(EPSILON_UPPER_BOUND);
    });
  });
});
