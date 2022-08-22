# @unstake.it/sol

Typescript SDK for the unstake.it solana program that allows users to instantly unstake their stake accounts for a fee.

Built on anchor 0.24.2.

Contents:

- [Installation](#installation)
  - [npm](#npm)
  - [yarn](#yarn)
- [Examples](#examples)
  - [Initialization](#initialization)
  - [Fetch Pool Data](#fetch-pool-data)
  - [Fetch Available Liquidity](#fetch-available-liquidity)
  - [Fetch Fee Params](#fetch-fee-params)
  - [Previewing an Unstake](#previewing-an-unstake)
  - [Estimate Fees](#estimate-fees)
  - [Unstake](#unstake)
  - [Reclaim Stake](#reclaim-stake)

## Installation

### npm

```bash
$ npm install @unstake-it/sol
```

### yarn

```bash
$ yarn add @unstake-it/sol
```

## Examples

### Initialization

Initialize the anchor program and define address constants.

```ts
import { PublicKey } from "@solana/web3.js";
import { Program } from "@project-serum/anchor";
import { IDL_JSON as UNSTAKE_IDL_JSON, Unstake } from "@unstake-it/sol";

// our mainnet program address
const PROG_ID = new PublicKey("unpXTU2Ndrc7WWNyEhQWe4udTzSibLPi25SXv2xbCHQ");

// construct new Program with provider set to anchor's default getProvider()
const UNSTAKE_PROGRAM: Program<Unstake> = new Program(
  UNSTAKE_IDL_JSON as Unstake,
  PROG_ID
);

// our mainnet unstake liquidity pool
const UNSTAKE_POOL_ADDRESS = new PublicKey(
  "FypPtwbY3FUfzJUtXHSyVRokVKG2jKtH29FmK4ebxRSd"
);
```

### Fetch Pool Data

```ts
const FETCHED_POOL_DATA = await UNSTAKE_PROGRAM.account.pool.fetch(
  UNSTAKE_POOL_ADDRESS
);
const { feeAuthority, lpMint, incomingStake } = FETCHED_POOL_DATA;
```

### Fetch Available Liquidity

The liquidity currently available for unstaking and liquidity removal is simply the SOL balance of the pool's reserves account.

```ts
import { findPoolSolReserves } from "@unstake-it/sol";

// this address is 3rBnnH9TTgd3xwu48rnzGsaQkSr1hR64nY71DrDt6VrQ on mainnet
const POOL_RESERVES_ADDRESS = await findPoolSolReserves(
  UNSTAKE_PROGRAM,
  UNSTAKE_POOL_ADDRESS
);
const availableLiquidityLamports =
  await UNSTAKE_PROGRAM.provider.connection.getBalance(POOL_RESERVES_ADDRESS);
```

### Fetch Fee Params

The fee params for the unstake pool is stored in a separate PDA.

```ts
import { findPoolFeeAccount } from "@unstake-it/sol";

// this address is 5Pcu8WeQa3VbBz2vdBT49Rj4gbS4hsnfzuL1LmuRaKFY on mainnet
const POOL_FEE_ADDRESS = await findPoolFeeAccount(
  UNSTAKE_PROGRAM,
  UNSTAKE_POOL_ADDRESS
);
const FETCHED_FEE_DATA = await UNSTAKE_PROGRAM.account.fee.fetch(
  POOL_FEE_ADDRESS
);

// `fee` is an enum containing different fields depending on the fee schedule variant.
// Recommend using `applyFee` to estimate fees (see example in #estimate-fees below)
const { fee } = FETCHED_FEE_DATA;
```

### Fetch Protocol Fee Params

The global protocol fee params for the unstake pool is stored in a singleton PDA.

```ts
import { findProtocolFeeAccount } from "@unstake-it/sol";

// this address is 2hN9UhvRFVfPYKL6rZJ5YiLEPCLTpN755pgwDJHWgFbU on mainnet
const PROTOCOL_FEE_ADDRESS = await findProtocolFeeAccount(UNSTAKE_PROGRAM);
const FETCHED_PROTOCOL_FEE_DATA =
  await UNSTAKE_PROGRAM.account.protocolFee.fetch(PROTOCOL_FEE_ADDRESS);

const { destination, authority, feeRatio, referrerFeeRatio } =
  FETCHED_PROTOCOL_FEE_DATA;

// this account data is required for unstakeTx(), unstakeWsolTx() and previewUnstake()
const PROTOCOL_FEE = {
  publicKey: PROTOCOL_FEE_ADDRESS,
  account: FETCHED_PROTOCOL_FEE_DATA,
};
```

### Previewing an Unstake

This function simply makes a `simulateTransaction` RPC call and reports the change in lamports to the destination account the transaction results in.

```ts
import { previewUnstake } from "@unstake-it/sol";

// stakeAccountPubkey defined elsewhere

const changeInLamports = await previewUnstake(UNSTAKE_PROGRAM, {
  poolAccount: UNSTAKE_POOL_ADDRESS,
  stakeAccount: stakeAccountPubkey,
  unstaker: UNSTAKE_PROGRAM.provider.wallet.publicKey,
  protocolFee: PROTOCOL_FEE,
});
```

### Estimate Fees

Estimate fees for an unstake amount manually using the fetched fee params. This is useful in cases where `previewUnstake` can't be used, such as when the stake account to be unstaked hasn't been created yet.

```ts
import BN from "bn.js";
import { applyFee, findPoolSolReserves } from "@unstake-it/sol";

const plannedUnstakeAmountLamports = new BN(1_000_000_000);

// this address is 3rBnnH9TTgd3xwu48rnzGsaQkSr1hR64nY71DrDt6VrQ on mainnet
const POOL_RESERVES_ADDRESS = await findPoolSolReserves(
  UNSTAKE_PROGRAM,
  UNSTAKE_POOL_ADDRESS
);
const availableLiquidityLamports =
  await UNSTAKE_PROGRAM.provider.connection.getBalance(POOL_RESERVES_ADDRESS);
const { incomingStake } = await UNSTAKE_PROGRAM.account.pool.fetch(
  UNSTAKE_POOL_ADDRESS
);

const estFeeDeductedLamports = applyFee(FETCHED_FEE_DATA, {
  poolIncomingStake: incomingStake,
  solReservesLamports: new BN(availableLiquidityLamports),
  stakeAccountLamports: plannedUnstakeAmountLamports,
});
```

### Unstake

Create and send the unstake transaction

```ts
import BN from "bn.js";
import { deactivateStakeAccountTx, unstakeTx } from "@unstake-it/sol";
// use solana-stake-sdk's util functions for fetching and processing stake accounts
import { getStakeAccount, stakeAccountState } from "@soceanfi/solana-stake-sdk";

// stakeAccountPubkey defined elsewhere

const { data: stakeAccount } = await getStakeAccount(
  UNSTAKE_PROGRAM.provider.connection,
  stakeAccountPubkey
);

const tx = await unstakeTx(UNSTAKE_PROGRAM, {
  stakeAccount: stakeAccountPubkey,
  poolAccount: UNSTAKE_POOL_ADDRESS,
  unstaker: UNSTAKE_PROGRAM.provider.wallet.publicKey,
  protocolFee: PROTOCOL_FEE,
});

// deactivateStakeAccount is a permissionless crank instruction that allows
// the pool to deactivate the stake accounts it receives so that it can
// reclaim the SOL liquidity on the next epoch.
// You can help our operations by including it in the same transaction
// that unstakes the stake account (:
const {
  epochInfo: { epoch },
} = await UNSTAKE_PROGRAM.provider.connection.getEpochInfo();
const stakeState = stakeAccountState(stakeAccount, new BN(epoch));
if (stakeState === "active" || stakeState === "activating") {
  tx.add(
    await deactivateStakeAccountTx(unstakeProgram, {
      stakeAccount: stakeAccountPubkey,
      poolAccount: UNSTAKE_POOL_ADDRESS,
    })
  );
}

const signature = await UNSTAKE_PROGRAM.provider.sendAndConfirm(tx);
```

### UnstakeWsol

We also provide an instruction for unstaking SOL to wrapped SOL token accounts. Its usage is the same as [Unstake](#unstake); simply replace `unstakeTx()` with `unstakeWsolTx()` in the example above.

### Reclaim Stake

ReclaimStake is a permissionless crank instruction that returns SOL from previously unstaked stake accounts that have now successfully deactivated to the pool's SOL reserves. This increases the liquidity available for unstaking and gives users a better rate.

```ts
import { Transaction } from "@solana/web3.js";
import {
  fetchLiquidityPoolStakeAccounts,
  reclaimStakeAccountTx,
} from "@unstake-it/sol";

const { inactive: stakeAccountsToReclaim } =
  await fetchLiquidityPoolStakeAccounts(UNSTAKE_PROGRAM, UNSTAKE_POOL_ADDRESS);

// You can fit 5 reclaimStakeAccount instructions into one tx before running into packet size limits
const CHUNK_SIZE = 5;
const chunks = [];
for (let i = 0; i < stakeAccountsToReclaim.length; i += CHUNK_SIZE) {
  chunks.push(stakeAccountsToReclaim.slice(i, i + CHUNK_SIZE));
}

const signatures = await Promise.all(
  chunks.map(async (chunk) => {
    const txs = await Promise.all(({ accountId }) =>
      reclaimStakeAccountTx(UNSTAKE_PROGRAM, {
        poolAccount: UNSTAKE_POOL_ADDRESS,
        stakeAccount: accountId,
      })
    );
    const txToSend = txs.reduce(
      (combined, tx) => combined.add(tx),
      new Transaction()
    );
    return UNSTAKE_PROGRAM.provider.sendAndConfirm(txToSend);
  })
);
```
