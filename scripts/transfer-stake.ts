import {
  Connection,
  clusterApiUrl,
  PublicKey,
  sendAndConfirmTransaction,
  StakeProgram,
} from "@solana/web3.js";
import { keypairFromFile } from "../tests/utils";

// TODO: fill in
const STAKE_ACC_TO_TRANSFER = new PublicKey("");
const NEW_AUTHORITY = new PublicKey("");

const CONN = new Connection(clusterApiUrl("devnet"));
const WALLET_PATH = "~/.config/solana/id.json";

async function main() {
  const wallet = keypairFromFile(WALLET_PATH);
  const tx = StakeProgram.authorize({
    stakePubkey: STAKE_ACC_TO_TRANSFER,
    authorizedPubkey: wallet.publicKey,
    newAuthorizedPubkey: NEW_AUTHORITY,
    stakeAuthorizationType: {
      index: 0,
    },
  });
  tx.add(
    StakeProgram.authorize({
      stakePubkey: STAKE_ACC_TO_TRANSFER,
      authorizedPubkey: wallet.publicKey,
      newAuthorizedPubkey: NEW_AUTHORITY,
      stakeAuthorizationType: {
        index: 1,
      },
    })
  );
  const sig = await sendAndConfirmTransaction(CONN, tx, [wallet]);
  console.log("TX:", sig);
}

main();
