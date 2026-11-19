// Phase 3: the craft arithmetic, each with its band, asserted at both edges.
import test from "node:test";
import assert from "node:assert/strict";
import { craft, compileSource } from "../dist/index.js";
import { leaf, mkProject } from "./project.js";

test("line height band is 120% to 145%: 119% fails, 120% passes, 145% passes, 146% fails", () => {
  assert.equal(craft.lineHeightBand(1.19).ok, false);
  assert.equal(craft.lineHeightBand(1.2).ok, true);
  assert.equal(craft.lineHeightBand(120 / 100).ok, true);
  assert.equal(craft.lineHeightBand(1.45).ok, true);
  assert.equal(craft.lineHeightBand(1.46).ok, false);
});

test("measure band is 45 to 75 characters at both edges", () => {
  assert.equal(craft.measureBand(44).ok, false);
  assert.equal(craft.measureBand(45).ok, true);
  assert.equal(craft.measureBand(75).ok, true);
  assert.equal(craft.measureBand(76).ok, false);
});

test("interface motion band is 100 to 300 ms at both edges", () => {
  assert.equal(craft.motionDurationBand(99).ok, false);
  assert.equal(craft.motionDurationBand(100).ok, true);
  assert.equal(craft.motionDurationBand(300).ok, true);
  assert.equal(craft.motionDurationBand(301).ok, false);
});

test("the bands are the literal numbers the report names", () => {
  assert.deepEqual(craft.BANDS["line-height"], { min: 1.2, max: 1.45, unit: "ratio" });
  assert.deepEqual(craft.BANDS.measure, { min: 45, max: 75, unit: "characters" });
  assert.deepEqual(craft.BANDS["motion-duration"], { min: 100, max: 300, unit: "ms" });
});

test("contrast comes from an OKLCH lightness difference", () => {
  const bw = craft.lightnessDifference("#000000", "#ffffff");
  assert.ok(Math.abs(bw - 1) < 1e-3, `black on white is a difference of 1, got ${bw}`);
  assert.equal(craft.lightnessDifference("#ffffff", "#ffffff"), 0);
  // #767676 on white is the WCAG 4.5:1 boundary; #959595 is about 3:1.
  assert.equal(craft.contrastBand("#767676", "#ffffff").ok, true);
  assert.equal(craft.contrastBand("#959595", "#ffffff").ok, false);
  assert.equal(craft.contrastBand("oklch(50% 0 0)", "#ffffff"), null, "a non-hex colour is not measured");
  assert.equal(craft.lightnessDifference("#fff", "#000") > 0.99, true, "three-digit hex parses");
});

test("one shadow light source: offsets must not name opposite quadrants", () => {
  assert.equal(craft.singleLightSource([{ offsetX: 0, offsetY: 2 }, { offsetX: 1, offsetY: 4 }]), true);
  assert.equal(craft.singleLightSource([{ offsetX: 2, offsetY: 2 }, { offsetX: -2, offsetY: 2 }]), false);
  assert.equal(craft.singleLightSource([{ offsetX: 0, offsetY: 2 }, { offsetX: 0, offsetY: -2 }]), false);
  assert.equal(craft.singleLightSource([]), true);
});

test("derive helpers: a modular scale and a spacing multiple", () => {
  assert.equal(craft.modularScale(17, 1.25, 0), 17);
  assert.equal(craft.modularScale(16, 1.25, 1), 20);
  assert.equal(craft.modularScale(16, 1.25, -1), 12.8);
  assert.equal(craft.spacingMultiple(4, 6), 24);
});

test("the compile report lists values outside a band; it never errors on them", async () => {
  const num = (v) => leaf("number", v, "authored(f-1)");
  const ms = (v) => leaf("duration", { value: v, unit: "ms" }, "authored(f-1)");
  const p = mkProject({
    type: { leading: { body: num(1.19), ok: num(1.2) } },
    layout: { measure: { prose: num(80), ok: num(60) } },
    motion: { duration: { fast: ms(99), base: ms(200), step: ms(0), slow: ms(600) } },
    color: { x: { fg: leaf("color", "#959595", "declared"), bg: leaf("color", "#ffffff", "declared") } },
    space: { depth: { a: leaf("shadow", { offsetX: 2, offsetY: 2, blur: 4, color: "#000" }, "authored(f-1)"), b: leaf("shadow", { offsetX: -2, offsetY: 2, blur: 4, color: "#000" }, "authored(f-1)") } },
  });
  try {
    const src = JSON.parse(await import("node:fs").then((fs) => fs.readFileSync(p.sourcePath, "utf8")));
    src.$extensions = { qontinui: { craft: { contrastPairs: [["color.x.fg", "color.x.bg"]] } } };
    await import("node:fs").then((fs) => fs.writeFileSync(p.sourcePath, JSON.stringify(src)));
    const { report } = await compileSource({ sourcePath: p.sourcePath, rootDir: p.dir });
    assert.deepEqual(
      report.out_of_band.map((o) => [o.path, o.check]),
      [
        ["color.x.fg on color.x.bg", "contrast"],
        ["layout.measure.prose", "measure"],
        ["motion.duration.fast", "motion-duration"],
        ["motion.duration.slow", "motion-duration"],
        ["space.depth", "single-light-source"],
        ["type.leading.body", "line-height"],
      ],
    );
  } finally {
    p.cleanup();
  }
});
