use std::collections::HashMap;

use clap::Args;

use solana_program::{message::Message, pubkey::Pubkey, system_program, sysvar};
use solana_sdk::{
    signature::{read_keypair_file, Keypair},
    signer::Signer,
    transaction::Transaction,
};
use unstake::{state::FEE_SEED_SUFFIX, ID};
use unstake_interface::{create_pool_ix, CreatePoolIxArgs, CreatePoolKeys};

use crate::utils::convert_fee;

use super::SubcmdExec;

#[derive(Args, Debug)]
#[command(long_about = "Create a new unstake liquidity pool")]
pub struct CreatePoolArgs {
    #[arg(
        help = "Path to JSON file defining liquidity pool's fee settings. Example contents:\n\
        '{ \"liquidity_linear\": { \"max_liq_remaining\": 0.003, \"zero_liq_remaining\": 0.03 }}\n\
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

        let fee = convert_fee(&self.fee_path);

        println!("Fee: {:?}", fee);

        let pool_account_default = Keypair::new();
        let pool_sol_reserves =
            Pubkey::find_program_address(&[&pool_account_default.pubkey().to_bytes()], &ID);
        let fee_account = Pubkey::find_program_address(
            &[&pool_account_default.pubkey().to_bytes(), FEE_SEED_SUFFIX],
            &ID,
        );
        let lp_mint_default = Keypair::new();
        let payer_pk = payer.pubkey();
        let mut accounts = CreatePoolKeys {
            fee_authority: payer_pk,
            pool_account: pool_account_default.pubkey(),
            lp_mint: lp_mint_default.pubkey(),
            payer: payer_pk,
            fee_account: fee_account.0,
            pool_sol_reserves: pool_sol_reserves.0,
            system_program: system_program::id(),
            token_program: spl_token::id(),
            rent: sysvar::rent::id(),
        };

        let mut signers = HashMap::new();
        signers.insert("payer", payer);
        signers.insert("pool_account", Box::new(pool_account_default));
        signers.insert("lp_mint", Box::new(lp_mint_default));

        let mut account_key_to_keypair_path_option = HashMap::new();
        account_key_to_keypair_path_option.insert("fee_authority", &self.fee_authority);
        account_key_to_keypair_path_option.insert("pool_account", &self.pool_account);
        account_key_to_keypair_path_option.insert("lp_mint", &self.lp_mint);
        account_key_to_keypair_path_option.insert("payer", &self.payer);

        for (account_key, option) in account_key_to_keypair_path_option {
            if option.is_some() {
                let keypair = read_keypair_file(option.clone().unwrap()).unwrap();
                match account_key {
                    "fee_authority" => {
                        accounts.fee_authority = keypair.pubkey();
                        signers.insert("fee_authority", Box::new(keypair));
                    }
                    "pool_account" => {
                        accounts.pool_account = keypair.pubkey();
                        signers.insert("pool_account", Box::new(keypair));
                    }
                    "lp_mint" => {
                        accounts.lp_mint = keypair.pubkey();
                        signers.insert("lp_mint", Box::new(keypair));
                    }
                    "payer" => {
                        accounts.payer = keypair.pubkey();
                        signers.insert("payer", Box::new(keypair));
                    }
                    _ => {}
                }
            }
        }

        let ix = create_pool_ix(accounts, CreatePoolIxArgs { fee }).unwrap();
        let signer_values: Vec<&dyn Signer> =
            signers.values().map(|boxed| boxed.as_ref()).collect();
        let msg = Message::new(&[ix], Some(&payer_pk));
        let blockhash = client.get_latest_blockhash().unwrap();
        let tx = Transaction::new(&signer_values, msg, blockhash);
        let sig = client.send_and_confirm_transaction(&tx).unwrap();
        println!(
            "Liquidity pool initialized at {}\n\
           LP mint: {}\n\
           Fee authority: {}",
            accounts.pool_account, accounts.lp_mint, accounts.fee_authority
        );
        println!("TX: {:#?}", sig);
    }
}
