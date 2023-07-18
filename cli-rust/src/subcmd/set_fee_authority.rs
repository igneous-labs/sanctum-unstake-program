use clap::Args;
use solana_program::{message::Message, pubkey::Pubkey};
use solana_sdk::{
    signature::{read_keypair_file, Keypair},
    transaction::Transaction,
};
use unstake::{accounts::SetFeeAuthority as SetFeeAuthorityAccounts, unstake::set_fee_authority};

use super::SubcmdExec;

#[derive(Args, Debug)]
#[command(long_about = "Sets the fee authority for an unstake liquidity pool")]
pub struct SetFeeAuthorityArgs {
    #[arg(help = "Pubkey of the pool to set the fee of")]
    pool_account: String,
    #[arg(help = "Pubkey that is to be the pool's new fee authority")]
    new_fee_authority: String,
    #[arg(help = "Path to keypair that is the pool's current fee authority")]
    fee_authority: Option<String>,
}

impl SubcmdExec for SetFeeAuthority {
    fn process_cmd(&self, args: &crate::Args) {
        let payer = args.config.signer();
        let client = args.config.rpc_client();

        let pool_account = Pubkey(self.pool_account);
        let new_fee_authority = Pubkey(self.new_fee_authority);

        let signers: Vec<Signer> = vec![];
        let mut fee_authority = payer.pubkey();
        if Some(self.fee_authority) {
            let fee_authority_keypair = read_keypair_file(self.fee_authority).unwrap();
            signers.push(fee_authority_keypair);
            fee_authority = fee_authority_keypair.pubkey();
        }

        let ix = set_fee_authority(SetFeeAuthorityAccounts {
            pool_account,
            fee_authority,
            new_fee_authority,
        })
        .unwrap();

        let msg = Message::new(&[ix], Some(&payer.pubkey()));
        let blockhash = client.get_latest_blockhash().unwrap();
        let tx = Transaction::new(&signers, msg, blockhash);
        let sig = client.send_and_confirm_transaction(&tx).unwrap();
        println!(
            "Liquidity pool at {} fee authority updated from {} to {}",
            pool_account.to_string(),
            fee_authority.to_string(),
            new_fee_authority.to_string()
        );
        println!("TX: {}", sig);
    }
}
