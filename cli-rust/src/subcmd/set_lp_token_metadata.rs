use std::str::FromStr;

use anchor_lang::AccountDeserialize;
use clap::Args;

use solana_program::{message::Message, pubkey::Pubkey, system_program, sysvar};
use solana_sdk::{signature::read_keypair_file, signer::Signer, transaction::Transaction};
use unstake::{state::Pool, ID};
use unstake_interface::{
    set_lp_token_metadata_ix, DataV2LpToken, SetLpTokenMetadataIxArgs, SetLpTokenMetadataKeys,
};

use crate::tx_utils::send_or_sim_tx;

use super::SubcmdExec;

#[derive(Args, Debug)]
#[command(long_about = "Sets liquidity token metadata")]
pub struct SetLpTokenMetadataArgs {
    #[arg(help = "Pubkey of the liquidity pool to set token metadata for")]
    pool_account: String,
    #[arg(help = "Name of the token to set metadata for")]
    symbol: String,
    #[arg(help = "Symbol for the token to set metadata for")]
    name: String,
    #[arg(help = "URI pointing to JSON representing the token to set metadata for")]
    uri: String,
    #[arg(
        help = "Path to keypair actings as the pool's fee authority. Defaults to wallet in config."
    )]
    fee_authority: Option<String>,
}

impl SubcmdExec for SetLpTokenMetadataArgs {
    fn process_cmd(&self, args: &crate::Args) {
        let payer = args.config.signer();
        let client = args.config.rpc_client();

        let pool_pk = Pubkey::from_str(&self.pool_account).unwrap();
        let pool_data = &mut &client.get_account_data(&pool_pk).unwrap()[..];
        let pool = Pool::try_deserialize(pool_data).unwrap();
        let pool_sol_reserves = Pubkey::find_program_address(&[&pool_pk.to_bytes()], &ID);

        let payer_pk = payer.pubkey();
        let mut signers = vec![payer];
        let mut fee_authority = payer_pk;
        if let Some(auth) = self.fee_authority.as_ref() {
            let fee_authority_keypair = read_keypair_file(auth).unwrap();
            fee_authority = fee_authority_keypair.pubkey();
            signers.push(Box::new(fee_authority_keypair));
        }

        let metadata =
            Pubkey::find_program_address(&[&pool_pk.to_bytes()], &mpl_token_metadata::id());

        let ix = set_lp_token_metadata_ix(
            SetLpTokenMetadataKeys {
                pool_account: pool_pk,
                pool_sol_reserves: pool_sol_reserves.0,
                fee_authority,
                lp_mint: pool.lp_mint,
                metadata: metadata.0,
                metadata_program: mpl_token_metadata::id(),
                payer: payer_pk,
                rent: sysvar::rent::id(),
                system_program: system_program::id(),
            },
            SetLpTokenMetadataIxArgs {
                data: DataV2LpToken {
                    symbol: self.symbol.clone(),
                    name: self.name.clone(),
                    uri: self.uri.clone(),
                },
            },
        )
        .unwrap();

        let msg = Message::new(&[ix], Some(&payer_pk));
        let blockhash = client.get_latest_blockhash().unwrap();
        let tx = Transaction::new(&signers, msg, blockhash);
        println!(
            "Set Metadata for Token: {} – {} – {}\n\
                For Liquidity pool: {}",
            self.symbol, self.name, self.uri, pool_pk
        );
        send_or_sim_tx(args, &client, &tx);
    }
}
