// How the kit launches npm, without a shell on any platform.
//
// `execFileSync("npm", ...)` fails on Windows with `spawnSync npm ENOENT`:
// npm is `npm.cmd` there, a batch file. Node will not look a bare `npm` up as
// `npm.cmd`, and refuses to run an explicit `.cmd` without a shell (EINVAL,
// CVE-2024-27980). A shell is not an answer: Node then joins the arguments
// unquoted, so cmd.exe splits a path at a space and acts on `&`, `^` and `%`
// in it, and Node 24 prints a DEP0190 deprecation warning for it. So the kit
// runs npm's own JavaScript entry point, `npm-cli.js`, under the Node it is
// running on, picking the same `npm-cli.js` that `npm.cmd` itself would.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** A resolved npm launcher: run `file` with `prefix` before npm's own arguments. */
export interface NpmLauncher {
  file: string;
  prefix: string[];
  /** How it was found, for error messages. */
  source: "npm_execpath" | "global-prefix" | "beside-node" | "path";
}

const NPM_CLI = /^npm-cli\.[cm]?js$/;

/** What `npm-prefix.js` prints: npm's global prefix, or null when it cannot be read. */
function readGlobalPrefix(nodePath: string, prefixJs: string, cwd: string): string | null {
  try {
    // npm.cmd runs npm-prefix.js in the directory npm is invoked in, where a
    // project .npmrc can set prefix, so the probe runs in the npm call's cwd too.
    const out = execFileSync(nodePath, [prefixJs], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 30_000 });
    const line = out.split(/\r?\n/).find((l) => l.trim() !== "");
    return line ? line.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Resolve how to launch npm.
 * - When npm launched the kit (`npm_execpath` names `npm-cli.js`), run that
 *   script under this Node. pnpm, yarn and bun set `npm_execpath` too, to
 *   their own launchers, and are ignored; so is `npx-cli.js`, which falls
 *   through to the arms below.
 * - On Windows otherwise, do what `npm.cmd` does: ask the `npm-prefix.js`
 *   beside `node.exe` for npm's global prefix and run the `npm-cli.js` under
 *   it when there is one (a globally upgraded npm), else the `npm-cli.js` the
 *   Node installer puts beside `node.exe`. If neither exists, refuse with a
 *   message rather than fall back to a shell.
 * - Elsewhere, run `npm` from PATH, as before.
 */
export function npmLauncher(
  platform: string = process.platform,
  env: Record<string, string | undefined> = process.env,
  nodePath: string = process.execPath,
  exists: (p: string) => boolean = fs.existsSync,
  globalPrefix: (nodePath: string, prefixJs: string, cwd: string) => string | null = readGlobalPrefix,
  cwd: string = process.cwd(),
): NpmLauncher {
  const execpath = env["npm_execpath"];
  // win32's basename splits on both separators, so it reads either spelling.
  if (execpath && NPM_CLI.test(path.win32.basename(execpath))) return { file: nodePath, prefix: [execpath], source: "npm_execpath" };
  if (platform === "win32") {
    const bin = path.win32.join(path.win32.dirname(nodePath), "node_modules", "npm", "bin");
    const beside = path.win32.join(bin, "npm-cli.js");
    const prefixJs = path.win32.join(bin, "npm-prefix.js");
    const tried: string[] = [];
    if (exists(prefixJs)) {
      const prefix = globalPrefix(nodePath, prefixJs, cwd);
      if (prefix) {
        const globalCli = path.win32.join(prefix, "node_modules", "npm", "bin", "npm-cli.js");
        if (exists(globalCli)) return { file: nodePath, prefix: [globalCli], source: "global-prefix" };
        tried.push(globalCli);
      }
    }
    if (exists(beside)) return { file: nodePath, prefix: [beside], source: "beside-node" };
    throw new Error(
      `cannot launch npm on Windows without a shell: no npm-cli.js beside ${nodePath} (looked for ${[...tried, beside].join(", ")}; ` +
        `npm's global prefix ${exists(prefixJs) ? "was probed with " + prefixJs : "could not be probed: no " + prefixJs}). ` +
        `Run the kit through npm (npm exec / an npm script), or install npm beside node.`,
    );
  }
  return { file: "npm", prefix: [], source: "path" };
}
