// Phase 2: the compiler core. Every expectation is a literal; each check has a
// seeded-violation fixture that reddens it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { compileSource, parseSource, SourceError } from "../dist/index.js";
import { execFileSync } from "node:child_process";
import { main } from "../dist/cli.js";
import { ROOT, compileTailwind, emittedClasses } from "./helpers.js";
import { leaf, mkProject } from "./project.js";

const CLAUSE = "ux-priorities/style-is-resolved-from-the-tenants-declared-visual-system";

const declaredSurface = {
  $extensions: { qontinui: { name: "fixture" } },
  color: { role: { surface: leaf("color", "#101014", "declared") } },
  type: { scale: { body: leaf("dimension", undefined, "undeclared") } },
};

test("a declared colour emits a variable; an undeclared type scale emits no value and no --dk-font-*", async () => {
  const p = mkProject(declaredSurface);
  try {
    const { outputs, report } = await compileSource({ sourcePath: p.sourcePath, rootDir: p.dir });
    assert.match(outputs["tokens.css"], /--dk-color-role-surface: #101014;/);
    assert.doesNotMatch(outputs["tokens.css"], /--dk-type-scale/);
    assert.doesNotMatch(outputs["tokens.css"], /--dk-font-/);
    assert.match(outputs["tokens.css"], /--dk-type-family-sans: system-ui;/, "the undeclared family is a platform keyword, not a face");
    assert.equal(report.groups.color.state, "declared");
    assert.equal(report.groups.type.state, "undeclared");
    assert.deepEqual(
      report.undeclared.find((u) => u.path === "type.scale.body"),
      { path: "type.scale.body", reason: "stated undeclared in the source" },
    );
    assert.equal(report.next_undeclared_group, "type");
  } finally {
    p.cleanup();
  }
});

test("seeded violation: a group with no leaves is undeclared, and a declared leaf in it makes it declared", async () => {
  const p = mkProject({ color: { role: { surface: leaf("color", "#fff", "declared") } } });
  try {
    const { report } = await compileSource({ sourcePath: p.sourcePath, rootDir: p.dir });
    assert.equal(report.groups.space.state, "undeclared");
    assert.equal(report.groups.space.leaves, 0);
    assert.equal(report.groups.color.state, "declared");
  } finally {
    p.cleanup();
  }
});

test("an undeclared identity renders as platform keywords, never a palette (D3)", async () => {
  const p = mkProject({ type: { scale: { body: leaf("dimension", undefined, "undeclared") } } });
  try {
    const { outputs, report } = await compileSource({ sourcePath: p.sourcePath, rootDir: p.dir });
    const css = outputs["tokens.css"];
    assert.match(css, /--dk-color-role-surface: Canvas;/);
    assert.match(css, /--dk-color-role-text: CanvasText;/);
    assert.match(css, /--dk-color-role-surface-hover: color-mix\(in oklab, CanvasText 8%, Canvas\);/);
    assert.match(css, /--dk-color-role-surface-active: color-mix\(in oklab, CanvasText 14%, Canvas\);/);
    assert.match(css, /--dk-type-family-sans: system-ui;/);
    assert.equal(report.identity.state, "undeclared");
    assert.match(outputs["tokens.ts"], /export const identity = "undeclared" as const;/);
    assert.ok(report.undeclared.some((u) => u.path === "color.role.surface"));
    // No hex value was invented.
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,6}\b/);
  } finally {
    p.cleanup();
  }
});

test("declared identity roles replace the keywords and the report says declared", async () => {
  const roles = {};
  for (const n of ["surface", "text", "muted", "accent", "accent-text", "control", "control-text", "border", "field", "field-text", "link"]) {
    roles[n] = leaf("color", "#123456", "declared");
  }
  const p = mkProject({
    color: { role: roles },
    type: { family: { sans: leaf("fontFamily", "Inter, sans-serif", "declared"), mono: leaf("fontFamily", "ui-monospace", "declared") } },
  });
  try {
    const { outputs, report } = await compileSource({ sourcePath: p.sourcePath, rootDir: p.dir });
    assert.equal(report.identity.state, "declared");
    assert.deepEqual(report.identity.system_fallbacks, []);
    assert.doesNotMatch(outputs["tokens.css"], /Canvas/);
  } finally {
    p.cleanup();
  }
});

test("an authored hue is refused and the refusal names the clause", async () => {
  const p = mkProject({ color: { anchor: { hue: leaf("number", 250, "authored(finding-1)") } } });
  try {
    await assert.rejects(
      compileSource({ sourcePath: p.sourcePath, rootDir: p.dir }),
      (e) => e instanceof SourceError && e.message.includes("color.anchor.hue") && e.message.includes(CLAUSE),
    );
  } finally {
    p.cleanup();
  }
});

test("identity is refused at the group path itself and derived needs a dimension", () => {
  assert.throws(() => parseSource({ type: { family: leaf("fontFamily", "Inter", "authored(f-1)") } }), (e) => e.message.includes("type.family") && e.message.includes(CLAUSE));
  assert.throws(() => parseSource({ imagery: { style: leaf("string", "flat", "authored(f-1)") } }), (e) => e.message.includes(CLAUSE));
  const d = { $extensions: { qontinui: { source: "derived(modular-scale)", derive: { rule: "modular-scale", from: 1, ratio: 2, step: 1 } } } };
  assert.throws(() => parseSource({ color: { x: { ...d, $type: "color" } } }), (e) => e.message.includes("must be a dimension"));
});

test("a flag without a value is a usage error, not the cwd", async () => {
  const lines = [];
  assert.equal(await main(["compile", "--out"], (s) => lines.push(s)), 2);
  assert.match(lines.join("\n"), /--out needs a value/);
});

test("authored is refused on every identity group: colour, type family, imagery style", () => {
  for (const [group, key, name, type, value] of [
    ["color", "role", "accent", "color", "#abc"],
    ["type", "family", "sans", "fontFamily", "Inter"],
    ["imagery", "style", "illustration", "string", "flat"],
  ]) {
    const src = { [group]: { [key]: { [name]: leaf(type, value, "authored(f-1)") } } };
    assert.throws(() => parseSource(src), (e) => e instanceof SourceError && e.message.includes(`${group}.${key}.${name}`) && e.message.includes(CLAUSE));
  }
});

test("seeded violation: authored on a structural group is accepted, and flagged unverified without a notification_ref", async () => {
  const p = mkProject({
    space: { unit: leaf("dimension", { value: 4, unit: "px" }, "authored(finding-7)"), gap: leaf("dimension", { value: 8, unit: "px" }, "authored") },
  });
  try {
    const { report } = await compileSource({ sourcePath: p.sourcePath, rootDir: p.dir });
    assert.deepEqual(report.unverified_provenance, [{ path: "space.gap", source: "authored", stage: "draft" }]);
    assert.equal(report.groups.space.state, "authored");
  } finally {
    p.cleanup();
  }
});

test("source violations are refused: no source, an undeclared leaf with a value, a restated resolved leaf, an unknown group", () => {
  const cases = [
    [{ space: { unit: { $type: "dimension", $value: "4px" } } }, "has no source"],
    [{ space: { unit: leaf("dimension", "4px", "undeclared") } }, "undeclared leaf carries no $value"],
    [{ space: { unit: leaf("dimension", "4px", "resolved(@qontinui/design-tokens@abc)") } }, "cannot state resolved"],
    [{ flavour: {} }, 'unknown group "flavour"'],
    [{ space: { unit: leaf("dimension", "4px", "declared"), "a.b": leaf("dimension", "4px", "declared") } }, 'may not contain "."'],
    [{ space: { unit: leaf("nonsense", "4px", "declared") } }, "unknown $type"],
  ];
  for (const [src, needle] of cases) {
    assert.throws(() => parseSource(src), (e) => e instanceof SourceError && e.message.includes(needle), needle);
  }
});

test("derived leaves compute from a stated rule and are recorded with their inputs", async () => {
  const derived = (rule) => ({ $type: "dimension", $extensions: { qontinui: { source: `derived(${rule.rule})`, derive: rule } } });
  const p = mkProject({
    type: { scale: { step2: derived({ rule: "modular-scale", from: 17, ratio: 1.25, step: 2 }) } },
    space: { s3: derived({ rule: "spacing-multiple", base: 4, multiple: 3 }) },
  });
  try {
    const { outputs, report } = await compileSource({ sourcePath: p.sourcePath, rootDir: p.dir });
    assert.match(outputs["tokens.css"], /--dk-type-scale-step2: 26\.563px;/);
    assert.match(outputs["tokens.css"], /--dk-space-s3: 12px;/);
    assert.deepEqual(report.derived.map((d) => [d.path, d.rule]), [["space.s3", "spacing-multiple"], ["type.scale.step2", "modular-scale"]]);
    assert.equal(report.groups.type.state, "authored");
  } finally {
    p.cleanup();
  }
});

test("aliases resolve to their target's value; a cycle and a dangling alias are refused", async () => {
  const p = mkProject({
    color: { brand: { primary: leaf("color", "#336699", "declared") }, role: { accent: leaf(undefined, "{color.brand.primary}", "declared") } },
  });
  try {
    const { outputs } = await compileSource({ sourcePath: p.sourcePath, rootDir: p.dir });
    assert.match(outputs["tokens.css"], /--dk-color-role-accent: #336699;/);
  } finally {
    p.cleanup();
  }
  const cyc = mkProject({ color: { a: leaf("color", "{color.b}", "declared"), b: leaf("color", "{color.a}", "declared") } });
  try {
    await assert.rejects(compileSource({ sourcePath: cyc.sourcePath, rootDir: cyc.dir }), /alias cycle/);
  } finally {
    cyc.cleanup();
  }
  const dangling = mkProject({ color: { a: leaf("color", "{color.nope}", "declared") } });
  try {
    await assert.rejects(compileSource({ sourcePath: dangling.sourcePath, rootDir: dangling.dir }), /names no leaf/);
  } finally {
    dangling.cleanup();
  }
});

test("compile --check exits 1 after one byte of an output is edited and 0 after a fresh compile", async () => {
  const p = mkProject(declaredSurface);
  const lines = [];
  const say = (s) => lines.push(s);
  try {
    const argv = ["--root", p.dir];
    assert.equal(await main(["compile", "--check", ...argv], say), 1, "no outputs yet is drift");
    assert.equal(await main(["compile", ...argv], say), 0);
    assert.equal(await main(["compile", "--check", ...argv], say), 0);
    const css = path.join(p.outDir, "tokens.css");
    const text = fs.readFileSync(css, "utf8");
    fs.writeFileSync(css, text.replace("#101014", "#101015"));
    lines.length = 0;
    assert.equal(await main(["compile", "--check", ...argv], say), 1);
    assert.match(lines.join("\n"), /drift in tokens\.css/);
    assert.equal(await main(["compile", ...argv], say), 0);
    assert.equal(await main(["compile", "--check", ...argv], say), 0);
  } finally {
    p.cleanup();
  }
});

test("design-kit status prints each group's state and the next undeclared group", async () => {
  const p = mkProject(declaredSurface);
  const lines = [];
  try {
    assert.equal(await main(["status", "--root", p.dir], (s) => lines.push(s)), 0);
    assert.deepEqual(lines, [
      "color: declared",
      "type: undeclared",
      "space: undeclared",
      "layout: undeclared",
      "motion: undeclared",
      "states: undeclared",
      "budgets: undeclared",
      "thresholds: undeclared",
      "imagery: undeclared",
      "exceptions: undeclared",
      "identity: undeclared",
      "next undeclared group: type",
    ]);
  } finally {
    p.cleanup();
  }
});

test("compile exits 2 and names the problem for a refused source", async () => {
  const p = mkProject({ color: { anchor: { hue: leaf("number", 250, "authored(f)") } } });
  const lines = [];
  try {
    assert.equal(await main(["compile", "--root", p.dir], (s) => lines.push(s)), 2);
    assert.match(lines.join("\n"), /the source was refused/);
    assert.ok(!fs.existsSync(p.outDir), "nothing is written for a refused source");
  } finally {
    p.cleanup();
  }
});

test("compile output is deterministic", async () => {
  const p = mkProject(declaredSurface);
  try {
    const a = await compileSource({ sourcePath: p.sourcePath, rootDir: p.dir });
    const b = await compileSource({ sourcePath: p.sourcePath, rootDir: p.dir });
    assert.deepEqual(a.outputs, b.outputs);
  } finally {
    p.cleanup();
  }
});

// ---------------------------------------------------------------------------
// The exclusive theme, through Tailwind
// ---------------------------------------------------------------------------

const themed = {
  color: { role: { surface: leaf("color", "#101014", "declared") }, brand: { primary: leaf("color", "#336699", "declared") } },
  space: {
    unit: leaf("dimension", { value: 4, unit: "px" }, "authored(finding-7)"),
    radius: { md: leaf("dimension", { value: 6, unit: "px" }, "authored(finding-7)") },
  },
  layout: { breakpoint: { md: leaf("dimension", { value: 48, unit: "rem" }, "authored(finding-7)") } },
};

test("theme.css begins --*: initial and mints no class for a named utility outside the theme", async (t) => {
  const p = mkProject(themed);
  try {
    const { outputs } = await compileSource({ sourcePath: p.sourcePath, rootDir: p.dir });
    const theme = outputs["theme.css"];
    assert.ok(theme.includes("@theme inline {\n  --*: initial;\n"), "the theme begins with the reset");
    assert.ok(theme.includes("  --color-surface: var(--dk-color-role-surface);\n"));
    assert.ok(theme.includes("  --spacing: var(--dk-space-unit);\n"));
    assert.ok(theme.includes("  --radius-md: var(--dk-space-radius-md);\n"));
    assert.ok(theme.includes("  --breakpoint-md: var(--dk-layout-breakpoint-md);\n"));
    assert.ok(!theme.includes("--color-red"), "no default palette survives");
    assert.ok(theme.includes("  --color-palette-brand-primary: var(--dk-color-brand-primary);\n"), "a non-role colour cannot collide with a role");

    // Through Tailwind: tokens.css supplies the --dk-* properties the theme reads.
    // Inside the repo so `@import "tailwindcss"` resolves from its node_modules.
    fs.mkdirSync(path.join(ROOT, ".dk-cache"), { recursive: true });
    const dir = fs.mkdtempSync(path.join(ROOT, ".dk-cache", "tw-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(dir, "theme.css"), theme);
    fs.writeFileSync(path.join(dir, "tokens.css"), outputs["tokens.css"]);
    fs.writeFileSync(path.join(dir, "content.html"), `<div class="bg-surface bg-red-500 text-lg p-3 rounded-md md:p-3 bg-[#f00]"></div>`);
    const entry = path.join(dir, "app.css");
    fs.writeFileSync(entry, `@import "tailwindcss" source(none);\n@import "./theme.css";\n@source "./content.html";\n`);
    const css = await compileTailwind(entry, ROOT);
    const classes = emittedClasses(css);
    assert.ok(classes.has("bg-surface"));
    assert.ok(classes.has("p-3"));
    assert.ok(classes.has("rounded-md"));
    assert.ok(classes.has("md:p-3"), "the breakpoint comes from the source, not from Tailwind");
    assert.ok(!classes.has("bg-red-500"));
    assert.ok(!classes.has("text-lg"));
    // The theme alone does not stop a literal (Probe 1); Phase 4's lint-classes does.
    assert.ok(classes.has("bg-[#f00]"));
  } finally {
    p.cleanup();
  }
});

test("seeded violation: a source with no layout.breakpoint defines no md variant", async () => {
  const { layout: _layout, ...noBreakpoints } = themed;
  void _layout;
  const p = mkProject(noBreakpoints);
  try {
    const { outputs, report } = await compileSource({ sourcePath: p.sourcePath, rootDir: p.dir });
    assert.ok(!outputs["theme.css"].includes("--breakpoint-"));
    assert.equal(report.groups.layout.state, "undeclared");
  } finally {
    p.cleanup();
  }
});

test("the bin runs through a symlink (as node_modules/.bin does) and prints status", () => {
  const p = mkProject(declaredSurface);
  try {
    const link = path.join(p.dir, "design-kit");
    fs.symlinkSync(path.join(ROOT, "dist", "cli.js"), link);
    const out = execFileSync(process.execPath, [link, "status", "--root", p.dir], { encoding: "utf8" });
    assert.match(out, /^color: declared\n/);
    assert.match(out, /next undeclared group: type\n$/);
  } finally {
    p.cleanup();
  }
});
