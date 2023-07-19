use std::{fs, str::FromStr};

use anchor_lang::AccountDeserialize;
use clap::Args;
use solana_program::{message::Message, native_token::sol_to_lamports, pubkey::Pubkey};
use solana_sdk::{
    signature::{read_keypair_file, Keypair},
    signer::Signer,
    transaction::Transaction,
};
use unstake::{
    accounts::RemoveLiquidity as RemoveLiquidityAccounts, state::Pool, unstake::remove_liquidity,
};

use super::SubcmdExec;

#[derive(Args, Debug)]
#[command(long_about = "Remove SOL liquidity to a liquidity pool")]
pub struct RemoveLiquidityArgs {
    #[arg(help = "Pubkey of the liquidity pool to remove liquidity from")]
    pool_account: String,
    #[arg(help = "Amount in LP tokens to remove as liquidity")]
    amount_lp: f64,
    #[arg(help = "Path to the keypair authority over the LP token account")]
    authority: Option<String>,
    #[arg(help = "LP token account to burn LP tokens from")]
    burn_from: Option<String>,
    #[arg(help = "SOL account to return removed SOL liquidity to")]
    to: Option<String>,
}

impl SubcmdExec for RemoveLiquidityArgs {
    fn process_cmd(&self, args: &crate::Args) {
        let payer = args.config.signer();
        let client = args.config.rpc_client();

        let pool_key = Pubkey::from_str(&self.pool_account).unwrap();
        let pool_account = client.get_account(&pool_key).unwrap();
        let pool = Pool::try_deserialize(&mut pool_account.data.as_slice()).unwrap();

        let amount_lp = self.amount_lp;
        let amount_lp_atomics = sol_to_lamports(amount_lp);

        let mut authority = payer.pubkey();
        let signers: Vec<Keypair> = vec![];
        if self.authority.is_some() {
            let authority_keypair = read_keypair_file(&self.authority.unwrap()).unwrap();
            signers.push(authority_keypair);
            authority = authority_keypair.pubkey();
        }

        let ix = remove_liquidity(
            RemoveLiquidityAccounts {
                burn_lp_tokens_from_authority: authority,
                pool_account: pool_key,
                burn_lp_tokens_from: Pubkey::from_str(&self.burn_from.unwrap()).unwrap(),
                to: Pubkey::from_str(&self.to.unwrap()).unwrap(),
                lp_mint: pool.lp_mint,
                pool_sol_reserves: todo!(),
                system_program: todo!(),
                token_program: todo!(),
            },
            amount_lp_atomics,
        )
        .unwrap();

        let msg = Message::new(&[ix], Some(&payer.pubkey()));
        let blockhash = client.get_latest_blockhash().unwrap();
        let tx = Transaction::new(&signers.iter().collect(), msg, blockhash);
        let sig = client.send_and_confirm_transaction(&tx).unwrap();
        println!(
            "{} LP tokens liquidity removed from pool at {}",
            amount_lp,
            pool_key.to_string(),
        );
        println!("TX: {}", sig);
    }
}
