// Phase 4: the rule-bearing guide, budgets and thresholds with a computed
// stage, the loosening diff, and the class lint. Every expectation is a
// literal; each check has a seeded violation that reddens it.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { buildGuide, canonical, checkVersion, compareBounds, lintText, stageOf } from "../dist/index.js";
import { main } from "../dist/cli.js";
import { validateElements } from "../dist/validate/guide.js";
import { compileJson, exampleJson, tmpDir } from "./kit-helpers.js";

const ROLES = ["surface", "text", "muted", "accent", "accent-text", "control", "control-text", "border", "field", "field-text", "link"];
const HEX = { surface: "#ffffff", text: "#111111", muted: "#777777", accent: "#0044cc", "accent-text": "#ffffff", control: "#eeeeee", "control-text": "#111111", border: "#999999", field: "#fafafa", "field-text": "#111111", link: "#0044cc" };

const withDeclaredRoles = () => {
  const j = exampleJson();
  j.color = { role: Object.fromEntries(ROLES.map((r) => [r, { $type: "color", $value: HEX[r], $extensions: { qontinui: { source: "declared" } } }])) };
  return j;
};

// ---------------------------------------------------------------- stage

test("check_version is a hash of the check name and value (independent literals)", () => {
  // printf 'budgets.density.max_interactive_per_viewport\n24' | sha256sum | cut -c1-16
  assert.equal(checkVersion("budgets.density.max_interactive_per_viewport", 24), "b27242763d4a274b");
  assert.equal(checkVersion("thresholds.contrast.min_lightness_delta", 0.4), "738ac6e6b20a4560");
  assert.equal(checkVersion("thresholds.contrast.min_lightness_delta", 0.5), "4823d6770037057c");
});

test("stage is computed: declared stays declared, a draft is shown only by a failing record at that exact version", () => {
  const v = "738ac6e6b20a4560";
  const failing = { records: [{ check: "x", check_version: v, injected_violation: "a contrast pair at 0.39", failed: true }] };
  assert.equal(stageOf("draft", v, { records: [] }), "draft");
  assert.equal(stageOf("draft", v, failing), "shown");
  assert.equal(stageOf("draft", v, { records: [{ ...failing.records[0], failed: false }] }), "draft", "a record that did not fail shows nothing");
  assert.equal(stageOf("draft", "4823d6770037057c", failing), "draft", "a record for another value shows nothing");
  assert.equal(stageOf("declared", v, failing), "declared");
  assert.equal(stageOf("undeclared", "", failing), "undeclared");
});

test("an authored budget compiles as draft, a recorded failure at that value moves it to shown, and a changed value moves it back", async () => {
  const j = exampleJson();
  const first = await compileJson(j, "stage");
  try {
    const t0 = JSON.parse(first.outputs["visual-system.thresholds.json"]).thresholds.find((e) => e.check === "thresholds.contrast.min_lightness_delta");
    assert.deepEqual(t0, {
      check: "thresholds.contrast.min_lightness_delta",
      value: 0.4,
      bound: "min",
      source: "draft",
      source_detail: "authored(design-kit-example-source)",
      check_version: "738ac6e6b20a4560",
      stage: "draft",
    });
    const b0 = JSON.parse(first.outputs["design-budgets.json"]).budgets.find((e) => e.check === "budgets.density.max_interactive_per_viewport");
    assert.equal(b0.stage, "draft");
    assert.equal(b0.check_version, "b27242763d4a274b");

    // Record a failure on an injected violation at exactly this check_version.
    fs.writeFileSync(
      path.join(first.dir, "design", "threshold-evidence.json"),
      JSON.stringify({ records: [{ check: t0.check, check_version: "738ac6e6b20a4560", injected_violation: "text on ground at 0.39", failed: true, recorded_at: "2026-11-19" }] }),
    );
    const { compileSource } = await import("../dist/index.js");
    const shown = await compileSource({ sourcePath: first.sourcePath, rootDir: first.dir });
    const t1 = JSON.parse(shown.outputs["visual-system.thresholds.json"]).thresholds.find((e) => e.check === t0.check);
    assert.equal(t1.stage, "shown");
    // The budget has no record: still draft. Nothing granted the stage; the record did.
    assert.equal(JSON.parse(shown.outputs["design-budgets.json"]).budgets.find((e) => e.check === b0.check).stage, "draft");

    // Edit the value: the check_version changes, the record no longer matches.
    const edited = JSON.parse(fs.readFileSync(first.sourcePath, "utf8"));
    edited.thresholds.contrast.min_lightness_delta.$value = 0.5;
    fs.writeFileSync(first.sourcePath, JSON.stringify(edited));
    const back = await compileSource({ sourcePath: first.sourcePath, rootDir: first.dir });
    const t2 = JSON.parse(back.outputs["visual-system.thresholds.json"]).thresholds.find((e) => e.check === t0.check);
    assert.equal(t2.value, 0.5);
    assert.equal(t2.check_version, "4823d6770037057c");
    assert.equal(t2.stage, "draft");
  } finally {
    first.cleanup();
  }
});

test("craft bands are draft thresholds of the budget group", async () => {
  const c = await compileJson(exampleJson(), "craft");
  try {
    const lh = JSON.parse(c.outputs["design-budgets.json"]).budgets.filter((e) => e.check.startsWith("craft.line-height."));
    assert.deepEqual(lh.map((e) => [e.check, e.value, e.bound, e.stage, e.check_version]), [
      ["craft.line-height.max", 1.45, "max", "draft", checkVersion("craft.line-height.max", 1.45)],
      ["craft.line-height.min", 1.2, "min", "draft", "eee43ccda7250da1"],
    ]);
  } finally {
    c.cleanup();
  }
});

test("imagery thresholds the visual system lists as undeclared are emitted as undeclared, never 0", async () => {
  const c = await compileJson(exampleJson(), "imagery");
  try {
    const t = JSON.parse(c.outputs["visual-system.thresholds.json"]).thresholds;
    const img = t.filter((e) => e.check.startsWith("imagery.threshold."));
    assert.deepEqual(img.map((e) => [e.check, e.value, e.source, e.check_version, e.stage]), [
      ["imagery.threshold.image_palette_within.max_delta_e", null, "undeclared", null, "undeclared"],
      ["imagery.threshold.image_resolution_sufficient.min_effective", null, "undeclared", null, "undeclared"],
    ]);
    for (const e of img) assert.notEqual(e.value, 0);
  } finally {
    c.cleanup();
  }
});

// ---------------------------------------------------------------- diff

function git(dir, ...args) {
  return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

async function diffRun(mutate, { env = {} } = {}) {
  const base = exampleJson();
  const c = await compileJson(base, "diff");
  const dir = c.dir;
  const cli = async (...a) => {
    const lines = [];
    const code = await main([...a, "--root", dir], (s) => lines.push(s));
    return { code, lines };
  };
  try {
    await cli("compile");
    git(dir, "init", "-q");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "base");
    const j = JSON.parse(fs.readFileSync(c.sourcePath, "utf8"));
    mutate(j);
    fs.writeFileSync(c.sourcePath, JSON.stringify(j, null, 2));
    const summary = path.join(dir, "summary.md");
    const saved = process.env.GITHUB_STEP_SUMMARY;
    process.env.GITHUB_STEP_SUMMARY = summary;
    try {
      const r = await cli("diff", "--base", "HEAD");
      return { ...r, summary: fs.existsSync(summary) ? fs.readFileSync(summary, "utf8") : "", env };
    } finally {
      if (saved === undefined) delete process.env.GITHUB_STEP_SUMMARY;
      else process.env.GITHUB_STEP_SUMMARY = saved;
    }
  } finally {
    c.cleanup();
  }
}

test("diff prints LOOSENED for a raised budget, writes the step summary, and exits 0", async () => {
  const r = await diffRun((j) => (j.budgets.density.max_interactive_per_viewport.$value = 30));
  assert.equal(r.code, 0);
  assert.deepEqual(r.lines, ["LOOSENED budgets.density.max_interactive_per_viewport 24 -> 30"]);
  assert.match(r.summary, /- `LOOSENED budgets\.density\.max_interactive_per_viewport 24 -> 30`/);
  assert.match(r.summary, /1 loosened\./);
});

test("diff prints nothing loosened for a tightened budget, and exits 0", async () => {
  const r = await diffRun((j) => (j.budgets.density.max_interactive_per_viewport.$value = 20));
  assert.equal(r.code, 0);
  assert.deepEqual(r.lines, ["design-kit: no loosened budget or threshold"]);
  assert.match(r.summary, /0 loosened\./);
});

test("a min bound loosens downward: lowering a minimum is LOOSENED, raising it is not", async () => {
  const lowered = await diffRun((j) => (j.thresholds.contrast.min_lightness_delta.$value = 0.3));
  assert.deepEqual(lowered.lines, ["LOOSENED thresholds.contrast.min_lightness_delta 0.4 -> 0.3"]);
  assert.equal(lowered.code, 0);
  const raised = await diffRun((j) => (j.thresholds.contrast.min_lightness_delta.$value = 0.5));
  assert.deepEqual(raised.lines, ["design-kit: no loosened budget or threshold"]);
});

test("removing a bound is LOOSENED; an unreadable base is UNKNOWN, still exit 0", async () => {
  const removed = await diffRun((j) => delete j.budgets.first_viewport);
  assert.deepEqual(removed.lines, ["LOOSENED budgets.first_viewport.max_text_blocks 12 -> removed"]);
  assert.equal(removed.code, 0);

  const c = await compileJson(exampleJson(), "diffnobase");
  try {
    git(c.dir, "init", "-q");
    const lines = [];
    const code = await main(["diff", "--base", "HEAD", "--root", c.dir], (s) => lines.push(s));
    assert.equal(code, 0);
    assert.deepEqual(lines, [
      "UNKNOWN design-budgets.json is not readable at HEAD; nothing to compare",
      "UNKNOWN visual-system.thresholds.json is not readable at HEAD; nothing to compare",
      "design-kit: 2 of 2 files not compared; a missing baseline is UNKNOWN, not a clean diff",
    ]);
  } finally {
    c.cleanup();
  }
});

test("compareBounds names a change in a bound with no declared direction MOVED, never LOOSENED", () => {
  const e = (value) => ({ check: "thresholds.weird", value, bound: "none", source: "draft", source_detail: "authored", check_version: "x", stage: "draft" });
  assert.deepEqual(compareBounds([e(1)], [e(2)]), [{ kind: "MOVED", check: "thresholds.weird", from: "1", to: "2", note: "direction not declared" }]);
});

test("a diff with a base that begins with a dash is refused, not passed to git as an option", async () => {
  const lines = [];
  assert.equal(await main(["diff", "--base", "-x"], (s) => lines.push(s)), 2);
  assert.match(lines[0], /diff needs --base <ref>/);
});

test("an evidence record that names no injected violation is refused", async () => {
  const c = await compileJson(exampleJson(), "evidence");
  try {
    fs.writeFileSync(path.join(c.dir, "design", "threshold-evidence.json"), JSON.stringify({ records: [{ check: "x", check_version: "738ac6e6b20a4560", failed: true }] }));
    const { compileSource } = await import("../dist/index.js");
    await assert.rejects(compileSource({ sourcePath: c.sourcePath, rootDir: c.dir }), /names no injected_violation/);
  } finally {
    c.cleanup();
  }
});

// ---------------------------------------------------------------- guide

test("hex colours canonicalise to the computed spelling; other spellings stay for the browser to resolve", () => {
  assert.equal(canonical("#123456"), "rgb(18, 52, 86)");
  assert.equal(canonical("#abc"), "rgb(170, 187, 204)");
  assert.equal(canonical("#cc000080"), "rgba(204, 0, 0, 0.502)");
  assert.equal(canonical("1rem"), "16px");
  assert.equal(canonical("Canvas"), "Canvas");
});

const STATES = '"default hover focus-visible active disabled loading"';
const conforming = () => ({
  elementId: "dom-b1",
  type: "button",
  classes: ["dk-button"],
  styles: { color: "rgb(255, 255, 255)", backgroundColor: "rgb(0, 68, 204)", borderRadius: "4px", fontSize: "15px" },
  customProperties: { "--dk-kit-states": STATES },
});

test("a generated guide has the StyleGuideConfig shape and its rules are generated per kit role", async () => {
  const c = await compileJson(withDeclaredRoles(), "guide");
  try {
    const g = JSON.parse(c.outputs["design-kit-specimen.styleguide.uibridge.json"]);
    assert.deepEqual(Object.keys(g), ["version", "name", "description", "tokens", "rules"]);
    assert.equal(g.version, "1.0.0");
    assert.equal(g.name, "design-kit-specimen");
    assert.equal(g.tokens.colors["role-accent"], "rgb(0, 68, 204)");
    assert.deepEqual(g.tokens.typography.fontSizes, { lg: "18px", md: "15px", sm: "13px", xl: "24px" });
    assert.deepEqual(g.tokens.borderRadius, { md: "4px", sm: "2px" });
    assert.deepEqual(
      g.rules.map((r) => r.id),
      [
        "palette-color",
        "palette-background-color",
        "font-size-on-scale",
        "heading-size-on-scale",
        "border-radius-on-scale",
        "button-states-declared",
        "text-input-states-declared",
        "select-states-declared",
        "checkbox-states-declared",
        "switch-states-declared",
        "tabs-states-declared",
        "dialog-states-declared",
        "data-table-states-declared",
        "button-state-declaration",
      ],
    );
    // A heading's size comes from the declared scale above the body step (md = 15px).
    assert.deepEqual(g.rules.find((r) => r.id === "heading-size-on-scale").constraints[0].values, ["18px", "24px"]);
    for (const r of g.rules) {
      assert.ok(["error", "warning", "info"].includes(r.severity));
      for (const k of r.constraints) assert.ok(["exact", "oneOf"].includes(k.type));
    }
  } finally {
    c.cleanup();
  }
});

test("validateElement (published @qontinui/ui-bridge) passes a conforming element and reddens six seeded violations", async () => {
  const c = await compileJson(withDeclaredRoles(), "guide-validate");
  try {
    const guide = JSON.parse(c.outputs["design-kit-specimen.styleguide.uibridge.json"]);
    const failing = async (el) => (await validateElements(guide, guide.rules, [el])).map((f) => f.ruleId).sort();

    assert.deepEqual(await failing(conforming()), []);

    const seeded = [
      ["an off-scale background colour", { ...conforming(), styles: { ...conforming().styles, backgroundColor: "rgb(1, 2, 3)" } }, ["palette-background-color"]],
      ["an off-palette text colour", { ...conforming(), styles: { ...conforming().styles, color: "rgb(9, 9, 9)" } }, ["palette-color"]],
      ["a literal radius", { ...conforming(), styles: { ...conforming().styles, borderRadius: "7px" } }, ["border-radius-on-scale"]],
      ["an off-scale font size", { ...conforming(), styles: { ...conforming().styles, fontSize: "16px" } }, ["font-size-on-scale"]],
      ["a missing state declaration", { ...conforming(), customProperties: {} }, ["button-state-declaration", "button-states-declared"]],
      [
        "a heading at the body size",
        { elementId: "h", type: "heading", styles: { color: "rgb(17, 17, 17)", backgroundColor: "rgba(0, 0, 0, 0)", borderRadius: "0px", fontSize: "15px" } },
        ["heading-size-on-scale"],
      ],
    ];
    for (const [what, el, expected] of seeded) assert.deepEqual(await failing(el), expected, what);
  } finally {
    c.cleanup();
  }
});

test("buildGuide omits a rule whose group is undeclared instead of inventing one", async () => {
  const j = exampleJson();
  delete j.type.scale;
  const c = await compileJson(j, "guide-undeclared");
  try {
    const ids = buildGuide("x", c.entries).rules.map((r) => r.id);
    assert.ok(!ids.includes("font-size-on-scale"));
    assert.ok(!ids.includes("heading-size-on-scale"));
    assert.ok(ids.includes("border-radius-on-scale"));
  } finally {
    c.cleanup();
  }
});

// ---------------------------------------------------------------- lint-classes

test("lint-classes reports bg-[#f00] and p-[13px] with file and line, and passes a conforming file", () => {
  const bad = [
    "export const A = () => (",
    '  <div className="flex bg-[#f00] p-[13px]">',
    '    <span style={{ color: "#ff0000", width: "12px" }} />',
    "  </div>",
    ");",
    "",
  ].join("\n");
  const found = lintText("bad.tsx", bad, new Set());
  assert.deepEqual(
    found.map((f) => `${f.file}:${f.line}:${f.column} ${f.rule} ${f.match}`),
    [
      "bad.tsx:2:24 arbitrary-value bg-[#f00]",
      "bad.tsx:2:34 arbitrary-value p-[13px]",
      "bad.tsx:3:28 inline-colour #ff0000",
      "bad.tsx:3:46 inline-length 12px",
    ],
  );
  const good = ['export const A = () => <div className="flex bg-surface p-3" style={{ color: "var(--dk-color-role-text)" }} />;', ""].join("\n");
  assert.deepEqual(lintText("good.tsx", good, new Set()), []);
});

test("a line carrying an exceptions entry from the source is waived; an unknown id waives nothing", () => {
  const line = (id) => `export const A = () => <div className="grid-cols-[1fr_2fr]" />; // design-kit-exception: ${id}\n`;
  assert.deepEqual(lintText("a.tsx", line("legacy-grid"), new Set(["legacy-grid"])), []);
  assert.deepEqual(
    lintText("a.tsx", line("nope"), new Set(["legacy-grid"])).map((f) => [f.rule, f.match]),
    [
      ["arbitrary-value", "grid-cols-[1fr_2fr]"],
      ["unknown-exception", "nope"],
    ],
  );
});

test("design-kit lint-classes exits 1 on a seeded violation and 0 on a conforming tree; exceptions come from the source", async () => {
  const c = await compileJson(exampleJson(), "lint");
  try {
    const src = path.join(c.dir, "app");
    fs.mkdirSync(src);
    fs.writeFileSync(path.join(src, "ok.tsx"), 'export const A = () => <div className="flex bg-surface" />;\n');
    const run = async () => {
      const lines = [];
      const code = await main(["lint-classes", "app", "--root", c.dir], (s) => lines.push(s));
      return { code, lines };
    };
    assert.deepEqual(await run(), { code: 0, lines: ["design-kit lint-classes: 1 files, 0 findings"] });
    fs.writeFileSync(path.join(src, "bad.tsx"), 'export const B = () => <div className="p-[13px]" />;\n');
    assert.deepEqual(await run(), { code: 1, lines: ["bad.tsx:1:40 arbitrary-value p-[13px]", "design-kit lint-classes: 2 files, 1 findings"] });
    // `exceptions.legacy-grid` is in the example source: a marked line is waived.
    fs.writeFileSync(path.join(src, "bad.tsx"), 'export const B = () => <div className="p-[13px]" />; // design-kit-exception: legacy-grid\n');
    assert.equal((await run()).code, 0);
  } finally {
    c.cleanup();
  }
});

test("lint-classes on a directory with no .tsx files and an unexpected extra argument are refused, not reported clean", async () => {
  const dir = tmpDir("lint-empty");
  try {
    const lines = [];
    assert.equal(await main(["lint-classes", ".", "--root", dir], (s) => lines.push(s)), 2);
    assert.match(lines[0], /no \.tsx files under \./);
    const more = [];
    assert.equal(await main(["compile", "stray", "--root", dir], (s) => more.push(s)), 2);
    assert.match(more[0], /unexpected argument stray/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a long delimiter-free run does not hang the arbitrary-value scan", () => {
  const start = Date.now();
  lintText("big.tsx", `const x = "${"a-".repeat(60000)}";\n`, new Set());
  assert.ok(Date.now() - start < 2000, "the scan is linear in the line length");
});

test("the kit's own tsx sources pass lint-classes (the check is shipped to the template, so the kit is its first user)", async () => {
  const { lintDir } = await import("../dist/index.js");
  const { ROOT } = await import("./helpers.js");
  const r = lintDir(path.join(ROOT, "src"), new Set());
  assert.deepEqual(r.findings, []);
  assert.equal(r.files, fs.readdirSync(path.join(ROOT, "src"), { recursive: true }).filter((f) => f.endsWith(".tsx")).length);
  assert.ok(r.files > 0);
});

void tmpDir;
