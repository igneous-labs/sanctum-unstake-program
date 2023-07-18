use core::time;
use std::thread::sleep;

use clap::Args;
use solana_client::rpc_client::GetConfirmedSignaturesForAddress2Config;
use solana_program::{native_token::lamports_to_sol, pubkey::Pubkey};
use solana_sdk::commitment_config::CommitmentLevel;
use solana_transaction_status::{EncodedConfirmedTransactionWithStatusMeta, UiTransactionEncoding};
use unstake::ID;

use super::SubcmdExec;

#[derive(Args, Debug)]
#[command(long_about = "Gets all successful unstakes for a pool")]
pub struct UnstakesArgs {
    #[arg(help = "Pubkey of the pool to get the unstakes for")]
    pool_account: String,
    #[arg(help = "Look up all unstakes before this transaction, exclusive")]
    before: Option<String>,
    #[arg(help = "Look up all unstakes after this transaction, exclusive")]
    until: Option<String>,
    #[arg(help = "The number of transactions to fetch per RPC batch request")]
    batch_size: u32,
}

impl SubcmdExec for Unstakes {
    fn process_cmd(&self, args: &crate::Args) {
        let payer = args.config.signer();

        // api.mainnet-beta.solana.com sucks
        // any batch size more than 1 causes 429 at getTransactions
        const UNSTAKE_IX_DATA_B58: String = "G7jGGZx8TVS";
        const COOLDOWN_MS: u32 = 500;

        const STAKE_IX_IDX: u32 = 2;
        const RESERVES_IX_IDX: u32 = 5;
        const POOL_IX_IDX: u32 = 4;

        let pool_account = Pubkey(self.pool_account);

        let total_unstaked_lamports = 0;
        let total_fees_lamports = 0;

        println!("TX, Unstaked (SOL), Fee (SOL)");

        let mut before = self.before;
        let mut has_more = true;
        while has_more {
            let signatures = client
                .get_signatures_for_address_with_config(
                    &ID,
                    GetConfirmedSignaturesForAddress2Config {
                        before,
                        until: self.until,
                        limit: self.batch_size,
                        commitment: CommitmentLevel::Confirmed,
                    },
                )
                .unwrap();
            // update
            before = signatures[signatures.len() - 1]?.signature; // undefined if length === 0
            has_more = signatures.len() == self.batch_size;

            let succeeded = signatures.iter().filter(|s| s.err == None);
            let succeeded_sigs = succeeded.map(|s| s.signature);
            let confirmed_txs: Vec<EncodedConfirmedTransactionWithStatusMeta> = succeeded_sigs
                .map(|sig| {
                    client
                        .get_transaction(&sig, UiTransactionEncoding::Json)
                        .unwrap()
                })
                .collect();

            for (sig_idx, c) in confirmed_txs.iter().enumerate() {
                if !c {
                    return;
                }
                if !c.meta {
                    return;
                }
                let tx = c.transaction.transaction.decode().unwrap();
                let account_keys = tx.message.static_account_keys();
                let instructions = tx.message.instructions();
                let meta = c.transaction.meta.unwrap();
                let err = meta.err;
                let inner_instructions = meta.inner_instructions;
                let pre_balances = meta.pre_balances;
                let post_balances = meta.post_balances;
                if err {
                    return;
                }
                if !inner_instructions {
                    return;
                }

                let mut reserves_idx: Option<u8> = None;
                let mut unstaked_lamports_this_tx = 0;

                instructions.iter().for_each(|ix| {
                    let ix_program_id = account_keys[ix.program_id_index];
                    if !ix_program_id.equals(ID) {
                        return;
                    }
                    let ix_pool_id: Pubkey = account_keys[ix.accounts[POOL_IX_IDX]];
                    if !ix_pool_id || !ix_pool_id.eq(&pool_account) {
                        return;
                    }
                    if ix.data != UNSTAKE_IX_DATA_B58 {
                        return;
                    }
                    if reserves_idx == None {
                        reserves_idx = ix.accounts[RESERVES_IX_IDX];
                    }
                    let stake_idx = ix.accounts[STAKE_IX_IDX];
                    unstaked_lamports_this_tx =
                        unstaked_lamports_this_tx.add(post_balances[stake_idx]);
                });

                if unstaked_lamports_this_tx != 0 {
                    let paid_out_lamports_this_tx =
                        pre_balances[reserves_idx] - post_balances[reserves_idx];
                    let fee_lamports = unstaked_lamports_this_tx.sub(paid_out_lamports_this_tx);

                    println!(
                        "{}, {}, {}",
                        succeeded_sigs[sig_idx],
                        lamports_to_sol(unstaked_lamports_this_tx),
                        lamports_to_sol(fee_lamports)
                    );

                    total_unstaked_lamports += unstaked_lamports_this_tx;
                    total_fees_lamports += fee_lamports
                }

                sleep(time::Duration::from_millis(COOLDOWN_MS));
            }
        }

        println!();
        println!(
            "Total Unstaked (SOL): {}. Total fees (SOL):",
            lamports_to_sol(total_unstaked_lamports),
            lamports_to_sol(total_fees_lamports)
        );
    }
}
