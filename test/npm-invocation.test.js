// The token package is built with npm. On Windows npm is npm.cmd, which
// execFileSync cannot launch without a shell ("spawnSync npm ENOENT"), and a
// shell would split and interpret path arguments. So npm runs as npm-cli.js
// under this node, chosen the way npm.cmd chooses it, and nothing launches a
// shell.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { npmLauncher } from "../dist/adapters/npm.js";

const NODE = "C:\\Program Files\\nodejs\\node.exe";
const BIN = "C:\\Program Files\\nodejs\\node_modules\\npm\\bin";
const BESIDE = `${BIN}\\npm-cli.js`;
const PREFIX_JS = `${BIN}\\npm-prefix.js`;
const GLOBAL = "C:\\Users\\u\\AppData\\Roaming\\npm\\node_modules\\npm\\bin\\npm-cli.js";

const only = (...present) => (p) => present.includes(p);
const noPrefix = () => null;
const prefixAt = (dir) => (node, js, cwd) => {
  assert.equal(node, NODE);
  assert.equal(js, PREFIX_JS);
  assert.equal(cwd, "C:\\work");
  return dir;
};

test("on Windows, a globally upgraded npm under npm's prefix wins, as npm.cmd does", () => {
  assert.deepEqual(npmLauncher("win32", {}, NODE, only(PREFIX_JS, BESIDE, GLOBAL), prefixAt("C:\\Users\\u\\AppData\\Roaming\\npm"), "C:\\work"), {
    file: NODE,
    prefix: [GLOBAL],
    source: "global-prefix",
  });
});

test("on Windows with no npm under the global prefix, the npm-cli.js beside node.exe runs", () => {
  assert.deepEqual(npmLauncher("win32", {}, NODE, only(PREFIX_JS, BESIDE), prefixAt("C:\\Users\\u\\AppData\\Roaming\\npm"), "C:\\work"), {
    file: NODE,
    prefix: [BESIDE],
    source: "beside-node",
  });
  // An unreadable prefix, or no npm-prefix.js at all, falls back the same way.
  assert.equal(npmLauncher("win32", {}, NODE, only(PREFIX_JS, BESIDE), noPrefix).source, "beside-node");
  assert.equal(npmLauncher("win32", {}, NODE, only(BESIDE), prefixAt("unused")).source, "beside-node");
});

test("on Windows with no npm-cli.js anywhere, it refuses and names where it looked", () => {
  assert.throws(
    () => npmLauncher("win32", {}, "C:\\tools\\node.exe", only(), noPrefix),
    /cannot launch npm on Windows without a shell: no npm-cli\.js beside C:\\tools\\node\.exe \(looked for C:\\tools\\node_modules\\npm\\bin\\npm-cli\.js; npm's global prefix could not be probed: no C:\\tools\\node_modules\\npm\\bin\\npm-prefix\.js\)/,
  );
});

test("on Linux and macOS with no npm_execpath, npm runs from PATH", () => {
  assert.deepEqual(npmLauncher("linux", {}, "/usr/bin/node", only(), noPrefix), { file: "npm", prefix: [], source: "path" });
  assert.deepEqual(npmLauncher("darwin", {}, "/usr/bin/node", only(), noPrefix), { file: "npm", prefix: [], source: "path" });
});

test("when npm launched the kit, its npm-cli.js runs under this node, on every platform", () => {
  for (const execpath of ["C:\\nodejs\\node_modules\\npm\\bin\\npm-cli.js", "/usr/lib/node_modules/npm/bin/npm-cli.js"]) {
    for (const platform of ["win32", "linux"]) {
      assert.deepEqual(npmLauncher(platform, { npm_execpath: execpath }, "node", only(), noPrefix), {
        file: "node",
        prefix: [execpath],
        source: "npm_execpath",
      });
    }
  }
});

test("an npm_execpath that is not npm-cli.js (pnpm, yarn, bun, npx) is ignored", () => {
  for (const execpath of ["C:\\pnpm\\bin\\pnpm.cjs", "/usr/lib/yarn/bin/yarn.js", "/home/u/.yarn/releases/yarn-4.1.0.cjs", "/usr/bin/bun", "C:\\nodejs\\node_modules\\npm\\bin\\npx-cli.js"]) {
    assert.deepEqual(npmLauncher("linux", { npm_execpath: execpath }, "node", only(), noPrefix), { file: "npm", prefix: [], source: "path" });
    assert.equal(npmLauncher("win32", { npm_execpath: execpath }, NODE, only(BESIDE), noPrefix).source, "beside-node");
  }
});

test("the launcher this box resolves with npm_execpath removed actually runs npm", () => {
  // Outside npm: on Windows this is the global-prefix or beside-node arm; elsewhere, PATH.
  const env = { ...process.env };
  delete env["npm_execpath"];
  const l = npmLauncher(process.platform, env);
  let expected = "path";
  if (process.platform === "win32") {
    // Probe the way npm.cmd does, independently, and require exactly that arm.
    const bin = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin");
    const prefix = execFileSync(process.execPath, [path.join(bin, "npm-prefix.js")], { encoding: "utf8" }).trim();
    expected = fs.existsSync(path.join(prefix, "node_modules", "npm", "bin", "npm-cli.js")) ? "global-prefix" : "beside-node";
  }
  assert.equal(l.source, expected);
  const version = execFileSync(l.file, [...l.prefix, "--version"], { encoding: "utf8", env }).trim();
  assert.match(version, /^\d+\.\d+\.\d+/);
});
