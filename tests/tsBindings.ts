import * as anchor from "@project-serum/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";
import { expect, use as chaiUse } from "chai";
import chaiAsPromised from "chai-as-promised";
import {
  fetchLiquidityPoolStakeAccounts,
  findPoolFeeAccount,
  findPoolSolReserves,
  Unstake,
} from "../ts/src";
import { airdrop } from "./utils";

chaiUse(chaiAsPromised);

describe("ts bindings", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.getProvider());
  const program = anchor.workspace.Unstake as anchor.Program<Unstake>;
  const provider = anchor.getProvider();

  const payerKeypair = Keypair.generate();
  const poolKeypair = Keypair.generate();
  const lpMintKeypair = Keypair.generate();

  let [poolSolReserves, poolSolReservesBump] = [null as PublicKey, 0];
  let [feeAccount, feeAccountBump] = [null as PublicKey, 0];

  before(async () => {
    console.log("airdropping to payer");
    await airdrop(provider.connection, payerKeypair.publicKey);
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
                num: new BN(0),
                denom: new BN(69),
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
  });

  describe("fetch", () => {
    it("ts fetch empty", async () => {
      const empty = await fetchLiquidityPoolStakeAccounts(
        program,
        poolKeypair.publicKey
      );
      expect(empty.active).to.be.empty;
      expect(empty.inactive).to.be.empty;
      expect(empty.activating).to.be.empty;
      expect(empty.deactivating).to.be.empty;
    });
  });
});
