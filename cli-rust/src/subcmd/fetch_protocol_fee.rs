use clap::Args;
use solana_program::pubkey::Pubkey;
use unstake::{state::PROTOCOL_FEE_SEED, ID};

use super::SubcmdExec;

#[derive(Args, Debug)]
#[command(long_about = "Fetches the protocol fee data for the program")]
pub struct FetchProtocolFeeArgs {}

impl SubcmdExec for FetchProtocolFeeArgs {
    fn process_cmd(&self, args: &crate::Args) {
        let payer = args.config.signer();
        let client = args.config.rpc_client();

        let protocol_fee_account = Pubkey::find_program_address(&[PROTOCOL_FEE_SEED], &ID);

        let pf = client.get_account_data(&protocol_fee_account.0).unwrap();

        println!("Protocol Fee: {:?}", pf);
    }
}
