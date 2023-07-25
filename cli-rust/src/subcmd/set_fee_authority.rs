use std::str::FromStr;

use clap::Args;
use solana_program::{message::Message, pubkey::Pubkey};
use solana_sdk::{signature::read_keypair_file, signer::Signer, transaction::Transaction};
use unstake_interface::{set_fee_authority_ix, SetFeeAuthorityIxArgs, SetFeeAuthorityKeys};

use crate::tx_utils::send_or_sim_tx;

use super::SubcmdExec;

#[derive(Args, Debug)]
#[command(long_about = "Sets the fee authority for an unstake liquidity pool")]
pub struct SetFeeAuthorityArgs {
    #[arg(help = "Pubkey of the pool to set the fee of")]
    pool_account: String,
    #[arg(help = "Pubkey that is to be the pool's new fee authority")]
    new_fee_authority: String,
    #[arg(help = "Path to keypair that is the pool's current fee authority")]
    fee_authority: Option<String>,
}

impl SubcmdExec for SetFeeAuthorityArgs {
    fn process_cmd(&self, args: &crate::Args) {
        let payer = args.config.signer();
        let client = args.config.rpc_client();

        let pool_account = Pubkey::from_str(&self.pool_account).unwrap();
        let new_fee_authority = Pubkey::from_str(&self.new_fee_authority).unwrap();

        let payer_pk = payer.pubkey();
        let mut signers = vec![payer];
        let mut fee_authority = payer_pk;
        if self.fee_authority.is_some() {
            let fee_authority_keypair =
                read_keypair_file(self.fee_authority.clone().unwrap()).unwrap();
            fee_authority = fee_authority_keypair.pubkey();
            signers.push(Box::new(fee_authority_keypair));
        }

        let ix = set_fee_authority_ix(
            SetFeeAuthorityKeys {
                pool_account,
                fee_authority,
                new_fee_authority,
            },
            SetFeeAuthorityIxArgs {},
        )
        .unwrap();

        let msg = Message::new(&[ix], Some(&payer_pk));
        let blockhash = client.get_latest_blockhash().unwrap();
        let tx = Transaction::new(&signers, msg, blockhash);
        send_or_sim_tx(args, &client, &tx);
        println!(
            "Liquidity pool at {} fee authority updated from {} to {}",
            pool_account, fee_authority, new_fee_authority
        );
    }
}
