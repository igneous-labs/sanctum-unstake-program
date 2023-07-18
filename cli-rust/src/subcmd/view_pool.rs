use anchor_lang::AccountDeserialize;
use clap::Args;
use solana_program::{native_token::lamports_to_sol, pubkey::Pubkey};
use stakedex_sdk_common::find_fee_token_acc;
use unstake::state::{Fee, Pool};

use super::SubcmdExec;

#[derive(Args, Debug)]
#[command(long_about = "View details about an unstake liquidity pool")]
pub struct ViewPoolArgs {
    #[arg(help = "Pubkey of the pool")]
    pool: Pubkey,
}

impl SubcmdExec for ViewPool {
    fn process_cmd(&self, args: &crate::Args) {
        let client = args.config.rpc_client();

        let pool_pk = Pubkey(args.pool);
        let pool_acc = client.get_account(&pool_pk).unwrap();
        let pool = Pool::try_deserialize(&pool_acc.data).unwrap();

        let fee_acc_pubkey = find_fee_token_acc(&pool_pk);
        let fee_acc = client.get_account(&fee_acc_pubkey).unwrap();

        let fee = Fee::try_deserialize(&fee_acc.data).unwrap();

        let liq_lamports = client.get_balance(&fee_acc_pubkey).unwrap();

        println!("Pool: {:#?}" pool);
        println!("Fee: {:#?}", fee);
        println!("Liquidity: {} SOL", lamports_to_sol(liq_lamports));
    }
}
