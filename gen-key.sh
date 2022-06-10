#!/bin/sh

PROGRAM_NAME="unstake"
PROGRAM_NAME_SNAKE=$(echo $PROGRAM_NAME | sed s/-/_/g) 

PROGRAM_PUBKEY_FILE="program.json"
solana-keygen new -f -o $PROGRAM_PUBKEY_FILE --no-bip39-passphrase
PROGRAM_PUBKEY=$(solana-keygen pubkey "$PROGRAM_PUBKEY_FILE")

# find and replace in lib.rs local-testing
LIB_FIND="#\[cfg\(feature = \"local-testing\"\)\]\ndeclare_id!(.+);\n"
LIB_REPLACE="#\[cfg\(feature = \"local-testing\"\)\]\ndeclare_id!(\"$PROGRAM_PUBKEY\");\n"
perl -i -0777 -pe "s/$LIB_FIND/$LIB_REPLACE/g" programs/$PROGRAM_NAME/src/lib.rs 

# find and replace in Anchor.toml
ANCHOR_FIND="\[programs\.localnet\]\n$PROGRAM_NAME_SNAKE = \".+\"\n"
ANCHOR_REPLACE="\[programs\.localnet\]\n$PROGRAM_NAME_SNAKE = \"${PROGRAM_PUBKEY}\"\n"
perl -i -0777 -pe "s/$ANCHOR_FIND/$ANCHOR_REPLACE/g" Anchor.toml