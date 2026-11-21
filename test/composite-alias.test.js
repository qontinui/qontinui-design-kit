// Plan 2026-11-21-design-kit-compiler-gaps Phase 3: a shadow can name a colour.
// An alias inside a composite value resolves (each field of a shadow object,
// each element of a shadow array); tokens.css reads the colour's variable, the
// guide carries the resolved value, and an alias that cannot resolve is refused
// rather than emitted as literal `{a.b}` text. Every expectation is a literal.
import test from "node:test";
import assert from "node:assert/strict";
import { compileSource } from "../dist/index.js";
import { main } from "../dist/cli.js";
import { leaf, mkProject } from "./project.js";

const px = (value) => ({ value, unit: "px" });
const GLOW = "rgba(74, 144, 217, 0.2)";

const glowSource = (shadow, extra = {}) => ({
  $extensions: { qontinui: { name: "fixture" } },
  color: { glow: { primary: leaf("color", GLOW, "declared") } },
  space: { depth: { glow: leaf("shadow", shadow, "authored(finding-glow)"), ...extra } },
});

async function compile(source) {
  const p = mkProject(source);
  try {
    return await compileSource({ sourcePath: p.sourcePath, rootDir: p.dir });
  } finally {
    p.cleanup();
  }
}

async function cli(source) {
  const p = mkProject(source);
  const lines = [];
  try {
    const code = await main(["compile", "--root", p.dir], (s) => lines.push(s));
    return { code, lines };
  } finally {
    p.cleanup();
  }
}

test("a shadow whose colour is {color.glow.primary} compiles to CSS with no `{`: tokens.css reads the variable, the guide the value", async () => {
  const { outputs } = await compile(glowSource({ offsetX: px(0), offsetY: px(0), blur: px(12), color: "{color.glow.primary}" }));
  const css = outputs["tokens.css"];
  assert.doesNotMatch(css, /\{color\./);
  assert.match(css, /^ {2}--dk-space-depth-glow: 0px 0px 12px 0px var\(--dk-color-glow-primary\);$/m);
  assert.match(css, /^ {2}--dk-color-glow-primary: rgba\(74, 144, 217, 0\.2\);$/m);
  assert.match(outputs["theme.css"], /^ {2}--shadow-glow: var\(--dk-space-depth-glow\);$/m);
  const guide = JSON.parse(outputs["fixture.styleguide.uibridge.json"]);
  assert.deepEqual(guide.tokens.shadows, { glow: "0px 0px 12px 0px rgba(74, 144, 217, 0.2)" });
  assert.match(outputs["tokens.ts"], /"glow": "0px 0px 12px 0px rgba\(74, 144, 217, 0\.2\)"/);
});

test("a shadow whose colour alias names no leaf exits 2 with that leaf's path", async () => {
  const r = await cli(glowSource({ offsetX: px(0), offsetY: px(0), blur: px(12), color: "{color.glow.nope}" }));
  assert.equal(r.code, 2);
  assert.deepEqual(r.lines, ["design-kit: the source was refused:\n  leaf space.depth.glow: alias {color.glow.nope} names no leaf"]);
});

test("a shadow whose colour alias points at an undeclared leaf is refused", async () => {
  const source = glowSource({ offsetX: px(0), offsetY: px(0), blur: px(12), color: "{color.glow.secondary}" });
  source.color.glow.secondary = leaf("color", undefined, "undeclared");
  const r = await cli(source);
  assert.equal(r.code, 2);
  assert.deepEqual(r.lines, ["design-kit: the source was refused:\n  leaf space.depth.glow: alias {color.glow.secondary} points at an undeclared leaf"]);
});

test("a string shadow that embeds an alias is refused naming the leaf, never passed through", async () => {
  const r = await cli(glowSource("0 0 12px {color.glow.primary}"));
  assert.equal(r.code, 2);
  assert.deepEqual(r.lines, [
    "design-kit: the source was refused:\n  leaf space.depth.glow: an alias may be a whole value or a whole field of a composite value, not embedded in a string: \"0 0 12px {color.glow.primary}\"",
  ]);
});

test("an alias cycle through a composite field is refused", async () => {
  const source = glowSource({ offsetX: px(0), offsetY: px(0), blur: px(12), color: "{space.depth.loop}" });
  source.space.depth.loop = leaf("shadow", { offsetX: px(0), offsetY: px(1), blur: px(2), color: "{space.depth.glow}" }, "authored(finding-glow)");
  const r = await cli(source);
  assert.equal(r.code, 2);
  assert.deepEqual(r.lines, ["design-kit: the source was refused:\n  alias cycle: space.depth.glow -> space.depth.loop -> space.depth.glow"]);
});

test("an array shadow renders two comma-separated layers and honours inset", async () => {
  const { outputs } = await compile(
    glowSource([
      { offsetX: px(0), offsetY: px(1), blur: px(2), color: "#000000" },
      { inset: true, offsetX: px(0), offsetY: px(0), blur: px(0), spread: px(1), color: "{color.glow.primary}" },
    ]),
  );
  assert.match(outputs["tokens.css"], /^ {2}--dk-space-depth-glow: 0px 1px 2px 0px #000000, inset 0px 0px 0px 1px var\(--dk-color-glow-primary\);$/m);
  const guide = JSON.parse(outputs["fixture.styleguide.uibridge.json"]);
  assert.equal(guide.tokens.shadows.glow, "0px 1px 2px 0px #000000, inset 0px 0px 0px 1px rgba(74, 144, 217, 0.2)");
});

test("an inset that is not a boolean is refused", async () => {
  await assert.rejects(compile(glowSource({ inset: "yes", offsetX: px(0), offsetY: px(0), blur: px(2), color: "#000000" })), /leaf space\.depth\.glow: cannot render .* \(inset must be true or false\)/);
});

test("the single-light-source band reads array shadows: a layer lit from below against one lit from above is listed", async () => {
  const lit = (offsetY) => ({ offsetX: px(0), offsetY: px(offsetY), blur: px(2), color: "#000000" });
  const { report } = await compile(glowSource([lit(1), lit(2)], { sm: leaf("shadow", lit(-2), "authored(finding-glow)") }));
  assert.deepEqual(report.out_of_band, [{ path: "space.depth", check: "single-light-source", value: 3, band: "one light source" }]);
  const same = await compile(glowSource([lit(1), lit(2)], { sm: leaf("shadow", lit(3), "authored(finding-glow)") }));
  assert.deepEqual(same.report.out_of_band, []);
});
