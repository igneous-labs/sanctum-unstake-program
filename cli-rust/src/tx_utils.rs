use base64::Engine;
use borsh::BorshSerialize;
use solana_client::rpc_client::RpcClient;
use solana_program::{instruction::Instruction, message::Message};
use solana_sdk::{signer::Signer, transaction::Transaction};
use spl_governance::state::proposal_transaction::{AccountMetaData, InstructionData};

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

pub fn chunk_array<T>(n: usize, input_array: &[T]) -> Vec<Vec<T>>
where
    T: Clone,
{
    input_array.chunks(n).map(|chunk| chunk.to_vec()).collect()
}

pub fn batch_ixs(client: &RpcClient, payer: &dyn Signer, ixs: &[Instruction]) -> Transaction {
    let msg = Message::new(ixs, Some(&payer.pubkey()));
    let blockhash = client.get_latest_blockhash().unwrap();
    Transaction::new(&vec![payer], msg, blockhash)
}

pub fn to_realms_ix_data(ix: Instruction) -> InstructionData {
    InstructionData {
        program_id: ix.program_id,
        accounts: ix
            .accounts
            .iter()
            .map(|acc| AccountMetaData {
                pubkey: acc.pubkey,
                is_signer: acc.is_signer,
                is_writable: acc.is_writable,
            })
            .collect(),
        data: ix.data,
    }
}

pub fn to_base64(ix_data: &InstructionData) -> String {
    let serialized_data: Vec<u8> = ix_data.try_to_vec().unwrap();
    base64::engine::general_purpose::STANDARD.encode(serialized_data)
}
