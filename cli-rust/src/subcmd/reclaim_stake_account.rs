use std::str::FromStr;

use clap::Args;

use solana_program::{message::Message, pubkey::Pubkey, sysvar};
use solana_sdk::transaction::Transaction;
use unstake::ID;
use unstake_interface::{reclaim_stake_account_ix, ReclaimStakeAccountKeys};

use crate::tx_utils::send_or_sim_tx;

use super::SubcmdExec;

#[derive(Args, Debug)]
#[command(
    long_about = "Reclaims SOL from a deactivated stake account back into the liquidity pool"
)]
pub struct ReclaimStakeAccountArgs {
    #[arg(help = "Pubkey of the liquidity pool to reclaim stake account to")]
    pool_account: String,
    #[arg(help = "Pubkey of the stake account to reclaim")]
    stake_account: String,
}

impl SubcmdExec for ReclaimStakeAccountArgs {
    fn process_cmd(&self, args: &crate::Args) {
        let payer = args.config.signer();
        let client = args.config.rpc_client();

        let pool_account = Pubkey::from_str(&self.pool_account).unwrap();
        let pool_sol_reserves = Pubkey::find_program_address(&[&pool_account.to_bytes()], &ID);

        let stake_account = Pubkey::from_str(&self.stake_account).unwrap();
        let stake_account_record_account = Pubkey::find_program_address(
            &[&pool_account.to_bytes(), &stake_account.to_bytes()],
            &ID,
        );

        let ix = reclaim_stake_account_ix(ReclaimStakeAccountKeys {
            pool_account,
            pool_sol_reserves: pool_sol_reserves.0,
            clock: sysvar::clock::id(),
            stake_account,
            stake_account_record_account: stake_account_record_account.0,
            stake_history: sysvar::stake_history::id(),
            stake_program: solana_stake_program::id(),
        })
        .unwrap();

        let payer_pk = payer.pubkey();
        let msg = Message::new(&[ix], Some(&payer_pk));
        let blockhash = client.get_latest_blockhash().unwrap();
        let tx = Transaction::new(&vec![payer], msg, blockhash);
        println!(
            "Reclaiming Stake account: {}\n\
            To Liquidity pool: {}",
            pool_account, stake_account
        );
        send_or_sim_tx(args, &client, &tx);
    }
}
