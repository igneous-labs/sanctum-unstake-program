import { Program, web3 } from "@project-serum/anchor";
import { Unstake } from "./idl/idl";
import { UnstakeAccounts, unstakeIx } from "./instructions";

/**
 * Previews the amount of SOL to be received from unstaking a given stake account
 * @param program
 * @param accounts
 * @returns the change in lamports to the `destination` account, caused by the unstake
 *           + possibly rent & transaction fees if `destination === payer`
 */
export async function previewUnstake(
  program: Program<Unstake>,
  accounts: UnstakeAccounts
): Promise<number> {
  const payer = accounts.payer ?? accounts.unstaker;
  const destination = accounts.destination ?? accounts.unstaker;
  // FIXME: simulateTransaction fails with `TypeError: Cannot read properties of undefined (reading 'numRequiredSignatures')`
  // because `instanceof Transaction` check in solana/web3.js: https://github.com/solana-labs/solana-web3.js/blob/ca780d88a8d2bcdd7466b6f760ffca0e8eeff2f6/src/connection.ts#L4061
  // fails because the Transaction class used here is different from the Transaction class in anchor's node_modules.
  const tx = new web3.Transaction().add(await unstakeIx(program, accounts));
  tx.feePayer = payer;
  const [
    destinationPreLamports,
    {
      value: {
        accounts: [destinationPost],
      },
    },
  ] = await Promise.all([
    program.provider.connection.getBalance(destination),
    program.provider.connection.simulateTransaction(tx, undefined, [
      destination,
    ]),
  ]);
  return destinationPost.lamports - destinationPreLamports;
}
