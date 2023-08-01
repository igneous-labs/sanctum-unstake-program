use std::str::FromStr;

use clap::Args;

use solana_program::{message::Message, pubkey::Pubkey, sysvar};
use solana_sdk::transaction::Transaction;
use unstake::ID;
use unstake_interface::{
    deactivate_stake_account_ix, DeactivateStakeAccountIxArgs, DeactivateStakeAccountKeys,
};

use crate::tx_utils::send_or_sim_tx;

use super::SubcmdExec;

#[derive(Args, Debug)]
#[command(long_about = "Deactivates stake account from the liquidity pool")]
pub struct DeactivateStakeAccountArgs {
    #[arg(help = "Pubkey of the liquidity pool to deactivate stake account from")]
    pool_account: String,
    #[arg(help = "Pubkey of the stake account to deactivate from liquidity pool")]
    stake_account: String,
}

impl SubcmdExec for DeactivateStakeAccountArgs {
    fn process_cmd(&self, args: &crate::Args) {
        let payer = args.config.signer();
        let client = args.config.rpc_client();

        let pool_account = Pubkey::from_str(&self.pool_account).unwrap();
        let pool_sol_reserves = Pubkey::find_program_address(&[&pool_account.to_bytes()], &ID);

        let stake_account = Pubkey::from_str(&self.stake_account).unwrap();

        let ix = deactivate_stake_account_ix(
            DeactivateStakeAccountKeys {
                pool_account,
                pool_sol_reserves: pool_sol_reserves.0,
                clock: sysvar::clock::id(),
                stake_account,
                stake_program: solana_stake_program::id(),
            },
            DeactivateStakeAccountIxArgs {},
        )
        .unwrap();

        let payer_pk = payer.pubkey();
        let msg = Message::new(&[ix], Some(&payer_pk));
        let blockhash = client.get_latest_blockhash().unwrap();
        let tx = Transaction::new(&vec![payer], msg, blockhash);
        println!(
            "Deactivating Stake account: {}\n\
            From Liquidity pool: {}",
            pool_account, stake_account
        );
        send_or_sim_tx(args, &client, &tx);
    }
}
