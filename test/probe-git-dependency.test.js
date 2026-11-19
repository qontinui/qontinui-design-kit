// Probe 2 (plan Phase 1): does `npm install github:<owner>/<repo>#<sha>` of a
// package whose `prepare` script builds dist/ yield an importable package?
//
// The test installs through a git URL of a one-commit copy of HEAD's tracked tree (a local
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
    // A one-commit repo holding exactly the tracked tree of HEAD. (A CI checkout is
    // shallow, so its own history cannot be served to a clone; the mechanism
    // under test is a git dependency whose package builds in `prepare`.)
    const src = path.join(tmp, "src");
    fs.mkdirSync(src);
    const archive = execFileSync("git", ["archive", "HEAD"], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
    execFileSync("tar", ["-x", "-C", src], { input: archive });
    const git = (...args) => execFileSync("git", ["-c", "user.name=probe", "-c", "user.email=probe@example.invalid", ...args], { cwd: src, encoding: "utf8" });
    git("init", "-q");
    git("add", "-A");
    git("commit", "-q", "-m", "probe");
    const sha = git("rev-parse", "HEAD").trim();
    assert.match(sha, /^[0-9a-f]{40}$/);
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
