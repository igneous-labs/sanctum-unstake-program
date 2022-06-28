#!/usr/bin/env node

import { Address, AnchorProvider, Program } from "@project-serum/anchor";
import { IDL, Unstake, createPoolTx } from "@soceanfi/unstake";
import { Keypair, sendAndConfirmTransaction } from "@solana/web3.js";
import { hideBin } from "yargs/helpers";
import yargs from "yargs";
import { keypairFromFile } from "./utils";
import { BN } from "bn.js";

function initProgram(
  cluster: string,
  wallet: string,
  program: Address
): Program<Unstake> {
  process.env.ANCHOR_PROVIDER_URL = cluster;
  process.env.ANCHOR_WALLET = wallet;
  return new Program(IDL, program, AnchorProvider.env());
}

yargs(hideBin(process.argv))
  .strict()
  .help("h")
  .alias("h", "help")
  .option("cluster", {
    describe: "solana cluster",
    default: "http://localhost:8899",
    type: "string",
  })
  .option("wallet", {
    describe: "path to wallet keypair file",
    default: `${process.env.HOME}/.config/solana/id.json`,
    type: "string",
  })
  .option("program_id", {
    describe: "program pubkey",
    default: "6KBz9djJAH3gRHscq9ujMpyZ5bCK9a27o3ybDtJLXowz",
    type: "string",
  })
  .command(
    "create_pool",
    "create a new unstake liquidity pool",
    (y) =>
      y
        .option("payer", {
          type: "string",
          description: "Path to keypair paying for the pool's rent and tx fees",
          defaultDescription: "wallet",
        })
        .option("fee_authority", {
          type: "string",
          description: "Path to keypair actings as the pool's fee authority",
          defaultDescription: "wallet",
        })
        .option("pool_account", {
          type: "string",
          description: "Path to keypair that will be the pool's address",
          defaultDescription: "randomly generated keypair",
        })
        .option("lp_mint", {
          type: "string",
          description:
            "Path to keypair that will be the pool's LP mint address",
          defaultDescription: "randomly generated keypair",
        }),
    async ({
      cluster,
      wallet,
      program_id,
      payer: payerOption,
      fee_authority: feeAuthorityOption,
      pool_account: poolAccountOption,
      lp_mint: lpMintOption,
    }) => {
      // TODO: replace with positional arg
      const fee = {
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
      };
      const program = initProgram(cluster, wallet, program_id);
      const provider = program.provider as AnchorProvider;
      const poolAccountDefault = Keypair.generate();
      const lpMintDefault = Keypair.generate();
      const accounts = {
        feeAuthority: provider.wallet.publicKey,
        poolAccount: poolAccountDefault.publicKey,
        lpMint: lpMintDefault.publicKey,
        payer: provider.wallet.publicKey,
      };
      const signers = {
        poolAccount: poolAccountDefault,
        lpMint: lpMintDefault,
      };
      const accountKeyToKeypairPathOption = {
        feeAuthority: feeAuthorityOption,
        poolAccount: poolAccountOption,
        lpMint: lpMintOption,
        payer: payerOption,
      };
      Object.entries(accountKeyToKeypairPathOption).forEach(
        ([accountKey, option]) => {
          if (option) {
            const keypair = keypairFromFile(option);
            accounts[accountKey] = keypair.publicKey;
            signers[accountKey] = keypair;
          }
        }
      );
      const tx = await createPoolTx(program, fee, accounts);
      const sig = await sendAndConfirmTransaction(
        provider.connection,
        tx,
        Object.values(signers)
      );
      console.log(
        "Liquidity pool initialized at",
        accounts.poolAccount.toString(),
        ", LP mint:",
        accounts.lpMint.toString(),
        ", fee authority:",
        accounts.feeAuthority.toString()
      );
      console.log("TX:", sig);
    }
  ).argv;
