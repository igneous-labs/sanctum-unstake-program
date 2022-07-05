## High level design

- Stake accounts' worth are determined using the native `lamports` field (includes rent lamports)
- Stake accounts are just transferred directly to the pool by setting withdraw and stake authority
- In return, SOL is transferred directly to the specified destination account, minus the pool's fees
- Stake accounts with Lockup active are disallowed
- Unstaked stake accounts are deactivated and reclaimed as liquid SOL on the next epoch via permissionless cranks
- Discover stake accounts owned by the pool via getProgramAccounts to run the cranks on

## Program Accounts

### Pool

The main liquidity pool account.

| field            | type     | description                                                                                                                                                                                                                                  |
| ---------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fee_authority`  | `Pubkey` | the pubkey authorized to set the pool's fees                                                                                                                                                                                                 |
| `lp_mint`        | `Pubkey` | the pool's LP token mint                                                                                                                                                                                                                     |
| `incoming_stake` | `u64`    | the last known value of total number of lamports in stake accounts owned by the pool that have not been reclaimed yet. The total SOL owned by a pool accounted for can be calculated by taking `incoming_stake + pool_sol_reserves.lamports` |

### Fee

The account that stores the pool's fee parameters.

Located at PDA `[pool_account_pubkey, "fee"]`

Single `enum` field, `fee` that implements different fee variants:

#### Flat

Charges a flat percentage fee on all unstakes

#### LiquidityLinear

Charges a fee percentage that increases linearly as the liquiditiy in the pool is consumed.

### StakeAccountRecord

An account that stores data for the unstaked stake account that it's 1:1 associated with.

Located at PDA `[pool_account_pubkey, stake_account_pubkey]`

| field                  | type  | description                                                             |
| ---------------------- | ----- | ----------------------------------------------------------------------- |
| `lamports_at_creation` | `u64` | the total lamports in the associated stake account at time of `Unstake` |

## Other Accounts

### Pool SOL reserves

Regular system account that holds the liquid SOL used to service unstakes.

Located at PDA `[pool_account_pubkey]`

### LP token mint

Token authority set to PDA `[pool_account_pubkey]` (Pool SOL reserves)

Can be located at any keypair to enable vanity pubkeys.

Initialized on `CreatePool`.

### Unstaked stake accounts

Unstaked stake accounts that are owned by the pool have their withdraw and stake authority set to PDA `[pool_account_pubkey]` (Pool SOL reserves).

## Instructions

### CreatePool

Creates a new unstake liquidity pool.

### AddLiquidity

Add SOL liquidity to a pool, minting LP tokens in return.

### RemoveLiquidity

Burn LP tokens to remove SOL liquidity from a pool. Does not work and must wait till the next epoch for `ReclaimStakeAccount`s if pool SOL reserves does not have enough SOL to return to the LP.

### Unstake

Unstakes a given stake account to a pool and receive SOL in return.

### DeactivateStakeAccount

Permissionless crank to deactivate an unstaked stake account.

### ReclaimStakeAccount

Permissionless crank to reclaim the SOL in a deactivated unstaked stake account to a pool's SOL reserves.

### SetFee

Modify the pool's fees.
