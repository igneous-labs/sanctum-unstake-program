use std::str::FromStr;

use borsh::BorshDeserialize;
use clap::Args;
use solana_program::pubkey::Pubkey;
use unstake::{state::PROTOCOL_FEE_SEED, ID};
use unstake_interface::{
    set_protocol_fee_ix, ProtocolFee, SetProtocolFeeIxArgs, SetProtocolFeeKeys,
};

use crate::tx_utils::{to_base64, to_realms_ix_data};

use super::SubcmdExec;

#[derive(Args, Debug)]
#[command(
    long_about = "Outputs a base64 encoded tx for updating the protocol fee account for use in realms"
)]
pub struct SetProtocolFeeArgs {
    #[arg(help = "System account to send protocol fee lamports to")]
    new_destination: String,

    #[arg(help = "New authority of the protocol fee account")]
    new_authority: String,
}

impl SubcmdExec for SetProtocolFeeArgs {
    fn process_cmd(&self, args: &crate::Args) {
        let client = args.config.rpc_client();
        let new_destination = Pubkey::from_str(&self.new_destination).unwrap();
        let new_authority = Pubkey::from_str(&self.new_authority).unwrap();

        let (protocol_fee_account, _) = Pubkey::find_program_address(&[PROTOCOL_FEE_SEED], &ID);
        let account = client.get_account_data(&protocol_fee_account).unwrap();
        // TODO: use later vers of solores that accounts for anchor account discriminators
        let mut pf = ProtocolFee::deserialize(&mut &account[8..]).unwrap();
        let old_auth = pf.authority;
        let old_destination = pf.destination;
        pf.authority = new_authority;
        pf.destination = new_destination;

        let ix = set_protocol_fee_ix(
            SetProtocolFeeKeys {
                authority: old_auth,
                protocol_fee_account,
            },
            SetProtocolFeeIxArgs { protocol_fee: pf },
        )
        .unwrap();

        let ix_data = to_realms_ix_data(ix);
        let ix_base64 = to_base64(&ix_data);

        println!(
            r#"
            Instruction for changing
            authority from {old_auth} to {new_authority}
            destination from {old_destination} to {new_destination}

            {ix_base64}
            "#
        );
    }
}
