#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { compileSource, driftedOutputs, writeOutputs } from "./compile/compile.js";
import { SourceError, GROUPS } from "./source/schema.js";

const USAGE = `design-kit <command> [options]

  compile            compile design/language.dtcg.json into the output dir
  compile --check    exit 1 when the committed outputs differ from a fresh compile
  status             print each group's state and the next undeclared group

options
  --root <dir>       project root (default: cwd)
  --source <file>    source file, relative to --root (default: design/language.dtcg.json)
  --out <dir>        output dir, relative to --root (default: src/design)
`;

interface Args {
  command: string | null;
  check: boolean;
  root: string;
  source: string;
  out: string;
}

export function parseArgs(argv: string[]): Args {
  const a: Args = { command: null, check: false, root: process.cwd(), source: "design/language.dtcg.json", out: "src/design" };
  let i = 0;
  const value = (flag: string): string => {
    const next = argv[++i];
    if (next === undefined || next === "" || next.startsWith("--")) throw new Error(`${flag} needs a value`);
    return next;
  };
  for (i = 0; i < argv.length; i++) {
    const v = argv[i] as string;
    if (v === "--check") a.check = true;
    else if (v === "--root") a.root = path.resolve(value(v));
    else if (v === "--source") a.source = value(v);
    else if (v === "--out") a.out = value(v);
    else if (v.startsWith("-")) throw new Error(`unknown option ${v}`);
    else if (a.command === null) a.command = v;
    else throw new Error(`unexpected argument ${v}`);
  }
  return a;
}

/** Runs the CLI and returns the exit code: 0 ok, 1 drift, 2 a source or usage error. */
export async function main(argv: string[], out: (s: string) => void = (s) => process.stdout.write(s + "\n")): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    out((e as Error).message + "\n" + USAGE);
    return 2;
  }
  if (args.command !== "compile" && args.command !== "status") {
    out(USAGE);
    return args.command === null ? 0 : 2;
  }
  const sourcePath = path.resolve(args.root, args.source);
  const outDir = path.resolve(args.root, args.out);
  try {
    const { outputs, report } = await compileSource({ sourcePath, rootDir: args.root });
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
  } catch (e) {
    if (e instanceof SourceError) {
      out("design-kit: the source was refused:\n  " + e.problems.join("\n  "));
      return 2;
    }
    out(`design-kit: ${(e as Error).message}`);
    return 2;
  }
}

// `node_modules/.bin/design-kit` is a symlink: compare real paths.
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
