// Plan 2026-11-21-design-kit-compiler-gaps Phase 5: an undeclared leaf carries
// its reason from the source; `validate-guide` gains `--storage-state` (passed
// to the published door) and `--json` (the machine-readable report, written on
// exit 0, 1 and 3). Every expectation is a literal.
import test from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync, spawn } from "node:child_process";
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
    fs.writeFileSync(out, JSON.stringify({ schema: 1, exitCode: 0, stale: true }));
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
      fs.writeFileSync(out, JSON.stringify({ schema: 1, exitCode: 0, stale: true }));
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
    fs.writeFileSync(out, JSON.stringify({ schema: 1, exitCode: 0, stale: true }));
    assert.equal(await main(["validate-guide", "guide.json", "t.html", "--root", p.dir, "--json", "out/report.json", "--bogus"], () => undefined), 2);
    assert.equal(fs.existsSync(out), false, "unknown option");

    const lines = [];
    assert.equal(await main(["validate-guide", "guide.json", "t.html", "--root", p.dir, "--json", "out"], (s) => lines.push(s)), 2);
    assert.deepEqual(lines, [`design-kit: --json ${path.join(p.dir, "out")} cannot be replaced: it is a directory`]);
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
    // Every bare word is checked as an input, so the page is found and kept.
    assert.deepEqual(shifted, [`design-kit: --json ${page} is one of validate-guide's inputs; refusing to overwrite it`]);
    assert.equal(fs.existsSync(page), true);
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
    const label = (st) => (isSheetCheck(st) ? "sheets" : st.payload?.expression === "location.href" ? "location" : st.action);
    assert.deepEqual(steps.map(label), ["sheets", "discover", "getDesignSnapshot", "pageEvaluate", "sheets", "location"]);

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
      evaluated("http://127.0.0.1:8/page"),
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

test("validate-guide: a valueless or empty --root or --json clears nothing, and an empty --json is refused naming the flag", async () => {
  const p = stubDoorProject();
  const cwd = process.cwd();
  try {
    process.chdir(p.dir);
    fs.writeFileSync(path.join(p.dir, "r.json"), JSON.stringify({ schema: 1, exitCode: 0, stale: true }));
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

// ---------------------------------------------------------------- review round 10

test("validate-guide: a --json report that cannot be written still prints the verdict first, then the write failure (exit 2)", async (t) => {
  // A read-only directory stops the write only for a non-root user on a POSIX filesystem; elsewhere the case cannot be built.
  if (process.platform === "win32" || process.getuid?.() === 0) {
    t.skip("a read-only directory does not stop root or a Windows write; the failure cannot be built here");
    return;
  }
  const p = stubDoorProject();
  const ro = path.join(p.dir, "ro");
  try {
    fs.mkdirSync(ro);
    fs.chmodSync(ro, 0o555);
    const lines = [];
    assert.equal(await main(["validate-guide", "guide.json", "http://127.0.0.1:9/page", "--root", p.dir, "--json", "ro/r.json"], (s) => lines.push(s)), 2);
    assert.deepEqual(lines[0], "design-kit: unknown(instrument-cannot-read): @qontinui/ui-bridge-wrapper@9.9.9 gave no design snapshot ()");
    assert.ok(lines[1].startsWith(`design-kit: --json ${path.join(ro, "r.json")} could not be written: EACCES`), lines[1]);
    assert.equal(lines.length, 2);
  } finally {
    fs.chmodSync(ro, 0o755);
    p.cleanup();
  }
});

// ---------------------------------------------------------------- review round 11

test("validate-guide --json naming the page file target is refused as an input, and the page is kept", async () => {
  const p = stubDoorProject();
  try {
    const page = path.join(p.dir, "page.html");
    fs.writeFileSync(page, "<!doctype html><p>x</p>");
    const lines = [];
    assert.equal(await main(["validate-guide", "guide.json", page, "--root", p.dir, "--json", page], (s) => lines.push(s)), 2);
    assert.deepEqual(lines, [`design-kit: --json ${page} is one of validate-guide's inputs; refusing to overwrite it`]);
    assert.equal(fs.readFileSync(page, "utf8"), "<!doctype html><p>x</p>");
  } finally {
    p.cleanup();
  }
});

// ---------------------------------------------------------------- review round 13

test("validate-guide: a mistyped option before the guide does not let --json naming the guide delete it", async () => {
  const p = stubDoorProject();
  const cwd = process.cwd();
  const elsewhere = tmpDir("elsewhere");
  try {
    process.chdir(elsewhere);
    const lines = [];
    assert.equal(await main(["validate-guide", "--storage-sate", "state.json", "guide.json", "http://127.0.0.1:9/page", "--root", p.dir, "--json", "guide.json"], (s) => lines.push(s)), 2);
    assert.deepEqual(lines, [`design-kit: --json ${path.join(p.dir, "guide.json")} is one of validate-guide's inputs; refusing to overwrite it`]);
    assert.equal(fs.existsSync(path.join(p.dir, "guide.json")), true);
  } finally {
    process.chdir(cwd);
    fs.rmSync(elsewhere, { recursive: true, force: true });
    p.cleanup();
  }
});

// ---------------------------------------------------------------- review round 14

test("validate-guide: a valueless flag other than --root or --json still clears the report it names before the run is refused", async () => {
  const p = stubDoorProject();
  try {
    const report = path.join(p.dir, "r.json");
    fs.writeFileSync(report, JSON.stringify({ schema: 1, exitCode: 0 }));
    const trailing = [];
    assert.equal(await main(["validate-guide", "guide.json", "http://127.0.0.1:9/page", "--root", p.dir, "--json", "r.json", "--file"], (s) => trailing.push(s)), 2);
    assert.equal(trailing[0].split("\n")[0], "--file needs a value");
    assert.equal(fs.existsSync(report), false);
    fs.writeFileSync(report, JSON.stringify({ schema: 1, exitCode: 0 }));
    const empty = [];
    assert.equal(await main(["validate-guide", "guide.json", "http://127.0.0.1:9/page", "--kit-dir", "", "--root", p.dir, "--json", "r.json"], (s) => empty.push(s)), 2);
    assert.equal(empty[0].split("\n")[0], "--kit-dir needs a value");
    assert.equal(fs.existsSync(report), false);
  } finally {
    p.cleanup();
  }
});

const SNAPSHOT = { action: "getDesignSnapshot", result: { elements: [{ elementId: "dom-go", type: "button", styles: { color: "rgb(17, 17, 17)" } }] } };

test("validate-guide: a page the door ended on another path of (a login redirect) is UNKNOWN (exit 3) naming it, not a verdict", async () => {
  const p = stubDoorProject();
  try {
    p.answer([sheets([]), { action: "discover", result: {} }, SNAPSHOT, evaluated(["rgb(17, 17, 17)"]), sheets([]), evaluated("http://127.0.0.1:9/login?next=%2Fapp")]);
    const lines = [];
    assert.equal(await main(["validate-guide", "guide.json", "http://127.0.0.1:9/app", "--root", p.dir, "--storage-state", "state.json", "--json", "r.json"], (s) => lines.push(s)), 3);
    // Only the origin and path are named: a query or fragment (a callback's code or token) stays out of logs and reports.
    const why = "unknown(redirected): http://127.0.0.1:9/app was answered by http://127.0.0.1:9/login; a verdict there is not a verdict on the target";
    assert.deepEqual(lines, [`design-kit: ${why}`]);
    const r = JSON.parse(fs.readFileSync(path.join(p.dir, "r.json"), "utf8"));
    // The elements read were the login page's, not the target's: the count is null, not theirs.
    assert.deepEqual([r.exitCode, r.unknown, r.elements, r.failures, r.stylesheets], [3, why, null, null, null]);
  } finally {
    p.cleanup();
  }
});

test("validate-guide: a guide none of whose rules answers to an element is unknown(no-rule-matched) (exit 3), and its report lists the empty results", async () => {
  const p = stubDoorProject();
  try {
    const rule = { id: "heading-size", description: "x", elementType: "heading", constraints: [{ type: "oneOf", property: "fontSize", values: ["32px"] }], severity: "error" };
    fs.writeFileSync(path.join(p.dir, "headings.json"), JSON.stringify({ ...GUIDE, rules: [rule] }));
    const none = { requested: 0, failed: [], unreadable: [], pending: [] };
    p.answer([
      evaluated(none),
      { action: "discover", result: {} },
      { action: "getDesignSnapshot", result: { elements: [{ elementId: "dom-p", type: "text", styles: { fontSize: "16px" } }] } },
      evaluated(["32px"]),
      evaluated(none),
      evaluated("http://127.0.0.1:9/page"),
    ]);
    const lines = [];
    assert.equal(await main(["validate-guide", "headings.json", "http://127.0.0.1:9/page", "--root", p.dir, "--json", "r.json"], (s) => lines.push(s)), 3);
    const why = "unknown(no-rule-matched): no rule answered to any element; nothing was evaluated";
    assert.deepEqual(lines, [
      "UNMATCHED heading-size: no element on the page answers to this rule",
      "design-kit validate-guide: 1 elements, 1 rules, 0 failures (@qontinui/ui-bridge-wrapper@9.9.9)",
      `design-kit: ${why}`,
    ]);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(p.dir, "r.json"), "utf8")), {
      schema: 1,
      guide: path.join(p.dir, "headings.json"),
      target: "http://127.0.0.1:9/page",
      exitCode: 3,
      unknown: why,
      elements: 1,
      rules: 1,
      failures: [],
      failuresByRule: {},
      unmatchedRules: ["heading-size"],
      stylesheets: none,
      instrument: "@qontinui/ui-bridge-wrapper@9.9.9",
    });
  } finally {
    p.cleanup();
  }
});


// ---------------------------------------------------------------- review round 15

test("validate-guide: an empty flag value before the command is that flag's value, so validate-guide is still read and the report is cleared", async () => {
  const p = stubDoorProject();
  const cwd = process.cwd();
  try {
    process.chdir(p.dir);
    fs.writeFileSync(path.join(p.dir, "r.json"), JSON.stringify({ schema: 1, exitCode: 0 }));
    const lines = [];
    assert.equal(await main(["--file", "", "validate-guide", "guide.json", "http://127.0.0.1:9/page", "--root", p.dir, "--json", "r.json"], (s) => lines.push(s)), 2);
    assert.equal(lines[0].split("\n")[0], "--file needs a value");
    assert.equal(fs.existsSync(path.join(p.dir, "r.json")), false);
  } finally {
    process.chdir(cwd);
    p.cleanup();
  }
});

test("validate-guide: a truncated snapshot is unknown(snapshot-truncated) and its report's element count is null, not the cap", async () => {
  const p = stubDoorProject();
  try {
    const snap = { action: "getDesignSnapshot", result: { elements: [{ elementId: "dom-go", type: "button", styles: { color: "rgb(17, 17, 17)" } }], truncated: true } };
    p.answer([sheets([]), { action: "discover", result: {} }, snap, evaluated(["rgb(17, 17, 17)"]), sheets([]), evaluated("http://127.0.0.1:9/page")]);
    assert.equal(await main(["validate-guide", "guide.json", "http://127.0.0.1:9/page", "--root", p.dir, "--json", "r.json"], () => undefined), 3);
    const r = JSON.parse(fs.readFileSync(path.join(p.dir, "r.json"), "utf8"));
    assert.deepEqual([r.exitCode, r.unknown, r.elements], [3, "unknown(snapshot-truncated): the page has more elements than one snapshot returns", null]);
  } finally {
    p.cleanup();
  }
});

// ---------------------------------------------------------------- review round 17

test("validate-guide --json naming a file that is not an earlier report (a page, another tool's JSON) is refused (exit 2) and the file kept", async () => {
  const p = stubDoorProject();
  try {
    const page = path.join(p.dir, "page.html");
    fs.writeFileSync(page, "<!doctype html><p>x</p>");
    const lines = [];
    // `--json` read as a boolean switch: the page becomes the report path and the target is missing.
    assert.equal(await main(["validate-guide", "guide.json", "--root", p.dir, "--json", "page.html"], (s) => lines.push(s)), 2);
    assert.deepEqual(lines, [`design-kit: --json ${page} is not an earlier validate-guide report (a JSON object with schema 1 and a numeric exitCode); refusing to overwrite it`]);
    assert.equal(fs.readFileSync(page, "utf8"), "<!doctype html><p>x</p>");

    const other = path.join(p.dir, "other.json");
    fs.writeFileSync(other, JSON.stringify({ exitCode: 0 }));
    const second = [];
    assert.equal(await main(["validate-guide", "guide.json", "http://127.0.0.1:9/page", "--root", p.dir, "--json", "other.json"], (s) => second.push(s)), 2);
    assert.deepEqual(second, [`design-kit: --json ${other} is not an earlier validate-guide report (a JSON object with schema 1 and a numeric exitCode); refusing to overwrite it`]);
    assert.equal(fs.readFileSync(other, "utf8"), '{"exitCode":0}');
  } finally {
    p.cleanup();
  }
});

// ---------------------------------------------------------------- review round 18

const BIN = path.join(ROOT, "dist", "cli.js");

test("validate-guide --json naming a FIFO is not read before the run; with a reader, the report is written into the pipe", async (t) => {
  if (process.platform === "win32") {
    t.skip("no mkfifo on Windows");
    return;
  }
  const p = stubDoorProject();
  const fifo = path.join(p.dir, "report.fifo");
  execFileSync("mkfifo", [fifo]);
  const reader = fs.promises.readFile(fifo, "utf8");
  try {
    const run = await new Promise((resolve) => {
      execFile(process.execPath, [BIN, "validate-guide", "guide.json", "http://127.0.0.1:9/page", "--root", p.dir, "--json", fifo], { timeout: 15000 }, (error, stdout) =>
        resolve({ code: error ? (error.code ?? error.signal) : 0, stdout }),
      );
    });
    assert.deepEqual(run, { code: 3, stdout: "design-kit: unknown(instrument-cannot-read): @qontinui/ui-bridge-wrapper@9.9.9 gave no design snapshot ()\n" });
    assert.equal(JSON.parse(await reader).exitCode, 3);
  } finally {
    // Release the reader if the run never opened the pipe for writing.
    try {
      fs.closeSync(fs.openSync(fifo, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK));
    } catch {
      // no reader left waiting
    }
    await reader.catch(() => undefined);
    p.cleanup();
  }
});

test("validate-guide --json naming an empty file or /dev/null clears nothing and runs: neither holds an earlier verdict", async () => {
  const p = stubDoorProject();
  try {
    const empty = path.join(p.dir, "empty.json");
    fs.writeFileSync(empty, "");
    assert.equal(await main(["validate-guide", "guide.json", "http://127.0.0.1:9/page", "--root", p.dir, "--json", "empty.json"], () => undefined), 3);
    assert.equal(JSON.parse(fs.readFileSync(empty, "utf8")).exitCode, 3);
    if (process.platform !== "win32") {
      assert.equal(await main(["validate-guide", "guide.json", "http://127.0.0.1:9/page", "--root", p.dir, "--json", "/dev/null"], () => undefined), 3);
    }
  } finally {
    p.cleanup();
  }
});

// ---------------------------------------------------------------- review round 19

const runBin = (args, stdio) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], { stdio, timeout: 15000 });
    let stdout = "";
    child.stdout?.on("data", (d) => (stdout += d));
    child.on("close", (code, signal) => resolve({ code: code ?? signal, stdout }));
  });
const STDOUT_REFUSAL = "design-kit: --json /dev/stdout is this run's own stdout, which carries the verdict; refusing to write the report there";

test("validate-guide --json /dev/stdout is refused (exit 2) when stdout is a file or a pipe: the report would replace or follow the verdict", async (t) => {
  if (process.platform === "win32") {
    t.skip("no /dev/stdout on Windows");
    return;
  }
  const p = stubDoorProject();
  try {
    const args = ["validate-guide", "guide.json", "http://127.0.0.1:9/page", "--root", p.dir, "--json", "/dev/stdout"];
    // In process: under node --test this file's stdout is the runner's pipe, so /dev/stdout is refused here too.
    const fd1 = fs.fstatSync(1);
    if (fd1.isFIFO() || fd1.isSocket() || fd1.isFile()) {
      const lines = [];
      assert.equal(await main(args, (s) => lines.push(s)), 2);
      assert.deepEqual(lines, [STDOUT_REFUSAL]);
    }
    const file = path.join(p.dir, "out.txt");
    const fd = fs.openSync(file, "w");
    try {
      assert.equal((await runBin(args, ["ignore", fd, "ignore"])).code, 2);
    } finally {
      fs.closeSync(fd);
    }
    assert.equal(fs.readFileSync(file, "utf8"), STDOUT_REFUSAL + "\n");
    assert.deepEqual(await runBin(args, ["ignore", "pipe", "ignore"]), { code: 2, stdout: STDOUT_REFUSAL + "\n" });
  } finally {
    p.cleanup();
  }
});

test("validate-guide --json naming a file target given relative to the current directory, under another --root, is refused as an input", async () => {
  const p = stubDoorProject();
  const cwd = process.cwd();
  const here = tmpDir("here");
  try {
    const page = path.join(here, "page.html");
    fs.writeFileSync(page, "");
    process.chdir(here);
    const lines = [];
    assert.equal(await main(["validate-guide", "guide.json", "page.html", "--root", p.dir, "--json", page], (s) => lines.push(s)), 2);
    assert.deepEqual(lines, [`design-kit: --json ${page} is one of validate-guide's inputs; refusing to overwrite it`]);
    assert.equal(fs.readFileSync(page, "utf8"), "");
  } finally {
    process.chdir(cwd);
    fs.rmSync(here, { recursive: true, force: true });
    p.cleanup();
  }
});

// ---------------------------------------------------------------- review round 20

test("a --storage-state file that is not a Playwright storageState (not JSON, or no cookies and origins arrays) is refused (exit 2) before any door runs", async () => {
  const p = stubDoorProject();
  try {
    const cases = [
      ["bad.json", "this is not json"],
      ["shape.json", JSON.stringify({ cookies: [] })],
    ];
    for (const [name, body] of cases) {
      fs.writeFileSync(path.join(p.dir, name), body);
      const lines = [];
      assert.equal(await main(["validate-guide", "guide.json", "http://127.0.0.1:9/page", "--root", p.dir, "--storage-state", name], (s) => lines.push(s)), 2, name);
      assert.deepEqual(lines, [`design-kit: --storage-state ${path.join(p.dir, name)} is not a Playwright storageState (a JSON object with cookies and origins arrays)`]);
    }
    assert.equal(fs.existsSync(path.join(p.dir, "node_modules", "@qontinui", "ui-bridge-wrapper", "dist", "argv.json")), false);
  } finally {
    p.cleanup();
  }
});

test("validate-guide: a page the door ended on at another origin (only the port or the scheme changed) is unknown(redirected); a changed query or fragment is the same page", async () => {
  const p = stubDoorProject();
  try {
    const answers = (url) => [sheets([]), { action: "discover", result: {} }, SNAPSHOT, evaluated(["rgb(17, 17, 17)"]), sheets([]), evaluated(url)];
    p.answer(answers("http://127.0.0.1:8/page"));
    const moved = [];
    assert.equal(await main(["validate-guide", "guide.json", "http://127.0.0.1:9/page", "--root", p.dir], (s) => moved.push(s)), 3);
    assert.deepEqual(moved, ["design-kit: unknown(redirected): http://127.0.0.1:9/page was answered by http://127.0.0.1:8/page; a verdict there is not a verdict on the target"]);
    p.answer(answers("http://127.0.0.1:9/page?x=1#y"));
    const same = [];
    assert.equal(await main(["validate-guide", "guide.json", "http://127.0.0.1:9/page", "--root", p.dir], (s) => same.push(s)), 0);
    assert.deepEqual(same, ["design-kit validate-guide: 1 elements, 1 rules, 0 failures (@qontinui/ui-bridge-wrapper@9.9.9)"]);
  } finally {
    p.cleanup();
  }
});

// ---------------------------------------------------------------- review round 21

const NO_SHEET_ANSWER = "unknown(instrument-cannot-read): @qontinui/ui-bridge-wrapper@9.9.9 did not answer the stylesheet-load check";

test("validate-guide and check-states: a stylesheet check the door did not answer is UNKNOWN (exit 3), never every sheet loaded", async () => {
  const p = stubDoorProject();
  try {
    p.answer([evaluated(null), { action: "discover", result: {} }, SNAPSHOT, evaluated(["rgb(17, 17, 17)"]), sheets([]), evaluated("http://127.0.0.1:9/page")]);
    const lines = [];
    assert.equal(await main(["validate-guide", "guide.json", "http://127.0.0.1:9/page", "--root", p.dir], (s) => lines.push(s)), 3);
    assert.deepEqual(lines, [`design-kit: ${NO_SHEET_ANSWER}`]);

    const page = path.join(p.dir, "specimen.html");
    fs.writeFileSync(page, '<!doctype html><script type="application/json" id="dk-specimen-cells">[{"component":"Button","variant":"primary","state":"hover","id":"c1","target":"b1"}]</script>');
    p.answer([
      sheets([]),
      { action: "discover", result: {} },
      { action: "getElementStateStyles", result: { stateStyles: [{ state: "hover", styles: {}, diffFromDefault: [{ property: "color", defaultValue: "rgb(0, 0, 0)", stateValue: "rgb(1, 2, 3)" }] }] } },
      evaluated({ count: 1, values: ["rgb(1, 2, 3)"] }),
      evaluated(null),
    ]);
    assert.equal(await main(["check-states", page, "--root", p.dir, "--file", "coverage.json"], () => undefined), 3);
    const cov = JSON.parse(fs.readFileSync(path.join(p.dir, "coverage.json"), "utf8"));
    assert.deepEqual(cov.cells.map((c) => [c.id, c.status, c.unknown]), [["c1", "unknown", NO_SHEET_ANSWER]]);
  } finally {
    p.cleanup();
  }
});
