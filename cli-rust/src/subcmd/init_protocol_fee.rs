use std::fs;

use clap::Args;
use solana_program::pubkey::Pubkey;
use unstake::{
    accounts::InitProtocolFee as InitProtocolFeeAccounts, state::PROTOCOL_FEE_SEED,
    unstake::init_protocol_fee, ID,
};

use super::SubcmdExec;

#[derive(Args, Debug)]
#[command(long_about = "Initializes the protocol fee for the program")]
pub struct InitProtocolFeeArgs {}

impl SubcmdExec for InitProtocolFee {
    fn process_cmd(&self, args: &crate::Args) {
        let payer = args.config.signer();
        let client = args.config.rpc_client();

        let protocol_fee_account = Pubkey::find_program_address(PROTOCOL_FEE_SEED, &ID);

        let tx = init_protocol_fee(InitProtocolFeeAccounts {
            payer: payer.pubkey(),
            protocol_fee_account,
            system_program: ID,
        })
        .unwrap();

        let sig = client.send_and_confirm_transaction(&tx).unwrap();
        println!("Protocol fee initialized at {}", protocol_fee_account.0);
        println!("TX: {}", sig);
    }
}
