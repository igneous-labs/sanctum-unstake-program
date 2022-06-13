## High level design

- Stake accounts' worth are determined using `stake_lamports` field (does not include rent lamports)
- Stake accounts' rent lamports are given to crank runners as incentives
- Stake accounts are just transferred directly to the pool by setting withdraw and stake authority
- Locked stake accounts are disallowed
- Discover stake accounts owned by the pool via getProgramAccounts to run the cranks on

## Program Accounts

### Pool

TODO

### Fee

Located at PDA `[pool_account_pubkey, "fee"]`

### StakeAccountRecord

Located at PDA `[pool_account_pubkey, stake_account_pubkey]`

## Other Accounts

### Pool SOL reserves

Regular system account, use SystemProgram.transfer signed with PDA to transfer lamports out.

Located at PDA `[pool_account_pubkey]`

### LP token mint

Token authority set to PDA `[pool_account_pubkey]`

Can be located at any keypair to enable vanity pubkeys.

Initialized on CreatePool.

## Instructions

### CreatePool

TODO

### AddLiquidity

TODO

### RemoveLiquidity

TODO

### Unstake

TODO

### DeactivateStakeAccount

TODO

### ReclaimStakeAccount

TODO

### SetFee

TODO
