#!/usr/bin/env node

import { exampleFunction, IDL_JSON, IDL } from "@soceanfi/unstake";

async function cli(argv: string[]) {
  exampleFunction();
  console.log(IDL_JSON);
  console.log(IDL);
  process.exit(0);
}

cli(process.argv);
