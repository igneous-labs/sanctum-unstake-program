# unstake_interface

Generated with `solores v0.5.0`

## Generate

After `anchor build`, run in workspace root:

```sh
solores \
    --solana-program-vers "workspace=true" \
    --borsh-vers "workspace=true" \
    --thiserror-vers "workspace=true" \
    --num-derive-vers "workspace=true" \
    --num-traits-vers "workspace=true" \
    --serde-vers "workspace=true" \
    target/idl/unstake.json
```

And then manually update the program ID in `lib.rs` to the desired program ID.
