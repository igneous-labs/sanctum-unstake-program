use std::str::FromStr;

use clap::Args;
use solana_program::pubkey::Pubkey;
use unstake::{
    accounts::SetFlashLoanFee as SetFlashLoanFeeAccounts, rational::Rational, state::FlashLoanFee,
    unstake::set_flash_loan_fee, ID,
};

use super::SubcmdExec;

#[derive(Args, Debug)]
#[command(long_about = "Set flash loan fee")]
pub struct SetFlashLoanFeeArgs {
    #[arg(help = "")]
    pool_account: String,
    #[arg(help = "")]
    flash_loan_fee_account: String,
}

impl SubcmdExec for SetFlashLoanFeeArgs {
    fn process_cmd(&self, args: &crate::Args) {
        let payer = args.config.signer();
        let client = args.config.rpc_client();
        let pool_account = Pubkey::from_str(&self.pool_account).unwrap();
        let flash_loan_fee_account = Pubkey::from_str(&self.flash_loan_fee_account).unwrap();

        let fees = FlashLoanFee {
            fee_ratio: Rational {
                num: 1,
                denom: 1000,
            },
        };

        let tx = set_flash_loan_fee(
            SetFlashLoanFeeAccounts {
                payer: payer.pubkey(),
                fee_authority: payer.pubkey(),
                pool_account,
                flash_loan_fee_account,
                system_program: ID,
            },
            fees,
        )
        .unwrap();

        let sig = client.send_and_confirm_transaction(&tx).unwrap();
        println!("Flash loan fee set to {}", flash_loan_fee_account);
        println!("TX: {}", sig);
    }
}
