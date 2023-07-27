# Unstake

## Dependencies

- `yarn`
- `wget`, `python3` for pre-commit
- `soteria` for vuln scanning

## Setup

1. `yarn install`
2. `yarn pre-commit-install`

`clippy` pre-commit hook will take a while on slower machines, feel free to disable it if desired.

## Auto vuln scanning

`soteria -analyzeAll .`

## CI

Current CI pipline is a manually triggered github action to generate the typescript library at a new github semver tag. To trigger, go to `Actions > CI > Run workflow` and specify the semver for the new typescript release.

## unstake_interface

Regenerate `unstake_interface` after `anchor build` with `solores -s "~1.14" -b "^0.9.1" target/idl/unstake.json` and replace `program_id`.

## Deploy

Current mainnet deploy is commit hash `11aac05b22794e6c2c3366dbb7141f4c61845c24`
