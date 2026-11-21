/**
 * A driver for the PUBLISHED exec door: `ui-bridge-inject --exec-stdin` from
 * `@qontinui/ui-bridge-wrapper@0.12.0`, which needs the optional
 * `@qontinui/ui-bridge-headless` peer and Playwright's Chromium. The kit pins
 * both and never ships a copy of either.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";

export interface DoorStep {
  action: string;
  payload: Record<string, unknown>;
}

export interface DoorLine {
  action: string;
  result?: Record<string, unknown>;
  error?: { code?: string; message?: string; source?: string };
}

export interface DoorRun {
  ok: boolean;
  lines: DoorLine[];
  stderr: string;
  code: number | null;
  /** The wrapper version that answered, e.g. `@qontinui/ui-bridge-wrapper@0.12.0`. */
  instrument: string;
}

/** Locate the wrapper's `inject-cli.cjs`, looking from the project first, then from the kit itself. */
export function resolveInjectBin(rootDir: string): { bin: string; instrument: string } {
  const from = [path.join(rootDir, "package.json"), import.meta.url];
  for (const base of from) {
    try {
      const req = createRequire(base.startsWith("file:") ? base : base);
      const entry = req.resolve("@qontinui/ui-bridge-wrapper");
      const dist = path.dirname(entry);
      const bin = path.join(dist, "inject-cli.cjs");
      if (!fs.existsSync(bin)) continue;
      const pkg = JSON.parse(fs.readFileSync(path.join(dist, "..", "package.json"), "utf8")) as { version?: string };
      return { bin, instrument: `@qontinui/ui-bridge-wrapper@${pkg.version ?? "unknown"}` };
    } catch {
      // try the next base
    }
  }
  throw new Error("@qontinui/ui-bridge-wrapper is not installed (install it with @qontinui/ui-bridge-headless and run `npx playwright install chromium`)");
}

export function runDoor(rootDir: string, url: string, steps: DoorStep[], opts: { timeoutMs?: number } = {}): Promise<DoorRun> {
  const { bin, instrument } = resolveInjectBin(rootDir);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bin, "--url", url, "--exec-stdin", "--quiet"], { cwd: rootDir, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs ?? 180_000);
    child.stdout.on("data", (d: Buffer) => (stdout += d));
    child.stderr.on("data", (d: Buffer) => (stderr += d));
    let settled = false;
    const settle = (code: number | null, extra = ""): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const lines: DoorLine[] = [];
      for (const l of stdout.split("\n")) {
        if (!l.startsWith("{")) continue;
        try {
          lines.push(JSON.parse(l) as DoorLine);
        } catch {
          // A truncated or non-JSON line (a log line, a run killed by the timeout) is not an answer.
          stderr += `\nunparsed door line: ${l.slice(0, 80)}`;
        }
      }
      resolve({ ok: code === 0, lines, stderr: stderr + extra, code, instrument });
    };
    child.on("error", (e) => settle(null, `\nspawn failed: ${e.message}`));
    child.on("close", (code) => settle(code));
    child.stdin.on("error", () => undefined);
    child.stdin.end(steps.map((s) => JSON.stringify(s)).join("\n") + "\n");
  });
}

const TYPES: Record<string, string> = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json" };

/** A served page: its URL, how to stop serving it, and the stylesheet requests that 404'd. */
export interface ServedPage {
  url: string;
  close: () => Promise<void>;
  /**
   * Every `.css` path the server answered 404, in request order, once each. A
   * favicon, image or font 404 is not a stylesheet miss and is not listed.
   * Always empty for a URL target (the kit does not serve it).
   */
  missed: () => string[];
}

/** Serve a directory over http on an ephemeral loopback port. */
export function serveDir(dir: string): Promise<ServedPage> {
  const root = path.resolve(dir);
  const missed: string[] = [];
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let rel: string;
      try {
        rel = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
      } catch {
        res.statusCode = 400;
        res.end("bad request");
        return;
      }
      const file = path.join(root, rel);
      const inside = path.relative(root, file);
      if (inside.startsWith("..") || path.isAbsolute(inside) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        if (path.extname(rel).toLowerCase() === ".css" && !missed.includes(rel)) missed.push(rel);
        res.statusCode = 404;
        res.end("not found");
        return;
      }
      res.setHeader("content-type", TYPES[path.extname(file)] ?? "application/octet-stream");
      res.end(fs.readFileSync(file));
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())), missed: () => [...missed] });
    });
  });
}

/**
 * A page argument is a URL or a local file. A file is served from its own
 * directory so the check never needs a dev server.
 */
export async function openPage(target: string): Promise<ServedPage> {
  if (/^https?:\/\//.test(target)) return { url: target, close: async () => undefined, missed: () => [] };
  const file = path.resolve(target);
  if (!fs.existsSync(file)) throw new Error(`not a URL and not a file: ${target}`);
  const server = await serveDir(path.dirname(file));
  return { url: `${server.url}/${path.basename(file)}`, close: server.close, missed: server.missed };
}

/** The value a `pageEvaluate` step returned, or undefined when it failed. */
export function evalValue(line: DoorLine | undefined): unknown {
  const r = line?.result as { result?: { value?: unknown } } | undefined;
  return r?.result?.value;
}
