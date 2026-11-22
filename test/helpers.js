// Shared helpers for the test files. Plain ESM, no framework: `node --test`.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { npmLauncher } from "../dist/adapters/npm.js";

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

/** Run npm the way the kit does (npm-cli.js under this node on Windows), never through a shell. */
export function runNpm(args, opts = {}) {
  const l = npmLauncher();
  return execFileSync(l.file, [...l.prefix, ...args], opts);
}
