import {
  Connection,
  clusterApiUrl,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  StakeProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { airdrop, keypairFromFile, sleep } from "../tests/utils";

const STAKE_ACCS_TO_CREATE = 10;
const MAX_AIRDROPS_BEFORE_STAKE = 3;

const AIRDROP_COOLDOWN_MS = 2000;
const MAX_AIRDROP_AMT_SOL = 1.0;
const MIN_STAKE_SOL = 0.00228289;
const MIN_STAKE_LAMPORTS = MIN_STAKE_SOL * LAMPORTS_PER_SOL;
const BALANCE_BUFFER = 2 * MIN_STAKE_SOL;

const CONN = new Connection(clusterApiUrl("devnet"));
const WALLET_PATH = "~/.config/solana/id.json";

async function main() {
  const wallet = keypairFromFile(WALLET_PATH);
  const allVoteAccs = await CONN.getVoteAccounts()
    .then(({ current, delinquent }) => current.concat(delinquent))
    .then((arr) => arr.map((info) => info.votePubkey));

  for (let i = 0; i < STAKE_ACCS_TO_CREATE; i++) {
    // airdrop
    const nAirdrops = 1 + Math.floor(Math.random() * MAX_AIRDROPS_BEFORE_STAKE);
    for (let j = 0; j < nAirdrops; j++) {
      await airdrop(CONN, wallet.publicKey, MAX_AIRDROP_AMT_SOL);
      await sleep(AIRDROP_COOLDOWN_MS);
    }

    const stakeKeypair = Keypair.generate();
    const votePubkey = new PublicKey(
      allVoteAccs[Math.floor(Math.random() * allVoteAccs.length)]
    );
    const balanceLamports = await CONN.getBalance(wallet.publicKey);
    const stakeLamports = Math.round(
      MIN_STAKE_LAMPORTS +
        Math.random() * (balanceLamports - BALANCE_BUFFER - MIN_STAKE_LAMPORTS)
    );
    const tx = StakeProgram.createAccount({
      fromPubkey: wallet.publicKey,
      stakePubkey: stakeKeypair.publicKey,
      authorized: {
        staker: wallet.publicKey,
        withdrawer: wallet.publicKey,
      },
      lamports: stakeLamports,
    });
    tx.add(
      StakeProgram.delegate({
        stakePubkey: stakeKeypair.publicKey,
        authorizedPubkey: wallet.publicKey,
        votePubkey,
      })
    );
    await sendAndConfirmTransaction(CONN, tx, [wallet, stakeKeypair], {
      skipPreflight: true,
    });
    console.log("Setup stake acc", stakeKeypair.publicKey.toString());
  }
}

main();
