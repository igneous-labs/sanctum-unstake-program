use clap::Args;
use solana_program::{pubkey::Pubkey, system_program};
use solana_sdk::transaction::Transaction;
use unstake::{state::PROTOCOL_FEE_SEED, ID};
use unstake_interface::{init_protocol_fee_ix, InitProtocolFeeKeys};

use crate::tx_utils::send_or_sim_tx;

use super::SubcmdExec;

#[derive(Args, Debug)]
#[command(long_about = "Initializes the protocol fee for the program")]
pub struct InitProtocolFeeArgs {}

impl SubcmdExec for InitProtocolFeeArgs {
    fn process_cmd(&self, args: &crate::Args) {
        let payer = args.config.signer();
        let client = args.config.rpc_client();

        let protocol_fee_account = Pubkey::find_program_address(&[PROTOCOL_FEE_SEED], &ID);

        let ix = init_protocol_fee_ix(InitProtocolFeeKeys {
            payer: payer.pubkey(),
            protocol_fee_account: protocol_fee_account.0,
            system_program: system_program::id(),
        })
        .unwrap();

        let blockhash = client.get_latest_blockhash().unwrap();
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&payer.pubkey()),
            &[payer.as_ref()],
            blockhash,
        );
        println!("Protocol fee initialized at {}", protocol_fee_account.0);
        send_or_sim_tx(args, &client, &tx);
    }
}
