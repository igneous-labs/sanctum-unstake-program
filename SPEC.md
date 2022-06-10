## High level design

- Stake accounts' worth are determined using `stake_lamports` field (does not include rent lamports)
- Stake accounts' rent lamports are given to crank runners as incentives
- Stake accounts are just transferred directly to the pool by setting withdraw and stake authority
- Discover stake accounts owned by the pool via getProgramAccounts to run the cranks on

## Program Accounts

### Pool

TODO

### Fee

TODO

## Other Accounts

### Pool SOL reserves

TODO

### LP token mint

TODO

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
