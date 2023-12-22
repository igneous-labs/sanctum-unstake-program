use std::str::FromStr;

use clap::Args;

use solana_program::{pubkey::Pubkey, sysvar};
use unstake::ID;
use unstake_interface::{reclaim_stake_account_ix, ReclaimStakeAccountKeys};

use crate::{
    tx_utils::{batch_ixs, chunk_array, send_or_sim_tx},
    utils::fetch_liquidity_pool_stake_accounts,
};

use super::SubcmdExec;

const RECLAIM_BATCH_SIZE: usize = 5;

#[derive(Args, Debug)]
#[command(
    long_about = "Reclaims SOL from all deactivated stake accounts back into the liquidity pool"
)]
pub struct ReclaimAllArgs {
    #[arg(help = "Pubkey of the liquidity pool to reclaim all stakes accounts to")]
    pool_account: String,
}

impl SubcmdExec for ReclaimAllArgs {
    fn process_cmd(&self, args: &crate::Args) {
        let payer = args.config.signer();
        let client = args.config.rpc_client();

        let pool_account = Pubkey::from_str(&self.pool_account).unwrap();
        let pool_sol_reserves = Pubkey::find_program_address(&[&pool_account.to_bytes()], &ID);

        println!("Fetching stake accounts belongs to {} ...", &pool_account);
        let liquidity_pool_stake_accounts =
            fetch_liquidity_pool_stake_accounts(&client, &pool_account, &pool_sol_reserves.0);
        println!(
            "{}",
            serde_json::to_string_pretty(&liquidity_pool_stake_accounts).unwrap()
        );
        let deactivating_stake_accounts = liquidity_pool_stake_accounts.deactivating;
        let stake_accounts_to_reclaim = liquidity_pool_stake_accounts.inactive;
        println!(
            "Found {} deactivating stake accounts",
            deactivating_stake_accounts.len()
        );
        println!(
            "Found {} inactive stake accounts to reclaim",
            stake_accounts_to_reclaim.len()
        );

        if stake_accounts_to_reclaim.is_empty() {
            println!("Nothing to reclaim!");
            return;
        }

        println!("Generating txs...");
        let mut reclaim_ixs = Vec::new();
        for stake_account in stake_accounts_to_reclaim.iter() {
            let stake_account_record_account = Pubkey::find_program_address(
                &[&pool_account.to_bytes(), &stake_account.to_bytes()],
                &ID,
            );
            let ix = reclaim_stake_account_ix(ReclaimStakeAccountKeys {
                pool_account,
                pool_sol_reserves: pool_sol_reserves.0,
                clock: sysvar::clock::id(),
                stake_account: *stake_account,
                stake_account_record_account: stake_account_record_account.0,
                stake_history: sysvar::stake_history::id(),
                stake_program: solana_stake_program::id(),
            })
            .unwrap();
            reclaim_ixs.push(ix);
        }

        let reclaim_txs_batched = chunk_array(RECLAIM_BATCH_SIZE, &reclaim_ixs)
            .into_iter()
            .map(|ixs| batch_ixs(&client, &*payer, &ixs));

        println!("Sending txs...");
        println!("Reclaims:");
        reclaim_txs_batched.for_each(|tx| {
            send_or_sim_tx(args, &client, &tx);
        });
    }
}
