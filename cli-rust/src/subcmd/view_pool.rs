use std::str::FromStr;

use anchor_lang::AccountDeserialize;
use clap::Args;
use solana_program::{native_token::lamports_to_sol, pubkey::Pubkey};
use unstake::{
    state::{Fee, Pool, FEE_SEED_SUFFIX},
    ID,
};

use super::SubcmdExec;

#[derive(Args, Debug)]
#[command(long_about = "View details about an unstake liquidity pool")]
pub struct ViewPoolArgs {
    #[arg(help = "Pubkey of the pool")]
    pool: String,
}

impl SubcmdExec for ViewPoolArgs {
    fn process_cmd(&self, args: &crate::Args) {
        let client = args.config.rpc_client();

        let pool_pk = Pubkey::from_str(&self.pool).unwrap();
        let pool_account = client.get_account(&pool_pk).unwrap();
        let pool = Pool::try_deserialize(&mut pool_account.data.as_slice()).unwrap();

        let fee_account_pk =
            Pubkey::find_program_address(&[&pool_pk.to_bytes(), FEE_SEED_SUFFIX], &ID);
        let fee_account = client.get_account(&fee_account_pk.0).unwrap();
        let fee = Fee::try_deserialize(&mut fee_account.data.as_slice()).unwrap();

        let pool_sol_reserves = Pubkey::find_program_address(&[&pool_pk.to_bytes()], &ID);
        let liq_lamports = client.get_balance(&pool_sol_reserves.0).unwrap();

        let max_liq_lamports = pool.incoming_stake + liq_lamports;

        println!("Pool:\n{:#?}", pool);
        println!("Fee:\n{:#?}", fee);
        println!("Liquidity: {} SOL", lamports_to_sol(liq_lamports));
        println!(
            "Utilization: {} / {} ({:.4}%)",
            lamports_to_sol(pool.incoming_stake),
            lamports_to_sol(max_liq_lamports),
            100. * pool.incoming_stake as f64 / max_liq_lamports as f64
        );
    }
}
