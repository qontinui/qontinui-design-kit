#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compileSource, driftedOutputs, writeOutputs } from "./compile/compile.js";
import { compareBounds, formatMove, stepSummary } from "./diff/diff.js";
import type { ThresholdEntry } from "./emit/budgets.js";
import { isUrlTarget } from "./door/inject.js";
import { lintDir } from "./lint/classes.js";
import { parseSource } from "./source/parse.js";
import { SourceError, GROUPS } from "./source/schema.js";

const USAGE = `design-kit <command> [options]

  compile                    compile design/language.dtcg.json into the output dir
  compile --check            exit 1 when the committed outputs differ from a fresh compile
  status                     print each group's state and the next undeclared group
  diff --base <ref>          print LOOSENED lines for budgets and thresholds that moved toward permissive; exit 0
  lint-classes <dir>         find arbitrary-value classes and inline literal colours or lengths in .tsx files
  specimen [--check]         write (or check) specimen.html: every component, variant and state, plus the board
  check-states <url|file>    measure each specimen cell's state through the published exec door; write state-coverage.json
  validate-guide <guide> <url|file> [--storage-state <file>] [--json <file>]
                             run the guide's rules (ui-bridge validateElement) over the page's elements;
                             a page whose stylesheet did not load is UNKNOWN (exit 3). A file target
                             resolves against the current directory, the guide against --root
  index [--check]            write (or check) the component index between the markers in CLAUDE.md

options
  --root <dir>       project root (default: cwd)
  --source <file>    source file, relative to --root (default: design/language.dtcg.json)
  --out <dir>        output dir, relative to --root (default: src/design)
  --base <ref>       git ref to compare against (diff)
  --file <file>      specimen.html (specimen), CLAUDE.md (index), state-coverage.json (check-states), relative to --root
  --kit-dir <dir>    directory holding the kit's .tsx sources or .d.ts declarations (index)
  --storage-state <file>
                     a Playwright storageState the door's browser starts from, for an authed route
                     (validate-guide; passed as the wrapper's own --storage-state), relative to --root
  --json <file>      write the report as JSON (validate-guide): elements, rules, failures by rule and
                     element, unmatched rules, stylesheets, instrument, exit code and, on exit 3, the
                     unknown(...) reason; relative to --root

exit codes: 0 ok, 1 drift or findings, 2 refused or misused, 3 UNKNOWN (the instrument could not measure)
`;

interface Args {
  command: string | null;
  positional: string[];
  check: boolean;
  root: string;
  source: string;
  out: string;
  base: string | null;
  file: string | null;
  kitDir: string | null;
  storageState: string | null;
  json: string | null;
}

/** A value flag's value is present: not missing, not empty, not the next option. One predicate for parseArgs and the raw-argv scan. */
function hasValue(next: string | undefined): next is string {
  return next !== undefined && next !== "" && !next.startsWith("--");
}

export function parseArgs(argv: string[]): Args {
  const a: Args = { command: null, positional: [], check: false, root: process.cwd(), source: "design/language.dtcg.json", out: "src/design", base: null, file: null, kitDir: null, storageState: null, json: null };
  let i = 0;
  const flagValue = (flag: string): string => {
    const next = argv[++i];
    if (!hasValue(next)) throw new Error(`${flag} needs a value`);
    return next;
  };
  for (i = 0; i < argv.length; i++) {
    const v = argv[i] as string;
    if (v === "--check") a.check = true;
    else if (Object.hasOwn(VALUE_OPTIONS, v)) {
      const key = VALUE_OPTIONS[v as keyof typeof VALUE_OPTIONS];
      const given = flagValue(v);
      if (key === "root") a.root = path.resolve(given);
      else a[key] = given;
    } else if (v.startsWith("-")) throw new Error(`unknown option ${v}`);
    else if (a.command === null) a.command = v;
    else a.positional.push(v);
  }
  return a;
}

type Out = (s: string) => void;

const COMMANDS = ["compile", "status", "diff", "lint-classes", "specimen", "check-states", "validate-guide", "index"];

/** Two paths name one file: equal, or (both existing) the same device and inode, which a case-insensitive filesystem needs. */
function samePath(a: string, b: string): boolean {
  if (a === b) return true;
  try {
    // bigint: a 64-bit file id (NTFS) loses its low bits as a Number.
    const x = fs.statSync(a, { bigint: true });
    const y = fs.statSync(b, { bigint: true });
    return x.dev === y.dev && x.ino === y.ino;
  } catch {
    return false;
  }
}

/** The options that take a value, and the field each sets: one table for parseArgs and for the raw-argv scan in clearJsonReport. */
const VALUE_OPTIONS = {
  "--root": "root",
  "--source": "source",
  "--out": "out",
  "--base": "base",
  "--file": "file",
  "--kit-dir": "kitDir",
  "--storage-state": "storageState",
  "--json": "json",
} as const satisfies Record<string, keyof Args>;
const VALUE_FLAGS: ReadonlySet<string> = new Set(Object.keys(VALUE_OPTIONS));

/**
 * `validate-guide --json <file>`: remove an earlier report before anything can
 * refuse the run (exit 2), argument parsing included, so a refused run never
 * leaves a previous verdict standing at that path. It reads the raw argv for
 * that reason. A path that is one of the run's inputs (the guide, a file
 * target), or that cannot be removed (a directory), is refused with exit 2 and
 * left as it is. Returns the exit code to stop with, or null to go on.
 */
function clearJsonReport(argv: string[], out: Out): number | null {
  let root = process.cwd();
  let json: string | null = null;
  let storageState: string | null = null;
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i] as string;
    if (VALUE_FLAGS.has(v)) {
      const next = argv[i + 1];
      // A value flag with no value, or an empty one (an unset "$ROOT"): parseArgs refuses the run, and the
      // paths it would name are unknown, so clear nothing.
      if (!hasValue(next)) return null;
      if (v === "--root") root = path.resolve(next);
      if (v === "--json") json = next;
      if (v === "--storage-state") storageState = next;
      i++;
    } else if (!v.startsWith("-")) positional.push(v);
  }
  if (positional[0] !== "validate-guide" || json === null) return null;
  const file = path.resolve(root, json);
  const [, guide, target] = positional;
  const inputs = [
    guide ? path.resolve(root, guide) : null,
    target && !isUrlTarget(target) ? path.resolve(target) : null,
    storageState ? path.resolve(root, storageState) : null,
  ].filter((f): f is string => f !== null);
  if (inputs.some((f) => samePath(f, file))) {
    out(`design-kit: --json ${file} is one of validate-guide's inputs; refusing to overwrite it`);
    return 2;
  }
  try {
    fs.rmSync(file, { force: true });
  } catch (e) {
    out(`design-kit: --json ${file} cannot be replaced: ${(e as Error).message}`);
    return 2;
  }
  return null;
}

/** Runs the CLI and returns the exit code (see USAGE). */
export async function main(argv: string[], out: Out = (s) => process.stdout.write(s + "\n")): Promise<number> {
  const cleared = clearJsonReport(argv, out);
  if (cleared !== null) return cleared;
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    out((e as Error).message + "\n" + USAGE);
    return 2;
  }
  if (args.command === null || !COMMANDS.includes(args.command)) {
    out(USAGE);
    return args.command === null ? 0 : 2;
  }
  const arity: Record<string, number> = { compile: 0, status: 0, diff: 0, specimen: 0, index: 0, "lint-classes": 1, "check-states": 1, "validate-guide": 2 };
  if ((args.storageState !== null || args.json !== null) && args.command !== "validate-guide") {
    out(`design-kit: --storage-state and --json apply to validate-guide only\n` + USAGE);
    return 2;
  }
  if (args.positional.length > (arity[args.command] ?? 0)) {
    out(`design-kit: unexpected argument ${args.positional[arity[args.command] ?? 0]}\n` + USAGE);
    return 2;
  }
  try {
    switch (args.command) {
      case "compile":
      case "status":
        return await compileCommand(args, out);
      case "diff":
        return await diffCommand(args, out);
      case "lint-classes":
        return lintCommand(args, out);
      case "specimen":
        return await specimenCommand(args, out);
      case "check-states":
        return await checkStatesCommand(args, out);
      case "validate-guide":
        return await validateGuideCommand(args, out);
      default:
        return await indexCommand(args, out);
    }
  } catch (e) {
    if (e instanceof SourceError) {
      out("design-kit: the source was refused:\n  " + e.problems.join("\n  "));
      return 2;
    }
    const msg = (e as Error).message;
    out(`design-kit: ${msg}`);
    return msg.startsWith("unknown(") ? 3 : 2;
  }
}

const sourcePathOf = (a: Args): string => path.resolve(a.root, a.source);
const outDirOf = (a: Args): string => path.resolve(a.root, a.out);

async function compileCommand(args: Args, out: Out): Promise<number> {
  const { outputs, report } = await compileSource({ sourcePath: sourcePathOf(args), rootDir: args.root });
  const outDir = outDirOf(args);
  if (args.command === "status") {
    for (const g of GROUPS) out(`${g}: ${report.groups[g].state}`);
    out(`identity: ${report.identity.state}`);
    out(`next undeclared group: ${report.next_undeclared_group ?? "none"}`);
    return 0;
  }
  if (args.check) {
    const drifted = driftedOutputs(outDir, outputs);
    if (drifted.length > 0) {
      out(`design-kit: drift in ${drifted.join(", ")} (run \`design-kit compile\`)`);
      return 1;
    }
    out("design-kit: outputs match a fresh compile");
    return 0;
  }
  writeOutputs(outDir, outputs);
  const undeclared = Object.entries(report.groups).filter(([, g]) => g.state === "undeclared").map(([n]) => n);
  out(`design-kit: wrote ${Object.keys(outputs).length} files to ${path.relative(args.root, outDir) || "."}`);
  out(`undeclared groups: ${undeclared.length ? undeclared.join(", ") : "none"}; identity: ${report.identity.state}`);
  return 0;
}

function gitShow(root: string, ref: string, rel: string): string | null {
  try {
    return execFileSync("git", ["-C", root, "show", `${ref}:./${rel.split(path.sep).join("/")}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

async function diffCommand(args: Args, out: Out): Promise<number> {
  if (!args.base || args.base.startsWith("-")) {
    out("design-kit: diff needs --base <ref>\n" + USAGE);
    return 2;
  }
  const { outputs } = await compileSource({ sourcePath: sourcePathOf(args), rootDir: args.root });
  const rel = path.relative(args.root, outDirOf(args));
  const moves = [];
  let unreadable = 0;
  for (const [file, key] of [["design-budgets.json", "budgets"], ["visual-system.thresholds.json", "thresholds"]] as const) {
    const before = gitShow(args.root, args.base, path.join(rel, file));
    if (before === null) {
      out(`UNKNOWN ${file} is not readable at ${args.base}; nothing to compare`);
      unreadable++;
      continue;
    }
    const base = (JSON.parse(before) as Record<string, ThresholdEntry[]>)[key] ?? [];
    const now = (JSON.parse(outputs[file] as string) as Record<string, ThresholdEntry[]>)[key] ?? [];
    moves.push(...compareBounds(base, now));
  }
  for (const m of moves) out(formatMove(m));
  if (unreadable > 0) out(`design-kit: ${unreadable} of 2 files not compared; a missing baseline is UNKNOWN, not a clean diff`);
  else if (moves.length === 0) out("design-kit: no loosened budget or threshold");
  const summary = process.env["GITHUB_STEP_SUMMARY"];
  if (summary) fs.appendFileSync(summary, stepSummary(args.base, moves, unreadable));
  // D6: a loosening is marked, never failed, so the verb exits 0 whatever it finds.
  return 0;
}

function lintCommand(args: Args, out: Out): number {
  const dir = args.positional[0];
  if (!dir) {
    out("design-kit: lint-classes needs a directory\n" + USAGE);
    return 2;
  }
  const exceptions = new Set<string>();
  const sp = sourcePathOf(args);
  if (fs.existsSync(sp)) {
    for (const l of parseSource(JSON.parse(fs.readFileSync(sp, "utf8"))).leaves) {
      if (l.group === "exceptions") exceptions.add(l.path.slice("exceptions.".length));
    }
  }
  const { files, findings } = lintDir(path.resolve(args.root, dir), exceptions);
  if (files === 0) {
    out(`design-kit lint-classes: no .tsx files under ${dir}; a check that read nothing is UNKNOWN, not clean`);
    return 2;
  }
  for (const f of findings) out(`${f.file}:${f.line}:${f.column} ${f.rule} ${f.match}`);
  out(`design-kit lint-classes: ${files} files, ${findings.length} findings`);
  return findings.length > 0 ? 1 : 0;
}

async function specimenCommand(args: Args, out: Out): Promise<number> {
  const { outputs, report, entries } = await compileSource({ sourcePath: sourcePathOf(args), rootDir: args.root });
  const { generateSpecimen } = await import("./specimen/render.js");
  const html = generateSpecimen({ tokensCss: outputs["tokens.css"] as string, entries, identity: report.identity.state });
  const file = path.resolve(args.root, args.file ?? "specimen.html");
  if (args.check) {
    if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== html) {
      out(`design-kit: ${path.relative(args.root, file)} differs from a fresh specimen (run \`design-kit specimen\`)`);
      return 1;
    }
    out("design-kit: specimen matches a fresh render");
    return 0;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  out(`design-kit: wrote ${path.relative(args.root, file)}`);
  return 0;
}

async function checkStatesCommand(args: Args, out: Out): Promise<number> {
  const target = args.positional[0];
  if (!target) {
    out("design-kit: check-states needs a URL or an html file\n" + USAGE);
    return 2;
  }
  const { checkStates, unexpectedUnknowns } = await import("./specimen/check-states.js");
  const coverage = await checkStates(target, args.root);
  const file = path.resolve(args.root, args.file ?? "state-coverage.json");
  fs.writeFileSync(file, JSON.stringify(coverage, null, 2) + "\n");
  for (const f of coverage.findings) out(`FINDING ${f.finding} ${f.id}: ${f.detail}`);
  const s = coverage.summary;
  out(`design-kit check-states: ${s.cells} cells, ${s.measured} measured, ${s.baseline} baseline, ${s.unknown} unknown, ${s.findings} findings (${coverage.instrument})`);
  if (s.findings > 0) return 1;
  // Name why before the verdict: a missing stylesheet makes every cell unknown, so nothing is measured.
  const odd = unexpectedUnknowns(coverage);
  for (const c of odd.slice(0, 5)) out(`${c.unknown} ${c.id}`);
  if (s.measured === 0) {
    out("design-kit: unknown(nothing-measured): no cell was measured");
    return 3;
  }
  return odd.length > 0 ? 3 : 0;
}

async function validateGuideCommand(args: Args, out: Out): Promise<number> {
  const [guide, target] = args.positional;
  if (!guide || !target) {
    out("design-kit: validate-guide needs <guide> <url|file>\n" + USAGE);
    return 2;
  }
  const jsonFile = args.json !== null ? path.resolve(args.root, args.json) : null;
  let storageState: string | undefined;
  if (args.storageState !== null) {
    storageState = path.resolve(args.root, args.storageState);
    let readable = false;
    try {
      fs.accessSync(storageState, fs.constants.R_OK);
      readable = fs.statSync(storageState).isFile();
    } catch {
      readable = false;
    }
    if (!readable) {
      out(`design-kit: --storage-state ${storageState} is not a readable file`);
      return 2;
    }
  }
  const { validateGuide, guideJson, GuideUnknown } = await import("./validate/guide.js");
  // The verdict is printed before the report is written, so a report that cannot be written
  // (a read-only directory) is a second line and exit 2, never a replacement for the verdict.
  const writeJson = (json: ReturnType<typeof guideJson>): boolean => {
    if (jsonFile === null) return true;
    try {
      fs.mkdirSync(path.dirname(jsonFile), { recursive: true });
      fs.writeFileSync(jsonFile, JSON.stringify(json, null, 2) + "\n");
      return true;
    } catch (e) {
      out(`design-kit: --json ${jsonFile} could not be written: ${(e as Error).message}`);
      return false;
    }
  };
  let report;
  try {
    report = await validateGuide(path.resolve(args.root, guide), target, args.root, storageState ? { storageState } : {});
  } catch (e) {
    if (!(e instanceof GuideUnknown)) throw e;
    // An UNKNOWN still writes its report, with the reason (exit 3).
    out(`design-kit: ${e.message}`);
    return writeJson(guideJson(e.partial, 3, e.message)) ? 3 : 2;
  }
  const errors = report.failures.filter((f) => f.severity === "error");
  for (const id of report.unmatchedRules) out(`UNMATCHED ${id}: no element on the page answers to this rule`);
  for (const f of report.failures) out(`${f.severity.toUpperCase()} ${f.elementId} ${f.ruleId}: ${f.messages.join("; ")}`);
  out(`design-kit validate-guide: ${report.elements} elements, ${report.rules} rules, ${report.failures.length} failures (${report.instrument})`);
  if (errors.length === 0 && report.rules > 0 && report.unmatchedRules.length === report.rules) {
    const why = "unknown(no-rule-matched): no rule answered to any element; nothing was evaluated";
    out(`design-kit: ${why}`);
    return writeJson(guideJson(report, 3, why)) ? 3 : 2;
  }
  const code = errors.length > 0 ? 1 : 0;
  return writeJson(guideJson(report, code, null)) ? code : 2;
}

async function indexCommand(args: Args, out: Out): Promise<number> {
  const ts = await import("typescript").then((m) => m.default ?? m).catch(() => {
    throw new Error("the `typescript` package is required by `design-kit index` (install it as a dev dependency)");
  });
  const { ALL } = await import("./kit/registry.js");
  const { generateIndex, applyIndex, checkIndex } = await import("./index-gen/generate.js");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const kitDir = args.kitDir ? path.resolve(args.root, args.kitDir) : path.join(here, "kit");
  const body = generateIndex({ sourceDir: kitDir, entries: ALL, typescript: ts as typeof import("typescript") });
  const unread = body.split("\n").filter((l) => l.startsWith("(no source found for") || l.startsWith("(props type of"));
  if (unread.length > 0) {
    out(`design-kit: cannot read the kit's props from ${kitDir}: ${unread.join(" ")}\nan index that omits a contract is UNKNOWN, not current (pass --kit-dir)`);
    return 2;
  }
  const file = path.resolve(args.root, args.file ?? "CLAUDE.md");
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (args.check) {
    const state = checkIndex(current, body);
    if (state === "current") {
      out("design-kit: the component index is current");
      return 0;
    }
    out(`design-kit: the component index in ${path.relative(args.root, file)} is ${state} (run \`design-kit index\`)`);
    return 1;
  }
  fs.writeFileSync(file, applyIndex(current, body));
  out(`design-kit: wrote the component index (${Buffer.byteLength(body)} bytes) to ${path.relative(args.root, file)}`);
  return 0;
}

// `node_modules/.bin/design-kit` is a symlink: compare real paths.
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
