/** The package name, exported so a consumer (and the delivery probe) can tell the module loaded. */
export const designKitName = "@qontinui/design-kit";

export { compileSource, driftedOutputs, writeOutputs, OUTPUT_FILES } from "./compile/compile.js";
export type { CompileOptions, CompileReport, CompileResult } from "./compile/compile.js";
export { parseSource } from "./source/parse.js";
export { SourceError, GROUPS } from "./source/schema.js";
export type { DesignSource, Leaf, GroupName, SourceKind } from "./source/schema.js";
export * as craft from "./craft/arithmetic.js";
export { loadTokenPackage, tokenLeaves, TOKEN_PACKAGE } from "./adapters/design-tokens.js";
