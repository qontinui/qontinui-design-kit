// Plan 2026-11-21-design-kit-compiler-gaps Phase 2: an `em` length stays `em`
// in the guide, and a page whose stylesheet did not load reads UNKNOWN (exit 3)
// instead of a verdict over browser defaults. Every expectation is a literal.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { canonical } from "../dist/index.js";
import { main } from "../dist/cli.js";
import { openPage, serveDir } from "../dist/door/inject.js";
import { checkStates } from "../dist/specimen/check-states.js";
import { validateGuide } from "../dist/validate/guide.js";
import { ROOT } from "./helpers.js";
import { needDoor, tmpDir, writeSpecimen } from "./kit-helpers.js";

test("canonical keeps an em length as written and converts only rem at the 16px root", () => {
  assert.equal(canonical("0.05em"), "0.05em");
  assert.equal(canonical("-0.025em"), "-0.025em");
  assert.equal(canonical("1rem"), "16px");
  assert.equal(canonical("0.5rem"), "8px");
});

const get = (url) =>
  new Promise((resolve) => {
    http.get(url, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
    });
  });

test("the page server records a stylesheet 404 and nothing else; openPage forwards it", async () => {
  const dir = tmpDir("missed");
  try {
    fs.writeFileSync(path.join(dir, "p.html"), "<!doctype html><p>x</p>");
    fs.writeFileSync(path.join(dir, "here.css"), "p{}");
    const server = await serveDir(dir);
    try {
      assert.equal(await get(`${server.url}/tokens.css`), 404);
      assert.equal(await get(`${server.url}/theme.css?v=2`), 404);
      assert.equal(await get(`${server.url}/favicon.ico`), 404);
      assert.equal(await get(`${server.url}/missing.png`), 404);
      assert.equal(await get(`${server.url}/font.woff2`), 404);
      assert.equal(await get(`${server.url}/here.css`), 200);
      assert.deepEqual(server.missed(), ["/tokens.css", "/theme.css"]);
    } finally {
      await server.close();
    }
    const page = await openPage(path.join(dir, "p.html"));
    try {
      assert.equal(await get(page.url.replace("p.html", "gone.css")), 404);
      assert.deepEqual(page.missed(), ["/gone.css"]);
    } finally {
      await page.close();
    }
    const remote = await openPage("http://127.0.0.1:9/x");
    assert.deepEqual(remote.missed(), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// One rule: text is #111111, which only the linked tokens.css makes true.
const GUIDE = {
  version: "1.0.0",
  name: "fixture",
  description: "fixture",
  tokens: { colors: {}, typography: { fontFamilies: {}, fontSizes: {}, fontWeights: {}, lineHeights: {}, letterSpacings: {} }, spacing: {}, borderRadius: {}, shadows: {}, breakpoints: {} },
  rules: [{ id: "palette-color", description: "text colour is on the palette", constraints: [{ type: "oneOf", property: "color", values: ["#111111"] }], severity: "error" }],
};
// A favicon and an image that 404 are not stylesheets: they must not make the page UNKNOWN.
// (A button does not inherit colour from the UA sheet, so it reads the token itself.)
const PAGE =
  '<!doctype html><html style="color: var(--dk-text)"><head><link rel="icon" href="favicon.ico"><link rel="stylesheet" href="tokens.css"></head>' +
  '<body><button id="go" type="button" style="color: var(--dk-text)">Go</button><img src="missing.png" alt=""></body></html>';

test("validate-guide: a page whose linked tokens.css 404s exits 3 naming it; with the sheet present it exits 0 despite a 404 favicon and image", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const dir = tmpDir("sheet");
  try {
    const guide = path.join(dir, "guide.json");
    const page = path.join(dir, "page.html");
    fs.writeFileSync(guide, JSON.stringify(GUIDE));
    fs.writeFileSync(page, PAGE);

    const missing = [];
    assert.equal(await main(["validate-guide", guide, page, "--root", ROOT], (s) => missing.push(s)), 3);
    assert.deepEqual(missing, [
      "design-kit: unknown(stylesheet-missing): /tokens.css did not load; a guide evaluated without its stylesheets reads browser defaults, not the page",
    ]);

    fs.writeFileSync(path.join(dir, "tokens.css"), ":root { --dk-text: #111111; }\n");
    const present = [];
    assert.equal(await main(["validate-guide", guide, page, "--root", ROOT], (s) => present.push(s)), 0);
    assert.match(present.at(-1), /^design-kit validate-guide: \d+ elements, 1 rules, 0 failures \(@qontinui\/ui-bridge-wrapper@0\.12\.0\)$/);
    const report = await validateGuide(guide, page, ROOT);
    assert.deepEqual(report.stylesheets, { requested: 1, failed: [] });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** The shipped specimen with its tokens moved out of the inline <style>; `link` adds a <link> to tokens.css. */
async function specimenWithoutInlineTokens(name, { link }) {
  const sp = await writeSpecimen({ name });
  let html = sp.html.replace(sp.outputs["tokens.css"], "");
  if (link) html = html.replace("<style>", '<link rel="stylesheet" href="tokens.css">\n<style>');
  fs.writeFileSync(sp.file, html);
  return sp;
}

const nonBaseline = (cov) => cov.cells.filter((c) => c.status !== "baseline" && c.state !== "focus-visible");

test("check-states: a specimen whose linked token sheet 404s is unknown, never measured, and the CLI exits 3", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const sp = await specimenWithoutInlineTokens("sheet-missing", { link: true });
  try {
    const cov = await checkStates(sp.file, ROOT);
    assert.equal(cov.summary.measured, 0);
    assert.deepEqual(cov.stylesheets, { requested: 1, failed: ["/tokens.css"] });
    assert.equal(nonBaseline(cov).length, 36);
    for (const c of nonBaseline(cov)) assert.equal(c.unknown, "unknown(stylesheet-missing): /tokens.css did not load", c.id);
    const lines = [];
    const code = await main(["check-states", sp.file, "--root", ROOT, "--file", path.relative(ROOT, path.join(sp.dir, "state-coverage.json"))], (s) => lines.push(s));
    assert.equal(code, 3);
    assert.match(lines.join("\n"), /unknown\(stylesheet-missing\): \/tokens\.css did not load/);
  } finally {
    sp.cleanup();
  }
});

test("check-states: the kit's own --dk-kit-states does not make a page with no token declarations read known", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const sp = await specimenWithoutInlineTokens("no-tokens", { link: false });
  try {
    const cov = await checkStates(sp.file, ROOT);
    assert.equal(cov.summary.measured, 0);
    assert.deepEqual(cov.stylesheets, { requested: 0, failed: [] });
    for (const c of nonBaseline(cov)) assert.equal(c.unknown, "unknown(no-token-values): the page declares no --dk-* custom property other than --dk-kit-states", c.id);
  } finally {
    sp.cleanup();
  }
});

test("check-states: the same specimen with its linked token sheet present is measured complete", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const sp = await specimenWithoutInlineTokens("sheet-present", { link: true });
  try {
    fs.writeFileSync(path.join(sp.dir, "tokens.css"), sp.outputs["tokens.css"]);
    const cov = await checkStates(sp.file, ROOT);
    assert.deepEqual(cov.summary, { cells: 56, measured: 36, baseline: 10, unknown: 10, findings: 0 });
    assert.deepEqual(cov.stylesheets, { requested: 1, failed: [] });
  } finally {
    sp.cleanup();
  }
});
