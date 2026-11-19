// Shared helpers for the test files. Plain ESM, no framework: `node --test`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Compile a CSS file through Tailwind v4 and return the CSS text. */
export async function compileTailwind(cssPath, base = ROOT) {
  const css = fs.readFileSync(cssPath, "utf8");
  const result = await postcss([tailwind({ base })]).process(css, { from: cssPath });
  return result.css;
}

/**
 * The class names Tailwind emitted a rule for, unescaped. Only top-level
 * class selectors are read (variant rules such as `.md\:p-3` are included
 * because Tailwind nests them in an at-rule but still emits the selector).
 */
export function emittedClasses(css) {
  const out = new Set();
  for (const m of css.matchAll(/^\s*\.((?:\\.|[^\s{,:])+)(?:\s[^{]*)?\{/gm)) {
    out.add(m[1].replace(/\\(.)/g, "$1"));
  }
  return out;
}
