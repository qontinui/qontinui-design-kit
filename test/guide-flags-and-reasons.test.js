// Plan 2026-11-21-design-kit-compiler-gaps Phase 5: an undeclared leaf carries
// its reason from the source; `validate-guide` gains `--storage-state` (passed
// to the published door) and `--json` (the machine-readable report, written on
// exit 0, 1 and 3). Every expectation is a literal.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { compileSource, parseSource, SourceError } from "../dist/index.js";
import { main } from "../dist/cli.js";
import { ROOT } from "./helpers.js";
import { needDoor, tmpDir, writeSpecimen } from "./kit-helpers.js";
import { leaf, mkProject } from "./project.js";

const REASON = "no role in @qontinui/design-tokens; owner decision pending";
const undeclaredWith = (reason) => ({ $type: "color", $extensions: { qontinui: { source: "undeclared", reason } } });

test("an undeclared leaf's $extensions.qontinui.reason is stored and listed in the compile report", async () => {
  const source = { $extensions: { qontinui: { name: "fixture" } }, color: { text: { tertiary: undeclaredWith(REASON) } } };
  const parsed = parseSource(source);
  assert.deepEqual(parsed.leaves.find((l) => l.path === "color.text.tertiary").inputs, { reason: REASON });
  const p = mkProject(source);
  try {
    const { report } = await compileSource({ sourcePath: p.sourcePath, rootDir: p.dir });
    assert.deepEqual(report.undeclared.find((u) => u.path === "color.text.tertiary"), { path: "color.text.tertiary", reason: REASON });
  } finally {
    p.cleanup();
  }
});

test("a reason on a leaf that is not undeclared, or an empty reason, is refused", () => {
  const authored = { ...leaf("number", 0.5, "authored(finding-1)") };
  authored.$extensions.qontinui.reason = "why";
  assert.throws(() => parseSource({ type: { unit: authored } }), (e) => {
    assert.ok(e instanceof SourceError);
    assert.deepEqual(e.problems, ["leaf type.unit: reason is carried only by an undeclared leaf (it says why the value is unknown); this leaf is authored"]);
    return true;
  });
  assert.throws(() => parseSource({ color: { text: { tertiary: undeclaredWith("  ") } } }), (e) => {
    assert.deepEqual(e.problems, ["leaf color.text.tertiary: reason must be a non-empty string"]);
    return true;
  });
});

const GUIDE = {
  version: "1.0.0",
  name: "fixture",
  description: "fixture",
  tokens: { colors: {}, typography: { fontFamilies: {}, fontSizes: {}, fontWeights: {}, lineHeights: {}, letterSpacings: {} }, spacing: {}, borderRadius: {}, shadows: {}, breakpoints: {} },
  rules: [{ id: "palette-color", description: "x", constraints: [{ type: "oneOf", property: "color", values: ["#111111"] }], severity: "error" }],
};

/** A project whose `@qontinui/ui-bridge-wrapper` is a stub door: it records its argv and answers nothing. */
function stubDoorProject() {
  const dir = tmpDir("stubdoor");
  const pkg = path.join(dir, "node_modules", "@qontinui", "ui-bridge-wrapper");
  fs.mkdirSync(path.join(pkg, "dist"), { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "stub", version: "1.0.0", private: true }));
  fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "@qontinui/ui-bridge-wrapper", version: "9.9.9", main: "dist/index.js" }));
  fs.writeFileSync(path.join(pkg, "dist", "index.js"), "module.exports = {};\n");
  fs.writeFileSync(
    path.join(pkg, "dist", "inject-cli.cjs"),
    "const fs = require('fs'); const path = require('path');\n" +
      "process.stdin.resume(); process.stdin.on('end', () => { fs.writeFileSync(path.join(__dirname, 'argv.json'), JSON.stringify(process.argv.slice(2))); process.exit(1); });\n",
  );
  fs.writeFileSync(path.join(dir, "guide.json"), JSON.stringify(GUIDE));
  fs.writeFileSync(path.join(dir, "state.json"), JSON.stringify({ cookies: [], origins: [] }));
  return { dir, argv: () => JSON.parse(fs.readFileSync(path.join(pkg, "dist", "argv.json"), "utf8")), cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test("validate-guide --storage-state is passed to the spawned door as the wrapper's own --storage-state; --json records the UNKNOWN on exit 3", async () => {
  const p = stubDoorProject();
  try {
    const lines = [];
    const code = await main(["validate-guide", "guide.json", "http://127.0.0.1:9/page", "--root", p.dir, "--storage-state", "state.json", "--json", "out/report.json"], (s) => lines.push(s));
    assert.equal(code, 3);
    assert.deepEqual(p.argv(), ["--url", "http://127.0.0.1:9/page", "--exec-stdin", "--quiet", "--storage-state", path.join(p.dir, "state.json")]);
    assert.deepEqual(lines, ["design-kit: unknown(instrument-cannot-read): @qontinui/ui-bridge-wrapper@9.9.9 gave no design snapshot ()"]);
    const report = JSON.parse(fs.readFileSync(path.join(p.dir, "out", "report.json"), "utf8"));
    assert.deepEqual(report, {
      guide: path.join(p.dir, "guide.json"),
      target: "http://127.0.0.1:9/page",
      exitCode: 3,
      unknown: "unknown(instrument-cannot-read): @qontinui/ui-bridge-wrapper@9.9.9 gave no design snapshot ()",
      elements: null,
      rules: 1,
      failures: [],
      failuresByRule: {},
      unmatchedRules: [],
      stylesheets: null,
      instrument: "@qontinui/ui-bridge-wrapper@9.9.9",
    });
  } finally {
    p.cleanup();
  }
});

test("an unreadable --storage-state file is refused (exit 2) before any door runs", async () => {
  const p = stubDoorProject();
  try {
    const lines = [];
    const code = await main(["validate-guide", "guide.json", "http://127.0.0.1:9/page", "--root", p.dir, "--storage-state", "missing.json"], (s) => lines.push(s));
    assert.equal(code, 2);
    assert.deepEqual(lines, [`design-kit: --storage-state ${path.join(p.dir, "missing.json")} is not a readable file`]);
    assert.equal(fs.existsSync(path.join(p.dir, "node_modules", "@qontinui", "ui-bridge-wrapper", "dist", "argv.json")), false);
  } finally {
    p.cleanup();
  }
});

test("validate-guide --json writes a report whose failures match the stdout ERROR lines on a specimen page", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const sp = await writeSpecimen({ name: "json" });
  try {
    const guideFile = path.join(sp.dir, "guide.json");
    fs.writeFileSync(guideFile, sp.outputs["design-kit-specimen.styleguide.uibridge.json"]);
    const hand = path.join(sp.dir, "hand.html");
    fs.writeFileSync(
      hand,
      `<!doctype html><html><head><style>${sp.outputs["tokens.css"]}</style></head><body><button id="hand" type="button" style="background-color:#ff0000;border-radius:7px">Go</button></body></html>`,
    );
    const out = path.join(sp.dir, "report.json");
    const lines = [];
    const code = await main(["validate-guide", guideFile, hand, "--root", ROOT, "--json", out], (s) => lines.push(s));
    assert.equal(code, 1);
    const report = JSON.parse(fs.readFileSync(out, "utf8"));
    const errorLines = lines.filter((l) => l.startsWith("ERROR ")).map((l) => l.split(":")[0]);
    const pairs = report.failures.map((f) => `ERROR ${f.elementId} ${f.ruleId}`);
    assert.deepEqual(pairs, errorLines);
    assert.deepEqual([...pairs].sort(), [
      "ERROR dom-hand border-radius-on-scale",
      "ERROR dom-hand button-state-declaration",
      "ERROR dom-hand font-size-on-scale",
      "ERROR dom-hand palette-background-color",
    ]);
    assert.deepEqual(report.failuresByRule, {
      "border-radius-on-scale": ["dom-hand"],
      "button-state-declaration": ["dom-hand"],
      "font-size-on-scale": ["dom-hand"],
      "palette-background-color": ["dom-hand"],
    });
    assert.equal(report.exitCode, 1);
    assert.equal(report.unknown, null);
    assert.equal(report.elements, 1);
    assert.equal(report.rules, 14);
    assert.deepEqual(report.stylesheets, { requested: 0, failed: [], unreadable: [] });
    assert.equal(report.instrument, "@qontinui/ui-bridge-wrapper@0.12.0");
    assert.ok(report.unmatchedRules.includes("tabs-states-declared"));
    assert.equal(report.target, hand);
  } finally {
    sp.cleanup();
  }
});

test("validate-guide's flags on another command are refused (exit 2)", async () => {
  const dir = tmpDir("flags");
  try {
    for (const argv of [["compile", "--json", "x.json"], ["check-states", "page.html", "--storage-state", "s.json"]]) {
      const lines = [];
      assert.equal(await main([...argv, "--root", dir], (s) => lines.push(s)), 2, argv.join(" "));
      assert.equal(lines[0].split("\n")[0], "design-kit: --storage-state and --json apply to validate-guide only");
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
