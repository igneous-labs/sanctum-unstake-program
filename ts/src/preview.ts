import { Program } from "@project-serum/anchor";
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
