# Anchor Program TS bindings

Installable ts package

## Initial Setup from Template

1. Change the name in `package.json` to the new anchor program's name
2. `cd cli && yarn remove example-program && yarn add link:../ts`

## Building

`yarn build` compiles the anchor program and copies `idl.json` and `idl.ts` into `src/idl` before `tsc`

## Local installation

`yarn pack` to create a tarball installable via `yarn add file:*.tgz`. Note: move the `.tgz` file out of the package directory or `yarn add` will add the package directory instead.
