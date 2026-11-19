import type { Entry } from "../compile/model.js";
import { GENERATED_HEADER, varName } from "./names.js";

/** `tokens.css`: every value-bearing entry as a `--dk-*` custom property. Pure and deterministic. */
export function emitTokensCss(entries: Entry[]): string {
  const lines = entries.map((e) => `  ${varName(e.path)}: ${e.css};`);
  return `/* ${GENERATED_HEADER} */\n:root {\n${lines.join("\n")}\n}\n`;
}
