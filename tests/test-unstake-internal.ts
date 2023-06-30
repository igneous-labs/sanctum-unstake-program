import BN from "bn.js";
import * as anchor from "@project-serum/anchor";
import {
  sendAndConfirmTransaction,
  Keypair,
  PublicKey,
  Lockup,
  LAMPORTS_PER_SOL,
  StakeProgram,
  VersionedTransaction,
  TransactionMessage,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccount,
  getAccount,
  getAssociatedTokenAddress,
  getMint,
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
  fetchLpFacingTestParams,
  waitForEpochToPass,
  checkAnchorError,
  EPSILON_UPPER_BOUND,
} from "./utils";
import { expect, use as chaiUse } from "chai";
import chaiAsPromised from "chai-as-promised";
import { findProgramAddressSync } from "@project-serum/anchor/dist/cjs/utils/pubkey";
import {
  Metadata,
  TokenStandard,
} from "@metaplex-foundation/mpl-token-metadata";

chaiUse(chaiAsPromised);

describe("internals", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.getProvider());
  const program = anchor.workspace.Unstake as anchor.Program<Unstake>;
  const provider = anchor.getProvider();

  const payerKeypair = Keypair.generate();
  const poolKeypair = Keypair.generate();
  const lpMintKeypair = Keypair.generate();
  const lperKeypair = Keypair.generate();

  let [poolSolReserves] = [null as PublicKey, 0];
  let [feeAccount] = [null as PublicKey, 0];
  let lperAta = null as PublicKey;
  let protocolFeeAddr = null as PublicKey;
  let protocolFee = null as ProtocolFeeAccount;
  let protocolFeeDestination = null as PublicKey;

  const metadata = {
    name: "unstake.it LP token",
    symbol: "UNSTAKE",
    uri: "https://example.com",
  };
  const metadataProgram = new PublicKey(
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
  );
  const [metadataAccount] = findProgramAddressSync(
    [
      Buffer.from("metadata"),
      metadataProgram.toBuffer(),
      lpMintKeypair.publicKey.toBuffer(),
    ],
    metadataProgram
  );

  const [flashLoanFeeAccount] = findProgramAddressSync(
    [poolKeypair.publicKey.toBuffer(), Buffer.from("flashloanfee")],
    program.programId
  );
  const finalFlashLoanFee = {
    feeRatio: {
      num: new BN(3),
      denom: new BN(10_000),
    },
  };
  const [flashAccount] = findProgramAddressSync(
    [poolKeypair.publicKey.toBuffer(), Buffer.from("flashaccount")],
    program.programId
  );

  before(async () => {
    [protocolFeeAddr] = await findProtocolFeeAccount(program.programId);
    protocolFee = await program.account.protocolFee.fetch(protocolFeeAddr);
    protocolFeeDestination = protocolFee.destination;

    console.log("airdropping to payer, lper and protocolFeeDestination");
    await Promise.all([
      airdrop(provider.connection, payerKeypair.publicKey),
      airdrop(provider.connection, lperKeypair.publicKey),
    ]);
    [poolSolReserves] = await findPoolSolReserves(
      program.programId,
      poolKeypair.publicKey
    );
    [feeAccount] = await findPoolFeeAccount(
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

    it("it rejects to set fee authority if the authority doesn't match", async () => {
      const rando = Keypair.generate();
      const tempFeeAuthority = Keypair.generate();

      await expect(
        program.methods
          .setFeeAuthority()
          .accounts({
            feeAuthority: rando.publicKey,
            poolAccount: poolKeypair.publicKey,
            newFeeAuthority: tempFeeAuthority.publicKey,
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

    it("it set fee authority", async () => {
      const tempFeeAuthority = Keypair.generate();
      await program.methods
        .setFeeAuthority()
        .accounts({
          feeAuthority: payerKeypair.publicKey,
          poolAccount: poolKeypair.publicKey,
          newFeeAuthority: tempFeeAuthority.publicKey,
        })
        .signers([payerKeypair])
        .rpc({ skipPreflight: true });

      await program.account.pool
        .fetch(poolKeypair.publicKey)
        .then(({ feeAuthority }) => {
          expect(feeAuthority.equals(tempFeeAuthority.publicKey)).to.be.true;
        });

      // revert the change to keep the tests bellow unaffected by this test
      await program.methods
        .setFeeAuthority()
        .accounts({
          feeAuthority: tempFeeAuthority.publicKey,
          poolAccount: poolKeypair.publicKey,
          newFeeAuthority: payerKeypair.publicKey,
        })
        .signers([tempFeeAuthority])
        .rpc({ skipPreflight: true });

      await program.account.pool
        .fetch(poolKeypair.publicKey)
        .then(({ feeAuthority }) => {
          expect(feeAuthority.equals(payerKeypair.publicKey)).to.be.true;
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

    it("it rejects to set token metadata with invalid fee authority", async () => {
      const fakeAuthKeypair = lperKeypair;
      await expect(
        program.methods
          .setLpTokenMetadata(metadata)
          .accounts({
            payer: fakeAuthKeypair.publicKey,
            feeAuthority: fakeAuthKeypair.publicKey,
            poolAccount: poolKeypair.publicKey,
            poolSolReserves,
            lpMint: lpMintKeypair.publicKey,
            metadata: metadataAccount,
            metadataProgram,
          })
          .signers([fakeAuthKeypair])
          .rpc({ skipPreflight: true })
      ).to.be.eventually.rejected.and.satisfy(
        checkAnchorError(
          6002,
          "The provided fee authority does not have the authority over the provided pool account"
        )
      );
    });

    it("it creates token metadata", async () => {
      await program.methods
        .setLpTokenMetadata(metadata)
        .accounts({
          payer: payerKeypair.publicKey,
          feeAuthority: payerKeypair.publicKey,
          poolAccount: poolKeypair.publicKey,
          poolSolReserves,
          lpMint: lpMintKeypair.publicKey,
          metadata: metadataAccount,
          metadataProgram,
        })
        .signers([payerKeypair])
        .rpc({ skipPreflight: true });
      const createdMetadata = await Metadata.fromAccountAddress(
        program.provider.connection,
        metadataAccount
      );

      expect(createdMetadata.data.name.replace(/\0/g, "")).to.eq(metadata.name);
      expect(createdMetadata.data.symbol.replace(/\0/g, "")).to.eq(
        metadata.symbol
      );
      expect(createdMetadata.data.uri.replace(/\0/g, "")).to.eq(metadata.uri);
      expect(createdMetadata.tokenStandard).to.eq(TokenStandard.Fungible);
    });

    it("it updates token metadata", async () => {
      const newMetadata = {
        name: "new name",
        symbol: "NEWSYM",
        uri: "new.com",
      };

      await program.methods
        .setLpTokenMetadata(newMetadata)
        .accounts({
          payer: payerKeypair.publicKey,
          feeAuthority: payerKeypair.publicKey,
          poolAccount: poolKeypair.publicKey,
          poolSolReserves,
          lpMint: lpMintKeypair.publicKey,
          metadata: metadataAccount,
          metadataProgram,
        })
        .signers([payerKeypair])
        .rpc({ skipPreflight: true });
      const updatedMetadata = await Metadata.fromAccountAddress(
        program.provider.connection,
        metadataAccount
      );

      expect(updatedMetadata.data.name.replace(/\0/g, "")).to.eq(
        newMetadata.name
      );
      expect(updatedMetadata.data.symbol.replace(/\0/g, "")).to.eq(
        newMetadata.symbol
      );
      expect(updatedMetadata.data.uri.replace(/\0/g, "")).to.eq(
        newMetadata.uri
      );
      expect(updatedMetadata.tokenStandard).to.eq(TokenStandard.Fungible);
    });

    it("it rejects to set flash loan fee with invalid fee authority", async () => {
      const fakeAuthKeypair = lperKeypair;
      await expect(
        program.methods
          .setFlashLoanFee({
            feeRatio: {
              num: new BN(1),
              denom: new BN(1_000),
            },
          })
          .accounts({
            payer: fakeAuthKeypair.publicKey,
            feeAuthority: fakeAuthKeypair.publicKey,
            poolAccount: poolKeypair.publicKey,
            flashLoanFeeAccount,
          })
          .signers([fakeAuthKeypair])
          .rpc({ skipPreflight: true })
      ).to.be.eventually.rejected.and.satisfy(
        checkAnchorError(
          6002,
          "The provided fee authority does not have the authority over the provided pool account"
        )
      );
    });

    it("it creates flash loan fee", async () => {
      const fee = {
        feeRatio: {
          num: new BN(1),
          denom: new BN(1_000),
        },
      };
      await program.methods
        .setFlashLoanFee(fee)
        .accounts({
          payer: payerKeypair.publicKey,
          feeAuthority: payerKeypair.publicKey,
          poolAccount: poolKeypair.publicKey,
          flashLoanFeeAccount,
        })
        .signers([payerKeypair])
        .rpc({ skipPreflight: true });
      await program.account.flashLoanFee
        .fetch(flashLoanFeeAccount)
        .then(({ feeRatio: { num, denom } }) => {
          expect(num.eq(fee.feeRatio.num)).to.be.true;
          expect(denom.eq(fee.feeRatio.denom)).to.be.true;
        });
    });

    it("it updates flash loan fee", async () => {
      await program.methods
        .setFlashLoanFee(finalFlashLoanFee)
        .accounts({
          payer: payerKeypair.publicKey,
          feeAuthority: payerKeypair.publicKey,
          poolAccount: poolKeypair.publicKey,
          flashLoanFeeAccount,
        })
        .signers([payerKeypair])
        .rpc({ skipPreflight: true });
      await program.account.flashLoanFee
        .fetch(flashLoanFeeAccount)
        .then(({ feeRatio: { num, denom } }) => {
          expect(num.eq(finalFlashLoanFee.feeRatio.num)).to.be.true;
          expect(denom.eq(finalFlashLoanFee.feeRatio.denom)).to.be.true;
        });
    });
  });

  describe("User facing", () => {
    const lockedUpStakeAcc = Keypair.generate();
    const notEnoughLiquidityStakeAcc = Keypair.generate();
    const flatFeeStakeAcc = Keypair.generate();
    const liquidityLinearFeeStakeAcc = Keypair.generate();
    const flatFeeWSolStakeAcc = Keypair.generate();
    const liquidityLinearFeeWSolStakeAcc = Keypair.generate();

    const lockedUpUnstaker = Keypair.generate();
    const notEnoughLiquidityUnstaker = Keypair.generate();
    const flatFeeUnstaker = Keypair.generate();
    const liquidityLinearFeeUnstaker = Keypair.generate();
    const flatFeeWSolUnstaker = Keypair.generate();
    const liquidityLinearFeeWSolUnstaker = Keypair.generate();
    const flashLoaner = Keypair.generate();

    const liquidityLamports = new BN(10 * LAMPORTS_PER_SOL);

    let lockedupUnstakerWSolAcc: PublicKey;
    let notEnoughLiquidityUnstakerWSolAcc: PublicKey;
    let flatFeeWSolUnstakerWSolAcc: PublicKey;
    let liquidityLinearFeeWSolUnstakerWSolAcc: PublicKey;

    before(async () => {
      // airdrop to lper and unstakers
      await Promise.all(
        [
          lperKeypair,
          lockedUpUnstaker,
          notEnoughLiquidityUnstaker,
          flatFeeUnstaker,
          liquidityLinearFeeUnstaker,
          flatFeeWSolUnstaker,
          liquidityLinearFeeWSolUnstaker,
          flashLoaner,
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

      const {
        liquidityLinear: {
          params: {
            zeroLiqRemaining: { num, denom },
          },
        },
      } = LIQUIDITY_LINEAR_FEE;
      const maxUnstakeableLamports = liquidityLamports
        .mul(denom)
        .divRound(denom.sub(num));

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
          maxUnstakeableLamports.add(new BN(1)).toNumber(),
        ],
        [flatFeeStakeAcc, flatFeeUnstaker, undefined, undefined],
        [
          liquidityLinearFeeStakeAcc,
          liquidityLinearFeeUnstaker,
          undefined,
          undefined,
        ],
        [flatFeeWSolStakeAcc, flatFeeWSolUnstaker, undefined, undefined],
        [
          liquidityLinearFeeWSolStakeAcc,
          liquidityLinearFeeWSolUnstaker,
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

      // create wSOL account
      [
        lockedupUnstakerWSolAcc,
        notEnoughLiquidityUnstakerWSolAcc,
        flatFeeWSolUnstakerWSolAcc,
        liquidityLinearFeeWSolUnstakerWSolAcc,
      ] = await Promise.all(
        [
          lockedUpUnstaker,
          notEnoughLiquidityUnstaker,
          flatFeeWSolUnstaker,
          liquidityLinearFeeWSolUnstaker,
        ].map((kp) =>
          createAssociatedTokenAccount(
            provider.connection,
            kp,
            NATIVE_MINT,
            kp.publicKey
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
            protocolFeeAccount: protocolFeeAddr,
            protocolFeeDestination,
            clock: SYSVAR_CLOCK_PUBKEY,
            stakeProgram: StakeProgram.programId,
          })
          .signers([lockedUpUnstaker])
          .rpc({ skipPreflight: true })
      ).to.be.eventually.rejected.and.satisfy(
        checkAnchorError(6005, "The provided stake account is locked up")
      );
    });

    it("it rejects to unstakeWsol a locked up stake account", async () => {
      const [stakeAccountRecordAccount] = await findStakeAccountRecordAccount(
        program.programId,
        poolKeypair.publicKey,
        lockedUpStakeAcc.publicKey
      );

      await expect(
        program.methods
          .unstakeWsol()
          .accounts({
            payer: lockedUpUnstaker.publicKey,
            unstaker: lockedUpUnstaker.publicKey,
            stakeAccount: lockedUpStakeAcc.publicKey,
            destination: lockedupUnstakerWSolAcc,
            poolAccount: poolKeypair.publicKey,
            poolSolReserves,
            feeAccount,
            stakeAccountRecordAccount,
            protocolFeeAccount: protocolFeeAddr,
            protocolFeeDestination,
            clock: SYSVAR_CLOCK_PUBKEY,
            stakeProgram: StakeProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
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
            protocolFeeAccount: protocolFeeAddr,
            protocolFeeDestination,
            clock: SYSVAR_CLOCK_PUBKEY,
            stakeProgram: StakeProgram.programId,
          })
          .signers([notEnoughLiquidityUnstaker])
          .rpc({ skipPreflight: true })
      ).to.be.eventually.rejected.and.satisfy(
        checkAnchorError(6008, "Not enough liquidity to service this unstake")
      );
    });

    it("it fails to unstakeWsol not enough liquidity", async () => {
      const [stakeAccountRecordAccount] = await findStakeAccountRecordAccount(
        program.programId,
        poolKeypair.publicKey,
        notEnoughLiquidityStakeAcc.publicKey
      );

      await expect(
        program.methods
          .unstakeWsol()
          .accounts({
            payer: notEnoughLiquidityUnstaker.publicKey,
            unstaker: notEnoughLiquidityUnstaker.publicKey,
            stakeAccount: notEnoughLiquidityStakeAcc.publicKey,
            destination: notEnoughLiquidityUnstakerWSolAcc,
            poolAccount: poolKeypair.publicKey,
            poolSolReserves,
            feeAccount,
            stakeAccountRecordAccount,
            protocolFeeAccount: protocolFeeAddr,
            protocolFeeDestination,
            clock: SYSVAR_CLOCK_PUBKEY,
            stakeProgram: StakeProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([notEnoughLiquidityUnstaker])
          .rpc({ skipPreflight: true })
      ).to.be.eventually.rejected.and.satisfy(
        checkAnchorError(6008, "Not enough liquidity to service this unstake")
      );
    });

    it("it fails to unstakeWsol different mint", async () => {
      const [stakeAccountRecordAccount] = await findStakeAccountRecordAccount(
        program.programId,
        poolKeypair.publicKey,
        notEnoughLiquidityStakeAcc.publicKey
      );

      await expect(
        program.methods
          .unstakeWsol()
          .accounts({
            payer: notEnoughLiquidityUnstaker.publicKey,
            unstaker: notEnoughLiquidityUnstaker.publicKey,
            stakeAccount: notEnoughLiquidityStakeAcc.publicKey,
            destination: lperAta,
            poolAccount: poolKeypair.publicKey,
            poolSolReserves,
            feeAccount,
            stakeAccountRecordAccount,
            protocolFeeAccount: protocolFeeAddr,
            protocolFeeDestination,
            clock: SYSVAR_CLOCK_PUBKEY,
            stakeProgram: StakeProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([notEnoughLiquidityUnstaker])
          .rpc({ skipPreflight: true })
      ).to.be.eventually.rejected.and.satisfy(
        checkAnchorError(
          6010,
          "Destination token account is not a wrapped SOL account"
        )
      );
    });

    it("it rejects to unstake wrong protocol fee destination", async () => {
      const [stakeAccountRecordAccount] = await findStakeAccountRecordAccount(
        program.programId,
        poolKeypair.publicKey,
        flatFeeStakeAcc.publicKey
      );

      await expect(
        program.methods
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
            protocolFeeAccount: protocolFeeAddr,
            protocolFeeDestination: Keypair.generate().publicKey,
            clock: SYSVAR_CLOCK_PUBKEY,
            stakeProgram: StakeProgram.programId,
          })
          .signers([payerKeypair, flatFeeUnstaker])
          .rpc({ skipPreflight: true })
      ).to.be.eventually.rejected.and.satisfy(
        checkAnchorError(6011, "Wrong protocol fee destination account")
      );
    });

    it("it rejects to unstakeWsol wrong protocol fee destination", async () => {
      const [stakeAccountRecordAccount] = await findStakeAccountRecordAccount(
        program.programId,
        poolKeypair.publicKey,
        flatFeeWSolStakeAcc.publicKey
      );

      await expect(
        program.methods
          .unstakeWsol()
          .accounts({
            payer: payerKeypair.publicKey,
            unstaker: flatFeeWSolUnstaker.publicKey,
            stakeAccount: flatFeeWSolStakeAcc.publicKey,
            destination: flatFeeWSolUnstakerWSolAcc,
            poolAccount: poolKeypair.publicKey,
            poolSolReserves,
            feeAccount,
            stakeAccountRecordAccount,
            protocolFeeAccount: protocolFeeAddr,
            protocolFeeDestination: Keypair.generate().publicKey,
            clock: SYSVAR_CLOCK_PUBKEY,
            stakeProgram: StakeProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([payerKeypair, flatFeeWSolUnstaker])
          .rpc({ skipPreflight: true })
      ).to.be.eventually.rejected.and.satisfy(
        checkAnchorError(6011, "Wrong protocol fee destination account")
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
      const protocolFeeDestBalancePre = await provider.connection.getBalance(
        protocolFeeDestination
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
          protocolFeeAccount: protocolFeeAddr,
          protocolFeeDestination,
          clock: SYSVAR_CLOCK_PUBKEY,
          stakeProgram: StakeProgram.programId,
        })
        .signers([payerKeypair, flatFeeUnstaker])
        .rpc({ skipPreflight: true });

      const unstakerBalancePost = await provider.connection.getBalance(
        flatFeeUnstaker.publicKey
      );
      const protocolFeeDestBalancePost = await provider.connection.getBalance(
        protocolFeeDestination
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
      const protocolFeeLamportsExpected = Math.floor(
        (protocolFee.feeRatio.num.toNumber() * feeLamportsExpected) /
          protocolFee.feeRatio.denom.toNumber()
      );
      const feeLamportsCharged =
        stakeAccountLamports - (unstakerBalancePost - unstakerBalancePre);
      const protocolFeeLamportsCharged =
        protocolFeeDestBalancePost - protocolFeeDestBalancePre;

      expect(feeLamportsCharged).to.eql(feeLamportsExpected);
      expect(protocolFeeLamportsExpected).to.eql(protocolFeeLamportsCharged);
    });

    it("it charges Flat fee on unstakeWsol", async () => {
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
        flatFeeWSolStakeAcc.publicKey
      );
      const unstakerWSolBalancePre = (
        await getAccount(provider.connection, flatFeeWSolUnstakerWSolAcc)
      ).amount;
      const protocolFeeDestBalancePre = await provider.connection.getBalance(
        protocolFeeDestination
      );

      const [stakeAccountRecordAccount] = await findStakeAccountRecordAccount(
        program.programId,
        poolKeypair.publicKey,
        flatFeeWSolStakeAcc.publicKey
      );

      await program.methods
        .unstakeWsol()
        .accounts({
          payer: payerKeypair.publicKey,
          unstaker: flatFeeWSolUnstaker.publicKey,
          stakeAccount: flatFeeWSolStakeAcc.publicKey,
          destination: flatFeeWSolUnstakerWSolAcc,
          poolAccount: poolKeypair.publicKey,
          poolSolReserves,
          feeAccount,
          stakeAccountRecordAccount,
          protocolFeeAccount: protocolFeeAddr,
          protocolFeeDestination,
          clock: SYSVAR_CLOCK_PUBKEY,
          stakeProgram: StakeProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([payerKeypair, flatFeeWSolUnstaker])
        .rpc({ skipPreflight: true });

      const unstakerWSolBalancePost = (
        await getAccount(provider.connection, flatFeeWSolUnstakerWSolAcc)
      ).amount;
      const protocolFeeDestBalancePost = await provider.connection.getBalance(
        protocolFeeDestination
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
      const protocolFeeLamportsExpected = Math.floor(
        (protocolFee.feeRatio.num.toNumber() * feeLamportsExpected) /
          protocolFee.feeRatio.denom.toNumber()
      );
      const feeLamportsCharged =
        stakeAccountLamports -
        (Number(unstakerWSolBalancePost) - Number(unstakerWSolBalancePre));
      const protocolFeeLamportsCharged =
        protocolFeeDestBalancePost - protocolFeeDestBalancePre;

      expect(feeLamportsCharged).to.eql(feeLamportsExpected);
      expect(protocolFeeLamportsExpected).to.eql(protocolFeeLamportsCharged);
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
      const protocolFeeDestBalancePre = await provider.connection.getBalance(
        protocolFeeDestination
      );
      const { incomingStake: incomingStakePre } =
        await program.account.pool.fetch(poolKeypair.publicKey);
      const solReservesLamportsPre = await provider.connection.getBalance(
        poolSolReserves
      );

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
          protocolFeeAccount: protocolFeeAddr,
          protocolFeeDestination,
          clock: SYSVAR_CLOCK_PUBKEY,
          stakeProgram: StakeProgram.programId,
        })
        .signers([payerKeypair, liquidityLinearFeeUnstaker])
        .rpc({ skipPreflight: true });

      const unstakerBalancePost = await provider.connection.getBalance(
        liquidityLinearFeeUnstaker.publicKey
      );
      const protocolFeeDestBalancePost = await provider.connection.getBalance(
        protocolFeeDestination
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
            (maxLiqRemaining.num.toNumber() /
              maxLiqRemaining.denom.toNumber()) *
              stakeAccountLamports
          ),
          Math.ceil(
            (zeroLiqRemaining.num.toNumber() /
              zeroLiqRemaining.denom.toNumber()) *
              stakeAccountLamports
          ),
        ];
      });
      const protocolFeeLamportsExpected = Math.floor(
        (protocolFee.feeRatio.num.toNumber() * feeLamportsExpected) /
          protocolFee.feeRatio.denom.toNumber()
      );
      const feeLamportsCharged =
        stakeAccountLamports - (unstakerBalancePost - unstakerBalancePre);
      const protocolFeeLamportsCharged =
        protocolFeeDestBalancePost - protocolFeeDestBalancePre;

      expect(feeLamportsExpected).to.be.gt(0);
      expect(feeLamportsCharged).to.be.gt(0);
      const epsilon = Math.abs(feeLamportsExpected - feeLamportsCharged);
      expect(epsilon).to.be.below(EPSILON_UPPER_BOUND);
      expect(feeLamportsCharged).to.be.gt(minFeeLamportsExpected);
      expect(feeLamportsCharged).to.be.lt(maxFeeLamportsExpected);
      expect(protocolFeeLamportsExpected).to.eql(protocolFeeLamportsCharged);
    });

    it("it charges LiquidityLinear fee on unstakeWsol", async () => {
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
        liquidityLinearFeeWSolStakeAcc.publicKey
      );
      const unstakerWSolBalancePre = (
        await getAccount(
          provider.connection,
          liquidityLinearFeeWSolUnstakerWSolAcc
        )
      ).amount;
      const protocolFeeDestBalancePre = await provider.connection.getBalance(
        protocolFeeDestination
      );

      const { incomingStake: incomingStakePre } =
        await program.account.pool.fetch(poolKeypair.publicKey);
      const solReservesLamportsPre = await provider.connection.getBalance(
        poolSolReserves
      );

      const [stakeAccountRecordAccount] = await findStakeAccountRecordAccount(
        program.programId,
        poolKeypair.publicKey,
        liquidityLinearFeeWSolStakeAcc.publicKey
      );

      await program.methods
        .unstakeWsol()
        .accounts({
          payer: payerKeypair.publicKey,
          unstaker: liquidityLinearFeeWSolUnstaker.publicKey,
          stakeAccount: liquidityLinearFeeWSolStakeAcc.publicKey,
          destination: liquidityLinearFeeWSolUnstakerWSolAcc,
          poolAccount: poolKeypair.publicKey,
          poolSolReserves,
          feeAccount,
          stakeAccountRecordAccount,
          protocolFeeAccount: protocolFeeAddr,
          protocolFeeDestination,
          clock: SYSVAR_CLOCK_PUBKEY,
          stakeProgram: StakeProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([payerKeypair, liquidityLinearFeeWSolUnstaker])
        .rpc({ skipPreflight: true });

      const unstakerWSolBalancePost = (
        await getAccount(
          provider.connection,
          liquidityLinearFeeWSolUnstakerWSolAcc
        )
      ).amount;
      const protocolFeeDestBalancePost = await provider.connection.getBalance(
        protocolFeeDestination
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
            (maxLiqRemaining.num.toNumber() /
              maxLiqRemaining.denom.toNumber()) *
              stakeAccountLamports
          ),
          Math.ceil(
            (zeroLiqRemaining.num.toNumber() /
              zeroLiqRemaining.denom.toNumber()) *
              stakeAccountLamports
          ),
        ];
      });
      const protocolFeeLamportsExpected = Math.floor(
        (protocolFee.feeRatio.num.toNumber() * feeLamportsExpected) /
          protocolFee.feeRatio.denom.toNumber()
      );
      const feeLamportsCharged =
        stakeAccountLamports -
        (Number(unstakerWSolBalancePost) - Number(unstakerWSolBalancePre));
      const protocolFeeLamportsCharged =
        protocolFeeDestBalancePost - protocolFeeDestBalancePre;

      expect(feeLamportsExpected).to.be.gt(0);
      expect(feeLamportsCharged).to.be.gt(0);
      const epsilon = Math.abs(feeLamportsExpected - feeLamportsCharged);
      expect(epsilon).to.be.below(EPSILON_UPPER_BOUND);
      expect(feeLamportsCharged).to.be.gt(minFeeLamportsExpected);
      expect(feeLamportsCharged).to.be.lt(maxFeeLamportsExpected);
      expect(protocolFeeLamportsExpected).to.eql(protocolFeeLamportsCharged);
    });

    it("it refuses to give flash loan without repay", async () => {
      await expect(
        program.methods
          .takeFlashLoan(new BN(1_000_000_000))
          .accounts({
            receiver: flashLoaner.publicKey,
            poolAccount: poolKeypair.publicKey,
            poolSolReserves,
            flashAccount,
            instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .rpc({ skipPreflight: true })
      ).to.be.eventually.rejected.and.satisfy(
        checkAnchorError(
          6014,
          "No succeeding repay flash loan instruction found"
        )
      );
    });

    it("it basic flash loan", async () => {
      const loanAmt = new BN(1_000_000_000);
      const [protocolFeeDestBalancePre, poolSolReservesBalancePre] =
        await Promise.all(
          [protocolFeeDestination, poolSolReserves].map((pk) =>
            program.provider.connection.getBalance(pk)
          )
        );

      const takeIx = await program.methods
        .takeFlashLoan(loanAmt)
        .accounts({
          receiver: flashLoaner.publicKey,
          poolAccount: poolKeypair.publicKey,
          poolSolReserves,
          flashAccount,
          instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction();
      const repayIx = await program.methods
        .repayFlashLoan()
        .accounts({
          repayer: flashLoaner.publicKey,
          poolAccount: poolKeypair.publicKey,
          poolSolReserves,
          flashAccount,
          flashLoanFeeAccount,
          protocolFeeAccount: protocolFeeAddr,
          protocolFeeDestination,
        })
        .instruction();
      const bh = await program.provider.connection.getLatestBlockhash();
      const tx = new VersionedTransaction(
        new TransactionMessage({
          payerKey: flashLoaner.publicKey,
          recentBlockhash: bh.blockhash,
          instructions: [takeIx, repayIx],
        }).compileToV0Message()
      );
      tx.sign([flashLoaner]);
      const signature = await program.provider.connection.sendTransaction(tx, {
        skipPreflight: true,
      });
      await program.provider.connection.confirmTransaction({
        signature,
        ...bh,
      });

      const [protocolFeeDestBalancePost, poolSolReservesBalancePost] =
        await Promise.all(
          [protocolFeeDestination, poolSolReserves].map((pk) =>
            program.provider.connection.getBalance(pk)
          )
        );
      const flashAccountInfo = await program.provider.connection.getAccountInfo(
        flashAccount
      );

      expect(protocolFeeDestBalancePost).to.be.gt(protocolFeeDestBalancePre);
      expect(poolSolReservesBalancePost).to.be.gt(poolSolReservesBalancePre);
      expect(flashAccountInfo).to.be.null;
    });

    it("it take flash loan twice in same tx", async () => {
      const loanAmt = new BN(1_000_000_000);
      const [protocolFeeDestBalancePre, poolSolReservesBalancePre] =
        await Promise.all(
          [protocolFeeDestination, poolSolReserves].map((pk) =>
            program.provider.connection.getBalance(pk)
          )
        );

      const takeIx = await program.methods
        .takeFlashLoan(loanAmt)
        .accounts({
          receiver: flashLoaner.publicKey,
          poolAccount: poolKeypair.publicKey,
          poolSolReserves,
          flashAccount,
          instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction();
      const repayIx = await program.methods
        .repayFlashLoan()
        .accounts({
          repayer: flashLoaner.publicKey,
          poolAccount: poolKeypair.publicKey,
          poolSolReserves,
          flashAccount,
          flashLoanFeeAccount,
          protocolFeeAccount: protocolFeeAddr,
          protocolFeeDestination,
        })
        .instruction();
      const bh = await program.provider.connection.getLatestBlockhash();
      const tx = new VersionedTransaction(
        new TransactionMessage({
          payerKey: flashLoaner.publicKey,
          recentBlockhash: bh.blockhash,
          instructions: [takeIx, takeIx, repayIx],
        }).compileToV0Message()
      );
      tx.sign([flashLoaner]);
      const signature = await program.provider.connection.sendTransaction(tx, {
        skipPreflight: true,
      });
      await program.provider.connection.confirmTransaction({
        signature,
        ...bh,
      });

      const [protocolFeeDestBalancePost, poolSolReservesBalancePost] =
        await Promise.all(
          [protocolFeeDestination, poolSolReserves].map((pk) =>
            program.provider.connection.getBalance(pk)
          )
        );
      const flashAccountInfo = await program.provider.connection.getAccountInfo(
        flashAccount
      );

      expect(protocolFeeDestBalancePost).to.be.gt(protocolFeeDestBalancePre);
      expect(poolSolReservesBalancePost).to.be.gt(poolSolReservesBalancePre);
      expect(flashAccountInfo).to.be.null;
    });
  });
});
