// A thin driver for the published `ui-bridge-inject` exec door
// (@qontinui/ui-bridge-wrapper@0.12.0), pinned in devDependencies together with
// the @qontinui/ui-bridge-headless peer the bare `npx` form does not install.
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { ROOT } from "./helpers.js";

const BIN = path.join(ROOT, "node_modules", "@qontinui", "ui-bridge-wrapper", "dist", "inject-cli.cjs");

/** Serve a directory over http on an ephemeral loopback port. */
export function serveDir(dir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const file = path.join(dir, decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/"));
      if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.statusCode = 404;
        res.end("not found");
        return;
      }
      // A module script is refused unless it is served with a JavaScript type (the AppShell page hydrates).
      const type = file.endsWith(".html") ? "text/html" : file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "text/javascript" : "application/octet-stream";
      res.setHeader("content-type", type);
      res.end(fs.readFileSync(file));
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

/**
 * Run NDJSON steps through the door. Resolves to
 * { ok, lines: [{action, result, error?}], stderr, code }.
 * `viewport` ("WxH" in CSS pixels) only sizes the browser (`--viewport`);
 * every scroll, focus and reading is a step through the Bridge.
 */
export function runInject(url, steps, { timeoutMs = 120000, viewport } = {}) {
  return new Promise((resolve) => {
    const args = [BIN, "--url", url, "--exec-stdin", "--quiet", ...(viewport ? ["--viewport", viewport] : [])];
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      clearTimeout(timer);
      const lines = stdout
        .split("\n")
        .filter((l) => l.startsWith("{"))
        .map((l) => JSON.parse(l));
      resolve({ ok: code === 0, lines, stderr, code });
    });
    child.stdin.end(steps.map((s) => JSON.stringify(s)).join("\n") + "\n");
  });
}

/** The properties whose value changed between `default` and each requested state. */
export function stateDiffs(line) {
  const out = {};
  for (const s of line.result.stateStyles ?? []) {
    out[s.state] = s.diffFromDefault.map((d) => d.property);
  }
  return out;
}
