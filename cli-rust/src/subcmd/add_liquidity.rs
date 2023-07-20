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
use unstake::{state::Pool, ID};
use unstake_interface::{add_liquidity_ix, AddLiquidityIxArgs, AddLiquidityKeys};

use super::SubcmdExec;

#[derive(Args, Debug)]
#[command(long_about = "Adds SOL liquidity to a liquidity pool")]
pub struct AddLiquidityArgs {
    #[arg(help = "Pubkey of the liquidity pool to add liquidity to")]
    pool_account: String,
    #[arg(help = "Amount in SOL to add as liquidity")]
    amount_sol: f64,
    #[arg(help = "Path to the SOL keypair to add liquidity from. Defaults to wallet in config")]
    from: Option<String>,
    #[arg(help = "LP token account to mint LP tokens to. Defaults to ATA of `from`")]
    mint_lp_tokens_to: Option<String>,
}

impl SubcmdExec for AddLiquidityArgs {
    fn process_cmd(&self, args: &crate::Args) {
        let payer = args.config.signer();
        let client = args.config.rpc_client();

        let pool_key = Pubkey::from_str(&self.pool_account).unwrap();
        let pool_account = client.get_account(&pool_key).unwrap();
        let pool_data = &mut &pool_account.data[..];
        let pool = Pool::try_deserialize(pool_data).unwrap();
        let amount_sol = self.amount_sol;
        let amount_lamports = sol_to_lamports(amount_sol);

        let payer_pk = payer.pubkey();
        let mut from = payer_pk;
        let mut signers = vec![payer];
        if self.from.is_some() {
            let from_keypair = read_keypair_file(self.from.clone().unwrap()).unwrap();
            from = from_keypair.pubkey();
            signers.push(Box::new(from_keypair));
        }

        let from_ata = get_associated_token_address(&from, &pool.lp_mint);
        let mint_lp_tokens_to = Pubkey::from_str(
            &self
                .mint_lp_tokens_to
                .clone()
                .unwrap_or(from_ata.to_string()),
        )
        .unwrap();

        let pool_sol_reserves = Pubkey::find_program_address(&[&pool_key.to_bytes()], &ID);

        let ix = add_liquidity_ix(
            AddLiquidityKeys {
                from,
                pool_account: pool_key,
                mint_lp_tokens_to,
                lp_mint: pool.lp_mint,
                system_program: system_program::id(),
                token_program: spl_token::id(),
                pool_sol_reserves: pool_sol_reserves.0,
            },
            AddLiquidityIxArgs {
                amount: amount_lamports,
            },
        )
        .unwrap();

        let mut instructions: Vec<Instruction> = vec![ix];

        if let Err(e) = client.get_account(&mint_lp_tokens_to) {
            if !mint_lp_tokens_to.eq(&from_ata) {
                panic!("LP token account {} does not exist", mint_lp_tokens_to);
            }

            println!(
                "LP token account {} does not exist, creating...",
                mint_lp_tokens_to
            );

            instructions.insert(
                0,
                create_associated_token_account(&payer_pk, &from, &pool.lp_mint, &spl_token::id()),
            )
        }

        let msg = Message::new(&instructions, Some(&payer_pk));
        let blockhash = client.get_latest_blockhash().unwrap();
        let tx = Transaction::new(&signers, msg, blockhash);
        let sig = client.send_and_confirm_transaction(&tx).unwrap();
        println!("{} SOL liquidity added to pool at {}", amount_sol, pool_key);
        println!("TX: {}", sig);
    }
}
