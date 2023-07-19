use std::{fs, str::FromStr};

use clap::Args;
use solana_program::{message::Message, pubkey::Pubkey, system_program};
use solana_sdk::{signature::read_keypair_file, signer::Signer, transaction::Transaction};
use unstake::{accounts::SetFee as SetFeeAccounts, unstake::set_fee};

use super::SubcmdExec;

#[derive(Args, Debug)]
#[command(long_about = "Sets the fee for an unstake liquidity pool")]
pub struct SetFeeArgs {
    #[arg(help = "Pubkey of the pool to set the fee of")]
    pool_account: String,
    #[arg(
        help = "Path to JSON file defining liquidity pool's fee settings. Example contents:\n\
      '{ \"liquidityLinear\": { \"maxLiqRemaining\": 0.003, \"zeroLiqRemaining\": 0.03 }}\n\
      '{ \"flat\": 0.01 }'"
    )]
    fee_path: String,
    #[arg(help = "Path to keypair that is the pool's fee authority")]
    fee_authority: Option<String>,
}

impl SubcmdExec for SetFeeArgs {
    fn process_cmd(&self, args: &crate::Args) {
        let payer = args.config.signer();
        let client = args.config.rpc_client();

        let pool_account = Pubkey::from_str(&self.pool_account).unwrap();
        let fee_file = fs::File::open(self.fee_path).unwrap();
        let fee = serde_json::from_reader(fee_file).unwrap();

        let signers = vec![];
        let mut fee_authority = payer.pubkey();
        if self.fee_authority.is_some() {
            let fee_authority_keypair = read_keypair_file(self.fee_authority.unwrap()).unwrap();
            signers.push(fee_authority_keypair);
            fee_authority = fee_authority_keypair.pubkey();
        }

        let ix = set_fee(
            SetFeeAccounts {
                pool_account,
                fee_authority,
                system_program: system_program::id(),
                fee_account: !todo(),
                rent: !todo(),
            },
            fee,
        )
        .unwrap();

        let msg = Message::new(&[ix], Some(&payer.pubkey()));
        let blockhash = client.get_latest_blockhash().unwrap();
        let tx = Transaction::new(&signers.iter().collect(), msg, blockhash);
        let sig = client.send_and_confirm_transaction(&tx).unwrap();
        println!(
            "Liquidity pool at {} fees updated to {:?}",
            pool_account.to_string(),
            fee.fee
        );
        println!("TX: {}", sig);
    }
}
