import { Program } from "@project-serum/anchor";
import { Unstake } from "./idl/idl";
import { UnstakeAccounts, unstakeTx } from "./transactions";

/**
 *
 * @param program
 * @param accounts
 * @returns the change in lamports to the `destination` account, caused by the unstake + possibly rent & tx fees
 */
export async function previewUnstake(
  program: Program<Unstake>,
  accounts: UnstakeAccounts
): Promise<number> {
  const destination = accounts.destination ?? accounts.unstaker;
  const startingLamports = await program.provider.connection.getBalance(
    destination
  );
  const tx = await unstakeTx(program, accounts);
  const {
    value: {
      accounts: [destinationPost],
    },
  } = await program.provider.connection.simulateTransaction(tx, undefined, [
    destination,
  ]);
  return destinationPost.lamports - startingLamports;
}
