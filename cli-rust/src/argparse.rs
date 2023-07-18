use std::{io, str::FromStr};

use clap2::ArgMatches;
use derive_more::{AsRef, Deref};
use solana_clap_utils::keypair::signer_from_path;
use solana_cli_config::{Config, CONFIG_FILE};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    commitment_config::{CommitmentConfig, CommitmentLevel},
    signer::Signer,
};

/// clap requires arg types to impl Clone, but solana doesnt do it
#[derive(AsRef, Debug, Deref)]
pub struct ConfigWrapper(Config);

impl Clone for ConfigWrapper {
    fn clone(&self) -> Self {
        Self(Config {
            json_rpc_url: self.0.json_rpc_url.clone(),
            websocket_url: self.0.websocket_url.clone(),
            keypair_path: self.0.keypair_path.clone(),
            address_labels: self.0.address_labels.clone(),
            commitment: self.0.commitment.clone(),
        })
    }
}

impl ConfigWrapper {
    pub fn rpc_client(&self) -> RpcClient {
        RpcClient::new_with_commitment(
            &self.json_rpc_url,
            CommitmentConfig {
                commitment: CommitmentLevel::from_str(&self.commitment).unwrap(),
            },
        )
    }

    pub fn signer(&self) -> Box<dyn Signer> {
        // Not supporting
        // - SignerSourceKind::Prompt with skip seed phrase validation since we dont allow that flag in crate::Args
        // - SignerSourceKind::Usb with confirm_key since we dont allow that flag in crate::Args
        // - SignerSourceKind::Pubkey since we dont allow SIGN_ONLY_ARG in crate::Args
        // See: https://docs.rs/solana-clap-utils/latest/src/solana_clap_utils/keypair.rs.html#752-820
        let empty_argmatches = ArgMatches::default();
        // This throws "Protocol("Unknown error")" if usb://ledger and ledger is not unlocked and on solana app
        signer_from_path(&empty_argmatches, &self.0.keypair_path, "wallet", &mut None).unwrap()
    }
}

pub fn parse_solana_cli_config_from_path(path: &str) -> Result<ConfigWrapper, io::Error> {
    let p = if path.is_empty() {
        CONFIG_FILE.as_ref().ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::Other,
                "Solana CONFIG_FILE could not identify the user's home directory",
            )
        })?
    } else {
        path
    };
    Ok(ConfigWrapper(Config::load(p)?))
}
