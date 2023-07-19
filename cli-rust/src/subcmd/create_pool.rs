use std::collections::HashMap;

use clap::Args;
use solana_program::{message::Message, system_program};
use solana_sdk::{
    signature::{read_keypair_file, Keypair},
    signer::Signer,
    transaction::Transaction,
};
use unstake::{accounts::CreatePool as CreatePoolAccs, state::Fee, unstake::create_pool};

use super::SubcmdExec;

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

impl SubcmdExec for CreatePoolArgs {
    fn process_cmd(&self, args: &crate::Args) {
        let payer = args.config.signer();
        let client = args.config.rpc_client();

        let fee_string = std::fs::read_to_string(self.fee_path).unwrap();
        // how do i read this from file?
        let fee: Fee = serde_json::from_str(&fee_string).unwrap();

        println!("Fee: {:?}", fee.fee);

        let pool_account_default = Keypair::new();
        let lp_mint_default = Keypair::new();
        let mut accounts = CreatePoolAccs {
            payer: payer.pubkey(),
            fee_authority: payer.pubkey(),
            pool_account: pool_account_default.pubkey(),
            lp_mint: lp_mint_default.pubkey(),
            fee_account: payer.pubkey(),
            system_program: system_program::id(),
            token_program: spl_token::id(),
            pool_sol_reserves: todo!(),
            rent: todo!(),
        };

        let mut signers = HashMap::new();
        signers.insert("pool_account", pool_account_default);
        signers.insert("lp_mint", lp_mint_default);

        let mut account_key_to_keypair_path_option = HashMap::new();
        account_key_to_keypair_path_option.insert("fee_authority", self.fee_authority);
        account_key_to_keypair_path_option.insert("pool_account", self.pool_account);
        account_key_to_keypair_path_option.insert("lp_mint", self.lp_mint);
        account_key_to_keypair_path_option.insert("payer", self.payer);

        for (account_key, option) in &account_key_to_keypair_path_option {
            match option {
                Some(option) => {
                    let keypair = read_keypair_file(option).unwrap();
                    match account_key {
                        &"fee_authority" => {
                            accounts.fee_authority = keypair.pubkey();
                            signers.insert("fee_authority", keypair);
                        }
                        &"pool_account" => {
                            accounts.pool_account = keypair.pubkey();
                            signers.insert("pool_account", keypair);
                        }
                        &"lp_mint" => {
                            accounts.lp_mint = keypair.pubkey();
                            signers.insert("lp_mint", keypair);
                        }
                        &"payer" => {
                            accounts.payer = keypair.pubkey();
                            signers.insert("payer", keypair);
                        }
                        _ => {}
                    }
                }
                _ => {}
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
            accounts.pool_account.to_string(),
            accounts.lp_mint.to_string(),
            accounts.fee_authority.to_string()
        );
        println!("TX: {}", sig);
    }
}
