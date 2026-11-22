// Plan 2026-11-21-design-kit-compiler-gaps Phase 4: the adapter imports the
// token package's fontWeights, lineHeights and letterSpacings (exported since
// 415be45). A group the package does not export is an explicit undeclared
// leaf, never an empty group. Every expectation is a literal.
import test from "node:test";
import assert from "node:assert/strict";
import { compileSource, loadTokenPackage, tokenLeaves } from "../dist/index.js";
import { CACHE_DIR, SHORT, leaf, mkProject, tokensRepo } from "./project.js";

const ctx = (rootDir) => ({ rootDir, tokensRepo: tokensRepo(), cacheDir: CACHE_DIR });
const LABEL = `@qontinui/design-tokens@${SHORT}`;
const TYPO = ["fontWeights", "lineHeights", "letterSpacings"];
const byPath = (leaves) => Object.fromEntries(leaves.map((l) => [l.path, l]));

test("against tokens at 415be45, regular is 400, relaxed is 1.3 and wide is {0.04, em}, each resolved", async () => {
  const pkg = await loadTokenPackage({ package: "@qontinui/design-tokens", ref: SHORT, groups: TYPO }, ctx(process.cwd()));
  const leaves = byPath(tokenLeaves(pkg, TYPO, null).leaves);
  assert.deepEqual(Object.keys(leaves).sort(), [
    "type.leading.loose",
    "type.leading.none",
    "type.leading.normal",
    "type.leading.relaxed",
    "type.leading.snug",
    "type.leading.tight",
    "type.tracking.normal",
    "type.tracking.wide",
    "type.tracking.wider",
    "type.tracking.widest",
    "type.weight.bold",
    "type.weight.regular",
    "type.weight.semibold",
  ]);
  assert.deepEqual([leaves["type.weight.regular"].type, leaves["type.weight.regular"].value], ["fontWeight", 400]);
  assert.deepEqual([leaves["type.leading.relaxed"].type, leaves["type.leading.relaxed"].value], ["number", 1.3]);
  assert.deepEqual([leaves["type.tracking.wide"].type, leaves["type.tracking.wide"].value], ["dimension", { value: 0.04, unit: "em" }]);
  assert.deepEqual(leaves["type.tracking.normal"].value, { value: 0, unit: "em" });
  for (const l of Object.values(leaves)) assert.deepEqual(l.source, { kind: "resolved", arg: LABEL });
});

test("a package lacking lineHeights yields an explicit undeclared type.leading leaf, never an empty group", () => {
  const fake = { label: "@qontinui/design-tokens@x", version: "x", ref: null, sha: null, exports: { fontWeights: { regular: 400 }, letterSpacings: { wide: "0.04em" } } };
  const leaves = byPath(tokenLeaves(fake, TYPO, null).leaves);
  assert.deepEqual(Object.keys(leaves).sort(), ["type.leading", "type.tracking.wide", "type.weight.regular"]);
  assert.equal(leaves["type.leading"].source.kind, "undeclared");
  assert.equal(leaves["type.leading"].inputs.reason, "@qontinui/design-tokens@x does not export lineHeights");
});

test("a tracking value in any spelling other than <number>em is refused with the key named", () => {
  const fake = (wide) => ({ label: "@qontinui/design-tokens@x", version: "x", ref: null, sha: null, exports: { letterSpacings: { wide } } });
  assert.throws(() => tokenLeaves(fake("0.6px"), ["letterSpacings"], null), {
    message: '@qontinui/design-tokens@x letterSpacings.wide is "0.6px"; the adapter reads only <number>em',
  });
  assert.throws(() => tokenLeaves(fake(0.04), ["letterSpacings"], null), {
    message: "@qontinui/design-tokens@x letterSpacings.wide is 0.04; the adapter reads only <number>em",
  });
});

test("a source importing the three groups compiles them as resolved, emits them, and lists the package's 1/1.1/1.15 as out-of-band, not errors", async () => {
  const p = mkProject({
    $extensions: { qontinui: { name: "fixture", import: [{ package: "@qontinui/design-tokens", ref: SHORT, groups: TYPO }] } },
    type: { leading: { custom: leaf("number", 1.3, "authored(finding-leading)") } },
  });
  try {
    const { outputs, report } = await compileSource({ sourcePath: p.sourcePath, rootDir: p.dir, ...ctx(p.dir) });
    const resolved = report.resolved_leaves.map((l) => l.path);
    assert.ok(resolved.includes("type.weight.regular"));
    assert.ok(resolved.includes("type.tracking.wide"));
    assert.deepEqual(
      report.resolved_leaves.find((l) => l.path === "type.leading.relaxed"),
      { path: "type.leading.relaxed", source: `resolved(${LABEL})` },
    );
    assert.deepEqual(report.imports_shadowed, []);
    assert.deepEqual(
      report.out_of_band.filter((o) => o.check === "line-height"),
      [
        { path: "type.leading.none", check: "line-height", value: 1, band: "1.2..1.45 ratio" },
        { path: "type.leading.snug", check: "line-height", value: 1.15, band: "1.2..1.45 ratio" },
        { path: "type.leading.tight", check: "line-height", value: 1.1, band: "1.2..1.45 ratio" },
      ],
    );
    const css = outputs["tokens.css"];
    assert.match(css, /^ {2}--dk-type-weight-semibold: 600;$/m);
    assert.match(css, /^ {2}--dk-type-leading-loose: 1\.35;$/m);
    assert.match(css, /^ {2}--dk-type-tracking-widest: 0\.12em;$/m);
    assert.match(outputs["theme.css"], /^ {2}--tracking-wide: var\(--dk-type-tracking-wide\);$/m);
    const guide = JSON.parse(outputs["fixture.styleguide.uibridge.json"]);
    assert.deepEqual(guide.tokens.typography.letterSpacings, { normal: "0em", wide: "0.04em", wider: "0.08em", widest: "0.12em" });
    assert.equal(guide.tokens.typography.fontWeights.bold, "700");
  } finally {
    p.cleanup();
  }
});

test("a fontWeights or lineHeights entry that is not a number is refused with the key named", () => {
  const fake = (exports) => ({ label: "@qontinui/design-tokens@x", version: "x", ref: null, sha: null, exports });
  assert.throws(() => tokenLeaves(fake({ fontWeights: { regular: "400" } }), ["fontWeights"], null), {
    message: '@qontinui/design-tokens@x fontWeights.regular is "400"; the adapter reads only a number',
  });
  assert.throws(() => tokenLeaves(fake({ lineHeights: { tight: "1.1" } }), ["lineHeights"], null), {
    message: '@qontinui/design-tokens@x lineHeights.tight is "1.1"; the adapter reads only a number',
  });
});
