use clap::Args;
use solana_program::pubkey::Pubkey;
use unstake::{
    instructions::SetFlashLoanFee as SetFlashLoanFeeIx, state::FlashLoanFee,
    unstake::set_flash_loan_fee, ID,
};

use crate::tx_utils::send_or_sim_tx;

use super::SubcmdExec;

#[derive(Args, Debug)]
#[command(long_about = "Set flash loan fee")]
pub struct SetFlashLoanFeeArgs {
    #[arg(help = "")]
    pool_account: Pubkey,
    #[arg(help = "")]
    flash_loan_fee_account: Pubkey,
}

impl SubcmdExec for SetFlashLoanFee {
    fn process_cmd(&self, args: &crate::Args) {
        let payer = args.config.signer();
        let client = args.config.rpc_client();
        let pool_account = self.pool_account;
        let flash_loan_fee_account = self.flash_loan_fee_account;

        let fees = FlashLoanFee {
            fee_ratio: (1, 1000),
        };

        let accounts = SetFlashLoanFeeIx {
            payer: payer.pubkey(),
            fee_authority: payer.pubkey(),
            pool_account: pool_account,
            flash_loan_fee_account: flash_loan_fee_account,
            system_program: ID,
        };

        let ix = set_flash_loan_fee(accounts, fees).unwrap();

        let msg = Message::new(&[ix], Some(&payer.pubkey()));
        let blockhash = client.get_latest_blockhash().unwrap();
        let tx = Transaction::new(&vec![payer], msg, blockhash);

        println!("Setting flash loan fee to {}",);
        send_or_sim_tx(args, &client, &tx);
    }
}
