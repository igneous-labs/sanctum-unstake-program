use solana_client::rpc_client::RpcClient;
use solana_sdk::{signer::Signer, transaction::Transaction};

pub fn send_or_sim_tx(args: &crate::Args, rpc_client: &RpcClient, tx: &Transaction) {
    if args.dry_run {
        let result = rpc_client.simulate_transaction(tx).unwrap();
        println!("Simulate result: {:?}", result);
    } else {
        let signature = rpc_client.send_transaction(tx).unwrap();
        println!("Signature: {}", signature);
    }
}

pub fn unique_signers(vec: &mut Vec<Box<dyn Signer>>) {
    vec.sort_by_key(|l| l.pubkey());
    vec.dedup_by(|a, b| a.pubkey() == b.pubkey());
}
