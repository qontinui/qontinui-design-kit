/**
 * Resolve first (plan D4): `@qontinui/design-tokens` is an INPUT, never a
 * restated copy. The adapter reads the built package, either at a git ref (the
 * published 1.0.0 lacks typeScale, durations and reducedMotion; they exist at
 * 415be45 and later) or at an installed version, and returns design-language
 * leaves labelled `resolved(@qontinui/design-tokens@<ref|version>)`.
 *
 * A group the resolved package does not export stays `undeclared`, as an
 * explicit undeclared leaf. It is never silently empty.
 *
 * The typography groups (`fontWeights`, `lineHeights`, `letterSpacings`,
 * exported since 415be45) map to `type.weight.*`, `type.leading.*` and
 * `type.tracking.*`, the paths the theme and guide emitters already read.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ImportGroup, ImportSpec, Leaf, ValueType } from "../source/schema.js";
import { IMPORT_GROUPS, SourceError } from "../source/schema.js";

export const TOKEN_PACKAGE = "@qontinui/design-tokens";
const DEFAULT_REPO = "https://github.com/qontinui/qontinui-design-tokens.git";

export interface TokenPackage {
  /** The label inside `resolved(...)`: `@qontinui/design-tokens@<ref|version>`. */
  label: string;
  version: string;
  /** The ref as written in the source, or null for an installed package. */
  ref: string | null;
  /** The full commit sha the ref resolved to, or null for an installed package. */
  sha: string | null;
  exports: Record<string, unknown>;
}

export interface LoadContext {
  /** The project root: where an installed package is resolved from. */
  rootDir: string;
  /** Where to clone the token package from (default: $DESIGN_TOKENS_REPO, then GitHub). */
  tokensRepo?: string;
  /** Where built refs are cached (default: $DESIGN_KIT_CACHE, then ~/.cache/qontinui-design-kit). */
  cacheDir?: string;
}

function run(cmd: string, args: string[], cwd: string): string {
  try {
    return execFileSync(cmd, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
      timeout: 15 * 60 * 1000,
      // Never wait on a credential prompt.
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
  } catch (e) {
    const err = e as { stderr?: string; message: string };
    throw new Error(`${cmd} ${args.join(" ")} failed in ${cwd}: ${(err.stderr ?? err.message).toString().slice(-600)}`);
  }
}

/** Build the token package at `ref` (once per cache dir) and return its directory and commit sha. */
function buildAtRef(ref: string, ctx: LoadContext): { dir: string; sha: string } {
  // A ref is a sha or a tag: never something git could read as an option.
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(ref)) throw new Error(`import ref ${JSON.stringify(ref)} is not a sha or a tag`);
  const repo = ctx.tokensRepo ?? process.env["DESIGN_TOKENS_REPO"] ?? DEFAULT_REPO;
  const cache = ctx.cacheDir ?? process.env["DESIGN_KIT_CACHE"] ?? path.join(os.homedir(), ".cache", "qontinui-design-kit");
  // The key covers the repo as well as the ref: another repo at the same ref is another build.
  const key = createHash("sha256").update(`${repo}\0${ref}`).digest("hex").slice(0, 16);
  const dir = path.join(cache, `design-tokens-${key}`);
  const marker = path.join(dir, ".design-kit-sha");
  if (fs.existsSync(path.join(dir, "dist", "index.js")) && fs.existsSync(marker)) {
    return { dir, sha: fs.readFileSync(marker, "utf8").trim() };
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(cache, { recursive: true });
  run("git", ["clone", "--quiet", "--no-checkout", repo, dir], cache);
  run("git", ["checkout", "--quiet", "--detach", ref], dir);
  const sha = run("git", ["rev-parse", "HEAD"], dir).trim();
  run("npm", ["ci", "--no-audit", "--no-fund"], dir);
  run("npm", ["run", "build"], dir);
  fs.writeFileSync(marker, sha + "\n");
  return { dir, sha };
}

function findInstalled(rootDir: string): string {
  const req = createRequire(path.join(rootDir, "package.json"));
  let entry: string;
  try {
    entry = req.resolve(TOKEN_PACKAGE);
  } catch {
    throw new Error(`${TOKEN_PACKAGE} is not installed under ${rootDir}; install it or give the import a "ref"`);
  }
  let dir = path.dirname(entry);
  for (;;) {
    const pj = path.join(dir, "package.json");
    if (fs.existsSync(pj) && (JSON.parse(fs.readFileSync(pj, "utf8")) as { name?: string }).name === TOKEN_PACKAGE) return dir;
    const up = path.dirname(dir);
    if (up === dir) throw new Error(`could not locate the ${TOKEN_PACKAGE} package directory from ${entry}`);
    dir = up;
  }
}

export async function loadTokenPackage(spec: ImportSpec, ctx: LoadContext): Promise<TokenPackage> {
  let dir: string;
  let sha: string | null = null;
  if (spec.ref !== null) {
    const built = buildAtRef(spec.ref, ctx);
    dir = built.dir;
    sha = built.sha;
  } else {
    dir = findInstalled(ctx.rootDir);
  }
  const version = (JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as { version: string }).version;
  const mod = (await import(pathToFileURL(path.join(dir, "dist", "index.js")).href)) as Record<string, unknown>;
  return { label: `${TOKEN_PACKAGE}@${spec.ref ?? version}`, version, ref: spec.ref, sha, exports: mod };
}

const round = (n: number): number => Math.round(n * 1000) / 1000;

function leaf(pkg: TokenPackage, p: string, type: ValueType, value: unknown, inputs: Record<string, unknown> | null = null): Leaf {
  const group = p.split(".")[0] as Leaf["group"];
  return { path: p, group, type, value, source: { kind: "resolved", arg: pkg.label }, derive: null, inputs };
}

function undeclaredLeaf(p: string, reason: string): Leaf {
  const group = p.split(".")[0] as Leaf["group"];
  return { path: p, group, type: null, value: null, source: { kind: "undeclared", arg: null }, derive: null, inputs: { reason } };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Every string leaf of a nested object, as `prefix.a.b` -> value. */
function flatten(prefix: string, obj: Record<string, unknown>, out: [string, string][]): void {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") out.push([`${prefix}.${k}`, v]);
    else if (isRecord(v)) flatten(`${prefix}.${k}`, v, out);
  }
}

/** A typography number; anything else is refused with the key named, never skipped into a silently smaller group. */
function numberOf(pkg: TokenPackage, group: string, key: string, v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new SourceError([`${pkg.label} ${group}.${key} is ${JSON.stringify(v)}; the adapter reads only a number`]);
  return v;
}

/** `"0.04em"` -> `{ value: 0.04, unit: "em" }`; any other spelling is refused with the key named. */
function emLength(pkg: TokenPackage, key: string, v: unknown): { value: number; unit: "em" } {
  const m = typeof v === "string" ? /^(-?\d*\.?\d+)em$/.exec(v) : null;
  if (!m) throw new SourceError([`${pkg.label} letterSpacings.${key} is ${JSON.stringify(v)}; the adapter reads only <number>em`]);
  return { value: parseFloat(m[1] as string), unit: "em" };
}

export interface AdapterResult {
  leaves: Leaf[];
}

/**
 * Leaves for the requested export groups. `surfaceUnit` multiplies the type
 * scale (which is drawn in reference pixels); with none declared the web scale
 * stays undeclared (report section 1.4).
 */
export function tokenLeaves(pkg: TokenPackage, groups: ImportGroup[] | null, surfaceUnit: number | null): AdapterResult {
  const wanted = new Set<ImportGroup>(groups ?? IMPORT_GROUPS);
  const leaves: Leaf[] = [];
  const missing = (g: ImportGroup, anchor: string): void => {
    leaves.push(undeclaredLeaf(anchor, `${pkg.label} does not export ${g}`));
  };

  if (wanted.has("color")) {
    const c = pkg.exports["colors"];
    if (!isRecord(c)) missing("color", "color");
    else {
      const flat: [string, string][] = [];
      flatten("color", c, flat);
      for (const [p, v] of flat) leaves.push(leaf(pkg, p, "color", v));
    }
  }
  if (wanted.has("fontFamilies")) {
    const f = pkg.exports["fontFamilies"];
    if (!isRecord(f)) missing("fontFamilies", "type.family");
    else for (const [k, v] of Object.entries(f)) leaves.push(leaf(pkg, `type.family.${k}`, "fontFamily", v));
  }
  if (wanted.has("typeScale")) {
    const t = pkg.exports["typeScale"];
    if (!isRecord(t)) missing("typeScale", "type.scale");
    else if (surfaceUnit === null) {
      leaves.push(undeclaredLeaf("type.scale", "no surface unit declared (type.unit); the package scale is drawn at a 1080px reference frame"));
    } else {
      const reference = pkg.exports["typeScaleReference"];
      for (const [k, px] of Object.entries(t)) {
        if (typeof px !== "number") continue;
        leaves.push(
          leaf(pkg, `type.scale.${k}`, "dimension", { value: round(px * surfaceUnit), unit: "px" }, { surfaceUnit, referencePx: px, referenceFrame: reference ?? null }),
        );
      }
    }
  }
  if (wanted.has("fontWeights")) {
    const w = pkg.exports["fontWeights"];
    if (!isRecord(w)) missing("fontWeights", "type.weight");
    else for (const [k, n] of Object.entries(w)) leaves.push(leaf(pkg, `type.weight.${k}`, "fontWeight", numberOf(pkg, "fontWeights", k, n)));
  }
  if (wanted.has("lineHeights")) {
    const h = pkg.exports["lineHeights"];
    if (!isRecord(h)) missing("lineHeights", "type.leading");
    else for (const [k, n] of Object.entries(h)) leaves.push(leaf(pkg, `type.leading.${k}`, "number", numberOf(pkg, "lineHeights", k, n)));
  }
  if (wanted.has("letterSpacings")) {
    const t = pkg.exports["letterSpacings"];
    if (!isRecord(t)) missing("letterSpacings", "type.tracking");
    else for (const [k, v] of Object.entries(t)) leaves.push(leaf(pkg, `type.tracking.${k}`, "dimension", emLength(pkg, k, v)));
  }
  if (wanted.has("durations")) {
    const d = pkg.exports["durations"];
    if (!isRecord(d)) missing("durations", "motion.duration");
    else for (const [k, ms] of Object.entries(d)) if (typeof ms === "number") leaves.push(leaf(pkg, `motion.duration.${k}`, "duration", { value: ms, unit: "ms" }));
  }
  if (wanted.has("easings")) {
    const e = pkg.exports["easings"];
    if (!isRecord(e)) missing("easings", "motion.easing");
    else for (const [k, pts] of Object.entries(e)) leaves.push(leaf(pkg, `motion.easing.${k}`, "cubicBezier", [...(pts as number[])]));
  }
  if (wanted.has("reducedMotion")) {
    const r = pkg.exports["reducedMotion"];
    if (!isRecord(r)) missing("reducedMotion", "motion.reduced");
    else {
      for (const [k, v] of Object.entries(r)) {
        if (k === "duration" && typeof v === "number") leaves.push(leaf(pkg, `motion.reduced.${k}`, "duration", { value: v, unit: "ms" }));
        else if (typeof v === "string") leaves.push(leaf(pkg, `motion.reduced.${k}`, "string", v));
        else if (typeof v === "boolean") leaves.push(leaf(pkg, `motion.reduced.${k}`, "boolean", v));
      }
    }
  }
  return { leaves };
}
