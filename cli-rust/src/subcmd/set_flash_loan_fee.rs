use std::str::FromStr;

use clap::Args;
use solana_program::{message::Message, pubkey::Pubkey, system_program};
use solana_sdk::{signature::read_keypair_file, signer::Signer, transaction::Transaction};
use unstake::{state::FLASH_LOAN_FEE_SEED_SUFFIX, ID};
use unstake_interface::{
    set_flash_loan_fee_ix, FlashLoanFee, Rational, SetFlashLoanFeeIxArgs, SetFlashLoanFeeKeys,
};

use crate::tx_utils::send_or_sim_tx;

use super::SubcmdExec;

#[derive(Args, Debug)]
#[command(long_about = "Set flash loan fee")]
pub struct SetFlashLoanFeeArgs {
    #[arg(help = "Pubkey of the pool to set the flash loan fee of")]
    pool_account: String,

    #[arg(
        help = "Path to keypair that is the pool's current fee authority. Defaults to config wallet"
    )]
    fee_authority: Option<String>,
}

impl SubcmdExec for SetFlashLoanFeeArgs {
    fn process_cmd(&self, args: &crate::Args) {
        let payer = args.config.signer();
        let client = args.config.rpc_client();
        let pool_account = Pubkey::from_str(&self.pool_account).unwrap();

        let flash_loan_fee = FlashLoanFee {
            fee_ratio: Rational {
                num: 1,
                denom: 1000,
            },
        };

        let payer_pk = payer.pubkey();
        let mut signers = vec![payer];

        let flash_loan_fee_account = Pubkey::find_program_address(
            &[&pool_account.to_bytes(), FLASH_LOAN_FEE_SEED_SUFFIX],
            &ID,
        )
        .0;

        let mut fee_authority = payer_pk;
        if let Some(fee_auth) = self.fee_authority.as_ref() {
            let fee_authority_keypair = read_keypair_file(fee_auth).unwrap();
            fee_authority = fee_authority_keypair.pubkey();
            signers.push(Box::new(fee_authority_keypair));
        }

        let ix = set_flash_loan_fee_ix(
            SetFlashLoanFeeKeys {
                payer: payer_pk,
                fee_authority,
                pool_account,
                flash_loan_fee_account,
                system_program: system_program::id(),
            },
            SetFlashLoanFeeIxArgs { flash_loan_fee },
        )
        .unwrap();

        let msg = Message::new(&[ix], Some(&payer_pk));
        let blockhash = client.get_latest_blockhash().unwrap();
        let tx = Transaction::new(&signers, msg, blockhash);
        println!("Flash loan fee set to {}", flash_loan_fee_account);
        send_or_sim_tx(args, &client, &tx);
    }
}
