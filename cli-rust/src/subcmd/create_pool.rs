use clap::Args;

use solana_program::{message::Message, pubkey::Pubkey, system_program, sysvar};
use solana_sdk::{
    signature::{read_keypair_file, Keypair},
    signer::Signer,
    transaction::Transaction,
};
use unstake::{state::FEE_SEED_SUFFIX, ID};
use unstake_interface::{create_pool_ix, CreatePoolIxArgs, CreatePoolKeys};

use crate::utils::convert_fee;

use super::SubcmdExec;

macro_rules! unique_signers {
    ($vec:ident) => {
        $vec.sort_by_key(|l| l.pubkey());
        $vec.dedup();
    };
}

#[derive(Args, Debug)]
#[command(long_about = "Create a new unstake liquidity pool")]
pub struct CreatePoolArgs {
    #[arg(
        help = "Path to JSON file defining liquidity pool's fee settings. Example contents:\n\
        '{ \"liquidity_linear\": { \"max_liq_remaining\": 0.003, \"zero_liq_remaining\": 0.03 }}\n\
        '{ \"flat\": 0.01 }'"
    )]
    fee_path: String,
    #[arg(
        help = "Path to keypair actings as the pool's fee authority. Defaults to wallet in config."
    )]
    fee_authority: Option<String>,
    #[arg(
        help = "Path to keypair that will be the pool's address. Defaults to randomly generated keypair."
    )]
    pool_account: Option<String>,
    #[arg(
        help = "Path to keypair that will be the pool's LP mint address. Defaults to randomly generated keypair."
    )]
    lp_mint: Option<String>,
}

impl SubcmdExec for CreatePoolArgs {
    fn process_cmd(&self, args: &crate::Args) {
        let payer = args.config.signer();
        let client = args.config.rpc_client();

        let fee = convert_fee(&self.fee_path);

        println!("Fee: {:?}", fee);

        let [pool_kp, lp_mint_kp] = [&self.pool_account, &self.lp_mint].map(|opt| {
            opt.as_ref()
                .map_or_else(Keypair::new, |path| read_keypair_file(path).unwrap())
        });
        let pool_sol_reserves = Pubkey::find_program_address(&[&pool_kp.pubkey().to_bytes()], &ID);
        let fee_account =
            Pubkey::find_program_address(&[&pool_kp.pubkey().to_bytes(), FEE_SEED_SUFFIX], &ID);
        let payer_pk = payer.pubkey();

        let mut accounts = CreatePoolKeys {
            pool_account: pool_kp.pubkey(),
            lp_mint: lp_mint_kp.pubkey(),
            fee_authority: payer.pubkey(),
            payer: payer_pk,
            fee_account: fee_account.0,
            pool_sol_reserves: pool_sol_reserves.0,
            system_program: system_program::id(),
            token_program: spl_token::id(),
            rent: sysvar::rent::id(),
        };
        let mut signers = vec![payer, Box::new(pool_kp), Box::new(lp_mint_kp)];
        if let Some(path) = self.fee_authority.as_ref() {
            let new_fee_auth = read_keypair_file(path).unwrap();
            accounts.fee_authority = new_fee_auth.pubkey();
            signers.push(Box::new(new_fee_auth));
        }
        unique_signers!(signers);

        let ix = create_pool_ix(accounts, CreatePoolIxArgs { fee }).unwrap();
        let msg = Message::new(&[ix], Some(&payer_pk));
        let blockhash = client.get_latest_blockhash().unwrap();
        let tx = Transaction::new(&signers, msg, blockhash);
        let sig = client.send_and_confirm_transaction(&tx).unwrap();
        println!(
            "Liquidity pool initialized at {}\n\
           LP mint: {}\n\
           Fee authority: {}",
            accounts.pool_account, accounts.lp_mint, accounts.fee_authority
        );
        println!("TX: {}", sig);
    }
}
