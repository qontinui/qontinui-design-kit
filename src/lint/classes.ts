/**
 * `design-kit lint-classes <dir>`: the gap the exclusive theme leaves.
 * Tailwind v4 emits an arbitrary value (`bg-[#f00]`, `p-[13px]`) whatever
 * `--*: initial` says (Probe 1), so a literal can still be written. This check
 * finds, in `.tsx` files, arbitrary-value classes and inline literal colours
 * and lengths, with file and line. Modelled on qontinui-web
 * `eslint-rules/no-fat-record-card.mjs`: a rule that holds where prose did not.
 *
 * An exception is a line carrying `design-kit-exception: <id>` where `<id>` is
 * an `exceptions` entry of the source. An unknown id waives nothing.
 */
import fs from "node:fs";
import path from "node:path";

export type FindingRule = "arbitrary-value" | "arbitrary-variant" | "inline-colour" | "inline-length" | "unknown-exception";

export interface Finding {
  file: string;
  line: number;
  column: number;
  rule: FindingRule;
  match: string;
}

const ARBITRARY_VALUE = /[^\s'"`{}()<>,;]*-\[[^\]\s'"`]+\][^\s'"`{}()<>,;]*/g;
const ARBITRARY_VARIANT = /(?<=^|[\s'"`])\[[^\]\s]+\]:[^\s'"`]+/g;
const COLOUR_HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const COLOUR_FN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/g;
const LENGTH = /(?<![\w.#-])\d*\.?\d+(?:px|rem|em|vh|vw)\b/g;
const MARKER = /design-kit-exception:\s*([A-Za-z0-9_.-]+)/g;

const blank = (s: string, start: number, len: number): string => s.slice(0, start) + " ".repeat(len) + s.slice(start + len);

/** Lint one file's text. `exceptions` are the source's exception ids. */
export function lintText(file: string, text: string, exceptions: ReadonlySet<string>): Finding[] {
  const out: Finding[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] as string;
    const trimmed = raw.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
    const marked = [...raw.matchAll(MARKER)].map((m) => m[1] as string);
    const waived = marked.some((id) => exceptions.has(id));
    for (const id of marked) {
      if (!exceptions.has(id)) out.push({ file, line: i + 1, column: raw.indexOf(id) + 1, rule: "unknown-exception", match: id });
    }
    // Scan a copy with the exception comment removed, and with each matched span blanked so one literal is one finding.
    let scan = raw.replace(MARKER, (m) => " ".repeat(m.length));
    const found: Finding[] = [];
    const take = (re: RegExp, rule: FindingRule): void => {
      for (const m of [...scan.matchAll(re)]) {
        const idx = m.index ?? 0;
        found.push({ file, line: i + 1, column: idx + 1, rule, match: m[0] });
        scan = blank(scan, idx, m[0].length);
      }
    };
    take(ARBITRARY_VALUE, "arbitrary-value");
    take(ARBITRARY_VARIANT, "arbitrary-variant");
    take(COLOUR_HEX, "inline-colour");
    take(COLOUR_FN, "inline-colour");
    take(LENGTH, "inline-length");
    if (!waived) out.push(...found);
  }
  return out.sort((a, b) => a.line - b.line || a.column - b.column);
}

function walk(dir: string, files: string[]): void {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, files);
    else if (e.name.endsWith(".tsx")) files.push(p);
  }
}

export function lintDir(dir: string, exceptions: ReadonlySet<string>): { files: number; findings: Finding[] } {
  const files: string[] = [];
  walk(dir, files);
  files.sort();
  const findings: Finding[] = [];
  for (const f of files) findings.push(...lintText(path.relative(dir, f) || f, fs.readFileSync(f, "utf8"), exceptions));
  return { files: files.length, findings };
}
