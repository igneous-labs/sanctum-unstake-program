use std::str::FromStr;

use clap::Args;
use solana_program::{message::Message, pubkey::Pubkey, system_program, sysvar};
use solana_sdk::{signature::read_keypair_file, signer::Signer, transaction::Transaction};
use unstake::{state::FEE_SEED_SUFFIX, ID};
use unstake_interface::{set_fee_ix, SetFeeIxArgs, SetFeeKeys};

use crate::{tx_utils::send_or_sim_tx, utils::convert_fee};

use super::SubcmdExec;

#[derive(Args, Debug)]
#[command(long_about = "Sets the fee for an unstake liquidity pool")]
pub struct SetFeeArgs {
    #[arg(help = "Pubkey of the pool to set the fee of")]
    pool_account: String,
    #[arg(
        help = "Path to JSON file defining liquidity pool's fee settings. Example contents:\n\
      '{ \"liquidity_linear\": { \"max_liq_remaining\": 0.003, \"zero_liq_remaining\": 0.03 }}\n\
      '{ \"flat\": 0.01 }'"
    )]
    fee_path: String,
    #[arg(help = "Path to keypair that is the pool's fee authority. Defaults to config wallet")]
    fee_authority: Option<String>,
}

impl SubcmdExec for SetFeeArgs {
    fn process_cmd(&self, args: &crate::Args) {
        let payer = args.config.signer();
        let client = args.config.rpc_client();

        let fee = convert_fee(&self.fee_path);

        let pool_account = Pubkey::from_str(&self.pool_account).unwrap();

        let payer_pk = payer.pubkey();
        let mut fee_authority = payer_pk;
        let mut signers = vec![payer];
        if let Some(auth) = self.fee_authority.as_ref() {
            let fee_authority_keypair = read_keypair_file(auth).unwrap();
            fee_authority = fee_authority_keypair.pubkey();
            signers.push(Box::new(fee_authority_keypair));
        }

        let fee_account =
            Pubkey::find_program_address(&[&pool_account.to_bytes(), FEE_SEED_SUFFIX], &ID);

        let ix = set_fee_ix(
            SetFeeKeys {
                pool_account,
                fee_authority,
                system_program: system_program::id(),
                fee_account: fee_account.0,
                rent: sysvar::rent::id(),
            },
            SetFeeIxArgs { fee: fee.clone() },
        )
        .unwrap();

        let msg = Message::new(&[ix], Some(&payer_pk));
        let blockhash = client.get_latest_blockhash().unwrap();
        let tx = Transaction::new(&signers, msg, blockhash);
        println!(
            "Liquidity pool at {} fees updated to {:?}",
            pool_account, fee
        );
        send_or_sim_tx(args, &client, &tx);
    }
}
