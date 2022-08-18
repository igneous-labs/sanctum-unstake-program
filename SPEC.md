# Unstake On-chain Program Specification

## Overview

Unstake On-chain program provides a mechanism to instantly convert a native
Solana Stake Account to SOL.

The program performs the conversion from stake account to SOL using its
underlying liquidity pool that contains a SOL reserves that is owned by the LP
token holders and continuously accrues fees as it operates.

The internal operations of the program require two permission-less crank
instructions to be executed to maintain the optimal operational state.

## High level design

- Stake accounts' worth are determined using the native `lamports` field (includes rent lamports)
- Stake accounts are transferred directly to the pool by setting its `withdrawer` and `staker` authority to the pool's SOL reserves account
- In return, SOL is transferred directly to the specified destination account, minus the pool's fees
- Stake accounts with an active `Lockup` are disallowed
- Unstaked stake accounts are deactivated and reclaimed as liquid SOL on the next epoch via permission-less cranks
- Discover stake accounts owned by the pool via `getProgramAccounts` to run the cranks on

## Program Accounts

### Pool

The main liquidity pool account.

Each pool has an LP token mint, the value that keeps track of the last known
amount of incoming lamports, and specifies an authority that can set the type of
fee to be applied on unstake instruction.

There is one-to-one relation between a pool account and its SOL reserves and a
fee account (see Fee).

| field            | type     | description                                                                                                                                                                                                                                  |
| ---------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fee_authority`  | `Pubkey` | the pubkey authorized to set the pool's fees                                                                                                                                                                                                 |
| `lp_mint`        | `Pubkey` | the pool's LP token mint                                                                                                                                                                                                                     |
| `incoming_stake` | `u64`    | the last known value of total number of lamports in stake accounts owned by the pool that have not been reclaimed yet. The total SOL owned by a pool accounted for can be calculated by taking `incoming_stake + pool_sol_reserves.lamports` |

### Fee

The account that stores the pool's fee parameters.

Located at PDA `[pool_account_pubkey, "fee"]`.

Single `enum` field, `fee` that implements different fee variants:

#### Flat

Charges a flat percentage fee on all unstakes.

Fee is specified as a ratio of fee to be taken from the lamports amount of a
stake account.

#### LiquidityLinear

Charges a fee percentage that increases linearly as the liquiditiy in the pool
is consumed.

Fee is specified with a starting ratio of fee, when there is no liquidity consumed
by unstake instruction yet, and a maximum ratio to be taken, when all of the
liquidity is already consumed. On unstake, the fee is decided by performing a
linear interpolation using the above two values.

### StakeAccountRecord

An account that stores data for the unstaked stake account that it's 1:1
associated with.

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

Unstaked stake accounts that are owned by the pool have their `withdrawer` and
`staker` authority set to PDA `[pool_account_pubkey]` (Pool SOL reserves).

## Instructions

### Admin Facing

#### CreatePool

Creates a new unstake liquidity pool.

##### Requirements:

- Initializes the pool account, fee account and LP token mint

##### Signers:

- Payer to pay for the new accounts' rent
- New pool's fee authority

#### SetFee

Modify the pool's fees.

##### Requirements:

- Updates the pool's associated Fee account to a new fee scheme

##### Signers:

- Fee authority of the provided pool

### Liquidity Pool Facing

#### AddLiquidity

Add SOL liquidity to a pool, minting LP tokens in return.

##### Requirements:

- Mints LP tokens to the specified destination LP token account
- Minted tokens should be proportional to the liquidity added i.e. `LP tokens minted / (LP tokens minted + existing LP token supply) = SOL added / (SOL added + pool's existing SOL)`
- Zero-edge cases: if zero existing liquidity or zero LP token supply, then the minted amount should result in LP token supply being 1:1 with the total SOL owned by the pool.

##### Signers:

- Authority of the SystemAccount providing the SOL to add

#### RemoveLiquidity

Burns LP tokens to remove SOL liquidity from a pool.

##### Requirements:

- Burns LP tokens and return SOL from the pool SOL reserves to the destination `SystemAccount`
- SOL returned should be proportional to the LP tokens burnt i.e. `SOL returned / (pool's existing SOL - SOL returned) = LP tokens burnt / (existing LP token supply - LP tokens burnt)`
- Fails if pool SOL reserves does not have enough SOL to return to the LP. LP must wait till the next epoch for `ReclaimStakeAccount`s to return liquidity to the pool SOL reserves to try again.
- Zero-edge cases: if a `RemoveLiquidity` instruction results in LP token supply going to 0, then the SOL owned by the pool should go to 0 as well

##### Signers:

- Authority of the LP token account to burn LP tokens from

### Crank Facing

#### DeactivateStakeAccount

Permissionless crank to deactivate an unstaked stake account.

##### Requirements:

- Deactivates an active stake account owned by the pool so that its SOL can be reclaimed to the pool's SOL reserves in the next epoch

##### Signers:

None, permissionless crank.

#### ReclaimStakeAccount

Permissionless crank to reclaim the SOL in a deactivated unstaked stake account to a pool's SOL reserves.

##### Requirements:

- Reclaims an inactive stake account owned by the pool to the pool's SOL reserves account

##### Signers:

None, permissionless crank.

##### Analytics Log Emission:

Instruction type is marked as 1.

###### Format:

```
unstake-log: [instruction, stake_account_address, recorded_lamports, reclaimed_lamports]
```

| index | field                   | definition                                                                                      |
| ----- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| 0     | `instruction`           | instruction type: 1 for `ReclaimStakeAccount` ix                                                |
| 1     | `stake_account_address` | base 58 encoded string of stake account address                                                 |
| 2     | `recorded_lamports`     | the amount of sol in lamports in stake account observed at the time of `Unstake` ix             |
| 3     | `reclaimed_lamports`    | the amount of sol in lamports in stake account observed at the time of `ReclaimStakeAccount` ix |

###### Example:

```
unstake-log: [1, 5Rdj6vKRUkoZ9cS4FZSfhfhiTRd4VjPqVHsQ8znjHtj1, 2282881, 2282881]
```

### User Facing

#### Unstake

Unstakes a given stake account to a pool and receive SOL in return.

##### Requirements:

- Rejects stake accounts that are locked up
- Transfers the ownership of the provided stake account to the pool SOL reserves
- Transfers the provided stake accounts SOL amount, excluding the pool's fee, to the specified unstaker account

##### Signers:

- Payer to pay for the new StakeAccountRecord account's rent
- Unstaker that owns the provided stake account

##### Analytics Log Emission:

Instruction type is marked as 0.

###### Format:

```
unstake-log: [instruction, unstaker, stake_account_address, stake_account_voter, stake_account_activation_epoch, FEE, recorded_lamports, paid_lamports, fee_lamports]
```

| index | field                            | definition                                                                          |
| ----- | -------------------------------- | ----------------------------------------------------------------------------------- |
| 0     | `instruction`                    | instruction type: 0 for `Unstake` ix                                                |
| 1     | `unstaker`                       | base 58 encoded string of unstaker's wallet pubkey                                  |
| 2     | `stake_account_address`          | base 58 encoded string of stake account address                                     |
| 3     | `stake_account_voter`            | base 58 encoded string of stake account's voter pubkey                              |
| 4     | `stake_account_activation_epoch` | the activation epoch of stake account observed at the time of `Unstake` ix          |
| 5     | `FEE`                            | details of `FeeEnum` used (see Fee Format)                                          |
| 6     | `recorded_lamports`              | the amount of sol in lamports in stake account observed at the time of `Unstake` ix |
| 7     | `paid_lamports`                  | the amount of sol in lamports paid out to unstaker                                  |
| 8     | `fee_lamports`                   | the amount of sol in lamports charged as fee                                        |

###### Fee Format:

```
[fee_type, FEE_DETAILS]
```

**`Flat` Fee Details**:

| index | field      | definition             |
| ----- | ---------- | ---------------------- |
| 0     | `fee_type` | fee type: 0 for `Flat` |
| 1     | `ratio`    | fee ratio              |

**`LiquidityLinear` Fee Details**:

| index | field                | definition                                           |
| ----- | -------------------- | ---------------------------------------------------- |
| 0     | `fee_type`           | fee type: 1 for `LiquidityLinear`                    |
| 1     | `max_liq_remaining`  | fee ratio when the swap leaves all of its liquidity  |
| 2     | `zero_liq_remaining` | fee ratio when the swap leaves none of its liquidity |

###### Examples:

```
unstake-log: [0, Bai6uK4uvY4yWp2zAWQviKopsiSgtwJvzuy6DP2b4uDy, 7AzTg6RXXDbs6GMhqwsDbAdKuopRo4oS3BXVDi5HoJvD, 7VZtM1cDRgqJCxezv18Zykvorzuwn9B6cLRBE9s7rhS3, 0, [0, 69/1000], 2282881, 2125362, 157519]
```

```
unstake-log: [0, 6zKThTJd7kG9yJJHdHe1pUUZSSSA7ayUtYLuZT7cYN3J, 5Rdj6vKRUkoZ9cS4FZSfhfhiTRd4VjPqVHsQ8znjHtj1, 7VZtM1cDRgqJCxezv18Zykvorzuwn9B6cLRBE9s7rhS3, 0, [1, 15/1000, 42/1000], 2282881, 2247252, 35629]
```
