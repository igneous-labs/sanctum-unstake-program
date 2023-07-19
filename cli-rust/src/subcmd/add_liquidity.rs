use std::str::FromStr;

use anchor_lang::AccountDeserialize;
use clap::Args;
use solana_program::instruction::Instruction;
use solana_program::{
    message::Message, native_token::sol_to_lamports, pubkey::Pubkey, system_program,
};
use solana_sdk::{signature::read_keypair_file, signer::Signer, transaction::Transaction};
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

impl SubcmdExec for AddLiquidityArgs {
    fn process_cmd(&self, args: &crate::Args) {
        let payer = args.config.signer();
        let client = args.config.rpc_client();

        let pool_key = Pubkey::from_str(&self.pool_account).unwrap();
        let mut pool_account = client.get_account(&pool_key).unwrap();
        let mut pool_data = &mut &pool_account.data[..];
        let pool = Pool::try_deserialize(pool_data).unwrap();
        let amount_sol = self.amount_sol;
        let amount_lamports = sol_to_lamports(amount_sol);

        let mut from = payer.pubkey();
        let signers = vec![];
        if self.from.is_some() {
            let from_keypair = read_keypair_file(self.from.unwrap()).unwrap();
            signers.push(from_keypair);
            from = from_keypair.pubkey();
        }

        let from_ata = get_associated_token_address(&from, &pool.lp_mint);
        let mint_lp_tokens_to =
            Pubkey::from_str(&self.mint_lp_tokens_to.unwrap_or(from_ata.to_string())).unwrap();

        let ix = add_liquidity(
            AddLiquidityAccounts {
                from,
                pool_account: pool_key,
                mint_lp_tokens_to,
                lp_mint: pool.lp_mint,
                system_program: system_program::id(),
                token_program: spl_token::id(),
                pool_sol_reserves: todo!(),
            },
            amount_lamports,
        )
        .unwrap();

        let mut instructions: Vec<Instruction> = vec![ix];

        if let Err(e) = client.get_account(&mint_lp_tokens_to) {
            if !mint_lp_tokens_to.eq(&from_ata) {
                panic!(
                    "LP token account {} does not exist",
                    mint_lp_tokens_to.to_string()
                );
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
        let mut tx = Transaction::new(&signers.iter().collect(), msg, blockhash);
        let sig = client.send_and_confirm_transaction(&tx).unwrap();
        println!(
            "{} SOL liquidity added to pool at {}",
            amount_sol,
            pool_key.to_string(),
        );
        println!("TX: {}", sig);
    }
}
