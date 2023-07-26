/**
 * This stupid script just turns idl.json into a ts file with contents
 * `export const IDL_JSON = <idl.json>`
 * in order to get around https://github.com/microsoft/TypeScript/issues/51783
 */

const { readFileSync, writeFileSync } = require("fs");
const path = require("path");

const IDL_DIR_PATH = path.resolve(__dirname, "src/idl/");
const IDL_JSON_PATH = path.resolve(IDL_DIR_PATH, "idl.json");
const IDL_JS_PATH = path.resolve(IDL_DIR_PATH, "idlJson.ts");

function main() {
  const idlJsonStr = readFileSync(IDL_JSON_PATH, { encoding: "utf-8" });
  writeFileSync(IDL_JS_PATH, `export const IDL_JSON = ${idlJsonStr}`);
}

main();
