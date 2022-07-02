import BN from "bn.js";

export type ApplyFeeArgs = {
  /**
   * pool.incomingStake
   */
  poolIncomingStake: BN;

  /**
   * pool_sol_reserves.lamports
   */
  solReservesLamports: BN;

  /**
   * lamports of stake account to be unstaked
   */
  stakeAccountLamports: BN;
};
