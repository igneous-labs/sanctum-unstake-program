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

## TS library installation by other projects

`yarn add <PACKAGE-NAME>@git+ssh://git@github.com:igneous-labs/<REPO-NAME>.git#<VERSION-TAG>`

## CI

Current CI pipline is a manually triggered github action to generate the typescript library at a new github semver tag. To trigger, go to `Actions > CI > Run workflow` and specify the semver for the new typescript release.
