import { Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { Unstake } from "./idl/idl";
import { UnstakeAccounts, unstakeTx } from "./transactions";

/**
 * Previews the amount of SOL to be received from unstaking a given stake account
 * @param program
 * @param accounts
 * @returns the change in lamports to the `destination` account, caused by the unstake
 *           + possibly rent & transaction fees if `destination === payer`
 * @throws the `TransactionError` thrown by the simulated tx if it fails
 * @throws generic `Error` if unable to retrieve simulation results but no `TransactionError` thrown
 */
export async function previewUnstake(
  program: Program<Unstake>,
  accounts: UnstakeAccounts
): Promise<number> {
  const payer = accounts.payer ?? accounts.unstaker;
  const destination = accounts.destination ?? accounts.unstaker;
  const destinationPk = new PublicKey(destination);
  const tx = await unstakeTx(program, accounts);
  tx.feePayer = new PublicKey(payer);
  const [
    destinationPreLamports,
    {
      value: { accounts: accountsPost, err },
    },
  ] = await Promise.all([
    program.provider.connection.getBalance(destinationPk),
    program.provider.connection.simulateTransaction(tx, undefined, [
      destinationPk,
    ]),
  ]);
  if (!accountsPost || !accountsPost[0]) {
    if (err) {
      throw err;
    }
    throw new Error("Could not retrieve post-simulation accounts result");
  }
  const destinationPost = accountsPost[0];
  return destinationPost.lamports - destinationPreLamports;
}
