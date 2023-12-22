use std::str::FromStr;

use clap::Args;

use solana_program::{pubkey::Pubkey, sysvar};
use unstake::ID;
use unstake_interface::{deactivate_stake_account_ix, DeactivateStakeAccountKeys};

use crate::{
    tx_utils::{batch_ixs, chunk_array, send_or_sim_tx},
    utils::fetch_liquidity_pool_stake_accounts,
};

use super::SubcmdExec;

const DEACTIVATE_BATCH_SIZE: usize = 7;

#[derive(Args, Debug)]
#[command(long_about = "Deactivates all stake accounts from the liquidity pool")]
pub struct DeactivateAllArgs {
    #[arg(help = "Pubkey of the liquidity pool to deactivate all stake accounts from")]
    pool_account: String,
}

impl SubcmdExec for DeactivateAllArgs {
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
        let stake_accounts_to_deactivate = liquidity_pool_stake_accounts.active;
        println!(
            "Found {} deactivating stake accounts",
            deactivating_stake_accounts.len()
        );
        println!(
            "Found {} active stake accounts to deactivate",
            stake_accounts_to_deactivate.len()
        );

        if stake_accounts_to_deactivate.is_empty() {
            println!("Nothing to deactivate!");
            return;
        }

        println!("Generating txs...");
        let mut deactivate_ixs = Vec::new();
        for stake_account in stake_accounts_to_deactivate.iter() {
            let ix = deactivate_stake_account_ix(DeactivateStakeAccountKeys {
                pool_account,
                pool_sol_reserves: pool_sol_reserves.0,
                clock: sysvar::clock::id(),
                stake_account: *stake_account,
                stake_program: solana_stake_program::id(),
            })
            .unwrap();
            deactivate_ixs.push(ix);
        }

        let deactivate_txs_batched = chunk_array(DEACTIVATE_BATCH_SIZE, &deactivate_ixs)
            .into_iter()
            .map(|ixs| batch_ixs(&client, &*payer, &ixs));

        println!("Sending txs...");
        println!("Deactivations:");
        deactivate_txs_batched.for_each(|tx| {
            send_or_sim_tx(args, &client, &tx);
        });
    }
}
