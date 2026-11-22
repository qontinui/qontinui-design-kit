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
      "let input = ''; process.stdin.on('data', (d) => (input += d));\n" +
      "process.stdin.on('end', () => {\n" +
      "  fs.writeFileSync(path.join(__dirname, 'argv.json'), JSON.stringify(process.argv.slice(2)));\n" +
      "  fs.writeFileSync(path.join(__dirname, 'steps.ndjson'), input);\n" +
      "  const canned = path.join(__dirname, 'answers.ndjson');\n" +
      "  if (!fs.existsSync(canned)) process.exit(1);\n" +
      "  process.stdout.write(fs.readFileSync(canned, 'utf8'), () => process.exit(0));\n" +
      "});\n",
  );
  fs.writeFileSync(path.join(dir, "guide.json"), JSON.stringify(GUIDE));
  fs.writeFileSync(path.join(dir, "state.json"), JSON.stringify({ cookies: [], origins: [] }));
  return {
    dir,
    argv: () => JSON.parse(fs.readFileSync(path.join(pkg, "dist", "argv.json"), "utf8")),
    steps: () => fs.readFileSync(path.join(pkg, "dist", "steps.ndjson"), "utf8").trim().split("\n").map((l) => JSON.parse(l)),
    /** Make the stub door answer these lines, one per step, instead of nothing. */
    answer: (lines) => fs.writeFileSync(path.join(pkg, "dist", "answers.ndjson"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n"),
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
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
      schema: 1,
      guide: path.join(p.dir, "guide.json"),
      target: "http://127.0.0.1:9/page",
      exitCode: 3,
      unknown: "unknown(instrument-cannot-read): @qontinui/ui-bridge-wrapper@9.9.9 gave no design snapshot ()",
      elements: null,
      rules: 1,
      failures: null,
      failuresByRule: null,
      unmatchedRules: null,
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
    assert.deepEqual(report.stylesheets, { requested: 0, failed: [], unreadable: [], pending: [] });
    assert.equal(report.schema, 1);
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

test("a validate-guide run that exits 2 leaves no earlier --json report behind", async () => {
  const p = stubDoorProject();
  try {
    const out = path.join(p.dir, "out", "report.json");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ exitCode: 0, stale: true }));
    const lines = [];
    assert.equal(await main(["validate-guide", "guide.json", "not-a-file.html", "--root", p.dir, "--json", "out/report.json"], (s) => lines.push(s)), 2);
    assert.deepEqual(lines, ["design-kit: not a URL and not a file: not-a-file.html"]);
    assert.equal(fs.existsSync(out), false);
  } finally {
    p.cleanup();
  }
});

test("validate-guide runs refused for a missing target or an extra argument leave no earlier --json report either", async () => {
  const p = stubDoorProject();
  try {
    const out = path.join(p.dir, "out", "report.json");
    for (const argv of [["validate-guide", "guide.json"], ["validate-guide", "guide.json", "t.html", "extra"]]) {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, JSON.stringify({ exitCode: 0, stale: true }));
      assert.equal(await main([...argv, "--root", p.dir, "--json", "out/report.json"], () => undefined), 2, argv.join(" "));
      assert.equal(fs.existsSync(out), false, argv.join(" "));
    }
  } finally {
    p.cleanup();
  }
});

test("validate-guide --json: an argument refused at parse time leaves no earlier report; a directory or an input path is refused (exit 2) and left intact", async () => {
  const p = stubDoorProject();
  try {
    const out = path.join(p.dir, "out", "report.json");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ exitCode: 0, stale: true }));
    assert.equal(await main(["validate-guide", "guide.json", "t.html", "--root", p.dir, "--json", "out/report.json", "--bogus"], () => undefined), 2);
    assert.equal(fs.existsSync(out), false, "unknown option");

    const lines = [];
    assert.equal(await main(["validate-guide", "guide.json", "t.html", "--root", p.dir, "--json", "out"], (s) => lines.push(s)), 2);
    assert.match(lines[0], /^design-kit: --json .*\/out cannot be replaced: /);
    assert.equal(fs.statSync(path.join(p.dir, "out")).isDirectory(), true);

    const guide = [];
    assert.equal(await main(["validate-guide", "guide.json", "http://127.0.0.1:9/page", "--root", p.dir, "--json", "guide.json"], (s) => guide.push(s)), 2);
    assert.deepEqual(guide, [`design-kit: --json ${path.join(p.dir, "guide.json")} is one of validate-guide's inputs; refusing to overwrite it`]);
    assert.equal(fs.existsSync(path.join(p.dir, "guide.json")), true);
  } finally {
    p.cleanup();
  }
});

test("validate-guide --json naming the --storage-state file, or found behind an empty flag value, is refused and the input kept", async () => {
  const p = stubDoorProject();
  try {
    const state = path.join(p.dir, "state.json");
    const lines = [];
    assert.equal(await main(["validate-guide", "guide.json", "http://127.0.0.1:9/page", "--root", p.dir, "--storage-state", "state.json", "--json", "state.json"], (s) => lines.push(s)), 2);
    assert.deepEqual(lines, [`design-kit: --json ${state} is one of validate-guide's inputs; refusing to overwrite it`]);
    assert.equal(fs.existsSync(state), true);

    const page = path.join(p.dir, "page.html");
    fs.writeFileSync(page, "<!doctype html><p>x</p>");
    const shifted = [];
    assert.equal(await main(["validate-guide", "--file", "", "guide.json", page, "--root", p.dir, "--json", page], (s) => shifted.push(s)), 2);
    assert.equal(shifted[0].split("\n")[0], "--file needs a value");
    assert.equal(fs.existsSync(page), true, "an empty flag value clears nothing, so the page named by --json is kept");
  } finally {
    p.cleanup();
  }
});

// ---------------------------------------------------------------- review round 6

const isSheetCheck = (step) => step.action === "pageEvaluate" && step.payload.expression.includes("performance.getEntriesByType('resource')");

test("validate-guide and check-states read the stylesheet-load check before the page is read and again after", async () => {
  const p = stubDoorProject();
  try {
    assert.equal(await main(["validate-guide", "guide.json", "http://127.0.0.1:9/page", "--root", p.dir], () => undefined), 3);
    const steps = p.steps();
    assert.deepEqual(steps.map((st) => (isSheetCheck(st) ? "sheets" : st.action)), ["sheets", "discover", "getDesignSnapshot", "pageEvaluate", "sheets"]);

    const page = path.join(p.dir, "specimen.html");
    fs.writeFileSync(page, '<!doctype html><script type="application/json" id="dk-specimen-cells">[{"component":"Button","variant":"primary","state":"hover","id":"c1","target":"b1"}]</script>');
    await main(["check-states", page, "--root", p.dir, "--file", "coverage.json"], () => undefined);
    const cs = p.steps().map((st) => (isSheetCheck(st) ? "sheets" : st.action));
    assert.equal(cs[0], "sheets");
    assert.equal(cs.at(-1), "sheets");
  } finally {
    p.cleanup();
  }
});

test("validate-guide --json naming a hard link to the guide is refused as an input, and both names are kept", async () => {
  const p = stubDoorProject();
  try {
    const link = path.join(p.dir, "guide-link.json");
    fs.linkSync(path.join(p.dir, "guide.json"), link);
    const lines = [];
    assert.equal(await main(["validate-guide", "guide.json", "http://127.0.0.1:9/page", "--root", p.dir, "--json", "guide-link.json"], (s) => lines.push(s)), 2);
    assert.deepEqual(lines, [`design-kit: --json ${link} is one of validate-guide's inputs; refusing to overwrite it`]);
    assert.equal(fs.existsSync(link), true);
    assert.equal(fs.existsSync(path.join(p.dir, "guide.json")), true);
  } finally {
    p.cleanup();
  }
});

// ---------------------------------------------------------------- review round 7

const evaluated = (value) => ({ action: "pageEvaluate", result: { result: { value } } });
const sheets = (pending) => evaluated({ requested: 1, failed: [], unreadable: [], pending });
const LATE = "http://127.0.0.1:9/late.css";
const PENDING_LATE = `unknown(stylesheet-pending): ${LATE} had no stylesheet when the page was read (still loading, or blocked before any response)`;

test("validate-guide: a sheet pending at the first stylesheet read is UNKNOWN even when the last read finds it loaded", async () => {
  const p = stubDoorProject();
  try {
    p.answer([
      sheets([LATE]),
      { action: "discover", result: {} },
      { action: "getDesignSnapshot", result: { elements: [{ elementId: "dom-go", type: "button", styles: { color: "rgb(17, 17, 17)" } }] } },
      evaluated(["rgb(17, 17, 17)"]),
      sheets([]),
    ]);
    const lines = [];
    assert.equal(await main(["validate-guide", "guide.json", "http://127.0.0.1:8/page", "--root", p.dir, "--json", "r.json"], (s) => lines.push(s)), 3);
    assert.deepEqual(lines, [`design-kit: ${PENDING_LATE}`]);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(p.dir, "r.json"), "utf8")).stylesheets, { requested: 1, failed: [], unreadable: [], pending: [LATE] });
  } finally {
    p.cleanup();
  }
});

test("check-states: a sheet pending at the first stylesheet read makes every measured cell UNKNOWN even when the last read finds it loaded", async () => {
  const p = stubDoorProject();
  try {
    const page = path.join(p.dir, "specimen.html");
    fs.writeFileSync(page, '<!doctype html><script type="application/json" id="dk-specimen-cells">[{"component":"Button","variant":"primary","state":"hover","id":"c1","target":"b1"}]</script>');
    p.answer([
      sheets([LATE]),
      { action: "discover", result: {} },
      { action: "getElementStateStyles", result: { stateStyles: [{ state: "hover", styles: {}, diffFromDefault: [{ property: "color", defaultValue: "rgb(0, 0, 0)", stateValue: "rgb(1, 2, 3)" }] }] } },
      evaluated({ count: 1, values: ["rgb(1, 2, 3)"] }),
      sheets([]),
    ]);
    assert.equal(await main(["check-states", page, "--root", p.dir, "--file", "coverage.json"], () => undefined), 3);
    const cov = JSON.parse(fs.readFileSync(path.join(p.dir, "coverage.json"), "utf8"));
    assert.deepEqual(cov.cells.map((c) => [c.id, c.status, c.unknown]), [["c1", "unknown", PENDING_LATE]]);
    assert.deepEqual(cov.stylesheets, { requested: 1, failed: [], unreadable: [], pending: [LATE] });
  } finally {
    p.cleanup();
  }
});

// ---------------------------------------------------------------- review round 8

test("validate-guide --json is not cleared when a value flag before it has no value, and an empty --json is refused naming the flag", async () => {
  const p = stubDoorProject();
  const cwd = process.cwd();
  try {
    process.chdir(p.dir);
    fs.writeFileSync(path.join(p.dir, "r.json"), JSON.stringify({ stale: true }));
    const noRoot = [];
    assert.equal(await main(["validate-guide", "guide.json", "http://127.0.0.1:9/page", "--root", "--json", "r.json"], (s) => noRoot.push(s)), 2);
    assert.equal(noRoot[0].split("\n")[0], "--root needs a value");
    assert.equal(fs.existsSync(path.join(p.dir, "r.json")), true, "a run that never resolves its report removes nothing");
    const emptyRoot = [];
    assert.equal(await main(["validate-guide", "guide.json", "http://127.0.0.1:9/page", "--root", "", "--json", "r.json"], (s) => emptyRoot.push(s)), 2);
    assert.equal(emptyRoot[0].split("\n")[0], "--root needs a value");
    assert.equal(fs.existsSync(path.join(p.dir, "r.json")), true, "an empty --root (an unset \"$ROOT\") removes nothing either");
    const empty = [];
    assert.equal(await main(["validate-guide", "guide.json", "http://127.0.0.1:9/page", "--root", p.dir, "--json", ""], (s) => empty.push(s)), 2);
    assert.equal(empty[0].split("\n")[0], "--json needs a value");
  } finally {
    process.chdir(cwd);
    p.cleanup();
  }
});
