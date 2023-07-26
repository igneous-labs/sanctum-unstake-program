# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**Note:** Version 0 of Semantic Versioning is handled differently from version 1 and above.
The minor version will be incremented upon a breaking change and the patch version will be
incremented for features.

## [1.0.0] - 2023-07-13

### Breaking

- Removed `payer` account from `Unstake` and `UnstakeWSol` instructions, rent for stake_account_record_account is now paid from `pool_sol_reserves`

### Added

- `SetLpTokenMetadata` instruction for `pool_authority` to set metaplex token metadata for LP token
- flash loan feature: `SetFlashLoanFee`, `TakeFlashLoan`, `RepayFlashLoan`

## [0.1.0] - 2022-08-24

### Added

- `UnstakeWsol` instruction to unstake directly to a wrapped SOL account
- protocol fees and referral bonuses determined by the `ProtocolFee` account
- `InitProtocolFee` instruction to initialize global protocol fee to a default
- `SetProtocolFee` instruction to modify protocol fee

### Changed

- BREAKING: unstake instructions (Unstake, UnstakeWsol) now require the protocol fee account and protocol fee destination account to be passed in
- unstake instructions now accept an optional referral account in `remaining_accounts` to receive referral bonuses
