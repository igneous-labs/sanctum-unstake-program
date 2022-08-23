#!/bin/sh

# have to use a separate shell script to encapsulate the sequential tests execution because Anchor.toml doesnt allow quotes and '&&'

yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/protocol-test.ts && yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/test-*.ts --parallel
