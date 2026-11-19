// Phase 5: states as data, the kit slice, the specimen and the state check.
// Literals only; each check has a seeded violation that reddens it. The state
// check drives the PUBLISHED exec door and needs Chromium (see needDoor).
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ALL, COMPONENTS, defineComponent, kitCss, kitTokenContract, STATES } from "../dist/index.js";
import { cellsOf } from "../dist/specimen/cells.js";
import { checkStates } from "../dist/specimen/check-states.js";
import { validateGuide } from "../dist/validate/guide.js";
import { main } from "../dist/cli.js";
import { ROOT } from "./helpers.js";
import { compileJson, exampleJson, needDoor, tmpDir, writeSpecimen } from "./kit-helpers.js";

// ---------------------------------------------------------------- states as data

test("defineComponent stores states as data from the closed list and refuses anything else", () => {
  assert.deepEqual([...STATES], ["default", "hover", "focus-visible", "active", "disabled", "loading", "error", "selected"]);
  const ok = defineComponent({ name: "Chip", props: { variant: ["a", "b"] }, states: ["default", "hover"] });
  assert.deepEqual([...ok.states], ["default", "hover"]);
  assert.deepEqual(ok.props, { variant: ["a", "b"] });
  assert.throws(() => defineComponent({ name: "Chip", props: {}, states: ["default", "pressed"] }), /state "pressed" is not in the closed list default \| hover/);
  assert.throws(() => defineComponent({ name: "Chip", props: {}, states: ["hover"] }), /states must include "default"/);
  assert.throws(() => defineComponent({ name: "Chip", props: {}, states: ["default", "default"] }), /state default is listed twice/);
  assert.throws(() => defineComponent({ name: "Chip", props: {}, states: [] }), /states is empty/);
  assert.throws(() => defineComponent({ name: "chip", props: {}, states: ["default"] }), /must be PascalCase/);
  assert.throws(() => defineComponent({ name: "Chip", props: { variant: [] }, states: ["default"] }), /variant axis variant has no values/);
});

test("the slice is eight components and one pattern, with the states of the plan", () => {
  assert.equal(COMPONENTS.length, 8);
  assert.deepEqual(COMPONENTS.map((e) => e.def.name), ["Button", "TextInput", "Select", "Checkbox", "Switch", "Tabs", "Dialog", "DataTable"]);
  assert.deepEqual(ALL.map((e) => e.def.name).slice(8), ["RecordListPage"]);
  assert.deepEqual([...COMPONENTS[0].def.states], ["default", "hover", "focus-visible", "active", "disabled", "loading"]);
  assert.deepEqual(COMPONENTS[0].def.props, { variant: ["primary", "secondary", "quiet"] });
  // Every interactive control renders disabled visibly different from enabled: its disabled state is in its data.
  for (const name of ["Button", "TextInput", "Select", "Checkbox", "Switch", "Tabs", "Dialog"]) {
    assert.ok(COMPONENTS.find((e) => e.def.name === name).def.states.includes("disabled"), `${name} lists disabled`);
  }
});

// ---------------------------------------------------------------- no skin

const NAMED = /\b(?:red|green|blue|white|black|gray|grey|orange|yellow|purple|pink|silver|navy|teal|maroon)\b/i;
const LITERAL = /#[0-9a-f]{3,8}\b|\b\d*\.?\d+(?:px|rem|em|vh|vw|ms|s)\b|\b(?:rgb|hsl|hsla|rgba|oklch|oklab|lab|lch)\(/i;

/** Declarations of a stylesheet that carry a literal colour or length (the state list property is data, not skin). */
function skinLiterals(css) {
  const out = [];
  for (const m of css.matchAll(/([a-z-]+):\s*([^;]+);/g)) {
    if (m[1] === "--dk-kit-states") continue;
    if (LITERAL.test(m[2]) || NAMED.test(m[2])) out.push(`${m[1]}: ${m[2]}`);
  }
  return out;
}

test("the kit ships no skin: no declaration carries a literal colour or length", () => {
  const css = kitCss();
  assert.ok(css.includes("var(--dk-color-role-accent)"));
  assert.deepEqual(skinLiterals(css), []);
  // Seeded violation: the same check reddens a stylesheet with literals.
  assert.deepEqual(skinLiterals("a { color: #fff; padding: 12px; background-color: red; border: 1px solid rgb(0, 0, 0); }"), [
    "color: #fff",
    "padding: 12px",
    "background-color: red",
    "border: 1px solid rgb(0, 0, 0)",
  ]);
});

test("every token the kit reads is provided by the example source; a source missing a group is named", async () => {
  const provided = async (json) => {
    const c = await compileJson(json, "contract");
    try {
      return kitTokenContract().filter((n) => !c.outputs["tokens.css"].includes(`${n}:`));
    } finally {
      c.cleanup();
    }
  };
  assert.deepEqual(await provided(exampleJson()), []);
  const noSpace = exampleJson();
  delete noSpace.space;
  const missing = await provided(noSpace);
  assert.ok(missing.includes("--dk-space-scale-2") && missing.includes("--dk-space-radius-md"));
});

// ---------------------------------------------------------------- required state props

test("omitting empty, loading, error or filteredEmpty on RecordListPage is a compile error", () => {
  const tsc = path.join(ROOT, "node_modules", "typescript", "bin", "tsc");
  const flags = ["--noEmit", "--strict", "--skipLibCheck", "--jsx", "react-jsx", "--module", "nodenext", "--moduleResolution", "nodenext", "--target", "es2022"];
  const fixture = path.join(ROOT, "test", "fixtures", "types", "record-list-page.tsx");
  // The fixture, with its four @ts-expect-error lines, compiles clean.
  execFileSync(process.execPath, [tsc, ...flags, fixture], { cwd: ROOT, stdio: "pipe" });

  // Seeded violation: the same file without the directives must fail, naming each missing prop.
  const neg = path.join(ROOT, "test", "fixtures", "types", "negative.tmp.tsx");
  fs.writeFileSync(neg, fs.readFileSync(fixture, "utf8").replace(/^\s*\/\/ @ts-expect-error.*\n/gm, ""));
  try {
    let out = "";
    assert.throws(() => execFileSync(process.execPath, [tsc, ...flags, neg], { cwd: ROOT, stdio: "pipe" }), (e) => {
      out = String(e.stdout);
      return true;
    });
    for (const prop of ["empty", "loading", "error", "filteredEmpty"]) {
      assert.match(out, new RegExp(`TS2741: Property '${prop}' is missing`), `${prop} is required`);
    }
    assert.equal((out.match(/error TS/g) ?? []).length, 4);
  } finally {
    fs.rmSync(neg, { force: true });
  }
});

// ---------------------------------------------------------------- the specimen

test("the specimen renders components x variants x states cells equal to the data: 56 cells for 8 components", async () => {
  assert.equal(cellsOf().length, 56);
  const byComponent = {};
  for (const c of cellsOf()) byComponent[c.component] = (byComponent[c.component] ?? 0) + 1;
  assert.deepEqual(byComponent, { Button: 18, TextInput: 5, Select: 6, Checkbox: 6, Switch: 6, Tabs: 6, Dialog: 5, DataTable: 4 });

  const sp = await writeSpecimen({ name: "specimen-count" });
  try {
    assert.equal((sp.html.match(/ data-component="/g) ?? []).length, 56);
    assert.equal((sp.html.match(/data-variant="primary" data-state="hover"/g) ?? []).length, 1);
    assert.match(sp.html, /<html lang="en" data-design-identity="undeclared">/);
    assert.match(sp.html, /id="identity-banner"/);
    assert.match(sp.html, /id="board"/);
    assert.equal((sp.html.match(/data-pattern-state="/g) ?? []).length, 5);
    const embedded = JSON.parse(/<script type="application\/json" id="dk-specimen-cells">([\s\S]*?)<\/script>/.exec(sp.html)[1]);
    assert.deepEqual(embedded, cellsOf());
    // Every colour in the board reads a token; the page has no literal colour of its own.
    assert.doesNotMatch(sp.html.replace(/<script[\s\S]*?<\/script>/g, ""), /style="[^"]*#[0-9a-f]{3,6}/i);
  } finally {
    sp.cleanup();
  }
});

test("design-kit specimen writes the file and --check exits 1 after one byte changes", async () => {
  const c = await compileJson(exampleJson(), "specimen-cli");
  try {
    const run = async (...a) => {
      const lines = [];
      const code = await main([...a, "--root", c.dir], (s) => lines.push(s));
      return { code, lines };
    };
    assert.deepEqual(await run("specimen"), { code: 0, lines: ["design-kit: wrote specimen.html"] });
    assert.deepEqual(await run("specimen", "--check"), { code: 0, lines: ["design-kit: specimen matches a fresh render"] });
    const f = path.join(c.dir, "specimen.html");
    fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("Save changes", "Save change"));
    assert.equal((await run("specimen", "--check")).code, 1);
  } finally {
    c.cleanup();
  }
});

// ---------------------------------------------------------------- the state check (published exec door)

let shippedRun;
const shipped = () => {
  shippedRun ??= (async () => {
    const sp = await writeSpecimen({ name: "shipped" });
    try {
      return await checkStates(sp.file, ROOT);
    } finally {
      sp.cleanup();
    }
  })();
  return shippedRun;
};

const cellOf = (cov, id) => cov.cells.find((c) => c.id === id);

test("check-states: every shipped state cell has a token-derived delta; focus-visible is unknown(focus-visible-not-emulated)", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const cov = await shipped();
  assert.equal(cov.instrument, "@qontinui/ui-bridge-wrapper@0.12.0");
  assert.deepEqual(cov.summary, { cells: 56, measured: 36, baseline: 10, unknown: 10, findings: 0 });
  assert.deepEqual(cov.findings, []);

  const hover = cellOf(cov, "cell-button-primary-hover");
  assert.deepEqual(
    { status: hover.status, n: hover.changedProperties, props: hover.properties, token: hover.tokenDerived, complete: hover.complete },
    { status: "measured", n: 1, props: ["backgroundColor"], token: true, complete: true },
  );
  // A disabled control looks different from an enabled one, through tokens only.
  const disabled = cellOf(cov, "cell-button-primary-disabled");
  assert.deepEqual(disabled.properties, ["color", "backgroundColor", "border"]);
  assert.equal(disabled.complete, true);
  const selected = cellOf(cov, "cell-data-table-default-selected");
  assert.equal(selected.status, "measured");
  assert.equal(selected.complete, true);

  const unknown = cov.cells.filter((c) => c.status === "unknown");
  assert.equal(unknown.length, 10);
  for (const c of unknown) {
    assert.equal(c.state, "focus-visible");
    assert.equal(c.unknown, "unknown(focus-visible-not-emulated)");
    assert.equal(c.complete, null);
    assert.equal(c.changedProperties, null);
  }
  for (const c of cov.cells.filter((x) => x.status === "measured")) assert.equal(c.complete, true, c.id);
});

test("check-states: a Button whose hover rule is removed is a cell with no delta, and the shipped Button is not", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const stateless = COMPONENTS.map((e) =>
    e.def.name === "Button" ? { ...e, styles: { ...e.styles, rules: e.styles.rules.filter((r) => !/\.dk-button\[data-variant="\w+"\]:not\(:disabled\):not\(\[data-dk-state\]\):hover/.test(r.selector)) } } : e,
  );
  const sp = await writeSpecimen({ kitCss: kitCss(stateless), name: "stateless" });
  try {
    const cov = await checkStates(sp.file, ROOT);
    assert.deepEqual(
      cov.findings.map((f) => [f.id, f.finding]),
      [
        ["cell-button-primary-hover", "no-delta"],
        ["cell-button-secondary-hover", "no-delta"],
        ["cell-button-quiet-hover", "no-delta"],
      ],
    );
    assert.deepEqual(cellOf(cov, "cell-button-primary-hover").changedProperties, 0);
    assert.equal(cellOf(cov, "cell-button-primary-hover").complete, false);
    // The unrelated active state of the same button is still complete.
    assert.equal(cellOf(cov, "cell-button-primary-active").complete, true);
  } finally {
    sp.cleanup();
  }
  // The shipped Button has none.
  assert.deepEqual((await shipped()).findings.filter((f) => f.id.startsWith("cell-button-")), []);
});

test("check-states: a hover that sets a literal colour is a non-token delta", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const literal = COMPONENTS.map((e) =>
    e.def.name === "Button"
      ? { ...e, styles: { ...e.styles, rules: e.styles.rules.map((r) => (r.selector === '.dk-button[data-variant="primary"]:not(:disabled):not([data-dk-state]):hover' ? { ...r, decls: { "background-color": "#ff0000" } } : r)) } }
      : e,
  );
  const sp = await writeSpecimen({ kitCss: kitCss(literal), name: "literal" });
  try {
    const cov = await checkStates(sp.file, ROOT);
    assert.deepEqual(cov.findings, [
      {
        id: "cell-button-primary-hover",
        finding: "non-token-delta",
        detail: "Button primary hover: backgroundColor is not a var(--dk-*) read",
      },
    ]);
    assert.equal(cellOf(cov, "cell-button-primary-hover").tokenDerived, false);
  } finally {
    sp.cleanup();
  }
});

test("design-kit check-states writes state-coverage.json and exits 0 when every cell is complete", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const sp = await writeSpecimen({ name: "cli-check" });
  try {
    const lines = [];
    const code = await main(["check-states", sp.file, "--root", ROOT, "--file", path.relative(ROOT, path.join(sp.dir, "state-coverage.json"))], (s) => lines.push(s));
    assert.equal(code, 0);
    assert.match(lines.at(-1), /^design-kit check-states: 56 cells, 36 measured, 10 baseline, 10 unknown, 0 findings \(@qontinui\/ui-bridge-wrapper@0\.12\.0\)$/);
    const written = JSON.parse(fs.readFileSync(path.join(sp.dir, "state-coverage.json"), "utf8"));
    assert.equal(written.schema, 1);
    assert.equal(written.cells.length, 56);
  } finally {
    sp.cleanup();
  }
});

// ---------------------------------------------------------------- validate-guide on a page

test("validate-guide: the specimen conforms to its own generated guide; a hand-rolled button reddens four rules", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const sp = await writeSpecimen({ name: "vguide" });
  try {
    const guideFile = path.join(sp.dir, "guide.json");
    fs.writeFileSync(guideFile, sp.outputs["design-kit-specimen.styleguide.uibridge.json"]);
    const clean = await validateGuide(guideFile, sp.file, ROOT);
    assert.deepEqual(clean.failures, []);
    assert.equal(clean.rules, 14);
    assert.ok(clean.elements > 200);

    // Seeded violation: a button the kit did not render, on the same tokens.
    const hand = path.join(sp.dir, "hand.html");
    fs.writeFileSync(
      hand,
      `<!doctype html><html><head><style>${sp.outputs["tokens.css"]}</style></head><body><button id="hand" type="button" style="background-color:#ff0000;border-radius:7px">Go</button></body></html>`,
    );
    const bad = await validateGuide(guideFile, hand, ROOT);
    assert.deepEqual(bad.failures.map((f) => [f.elementId, f.ruleId]).sort(), [
      ["dom-hand", "border-radius-on-scale"],
      ["dom-hand", "button-state-declaration"],
      ["dom-hand", "font-size-on-scale"],
      ["dom-hand", "palette-background-color"],
    ]);

    const lines = [];
    const code = await main(["validate-guide", guideFile, hand, "--root", ROOT], (s) => lines.push(s));
    assert.equal(code, 1);
    assert.match(lines.at(-1), /^design-kit validate-guide: 1 elements, 14 rules, 4 failures \(@qontinui\/ui-bridge-wrapper@0\.12\.0\)$/);
  } finally {
    sp.cleanup();
  }
});

void tmpDir;
