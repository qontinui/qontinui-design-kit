// Plan 2026-11-21-design-kit-compiler-gaps Phase 2: an `em` length stays `em`
// in the guide, and a page whose stylesheet did not load reads UNKNOWN (exit 3)
// instead of a verdict over browser defaults. Every expectation is a literal.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { canonical, compileSource } from "../dist/index.js";
import { main } from "../dist/cli.js";
import { openPage, serveDir } from "../dist/door/inject.js";
import { ROOT } from "./helpers.js";
import { needDoor, tmpDir, writeSpecimen } from "./kit-helpers.js";
import { leaf, mkProject } from "./project.js";

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

    const json = path.join(dir, "report.json");
    const missing = [];
    assert.equal(await main(["validate-guide", guide, page, "--root", ROOT, "--json", json], (s) => missing.push(s)), 3);
    assert.deepEqual(missing, [
      "design-kit: unknown(stylesheet-missing): /tokens.css did not load; a guide evaluated without its stylesheets reads browser defaults, not the page",
    ]);
    const unknown = JSON.parse(fs.readFileSync(json, "utf8"));
    assert.deepEqual([unknown.exitCode, unknown.stylesheets], [3, { requested: 1, failed: ["/tokens.css"], unreadable: [], pending: [] }]);

    fs.writeFileSync(path.join(dir, "tokens.css"), ":root { --dk-text: #111111; }\n");
    const present = [];
    assert.equal(await main(["validate-guide", guide, page, "--root", ROOT, "--json", json], (s) => present.push(s)), 0);
    assert.match(present.at(-1), /^design-kit validate-guide: \d+ elements, 1 rules, 0 failures \(@qontinui\/ui-bridge-wrapper@0\.12\.0\)$/);
    const report = JSON.parse(fs.readFileSync(json, "utf8"));
    assert.deepEqual([report.exitCode, report.unknown, report.stylesheets], [0, null, { requested: 1, failed: [], unreadable: [], pending: [] }]);
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

/** Run `design-kit check-states` the way a consumer does, and read the coverage it wrote. */
async function runCheckStates(sp) {
  const file = path.join(sp.dir, "state-coverage.json");
  const lines = [];
  const code = await main(["check-states", sp.file, "--root", ROOT, "--file", path.relative(ROOT, file)], (s) => lines.push(s));
  return { code, lines, cov: JSON.parse(fs.readFileSync(file, "utf8")) };
}

test("check-states: a specimen whose linked token sheet 404s is unknown, never measured, and the CLI exits 3", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const sp = await specimenWithoutInlineTokens("sheet-missing", { link: true });
  try {
    const { code, lines, cov } = await runCheckStates(sp);
    assert.equal(code, 3);
    assert.equal(cov.summary.measured, 0);
    assert.deepEqual(cov.stylesheets, { requested: 1, failed: ["/tokens.css"], unreadable: [], pending: [] });
    assert.equal(nonBaseline(cov).length, 36);
    for (const c of nonBaseline(cov)) assert.equal(c.unknown, "unknown(stylesheet-missing): /tokens.css did not load", c.id);
    assert.match(lines.join("\n"), /unknown\(stylesheet-missing\): \/tokens\.css did not load/);
    assert.equal(lines.at(-1), "design-kit: unknown(nothing-measured): no cell was measured");
  } finally {
    sp.cleanup();
  }
});

test("check-states: the kit's own --dk-kit-states does not make a page with no token declarations read known", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const sp = await specimenWithoutInlineTokens("no-tokens", { link: false });
  try {
    const { code, cov } = await runCheckStates(sp);
    assert.equal(code, 3);
    assert.equal(cov.summary.measured, 0);
    assert.deepEqual(cov.stylesheets, { requested: 0, failed: [], unreadable: [], pending: [] });
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
    const { code, cov } = await runCheckStates(sp);
    assert.equal(code, 0);
    assert.deepEqual(cov.summary, { cells: 56, measured: 36, baseline: 10, unknown: 10, findings: 0 });
    assert.deepEqual(cov.stylesheets, { requested: 1, failed: [], unreadable: [], pending: [] });
  } finally {
    sp.cleanup();
  }
});

// ---------------------------------------------------------------- review round 1

/** An app server that is not the kit's: `/route` is the page, `/ok.css` and (once `served`) `/tokens.css` are CSS, the rest 404 with an HTML body. */
async function appServer(page, { served = () => false } = {}) {
  const app = http.createServer((req, res) => {
    if (req.url.startsWith("/route")) {
      res.setHeader("content-type", "text/html");
      res.end(page);
    } else if (req.url === "/tokens.css" && served()) {
      res.setHeader("content-type", "text/css");
      res.end(":root { --dk-text: #111111; }\n");
    } else {
      res.statusCode = 404;
      res.setHeader("content-type", "text/html");
      res.end("<!doctype html><h1>404</h1>");
    }
  });
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${app.address().port}`, close: () => new Promise((r) => app.close(r)) };
}

test("validate-guide on a URL target the kit does not serve: a 404 stylesheet exits 3 naming it, and the served sheet exits 0", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const dir = tmpDir("urltarget");
  let served = false;
  const app = await appServer(PAGE.replace('href="tokens.css"', 'href="/tokens.css"'), { served: () => served });
  try {
    const guide = path.join(dir, "guide.json");
    const json = path.join(dir, "report.json");
    fs.writeFileSync(guide, JSON.stringify(GUIDE));
    const missing = [];
    assert.equal(await main(["validate-guide", guide, `${app.url}/route`, "--root", ROOT, "--json", json], (s) => missing.push(s)), 3);
    assert.deepEqual(missing, [
      "design-kit: unknown(stylesheet-missing): /tokens.css did not load; a guide evaluated without its stylesheets reads browser defaults, not the page",
    ]);
    assert.deepEqual(JSON.parse(fs.readFileSync(json, "utf8")).stylesheets, { requested: 1, failed: ["/tokens.css"], unreadable: [], pending: [] });
    served = true;
    const present = [];
    assert.equal(await main(["validate-guide", guide, `${app.url}/route`, "--root", ROOT, "--json", json], (s) => present.push(s)), 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(json, "utf8")).stylesheets, { requested: 1, failed: [], unreadable: [], pending: [] });
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("validate-guide: a sheet from another origin whose rules cannot be read is unknown(stylesheet-unreadable), not 'did not load'", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const dir = tmpDir("crossorigin");
  const sheets = await appServer("", { served: () => true });
  const app = await appServer(PAGE.replace('href="tokens.css"', `href="${"__SHEETS__"}/tokens.css"`).replace("__SHEETS__", sheets.url));
  try {
    const guide = path.join(dir, "guide.json");
    const json = path.join(dir, "report.json");
    fs.writeFileSync(guide, JSON.stringify(GUIDE));
    const lines = [];
    assert.equal(await main(["validate-guide", guide, `${app.url}/route`, "--root", ROOT, "--json", json], (s) => lines.push(s)), 3);
    assert.deepEqual(lines, [
      `design-kit: unknown(stylesheet-unreadable): ${sheets.url}/tokens.css was fetched without CORS (the link has no crossorigin attribute, or its server sends no Access-Control-Allow-Origin), so whether it carries the page's styles cannot be read`,
    ]);
    assert.deepEqual(JSON.parse(fs.readFileSync(json, "utf8")).stylesheets, { requested: 1, failed: [], unreadable: [`${sheets.url}/tokens.css`], pending: [] });
  } finally {
    await app.close();
    await sheets.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const em = (value) => ({ value, unit: "em" });

async function guideOf(source) {
  const p = mkProject({ $extensions: { qontinui: { name: "fixture" } }, ...source });
  try {
    const { outputs } = await compileSource({ sourcePath: p.sourcePath, rootDir: p.dir });
    return JSON.parse(outputs["fixture.styleguide.uibridge.json"]);
  } finally {
    p.cleanup();
  }
}

test("an em breakpoint is px at the 16px initial font size in the guide; a breakpoint in no convertible unit is refused, not dropped", async () => {
  const g = await guideOf({ layout: { breakpoint: { md: leaf("dimension", em(48), "authored(f-bp)"), lg: leaf("dimension", { value: 1024, unit: "px" }, "authored(f-bp)") } } });
  assert.deepEqual(g.tokens.breakpoints, { lg: 1024, md: 768 });
  const p = mkProject({ $extensions: { qontinui: { name: "fixture" } }, layout: { breakpoint: { wide: leaf("dimension", "50vw", "authored(f-bp)") } } });
  try {
    await assert.rejects(compileSource({ sourcePath: p.sourcePath, rootDir: p.dir }), {
      message: "layout.breakpoint.wide is 50vw; a guide breakpoint is a px, rem or em length",
    });
  } finally {
    p.cleanup();
  }
});

test("an em type scale is listed at the 16px root, as in 0.1.x, and its heading rule excludes the body step", async () => {
  const g = await guideOf({ type: { scale: { sm: leaf("dimension", em(0.875), "authored(f-s)"), md: leaf("dimension", em(1), "authored(f-s)"), lg: leaf("dimension", em(1.5), "authored(f-s)") } } });
  assert.deepEqual(g.tokens.typography.fontSizes, { lg: "24px", md: "16px", sm: "14px" });
  assert.deepEqual(g.rules.find((r) => r.id === "heading-size-on-scale").constraints[0].values, ["24px"]);
});

// ---------------------------------------------------------------- review round 2

/** A page server with fixed routes (`path -> [status, type, body]`, a 3xx's body being its Location); `/slow.css` never answers until close. */
async function routes(map) {
  const sockets = [];
  const app = http.createServer((req, res) => {
    if (req.url === "/slow.css") return; // held open: the request never gets a response
    const r = map[req.url] ?? [404, "text/html", "<!doctype html><h1>404</h1>"];
    res.statusCode = r[0];
    if (r[0] >= 300 && r[0] < 400) res.setHeader("location", r[2]);
    else res.setHeader("content-type", r[1]);
    res.end(r[0] >= 300 && r[0] < 400 ? "" : r[2]);
  });
  app.on("connection", (sock) => sockets.push(sock));
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${app.address().port}`,
    close: () => new Promise((r) => {
      for (const sock of sockets) sock.destroy();
      app.close(r);
    }),
  };
}

const TOKENS = ":root { --dk-text: #111111; }\n";
const BODY = '<body><button id="go" type="button" style="color: var(--dk-text)">Go</button></body></html>';
const head = (links, script = "") => `<!doctype html><html style="color: var(--dk-text)"><head>${links}${script}</head>${BODY}`;

async function validateUrl(name, map) {
  const dir = tmpDir(name);
  const app = await routes(map);
  try {
    const guide = path.join(dir, "guide.json");
    const json = path.join(dir, "report.json");
    fs.writeFileSync(guide, JSON.stringify(GUIDE));
    const lines = [];
    const code = await main(["validate-guide", guide, `${app.url}/route`, "--root", ROOT, "--json", json], (s) => lines.push(s));
    return { code, lines, report: JSON.parse(fs.readFileSync(json, "utf8")) };
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("validate-guide: an @import-ed sheet that 404s on a URL target exits 3 naming it", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const r = await validateUrl("import404", {
    "/route": [200, "text/html", head('<link rel="stylesheet" href="/importer.css">')],
    "/importer.css": [200, "text/css", '@import url("/missing-import.css");\n' + TOKENS],
  });
  assert.equal(r.code, 3);
  assert.deepEqual(r.lines, [
    "design-kit: unknown(stylesheet-missing): /missing-import.css did not load; a guide evaluated without its stylesheets reads browser defaults, not the page",
  ]);
  assert.deepEqual(r.report.stylesheets, { requested: 1, failed: ["/missing-import.css"], unreadable: [], pending: [] });
});

test("validate-guide: a disabled stylesheet link is not a load failure; the page is evaluated", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const r = await validateUrl("disabled", {
    "/route": [200, "text/html", head('<link rel="stylesheet" href="/tokens.css"><link rel="stylesheet" href="/dark.css" disabled>')],
    "/tokens.css": [200, "text/css", TOKENS],
    "/dark.css": [200, "text/css", ":root { --dk-text: #222222; }\n"],
  });
  assert.equal(r.code, 0, r.lines.join("\n"));
  assert.deepEqual(r.report.stylesheets, { requested: 1, failed: [], unreadable: [], pending: [] });
});

test("validate-guide: a stylesheet still loading when the page is read is unknown(stylesheet-pending), not 'did not load'", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const late = "<script>addEventListener('load', () => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/slow.css'; document.head.appendChild(l); });</script>";
  const r = await validateUrl("pending", {
    "/route": [200, "text/html", head('<link rel="stylesheet" href="/tokens.css">', late)],
    "/tokens.css": [200, "text/css", TOKENS],
  });
  assert.equal(r.code, 3);
  assert.deepEqual(r.lines, [
    "design-kit: unknown(stylesheet-pending): /slow.css had no stylesheet when the page was read (still loading, or blocked before any response)",
  ]);
  assert.deepEqual(r.report.stylesheets, { requested: 2, failed: [], unreadable: [], pending: ["/slow.css"] });
});

// ---------------------------------------------------------------- review round 3

test("validate-guide: a stylesheet answered 200 text/html (a dev-server fallback) did not load, as a link and as an @import", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const html = [200, "text/html", "<!doctype html><title>app shell</title><p>not css</p>"];
  const linked = await validateUrl("mime-link", {
    "/route": [200, "text/html", head('<link rel="stylesheet" href="/tokens.css"><link rel="stylesheet" href="/fallback.css">')],
    "/tokens.css": [200, "text/css", TOKENS],
    "/fallback.css": html,
  });
  assert.equal(linked.code, 3);
  assert.deepEqual(linked.report.stylesheets, { requested: 2, failed: ["/fallback.css"], unreadable: [], pending: [] });
  const imported = await validateUrl("mime-import", {
    "/route": [200, "text/html", head('<link rel="stylesheet" href="/importer.css">')],
    "/importer.css": [200, "text/css", '@import url("/fallback2.css");\n' + TOKENS],
    "/fallback2.css": html,
  });
  assert.equal(imported.code, 3);
  assert.deepEqual(imported.report.stylesheets, { requested: 1, failed: ["/fallback2.css"], unreadable: [], pending: [] });
});

test("validate-guide on a file target whose resource timing was cleared: the kit server's record of the 404 still exits 3", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const dir = tmpDir("cleared");
  try {
    const guide = path.join(dir, "guide.json");
    const page = path.join(dir, "page.html");
    const json = path.join(dir, "report.json");
    fs.writeFileSync(guide, JSON.stringify(GUIDE));
    fs.writeFileSync(page, head('<link rel="stylesheet" href="tokens.css">', '<script>addEventListener("load", () => performance.clearResourceTimings());</script>'));
    const lines = [];
    assert.equal(await main(["validate-guide", guide, page, "--root", ROOT, "--json", json], (s) => lines.push(s)), 3);
    assert.deepEqual(lines, [
      "design-kit: unknown(stylesheet-missing): /tokens.css did not load; a guide evaluated without its stylesheets reads browser defaults, not the page",
    ]);
    assert.deepEqual(JSON.parse(fs.readFileSync(json, "utf8")).stylesheets, { requested: 1, failed: ["/tokens.css"], unreadable: [], pending: [] });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- review round 4

test("validate-guide: a stylesheet link with an empty href did not load; it is not 'pending' under the page's own name", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const r = await validateUrl("emptyhref", {
    "/route": [200, "text/html", head('<link rel="stylesheet" href="/tokens.css"><link rel="stylesheet" href="">')],
    "/tokens.css": [200, "text/css", TOKENS],
  });
  assert.equal(r.code, 3);
  assert.deepEqual(r.report.stylesheets, { requested: 2, failed: ["<link with no href>"], unreadable: [], pending: [] });
});

// ---------------------------------------------------------------- review round 5

test("validate-guide: an @import still loading when the page is read is unknown(stylesheet-pending)", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const late = "<script>addEventListener('load', () => { const st = document.createElement('style'); st.textContent = '@import url(/slow.css);'; document.head.appendChild(st); });</script>";
  const r = await validateUrl("pending-import", {
    "/route": [200, "text/html", head('<link rel="stylesheet" href="/tokens.css">', late)],
    "/tokens.css": [200, "text/css", TOKENS],
  });
  assert.equal(r.code, 3);
  assert.deepEqual(r.report.stylesheets, { requested: 1, failed: [], unreadable: [], pending: ["/slow.css"] });
});

test("validate-guide: a stylesheet link whose type is not text/css is never fetched, and is not counted", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const r = await validateUrl("lesslink", {
    "/route": [200, "text/html", head('<link rel="stylesheet" href="/tokens.css"><link rel="stylesheet" type="text/less" href="/theme.less">')],
    "/tokens.css": [200, "text/css", TOKENS],
  });
  assert.equal(r.code, 0, r.lines.join("\n"));
  assert.deepEqual(r.report.stylesheets, { requested: 1, failed: [], unreadable: [], pending: [] });
});

// ---------------------------------------------------------------- review round 8

test("validate-guide: a 404 @import inside a sheet reached through a redirect is caught under the URL the browser requested", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const r = await validateUrl("redirect-import", {
    "/route": [200, "text/html", head('<link rel="stylesheet" href="/a.css">')],
    "/a.css": [302, "", "/sub/b.css"],
    "/sub/b.css": [200, "text/css", '@import url("c.css");\n' + TOKENS],
  });
  assert.equal(r.code, 3);
  assert.deepEqual(r.report.stylesheets, { requested: 1, failed: ["/sub/c.css"], unreadable: [], pending: [] });
});

// ---------------------------------------------------------------- review round 9

test("check-states: tokens declared behind an @import, or inside an @layer block, are read as tokens and the specimen is measured", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const imported = await specimenWithoutInlineTokens("tokens-import", { link: false });
  try {
    fs.writeFileSync(path.join(imported.dir, "tokens.css"), imported.outputs["tokens.css"]);
    fs.writeFileSync(imported.file, fs.readFileSync(imported.file, "utf8").replace("<style>", '<style>@import url("tokens.css");\n'));
    const { code, cov } = await runCheckStates(imported);
    assert.equal(code, 0);
    assert.deepEqual(cov.summary, { cells: 56, measured: 36, baseline: 10, unknown: 10, findings: 0 });
  } finally {
    imported.cleanup();
  }
  const layered = await writeSpecimen({ name: "tokens-layer" });
  try {
    fs.writeFileSync(layered.file, layered.html.replace(layered.outputs["tokens.css"], `@layer tokens {\n${layered.outputs["tokens.css"]}\n}`));
    const { code, cov } = await runCheckStates(layered);
    assert.equal(code, 0);
    assert.deepEqual(cov.summary, { cells: 56, measured: 36, baseline: 10, unknown: 10, findings: 0 });
  } finally {
    layered.cleanup();
  }
});
