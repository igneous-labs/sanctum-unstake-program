use std::fs;

use anchor_lang::AccountDeserialize;
use clap::Args;
use solana_program::{message::Message, native_token::sol_to_lamports, pubkey::Pubkey};
use solana_sdk::{
    signature::{read_keypair_file, Keypair},
    transaction::Transaction,
};
use spl_associated_token_account::{
    get_associated_token_address, instruction::create_associated_token_account,
};
use unstake::{
    accounts::AddLiquidity as AddLiquidityAccounts, state::Pool, unstake::add_liquidity,
};

use super::SubcmdExec;

#[derive(Args, Debug)]
#[command(long_about = "Adds SOL liquidity to a liquidity pool")]
pub struct AddLiquidityArgs {
    #[arg(help = "Pubkey of the liquidity pool to add liquidity to")]
    pool_account: String,
    #[arg(help = "Amount in SOL to add as liquidity")]
    amount_sol: f64,
    #[arg(help = "Path to the SOL keypair to add liquidity from")]
    from: Option<String>,
    #[arg(help = "LP token account to mint LP tokens to")]
    mint_lp_tokens_to: Option<String>,
}

impl SubcmdExec for AddLiquidity {
    fn process_cmd(&self, args: &crate::Args) {
        let payer = args.config.signer();
        let client = args.config.rpc_client();

        let pool_key = Pubkey(self.pool_account);
        let pool_account = client.get_account(&pool_key).unwrap();
        let pool = Pool::try_deserialize(&pool_account.data).unwrap();
        let amount_sol = self.amount_sol;
        let amount_lamports = sol_to_lamports(amount_sol);

        let mut from = payer.pubkey();
        let signers: Vec<Keypair> = vec![];
        if Some(self.from) {
            let from_keypair = read_keypair_file(from_path).unwrap();
            signers.push(from_keypair);
            from = from_keypair.pubkey();
        }

        let from_ata = get_associated_token_address(&from, &pool.lp_mint);
        let mint_lp_tokens_to = self.mint_lp_tokens_to.unwrap_or(from_ata.to_string());

        let ix = add_liquidity(
            AddLiquidityAccounts {
                from: from,
                pool_account: pool_account,
                mint_lp_tokens_to: mint_lp_tokens_to,
                lp_mint: pool.lp_mint,
                pool_sol_reserves: !todo(),
                system_program: !todo(),
                token_program: !todo(),
            },
            amount_lamports,
        )
        .unwrap();

        let mut instructions = vec![ix];

        if let Err(e) = client.get_account(&mint_lp_tokens_to) {
            if !mint_lp_tokens_to.eq(&from_ata) {
                return Err(error!(
                    "LP token account {} does not exist",
                    mint_lp_tokens_to.to_string()
                ));
            }

            println!(
                "LP token account {} does not exist, creating...",
                mint_lp_tokens_to.to_string()
            );

            instructions.insert(
                0,
                create_associated_token_account(
                    &payer.pubkey(),
                    &mint_lp_tokens_to,
                    &from,
                    &pool.lp_mint,
                ),
            )
        }

        let msg = Message::new(&instructions, Some(&payer.pubkey()));
        let blockhash = client.get_latest_blockhash().unwrap();
        let tx = Transaction::new(&signers, msg, blockhash);
        let sig = client.send_and_confirm_transaction(&tx).unwrap();
        println!(
            "{} SOL liquidity added to pool at {}",
            amount_sol,
            pool_key.to_string(),
        );
        println!("TX: {}", sig);
    }
}
