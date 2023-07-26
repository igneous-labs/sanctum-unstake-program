use std::str::FromStr;

use anchor_lang::AccountDeserialize;
use clap::Args;
use solana_program::{
    instruction::Instruction, message::Message, native_token::sol_to_lamports, pubkey::Pubkey,
    system_program,
};
use solana_sdk::{signature::read_keypair_file, signer::Signer, transaction::Transaction};
use spl_associated_token_account::{
    get_associated_token_address, instruction::create_associated_token_account,
};
use unstake::{state::Pool, ID};
use unstake_interface::{remove_liquidity_ix, RemoveLiquidityIxArgs, RemoveLiquidityKeys};

use crate::tx_utils::send_or_sim_tx;

use super::SubcmdExec;

#[derive(Args, Debug)]
#[command(long_about = "Remove SOL liquidity to a liquidity pool")]
pub struct RemoveLiquidityArgs {
    #[arg(help = "Pubkey of the liquidity pool to remove liquidity from")]
    pool_account: String,
    #[arg(help = "Amount in LP tokens to remove as liquidity")]
    amount_lp: f64,
    #[arg(
        help = "Path to the keypair authority over the LP token account. Defaults to config wallet."
    )]
    authority: Option<String>,
    #[arg(help = "LP token account to burn LP tokens from. Defaults to ATA of authority.")]
    burn_from: Option<String>,
    #[arg(help = "SOL account to return removed SOL liquidity to. Defaults to config wallet.")]
    to: Option<String>,
}

impl SubcmdExec for RemoveLiquidityArgs {
    fn process_cmd(&self, args: &crate::Args) {
        let payer = args.config.signer();
        let client = args.config.rpc_client();

        let pool_key = Pubkey::from_str(&self.pool_account).unwrap();
        let pool_data = &mut &client.get_account_data(&pool_key).unwrap()[..];
        let pool = Pool::try_deserialize(pool_data).unwrap();
        let amount_lp = self.amount_lp;
        let amount_lp_atomics = sol_to_lamports(amount_lp);

        let payer_pk = payer.pubkey();
        let mut authority = payer_pk;
        let mut signers = vec![payer];
        if let Some(auth) = self.authority.as_ref() {
            let authority_keypair = read_keypair_file(auth).unwrap();
            authority = authority_keypair.pubkey();
            signers.push(Box::new(authority_keypair));
        }

        let pool_sol_reserves = Pubkey::find_program_address(&[&pool_key.to_bytes()], &ID);

        let mut to = payer_pk;
        if let Some(to_pk) = self.to.as_ref() {
            to = Pubkey::from_str(to_pk).unwrap();
        }

        let burn_lp_tokens_from = self.burn_from.as_ref().map_or_else(
            || get_associated_token_address(&authority, &pool.lp_mint),
            |s| Pubkey::from_str(s).unwrap(),
        );

        let ix = remove_liquidity_ix(
            RemoveLiquidityKeys {
                burn_lp_tokens_from_authority: authority,
                pool_account: pool_key,
                burn_lp_tokens_from,
                to,
                lp_mint: pool.lp_mint,
                pool_sol_reserves: pool_sol_reserves.0,
                system_program: system_program::id(),
                token_program: spl_token::id(),
            },
            RemoveLiquidityIxArgs {
                amount_lp: amount_lp_atomics,
            },
        )
        .unwrap();

        if let Err(e) = client.get_account(&burn_lp_tokens_from) {
            panic!("LP token account {} does not exist", burn_lp_tokens_from);
        }

        let msg = Message::new(&[ix], Some(&payer_pk));
        let blockhash = client.get_latest_blockhash().unwrap();
        let tx = Transaction::new(&signers, msg, blockhash);
        println!(
            "{} LP tokens liquidity removed from pool at {}",
            amount_lp, pool_key,
        );
        send_or_sim_tx(args, &client, &tx);
    }
}
