// Shared fixtures for the Phase 4 to 6 tests: the example source, a compiled
// specimen on disk, and the Chromium gate.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compileSource } from "../dist/index.js";
import { generateSpecimen } from "../dist/specimen/render.js";
import { ROOT } from "./helpers.js";
import { runInject, serveDir } from "./inject.js";

export const EXAMPLE_SOURCE = path.join(ROOT, "design", "language.dtcg.json");

export const exampleJson = () => JSON.parse(fs.readFileSync(EXAMPLE_SOURCE, "utf8"));

export function tmpDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `dk-${name}-`));
}

/** Compile a source object in a temp project and return the result plus the project paths. */
export async function compileJson(json, name = "kit") {
  const dir = tmpDir(name);
  fs.mkdirSync(path.join(dir, "design"), { recursive: true });
  const sourcePath = path.join(dir, "design", "language.dtcg.json");
  fs.writeFileSync(sourcePath, JSON.stringify(json, null, 2));
  const result = await compileSource({ sourcePath, rootDir: dir });
  return { dir, sourcePath, ...result, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/** Write a specimen for the example source; `kitCss` overrides the stylesheet. */
export async function writeSpecimen({ kitCss, name = "specimen" } = {}) {
  const compiled = await compileJson(exampleJson(), name);
  const html = generateSpecimen({
    tokensCss: compiled.outputs["tokens.css"],
    entries: compiled.entries,
    identity: compiled.report.identity.state,
    ...(kitCss ? { kitCss } : {}),
  });
  const file = path.join(compiled.dir, "specimen.html");
  fs.writeFileSync(file, html);
  return { ...compiled, file, html };
}

let chromium;
/** Can the published exec door run here? Cached; the probe is a one-element page. */
export function chromiumRuns() {
  chromium ??= (async () => {
    const dir = tmpDir("chromium");
    fs.writeFileSync(path.join(dir, "p.html"), "<!doctype html><button id=b>x</button>");
    const server = await serveDir(dir);
    try {
      const run = await runInject(`${server.url}/p.html`, [{ action: "discover", payload: {} }]);
      return { ok: run.lines.length > 0, why: run.stderr.slice(0, 200).replace(/\n/g, " ") };
    } finally {
      await server.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  })();
  return chromium;
}

/**
 * The door cannot run (no Chromium): the recorded result is
 * unknown(instrument-cannot-force), never a pass. Locally the test skips with
 * that result; under CI the same condition fails.
 */
export async function needDoor(t, assert) {
  const c = await chromiumRuns();
  if (c.ok) return true;
  const why = `unknown(instrument-cannot-force): the published exec door produced no output (${c.why})`;
  assert.ok(!process.env.CI, why);
  t.skip(why);
  return false;
}
