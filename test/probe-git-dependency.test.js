// Probe 2 (plan Phase 1): does `npm install github:<owner>/<repo>#<sha>` of a
// package whose `prepare` script builds dist/ yield an importable package?
//
// The test installs through a git URL of this checkout's HEAD commit (a local
// file transport, so it holds before anything is pushed); the real GitHub
// install is run once per sha when the record in README.md is made. A tracked
// dist/ is NOT needed when this passes (the fallback arm is unused).
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT } from "./helpers.js";

test("git dependency: prepare builds dist/ and the package imports with a bin", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dk-probe2-"));
  try {
    const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
    assert.match(sha, /^[0-9a-f]{40}$/);
    // A private repo holding exactly the HEAD commit: a detached CI merge
    // commit is not reachable from any branch, so a plain clone could miss it.
    const src = path.join(tmp, "src");
    execFileSync("git", ["init", "-q", src]);
    execFileSync("git", ["-C", src, "fetch", "-q", ROOT, sha]);
    execFileSync("git", ["-C", src, "checkout", "-q", "--detach", sha]);
    // A branch named for the sha so `npm install git+file://...#<sha>` resolves.
    const consumer = path.join(tmp, "consumer");
    fs.mkdirSync(consumer);
    fs.writeFileSync(path.join(consumer, "package.json"), JSON.stringify({ name: "consumer", version: "1.0.0", type: "module" }));
    execFileSync("npm", ["install", "--no-audit", "--no-fund", `git+file://${src}#${sha}`], {
      cwd: consumer,
      stdio: "pipe",
      encoding: "utf8",
    });
    const installed = path.join(consumer, "node_modules", "@qontinui", "design-kit");
    assert.ok(fs.existsSync(path.join(installed, "dist", "index.js")), "prepare built dist/index.js");
    assert.ok(fs.existsSync(path.join(installed, "dist", "cli.js")), "prepare built the bin");
    const out = execFileSync(
      process.execPath,
      ["-e", "import('@qontinui/design-kit').then((m) => console.log(m.designKitName))"],
      { cwd: consumer, encoding: "utf8" },
    ).trim();
    assert.equal(out, "@qontinui/design-kit");
    const npmVersion = execFileSync("npm", ["--version"], { encoding: "utf8" }).trim();
    console.log(`probe 2: npm ${npmVersion}, arm = prepare-builds-dist (no tracked dist/)`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// Seeded violation: a clone of a commit WITHOUT a build step would not carry
// dist/, so the existence assertion above is what distinguishes the two arms.
test("seeded violation: the checked-out source tree itself carries no dist/ for the consumer to find", () => {
  const tracked = execFileSync("git", ["ls-files", "dist"], { cwd: ROOT, encoding: "utf8" }).trim();
  assert.equal(tracked, "");
});
