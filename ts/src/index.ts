// Use this folder to define typescript bindings and util functions.

// The types for the JSON file and the IDL const is different
// so we need to re-export both
import * as IDL_JSON from "./idl/idl.json";
export { IDL_JSON };
export * from "./idl/idl";

export function exampleFunction(): void {
  console.log("Hello world");
}
