#!/usr/bin/env node

import {
  Address,
  AnchorProvider,
  IdlAccounts,
  Program,
} from "@project-serum/anchor";
import {
  IDL_JSON,
  Unstake,
  addLiquidityTx,
  createPoolTx,
  removeLiquidityTx,
  setFeeTx,
  findPoolFeeAccount,
  findPoolSolReserves,
} from "@unstake-it/sol";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { hideBin } from "yargs/helpers";
import yargs from "yargs";
import {
  keypairFromFile,
  parseLamportsToSol,
  parsePosSolToLamports,
  readJsonFile,
  sleep,
} from "./utils";
import { FeeArg, toFeeChecked } from "./feeArgs";
import {
  createAssociatedTokenAccountInstruction,
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { feeToHr, poolToHr } from "./display";
import { BN } from "bn.js";

function initProgram(
  cluster: string,
  wallet: string,
  program: Address
): Program<Unstake> {
  process.env.ANCHOR_PROVIDER_URL = cluster;
  process.env.ANCHOR_WALLET = wallet;
  return new Program(IDL_JSON as Unstake, program, AnchorProvider.env());
}

yargs(hideBin(process.argv))
  .strict()
  .help("h")
  .alias("h", "help")
  .option("cluster", {
    describe: "solana cluster",
    default: "http://127.0.0.1:8899",
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
    "view <pool>",
    "view details about an unstake liquidity pool",
    (y) =>
      y.positional("pool", {
        type: "string",
        description: "Pubkey of the pool",
      }),
    async ({ cluster, wallet, program_id, pool }) => {
      if (!pool) throw new Error("pool must be provided");
      const poolPubkey = new PublicKey(pool);
      const program = initProgram(cluster, wallet, program_id);
      const [poolAcc, feeAcc, liqLamports] = await Promise.all([
        program.account.pool.fetch(pool),
        findPoolFeeAccount(program.programId, poolPubkey).then(([addr]) =>
          program.account.fee.fetch(addr)
        ),
        findPoolSolReserves(program.programId, poolPubkey).then(([addr]) =>
          program.provider.connection.getBalance(addr)
        ),
      ]);
      console.log("Pool:", poolToHr(poolAcc));
      // JSON stringify if not too many nested layers results in [Object]
      console.log(
        "Fee:",
        feeToHr(feeAcc as unknown as IdlAccounts<Unstake>["fee"])
      );
      console.log("Liquidity:", parseLamportsToSol(liqLamports), "SOL");
    }
  )
  .command(
    "create_pool <fee_path>",
    "create a new unstake liquidity pool",
    (y) =>
      y
        .positional("fee_path", {
          type: "string",
          description:
            "Path to JSON file defining liquidity pool's fee settings. Example contents:\n" +
            '{ "liquidityLinear": { "maxLiqRemaining": 0.003, "zeroLiqRemaining": 0.03 }}\n' +
            '{ "flat": 0.01 }',
        })
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
      fee_path,
      payer: payerOption,
      fee_authority: feeAuthorityOption,
      pool_account: poolAccountOption,
      lp_mint: lpMintOption,
    }) => {
      const program = initProgram(cluster, wallet, program_id);
      const provider = program.provider as AnchorProvider;
      const fee = toFeeChecked(readJsonFile(fee_path!) as FeeArg);
      console.log("Fee:", JSON.stringify(fee));
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
            accounts[accountKey as keyof typeof accounts] = keypair.publicKey;
            signers[accountKey as keyof typeof signers] = keypair;
          }
        }
      );
      const tx = await createPoolTx(program, fee, accounts);
      const sig = await provider.sendAndConfirm(tx, Object.values(signers));
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
  )
  .command(
    "add_liquidity <pool_account> <amount_sol>",
    "adds SOL liquidity to a liquidity pool",
    (y) =>
      y
        .positional("pool_account", {
          type: "string",
          description: "pubkey of the liquidity pool to add liquidity to",
        })
        .positional("amount_sol", {
          type: "number",
          description: "amount in SOL to add as liquidity",
        })
        .option("from", {
          type: "string",
          description: "Path to the SOL keypair to add liquidity from",
          defaultDescription: "wallet",
        })
        .option("mint_lp_tokens_to", {
          type: "string",
          description: "LP token account to mint LP tokens to",
          defaultDescription: "ATA of from",
        }),
    async ({
      cluster,
      wallet,
      program_id,
      pool_account,
      amount_sol,
      from: fromOption,
      mint_lp_tokens_to: mintLpTokensToOption,
    }) => {
      const program = initProgram(cluster, wallet, program_id);
      const provider = program.provider as AnchorProvider;
      const poolKey = new PublicKey(pool_account!);
      const pool = await program.account.pool.fetch(poolKey);
      const poolAccount = {
        publicKey: poolKey,
        account: pool,
      };
      const amountSol = amount_sol!;
      const amountLamports = parsePosSolToLamports(amountSol);
      let from = provider.wallet.publicKey;
      const signers = [];
      if (fromOption) {
        const fromKeypair = keypairFromFile(fromOption);
        signers.push(fromKeypair);
        from = fromKeypair.publicKey;
      }
      const fromAta = await getAssociatedTokenAddress(pool.lpMint, from);
      const mintLpTokensTo = mintLpTokensToOption ?? fromAta;
      const tx = await addLiquidityTx(program, amountLamports, {
        from,
        poolAccount,
        mintLpTokensTo,
      });
      try {
        await getAccount(provider.connection, new PublicKey(mintLpTokensTo));
      } catch (e) {
        if (mintLpTokensTo.toString() !== fromAta.toString()) {
          throw new Error(
            `LP token account ${mintLpTokensTo.toString()} does not exist`
          );
        }
        console.log(
          "LP token account",
          mintLpTokensTo.toString(),
          "does not exist, creating..."
        );
        tx.instructions.unshift(
          createAssociatedTokenAccountInstruction(
            provider.wallet.publicKey,
            new PublicKey(mintLpTokensTo),
            from,
            pool.lpMint
          )
        );
      }
      const sig = await provider.sendAndConfirm(tx, signers);
      console.log(
        amountSol,
        "SOL liquidity added to pool at",
        poolKey.toString()
      );
      console.log("TX:", sig);
    }
  )
  .command(
    "remove_liquidity <pool_account> <amount_lp>",
    "remove SOL liquidity from a liquidity pool",
    (y) =>
      y
        .positional("pool_account", {
          type: "string",
          description: "pubkey of the liquidity pool to remove liquidity from",
        })
        .positional("amount_lp", {
          type: "number",
          description: "amount in LP tokens to remove as liquidity",
        })
        .option("authority", {
          type: "string",
          description:
            "Path to the keypair authority over the LP token account",
          defaultDescription: "wallet",
        })
        .option("burn_from", {
          type: "string",
          description: "LP token account to burn LP tokens from",
          defaultDescription: "ATA of authority",
        })
        .option("to", {
          type: "string",
          description: "SOL account to return removed SOL liquidity to",
          defaultDescription: "authority",
        }),
    async ({
      cluster,
      wallet,
      program_id,
      pool_account,
      amount_lp,
      authority: authorityOption,
      burn_from: burnFromOption,
      to: toOption,
    }) => {
      const program = initProgram(cluster, wallet, program_id);
      const provider = program.provider as AnchorProvider;
      const poolKey = new PublicKey(pool_account!);
      const pool = await program.account.pool.fetch(poolKey);
      const poolAccount = {
        publicKey: poolKey,
        account: pool,
      };
      const amountLp = amount_lp!;
      const amountLpAtomics = parsePosSolToLamports(amountLp);
      let authority = provider.wallet.publicKey;
      const signers = [];
      if (authorityOption) {
        const authorityKeypair = keypairFromFile(authorityOption);
        signers.push(authorityKeypair);
        authority = authorityKeypair.publicKey;
      }
      const tx = await removeLiquidityTx(program, amountLpAtomics, {
        authority,
        poolAccount,
        from: burnFromOption,
        sendLamportsTo: toOption,
      });
      const sig = await provider.sendAndConfirm(tx, signers);
      console.log(
        amountLp,
        "LP tokens liquidity removed from pool at",
        poolKey.toString()
      );
      console.log("TX:", sig);
    }
  )
  .command(
    "set_fee <pool_account> <fee_path>",
    "sets the fee for an unstake liquidity pool",
    (y) =>
      y
        .positional("pool_account", {
          type: "string",
          description: "Pubkey of the pool to set the fee of",
        })
        .positional("fee_path", {
          type: "string",
          description:
            "Path to JSON file defining liquidity pool's fee settings. Example contents:\n" +
            '{ "liquidityLinear": { "maxLiqRemaining": 0.003, "zeroLiqRemaining": 0.03 }}\n' +
            '{ "flat": 0.01 }',
        })
        .option("fee_authority", {
          type: "string",
          description: "Path to keypair that is the pool's fee authority",
          defaultDescription: "wallet",
        }),
    async ({
      cluster,
      wallet,
      program_id,
      pool_account,
      fee_path,
      fee_authority: feeAuthorityOption,
    }) => {
      const program = initProgram(cluster, wallet, program_id);
      const provider = program.provider as AnchorProvider;
      const poolAccount = new PublicKey(pool_account!);
      const fee = toFeeChecked(readJsonFile(fee_path!) as FeeArg);

      const signers = [];
      let feeAuthority = provider.wallet.publicKey;
      if (feeAuthorityOption) {
        const kp = keypairFromFile(feeAuthorityOption);
        signers.push(kp);
        feeAuthority = kp.publicKey;
      }

      const tx = await setFeeTx(program, fee, { poolAccount, feeAuthority });
      const sig = await provider.sendAndConfirm(tx, signers);
      console.log(
        "Liquidity pool at",
        poolAccount.toString(),
        "fees updated to",
        JSON.stringify(fee)
      );
      console.log("TX:", sig);
    }
  )
  .command(
    "unstakes <pool_account>",
    "gets all successful unstakes for a pool",
    (y) =>
      y
        .option("before", {
          type: "string",
          description:
            "Look up all unstakes before this transaction, exclusive",
          defaultDescription: "undefined",
        })
        .option("until", {
          type: "string",
          description: "Look up all unstakes after this transaction, exclusive",
          defaultDescription: "undefined",
        }),
    async ({
      cluster,
      program_id,
      pool_account,
      before: beforeOption,
      until,
    }) => {
      // api.mainnet-beta.solana.com sucks
      // anything more than 1 causes 429 at getTransactions
      const BATCH_SIZE = 1;
      const UNSTAKE_IX_DATA_B58 = "G7jGGZx8TVS";
      const COOLDOWN_MS = 500;

      const STAKE_IX_IDX = 2;
      const RESERVES_IX_IDX = 5;
      const POOL_IX_IDX = 4;

      const poolAccount = new PublicKey(pool_account!);
      const programId = new PublicKey(program_id);
      const connection = new Connection(cluster, "confirmed");

      let totalUnstakedLamports = new BN(0);
      let totalFeesLamports = new BN(0);

      console.log("TX, Unstaked (SOL), Fee (SOL)");

      let before = beforeOption;
      let hasMore = true;
      while (hasMore) {
        const signatures = await connection.getSignaturesForAddress(programId, {
          before,
          until,
          limit: BATCH_SIZE,
        });
        // update
        before = signatures[signatures.length - 1]?.signature; // undefined if length === 0
        hasMore = signatures.length === BATCH_SIZE;

        const succeeded = signatures.filter((s) => s.err === null);
        const succeededSigs = succeeded.map((s) => s.signature);
        const confirmedTxs = await connection.getTransactions(succeededSigs);
        confirmedTxs.forEach((c, sigIdx) => {
          if (!c) return;
          if (!c.meta) return;
          const { accountKeys, instructions } = c.transaction.message;
          const { err, innerInstructions, preBalances, postBalances } = c.meta;
          if (err) return;
          if (!innerInstructions) return;

          let reservesIdx: number | null = null;
          let unstakedLamportsThisTx = new BN(0);

          instructions.forEach(({ accounts, data, programIdIndex }) => {
            const ixProgramId = accountKeys[programIdIndex];
            if (!ixProgramId.equals(programId)) return;
            const ixPoolId = accountKeys[accounts[POOL_IX_IDX]];
            if (!ixPoolId.equals(poolAccount)) return;
            if (data !== UNSTAKE_IX_DATA_B58) return;
            if (reservesIdx === null) {
              reservesIdx = accounts[RESERVES_IX_IDX];
            }
            const stakeIdx = accounts[STAKE_IX_IDX];
            unstakedLamportsThisTx = unstakedLamportsThisTx.add(
              new BN(postBalances[stakeIdx])
            );
          });

          if (!unstakedLamportsThisTx.isZero()) {
            const paidOutLamportsThisTx = new BN(
              preBalances[reservesIdx!] - postBalances[reservesIdx!]
            );
            const feeLamports = unstakedLamportsThisTx.sub(
              paidOutLamportsThisTx
            );

            console.log(
              succeededSigs[sigIdx],
              ",",
              parseLamportsToSol(unstakedLamportsThisTx),
              ",",
              parseLamportsToSol(feeLamports)
            );

            totalUnstakedLamports = totalUnstakedLamports.add(
              unstakedLamportsThisTx
            );
            totalFeesLamports = totalFeesLamports.add(feeLamports);
          }
        });

        await sleep(COOLDOWN_MS);
      }
      console.log();
      console.log(
        "Total Unstaked (SOL):",
        parseLamportsToSol(totalUnstakedLamports),
        ". Total fees (SOL):",
        parseLamportsToSol(totalFeesLamports)
      );
    }
  ).argv;
