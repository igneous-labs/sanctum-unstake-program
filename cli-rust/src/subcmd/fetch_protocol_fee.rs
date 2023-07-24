use borsh::BorshDeserialize;
use clap::Args;
use serde::Serialize;
use solana_program::pubkey::Pubkey;
use std::{fs, path::PathBuf};
use unstake::{state::PROTOCOL_FEE_SEED, ID};
use unstake_interface::{ProtocolFee, Rational, PROTOCOL_FEE_ACCOUNT_DISCM};

use super::SubcmdExec;

#[derive(Args, Debug)]
#[command(long_about = "Fetches the protocol fee data for the program")]
pub struct FetchProtocolFeeArgs {
    #[arg(
        short,
        long,
        value_name = "FILE",
        help = "Path to save protocol fee data in. Prints to stdin if not given."
    )]
    out_file: Option<PathBuf>,
}

// NOTE: This struct is used to force format Pubkey to Base58 for json serialization
#[derive(Debug, Serialize)]
pub struct ProtocolFeeJson {
    pub destination: String, // Base58 Pubkey
    pub authority: String,   // Base58 Pubkey
    pub fee_ratio: Rational,
    pub referrer_fee_ratio: Rational,
}

impl From<&ProtocolFee> for ProtocolFeeJson {
    fn from(protocol_fee: &ProtocolFee) -> ProtocolFeeJson {
        Self {
            destination: protocol_fee.destination.to_string(),
            authority: protocol_fee.authority.to_string(),
            fee_ratio: protocol_fee.fee_ratio.clone(),
            referrer_fee_ratio: protocol_fee.referrer_fee_ratio.clone(),
        }
    }
}

impl SubcmdExec for FetchProtocolFeeArgs {
    fn process_cmd(&self, args: &crate::Args) {
        let client = args.config.rpc_client();

        let (protocol_fee_account_pk, _) = Pubkey::find_program_address(&[PROTOCOL_FEE_SEED], &ID);
        // TODO: use log crate
        // println!("Protocol fee account pk: {}", protocol_fee_account_pk);

        let protocol_fee_account = client
            .get_account(&protocol_fee_account_pk)
            .expect("Failed to fetch protocol fee account through RPC call");
        // NOTE: not using unstake::ProtocolFee cuz AnchorSerialize is not fully compat with BorshSerialize
        let protocol_fee = ProtocolFee::try_from_slice(
            &protocol_fee_account.data.as_slice()[PROTOCOL_FEE_ACCOUNT_DISCM.len()..],
        )
        .expect("Failed to deserialize protocol fee account data");
        let json_str = serde_json::to_string(&ProtocolFeeJson::from(&protocol_fee))
            .expect("Failed to serialize protocol fee account data into Json");
        if let Some(out_file) = &self.out_file {
            fs::write(out_file, json_str)
                .expect(&format!("Unable to write to file {:?}", out_file));
        } else {
            println!("Protocol fee:\n{}", json_str);
        }
    }
}
