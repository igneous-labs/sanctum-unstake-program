# Changelog

Individual changelogs of the npm packages available in `ts/` and `cli/` folder.

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**Note:** Version 0 of Semantic Versioning is handled differently from version 1 and above.
The minor version will be incremented upon a breaking change and the patch version will be
incremented for features.

## [2.0.0] - 2023-07-27

### Breaking

- Added `flashAccount` to `AddLiquidity` and `RemoveLiquidity` instructions

### Added

- `takeFlashLoan()`

## [1.0.1] - 2023-07-14

### Fixed

- Fixed import for `IDL_JSON` throwing `ERR_IMPORT_ASSERTION_TYPE_MISSING` for esm builds due to https://github.com/microsoft/TypeScript/issues/51783

## [1.0.0] - 2023-07-13

### Breaking

- Removed `payer` account from `Unstake` and `UnstakeWSol` instructions, rent for stake_account_record_account is now paid from `pool_sol_reserves`

## [0.1.5] - 2023-02-25

### Fixed

- cjs packaging issue

## [0.1.4] - 2023-02-25 (YANKED)

### Fixed

- cjs packaging issue due to not including `{ "type": "commonjs" }` in `package.json`

## [0.1.3] - 2022-11-22

### Changed

- Build both cjs and esm

## [0.1.2] - 2022-09-16

### Fixed

- `applyFee()` bug for liquidity linear fees returning the incorrect value

## [0.1.1] - 2022-08-25

### Changed

- `unstakeWsolTx()` and `unstakeTx()`'s `protocolFee` arg is now optional. However, the correct `protocolFeeDestination` must be provided in that case. This allows consumers to be able to construct transactions without having to fetch on-chain protocol fee account data first.

## [0.1.0] - 2022-08-24

### Added

- `unstakeWsolTx()` for the new `UnstakeWsol` instruction
- `findProtocolFeeAccount()` for getting PDA of global protocol fee account
- `previewUnstakeWsol()` for previewing the results of an `UnstakeWsol` instruction
- `applyProtocolFee()` for estimating protocol fees and referral bonuses

### Changed

- IDL changes to match `v0.1.0` of on-chain program
- Re-export anchor's exports at root for anchor version compatibility in consumers
- Add referrer arg for `unstakeTx()` and `unstakeWsolTx()` for referral bonus feature

## [0.0.3] - 2022-07-18

### Added

- README examples

## [0.0.2] - 2022-07-02

### Changed

- `previewUnstake` rethrows any `TransactionError`s thrown by the transaction simulation
