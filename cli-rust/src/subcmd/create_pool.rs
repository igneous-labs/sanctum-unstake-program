use std::fs;

use clap::Args;
use solana_program::{message::Message, pubkey::Pubkey};
use solana_sdk::{
    signature::{read_keypair_file, Keypair},
    transaction::Transaction,
};
use unstake::{
    accounts::CreatePool as CreatePoolAccs,
    state::{Fee, Pool},
    unstake::create_pool,
};

use super::SubcmdExec;

#[derive(Serialize, Deserialize)]
struct AccountKeyToKeypairPathOption {
    fee_authority: String,
    pool_account: String,
    lp_mint: String,
    payer: String,
}

struct Signers {
    pool_account: String,
    lp_mint: String,
}

#[derive(Args, Debug)]
#[command(long_about = "Create a new unstake liquidity pool")]
pub struct CreatePoolArgs {
    #[arg(
        help = "Path to JSON file defining liquidity pool's fee settings. Example contents:\n\
        '{ \"liquidityLinear\": { \"maxLiqRemaining\": 0.003, \"zeroLiqRemaining\": 0.03 }}\n\
        '{ \"flat\": 0.01 }'"
    )]
    fee_path: String,
    #[arg(help = "Path to keypair paying for the pool's rent and tx fees")]
    payer: Option<String>,
    #[arg(help = "Path to keypair actings as the pool's fee authority")]
    fee_authority: Option<String>,
    #[arg(help = "Path to keypair that will be the pool's address")]
    pool_account: Option<String>,
    #[arg(help = "Path to keypair that will be the pool's LP mint address")]
    lp_mint: Option<String>,
}

impl SubcmdExec for CreatePool {
    fn process_cmd(&self, args: &crate::Args) {
        let payer = args.config.signer();
        let client = args.config.rpc_client();

        let fee_file = fs::File::open(self.fee_path).unwrap();
        let fee = serde_json::from_reader(fee_file).unwrap();

        println!("Fee: {:#?}", fee);

        let pool_account_default = Keypair::new();
        let lp_mint_default = Keypair::new();
        let mut accounts = CreatePoolAccs {
            fee_account: !todo(),
            pool_sol_reserves: !todo(),
            rent: !todo(),
            system_program: !todo(),
            token_program: !todo(),
            fee_authority: payer.pubkey(),
            pool_account: pool_account_default,
            lp_mint: lp_mint_default,
            payer: payer.pubkey(),
        };

        let mut signers = Signers {
            pool_account: pool_account_default,
            lp_mint: lp_mint_default,
        };

        let account_key_to_keypair_path_option = AccountKeyToKeypairPathOption {
            fee_authority: self.fee_authority,
            pool_account: self.pool_account,
            lp_mint: self.lp_mint,
            payer: self.payer,
        };

        for (account_key, option) in account_key_to_keypair_path_option.iter() {
            if Some(option) {
                let keypair = read_keypair_file(option).unwrap();
                accounts[account_key] = keypair.pubkey();
                signers[account_key] = keypair;
            }
        }

        let ix = create_pool(accounts, fee).unwrap();
        let signer_values: Vec<&Keypair> = signers.values().collect();
        let msg = Message::new(&[ix], Some(&payer.pubkey()));
        let blockhash = client.get_latest_blockhash().unwrap();
        let tx = Transaction::new(&signer_values, msg, blockhash);
        let sig = client.send_and_confirm_transaction(&tx).unwrap();
        println!(
            "Liquidity pool initialized at {}\n\
           LP mint: {}\n\
           Fee authority: {}",
            pool_account.to_string(),
            lp_mint.to_string(),
            fee_authority.to_string()
        );
        println!("TX: {}", sig);
    }
}
