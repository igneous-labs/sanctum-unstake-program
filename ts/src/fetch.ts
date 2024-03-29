import { Program } from "@project-serum/anchor";
import {
  findAllStakeAccountsByAuth,
  stakeAccountState,
} from "@soceanfi/solana-stake-sdk";
import { Commitment, PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";
import { Unstake } from "./idl/idl";
import { findPoolSolReserves, findStakeAccountRecordAccount } from "./pda";
import { LiquidityPoolStakeAccounts } from "./types";

/**
 * Fetch all stake accounts owned by a liquidity pool
 * @param program
 * @param liquidityPool
 * @param commitment
 * @returns
 */
export async function fetchLiquidityPoolStakeAccounts(
  program: Program<Unstake>,
  liquidityPool: PublicKey,
  commitment?: Commitment
): Promise<LiquidityPoolStakeAccounts> {
  const [solReserves] = await findPoolSolReserves(
    program.programId,
    liquidityPool
  );
  // TODO: check that sending both requests at the same time
  // doesnt overload RPC servers
  const [stakeAccs, currentEpoch] = await Promise.all([
    findAllStakeAccountsByAuth(
      program.provider.connection,
      { withdrawer: solReserves },
      commitment
    ),
    program.provider.connection
      .getEpochInfo(commitment)
      .then(({ epoch }) => new BN(epoch)),
  ]);

  // filter out stake accs with no stake acc records
  const stakeAccRecordKeys = await Promise.all(
    stakeAccs.map(({ accountId }) =>
      findStakeAccountRecordAccount(
        program.programId,
        liquidityPool,
        accountId
      ).then(([pubkey]) => pubkey)
    )
  );
  const stakeAccRecords =
    await program.account.stakeAccountRecord.fetchMultiple(
      stakeAccRecordKeys,
      commitment
    );
  const stakeAccsWithRecord = stakeAccs.filter((_ksa, i) =>
    Boolean(stakeAccRecords[i])
  );

  return stakeAccsWithRecord.reduce(
    (res, ksa) => {
      const state = stakeAccountState(ksa.accountInfo.data, currentEpoch);
      res[state].push(ksa);
      return res;
    },
    {
      active: [],
      inactive: [],
      activating: [],
      deactivating: [],
    } as LiquidityPoolStakeAccounts
  );
}
