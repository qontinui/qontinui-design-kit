// Phase 3: the token-package adapter. The package is built from a clone at
// 415be45 (the CI checkout of qontinui-design-tokens, the sibling checkout, or
// GitHub, in that order). Resolve first: nothing is copied into the source.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { compileSource, loadTokenPackage, tokenLeaves } from "../dist/index.js";
import { main } from "../dist/cli.js";
import { CACHE_DIR, SHA, SHORT, leaf, mkProject, tokensRepo } from "./project.js";

const ctx = (rootDir) => ({ rootDir, tokensRepo: tokensRepo(), cacheDir: CACHE_DIR });
const spec = (groups = null) => ({ package: "@qontinui/design-tokens", ref: SHORT, groups });
const LABEL = `@qontinui/design-tokens@${SHORT}`;

const importing = (groups, extra = {}) => ({
  $extensions: { qontinui: { name: "fixture", import: [groups ? { package: "@qontinui/design-tokens", ref: SHORT, groups } : { package: "@qontinui/design-tokens", ref: SHORT }] } },
  ...extra,
});

test("the package builds at the pinned ref and exposes typeScale, durations and reducedMotion", async () => {
  const pkg = await loadTokenPackage(spec(), ctx(process.cwd()));
  assert.equal(pkg.sha, SHA);
  assert.equal(pkg.label, LABEL);
  assert.equal(pkg.version, "1.3.0");
  assert.equal(pkg.exports.typeScale.body, 28);
  assert.equal(pkg.exports.durations.fast, 150);
  assert.equal(pkg.exports.reducedMotion.cssDuration, "0.01ms");
});

test("a source that asks for typeScale and durations gets those and no fontFamilies", async () => {
  const pkg = await loadTokenPackage(spec(), ctx(process.cwd()));
  const { leaves } = tokenLeaves(pkg, ["typeScale", "durations"], 0.5);
  const paths = leaves.map((l) => l.path);
  assert.ok(paths.includes("type.scale.body"));
  assert.ok(paths.includes("motion.duration.fast"));
  assert.ok(!paths.some((p) => p.startsWith("type.family")), "fontFamilies were not asked for");
  assert.ok(!paths.some((p) => p.startsWith("color")));
  assert.deepEqual(leaves.find((l) => l.path === "type.scale.body").value, { value: 14, unit: "px" });
  assert.deepEqual(leaves.find((l) => l.path === "type.scale.display").inputs, { surfaceUnit: 0.5, referencePx: 64, referenceFrame: 1080 });
  assert.deepEqual(leaves.find((l) => l.path === "motion.duration.deliberate").value, { value: 900, unit: "ms" });
  for (const l of leaves) assert.equal(l.source.kind === "resolved" && l.source.arg, LABEL);
});

test("with no surface unit declared, type.scale is undeclared and no scale value is emitted", async () => {
  const pkg = await loadTokenPackage(spec(), ctx(process.cwd()));
  const { leaves } = tokenLeaves(pkg, ["typeScale"], null);
  assert.equal(leaves.length, 1);
  assert.equal(leaves[0].path, "type.scale");
  assert.equal(leaves[0].source.kind, "undeclared");
  assert.match(leaves[0].inputs.reason, /no surface unit declared/);

  const p = mkProject(importing(["typeScale"]));
  try {
    const { outputs, report } = await compileSource({ sourcePath: p.sourcePath, rootDir: p.dir, ...ctx(p.dir) });
    assert.doesNotMatch(outputs["tokens.css"], /--dk-type-scale/);
    assert.ok(report.undeclared.some((u) => u.path === "type.scale"));
  } finally {
    p.cleanup();
  }
});

test("a group the package does not export stays undeclared, never silently empty", () => {
  const fake = { label: "@qontinui/design-tokens@1.0.0", version: "1.0.0", ref: null, sha: null, exports: { colors: { brand: { primary: "#4A90D9" } } } };
  const { leaves } = tokenLeaves(fake, null, 1);
  const kinds = Object.fromEntries(leaves.map((l) => [l.path, l.source.kind]));
  assert.equal(kinds["color.brand.primary"], "resolved");
  for (const anchor of ["type.family", "type.scale", "motion.duration", "motion.easing", "motion.reduced"]) {
    assert.equal(kinds[anchor], "undeclared", anchor);
  }
  assert.match(leaves.find((l) => l.path === "motion.duration").inputs.reason, /does not export durations/);
});

test("the published @qontinui/design-tokens@1.0.0 lacks typeScale, durations and reducedMotion", async () => {
  const p = mkProject({});
  try {
    fs.writeFileSync(path.join(p.dir, "package.json"), JSON.stringify({ name: "c", version: "1.0.0", private: true }));
    execFileSync("npm", ["install", "--no-audit", "--no-fund", "--ignore-scripts", "@qontinui/design-tokens@1.0.0"], { cwd: p.dir, stdio: "pipe" });
    const pkg = await loadTokenPackage({ package: "@qontinui/design-tokens", ref: null, groups: null }, { rootDir: p.dir });
    assert.equal(pkg.version, "1.0.0");
    assert.equal(pkg.label, "@qontinui/design-tokens@1.0.0");
    const { leaves } = tokenLeaves(pkg, null, 1);
    const undeclared = leaves.filter((l) => l.source.kind === "undeclared").map((l) => l.path);
    assert.ok(undeclared.includes("type.scale"));
    assert.ok(undeclared.includes("motion.duration"));
    assert.ok(undeclared.includes("motion.reduced"));
    assert.ok(leaves.some((l) => l.path === "color.brand.primary" && l.source.kind === "resolved"));
  } finally {
    p.cleanup();
  }
});

test("a source importing the package compiles with every imported leaf labelled resolved and none restated", async () => {
  const source = importing(null, { type: { unit: leaf("number", 0.6, "authored(finding-9)") } });
  const p = mkProject(source);
  try {
    const text = fs.readFileSync(p.sourcePath, "utf8");
    assert.doesNotMatch(text, /#[0-9a-fA-F]{6}/, "the source holds no hex value");
    assert.doesNotMatch(text, /cubicBezier|"duration"/, "the source restates no motion value");

    const { outputs, report } = await compileSource({ sourcePath: p.sourcePath, rootDir: p.dir, ...ctx(p.dir) });
    const css = outputs["tokens.css"];
    assert.match(css, /--dk-color-brand-primary: #4A90D9;/);
    assert.match(css, /--dk-color-surface-canvas: #111115;/);
    assert.match(css, /--dk-type-scale-body: 16\.8px;/);
    assert.match(css, /--dk-type-family-sans: "Inter", ui-sans-serif, system-ui, sans-serif;/);
    assert.match(css, /--dk-motion-duration-fast: 150ms;/);
    assert.match(css, /--dk-motion-easing-standard: cubic-bezier\(0\.2, 0, 0, 1\);/);
    assert.match(css, /--dk-motion-reduced-css-duration: 0\.01ms;/);

    assert.deepEqual(report.resolved_from, [{ package: "@qontinui/design-tokens", ref: SHORT, version: "1.3.0", sha: SHA, label: LABEL }]);
    assert.ok(report.resolved_leaves.length > 50);
    for (const r of report.resolved_leaves) assert.equal(r.source, `resolved(${LABEL})`);
    assert.equal(report.groups.motion.state, "resolved");
    assert.equal(report.groups.type.state, "mixed", "the authored unit and the resolved scale");
    assert.equal(report.groups.color.state, "resolved");
    // The compile report names the unit the scale was multiplied by.
    assert.ok(!report.undeclared.some((u) => u.path === "type.scale"));
  } finally {
    p.cleanup();
  }
});

test("a leaf the source states itself shadows the import and is reported", async () => {
  const source = importing(["durations"], { motion: { duration: { fast: leaf("duration", { value: 120, unit: "ms" }, "authored(f-2)") } } });
  const p = mkProject(source);
  try {
    const { outputs, report } = await compileSource({ sourcePath: p.sourcePath, rootDir: p.dir, ...ctx(p.dir) });
    assert.match(outputs["tokens.css"], /--dk-motion-duration-fast: 120ms;/);
    assert.match(outputs["tokens.css"], /--dk-motion-duration-base: 300ms;/);
    assert.deepEqual(report.imports_shadowed, ["motion.duration.fast"]);
  } finally {
    p.cleanup();
  }
});

test("an unsupported import package is refused; an installed package that is absent says so", async () => {
  const p = mkProject({ $extensions: { qontinui: { import: ["left-pad"] } } });
  try {
    await assert.rejects(compileSource({ sourcePath: p.sourcePath, rootDir: p.dir }), /no adapter/);
  } finally {
    p.cleanup();
  }
  const q = mkProject({ $extensions: { qontinui: { import: ["@qontinui/design-tokens"] } } });
  try {
    fs.writeFileSync(path.join(q.dir, "package.json"), "{}");
    await assert.rejects(compileSource({ sourcePath: q.sourcePath, rootDir: q.dir }), /is not installed/);
  } finally {
    q.cleanup();
  }
});

test("compile --check works for a source with resolved leaves", async () => {
  const p = mkProject(importing(["durations"]));
  const say = () => {};
  const argv = ["--root", p.dir];
  process.env.DESIGN_TOKENS_REPO = tokensRepo();
  process.env.DESIGN_KIT_CACHE = CACHE_DIR;
  try {
    assert.equal(await main(["compile", ...argv], say), 0);
    assert.equal(await main(["compile", "--check", ...argv], say), 0);
    const css = path.join(p.outDir, "tokens.css");
    fs.writeFileSync(css, fs.readFileSync(css, "utf8").replace("150ms", "151ms"));
    assert.equal(await main(["compile", "--check", ...argv], say), 1);
  } finally {
    delete process.env.DESIGN_TOKENS_REPO;
    delete process.env.DESIGN_KIT_CACHE;
    p.cleanup();
  }
});
