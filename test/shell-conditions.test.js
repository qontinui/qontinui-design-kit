// Plan 2026-11-26-the-app-shell-is-never-derived-from-what-every-role-does-on-
// every-page, Phase 1: the kit compiles a project's own width and height
// conditions into conditions.css, and the shell's conditions (Appendix A rules
// 2-4) hold in Chromium.
//
// The browser is only launched and sized (`ui-bridge-inject --viewport`).
// Every scroll, focus and reading goes through the UI Bridge exec door:
// `executeElementAction` (scrollIntoView, focus, click), `pageScroll` and
// `getElement`. Nothing reads the DOM around the Bridge.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { buildGuide, COMPONENTS, compileSource, computedLength, OUTPUT_FILES, SourceError } from "../dist/index.js";
import { renderRules } from "../dist/kit/style.js";
import { ROOT, compileTailwind } from "./helpers.js";
import { EXAMPLE_SOURCE, exampleJson, compileJson, needDoor, tmpDir } from "./kit-helpers.js";
import { runInject, serveDir } from "./inject.js";
import { atEndOf, inView, navReachAtDepth, pinnedHeight } from "./reach.js";
import { shellEntry } from "./fixtures/shell/styles.js";

const FIXTURE = path.join(ROOT, "test", "fixtures", "shell");
const UI_BRIDGE_VERSION = JSON.parse(
  fs.readFileSync(createRequire(import.meta.url).resolve("@qontinui/ui-bridge/package.json"), "utf8"),
).version;

// ---------------------------------------------------------------- D3: reach at depth, on the plan's vectors

test("reach at depth: the helper passes the plan's vectors V1-V7", () => {
  const r = (m) => navReachAtDepth(m);
  // V1: 360 x 740, documentHeight 3700, no pins, static, first row top 136.75.
  assert.deepEqual(r({ H: 740, documentHeight: 3700, nav: { position: "static", top: 136.75 } }), { reach: 5, steps: 5, basis: "computed" });
  // V2: 1280 x 800, 2400, a static sidebar, first row top 120.
  assert.deepEqual(r({ H: 800, documentHeight: 2400, nav: { position: "static", top: 120 } }), { reach: 3, steps: 3, basis: "computed" });
  // V3: a 56 px sticky bar holding the menu control, read at the end: in view.
  assert.deepEqual(r({ H: 740, documentHeight: 3700, nav: { position: "sticky", top: 0, behindMenu: true, atEnd: { inView: true } } }), {
    reach: 0,
    steps: 1,
    basis: "read-at-end",
  });
  // V4: 360 x 740, documentHeight 700: scrollYmax is 0.
  assert.deepEqual(r({ H: 740, documentHeight: 700, nav: { position: "static", top: 136.75 } }), { reach: 0, steps: 0, basis: "computed" });
  // V5: no navigation item registered.
  assert.equal(r({ H: 740, documentHeight: 3700, nav: null }).unknown, "input_missing");
  // V6: a sticky sidebar captured at scroll 0 only is unknown; read at the end and in view it is 0.
  assert.equal(r({ H: 800, documentHeight: 2400, nav: { position: "sticky", top: 120 } }).unknown, "input_missing");
  assert.deepEqual(r({ H: 800, documentHeight: 2400, nav: { position: "sticky", top: 120, atEnd: { inView: true } } }), {
    reach: 0,
    steps: 0,
    basis: "read-at-end",
  });
  // V7: a 56 px fixed top bar holding the menu control, any capture.
  assert.deepEqual(r({ H: 740, documentHeight: 3700, nav: { position: "fixed", top: 0, boxInViewport: true, behindMenu: true } }), {
    reach: 0,
    steps: 1,
    basis: "computed",
  });
  // Without the fixed arm the formula would read 6 for a bar that never leaves the view; an unknown is never a number.
  assert.equal(r({ H: 740, documentHeight: 3700, nav: { position: "fixed", top: 0, boxInViewport: false } }).reach, undefined);
});

test("reach at depth: a reading at the end that is out of view is a verdict, and no usable height is unknown", () => {
  const r = (m) => navReachAtDepth(m);
  // Above the viewport at the end (off-screen, top -3241), at 1280 x 800: ceil(3241 / 640) = 6, whatever its position.
  for (const position of ["sticky", "static", "fixed"]) {
    assert.deepEqual(r({ H: 800, documentHeight: 4089, nav: { position, top: 48, atEnd: { inView: false, top: -3241, reason: "off-screen" } } }), {
      reach: 6,
      steps: 6,
      basis: "read-at-end",
    });
  }
  // The same, behind a closed menu, with a 56 px top pin: ceil((56 + 3397) / (0.8 x 684)) = 7, plus the menu.
  assert.deepEqual(r({ H: 740, documentHeight: 4137, pinTop: 56, nav: { position: "sticky", top: 0, behindMenu: true, atEnd: { inView: false, top: -3397, reason: "off-screen" } } }), {
    reach: 7,
    steps: 8,
    basis: "read-at-end",
  });
  // The static arithmetic agrees with the end reading for the same page (V2's shape read at its end).
  assert.equal(r({ H: 800, documentHeight: 2400, nav: { position: "static", top: 120, atEnd: { inView: false, top: -1480, reason: "off-screen" } } }).reach, 3);
  // Out of view for a reason scrolling up does not settle: unknown, never 0.
  assert.equal(r({ H: 800, documentHeight: 2400, nav: { position: "sticky", top: 0, atEnd: { inView: false, top: 0, reason: "no-layout" } } }).unknown, "input_missing");
  assert.equal(r({ H: 800, documentHeight: 2400, nav: { position: "static", top: 0, atEnd: { inView: false, top: 0, reason: "occluded" } } }).unknown, "input_missing");
  // No usable height: pins take the whole viewport, so a gesture moves nothing.
  assert.equal(r({ H: 800, documentHeight: 2400, pinTop: 400, pinBottom: 400, nav: { position: "static", top: 120 } }).unknown, "input_missing");
  assert.equal(r({ H: 800, documentHeight: 2400, pinTop: 500, pinBottom: 400, nav: { position: "static", top: 120 } }).unknown, "input_missing");
});

test("pinned height: only a pinned part at least W/2 wide counts; an unpinned control counts nothing", () => {
  const el = (top, left, right, height = 48, reason) => ({ state: { inViewport: true, ...(reason ? { visibilityReason: reason } : {}), rect: { top, bottom: top + height, left, right } } });
  // A full-width bar pinned at the top of a 360 px viewport.
  assert.equal(pinnedHeight([{ start: el(0, 0, 360), end: el(0, 0, 360) }], 360).height, 48);
  // Two touching 240 px sidebar rows at 1280: one part, 240 wide, under W/2.
  const side = pinnedHeight([{ start: el(48, 0, 240), end: el(48, 0, 240) }, { start: el(96, 0, 240), end: el(96, 0, 240) }], 1280);
  assert.deepEqual(side, { height: 0, parts: [{ width: 240, height: 96, counted: false }] });
  // A control that moved with the page is not pinned.
  assert.equal(pinnedHeight([{ start: el(0, 0, 360), end: el(-3000, 0, 360) }], 360).height, 0);
});

// ---------------------------------------------------------------- the compiled conditions

test("conditions.css is a fixed output; the kit's static stylesheet never carries a `when` rule", async () => {
  assert.ok(OUTPUT_FILES.includes("conditions.css"));
  const base = renderRules(shellEntry.styles.rules);
  assert.ok(base.includes(".fx-shell-nav {\n  display: none;\n}"));
  assert.ok(!base.includes("grid-template-columns"), "a wide rule does not render unconditionally");
  assert.ok(!base.includes("position: static"), "a short rule does not render unconditionally");
});

test("conditions.css carries the example source's own breakpoint and height condition", async () => {
  const c = await compileSource({ sourcePath: EXAMPLE_SOURCE, rootDir: ROOT, kit: [shellEntry] });
  const css = c.outputs["conditions.css"];
  const src = exampleJson();
  const md = src.layout.breakpoint.md.$value;
  const bar = src.layout.shell.bar.$value;
  const share = src.budgets.shell.max_pinned_share.$value;
  const preludes = [...css.matchAll(/^(@media [^{]+)\{/gm)].map((m) => m[1].trim());
  assert.deepEqual(preludes, [`@media (width >= ${md.value}${md.unit})`, `@media (height < ${computedLength(bar.value / share)}${bar.unit})`]);
  assert.deepEqual(preludes, ["@media (width >= 768px)", "@media (height < 480px)"]);
  assert.equal(c.report.conditions.wide.state, "declared");
  assert.equal(c.report.conditions.short.rules, 3);
  // wide is written before short, so where both hold a short rule wins at equal specificity.
  assert.ok(css.indexOf("/* wide */") < css.indexOf("/* short */"));
  // The default kit names no condition yet (the AppShell is Phase 3): the file is its header only.
  const plain = await compileSource({ sourcePath: EXAMPLE_SOURCE, rootDir: ROOT });
  assert.doesNotMatch(plain.outputs["conditions.css"], /@media/);
  assert.equal(plain.report.conditions.wide.rules, 0);
});

test("a source missing a leaf a condition needs emits no rule for it and lists the leaf undeclared; no default is filled in", async () => {
  const json = exampleJson();
  delete json.layout.shell.bar;
  const c = await compileJson(json, "cond-missing");
  try {
    // compileJson compiles with the default kit; recompile the same file with the fixture's rules.
    const r = await compileSource({ sourcePath: c.sourcePath, rootDir: c.dir, kit: [shellEntry] });
    const css = r.outputs["conditions.css"];
    assert.match(css, /@media \(width >= 768px\)/);
    assert.doesNotMatch(css, /height </, "no short rule without layout.shell.bar");
    assert.match(css, /short: undeclared \(layout\.shell\.bar\); no rule emitted/);
    assert.equal(r.report.conditions.short.state, "undeclared");
    assert.equal(r.report.conditions.short.media, null);
    const u = r.report.undeclared.find((e) => e.path === "layout.shell.bar");
    assert.ok(u, "compile-report lists layout.shell.bar");
    assert.match(u.reason, /`short` condition/);
    // Listed whether or not a kit rule names the condition yet: the default kit (no `when` rule) reports it too.
    assert.equal(c.report.conditions.short.rules, 0);
    assert.ok(c.report.undeclared.some((e) => e.path === "layout.shell.bar"), "the default-kit compile lists layout.shell.bar");
  } finally {
    c.cleanup();
  }
  const noBp = exampleJson();
  delete noBp.layout.breakpoint;
  const d = await compileJson(noBp, "cond-no-bp");
  try {
    const r = await compileSource({ sourcePath: d.sourcePath, rootDir: d.dir, kit: [shellEntry] });
    assert.doesNotMatch(r.outputs["conditions.css"], /width >=/);
    assert.ok(r.report.undeclared.some((e) => e.path === "layout.breakpoint.md"));
  } finally {
    d.cleanup();
  }
});

test("a bad condition value is a condition state, never a failed compile, with the default kit or with rules", async () => {
  const bad = [
    ["a share above 1", (j) => (j.budgets.shell.max_pinned_share.$value = 2), /max_pinned_share is 2/],
    ["a share of 0", (j) => (j.budgets.shell.max_pinned_share.$value = 0), /max_pinned_share is 0/],
    ["a share that is an alias", (j) => (j.budgets.shell.max_pinned_share.$value = "{budgets.density.max_interactive_per_viewport}"), /max_pinned_share is "\{budgets/],
    ["a null share", (j) => (j.budgets.shell.max_pinned_share.$value = null), /max_pinned_share is null/],
    ["a bar that is not a length", (j) => (j.layout.shell.bar.$value = "auto"), /layout\.shell\.bar is "auto"/],
    // A unit a media feature does not take: the browser would drop the whole query.
    ["a bar in %", (j) => (j.layout.shell.bar.$value = { value: 48, unit: "%" }), /layout\.shell\.bar is \{"value":48,"unit":"%"\}; a condition needs a px, rem or em length/],
    ["a bar with no unit", (j) => (j.layout.shell.bar.$value = { value: 48, unit: "" }), /layout\.shell\.bar is \{"value":48,"unit":""\}/],
    ["a bar of 48foo", (j) => (j.layout.shell.bar.$value = "48foo"), /layout\.shell\.bar is "48foo"; a condition needs a px, rem or em length/],
    [
      "a quotient that is not a finite length",
      (j) => {
        j.layout.shell.bar.$value = { value: 1e308, unit: "px" };
        j.budgets.shell.max_pinned_share.$value = 0.001;
      },
      /is Infinitypx; the height condition is a positive finite length/,
    ],
  ];
  for (const [what, mutate, reason] of bad) {
    const json = exampleJson();
    mutate(json);
    // compileJson compiles with the default kit: before this, it threw a SourceError.
    const c = await compileJson(json, "cond-invalid");
    try {
      assert.equal(c.report.conditions.short.state, "invalid", what);
      assert.match(c.report.conditions.short.reason, reason, what);
      assert.equal(c.report.conditions.short.media, null, what);
      assert.equal(c.report.conditions.wide.state, "declared", `${what}: the other condition is untouched`);
      const r = await compileSource({ sourcePath: c.sourcePath, rootDir: c.dir, kit: [shellEntry] });
      const css = r.outputs["conditions.css"];
      assert.doesNotMatch(css, /height </, `${what}: no short rule`);
      assert.match(css, /\/\* short: invalid \(/, what);
      assert.match(css, /@media \(width >= 768px\)/, `${what}: the wide rules still compile`);
    } finally {
      c.cleanup();
    }
  }
});

test("a breakpoint at or below zero makes `wide` invalid (`width >= 0` would hold at every width); the rest compiles", async () => {
  for (const [what, bp, text] of [
    ["a negative breakpoint", { value: -5, unit: "px" }, "-5px"],
    ["a zero breakpoint", { value: 0, unit: "rem" }, "0rem"],
  ]) {
    const json = exampleJson();
    json.layout.breakpoint.md.$value = bp;
    const c = await compileJson(json, "cond-bp-nonpositive");
    try {
      assert.equal(c.report.conditions.wide.state, "invalid", what);
      assert.equal(c.report.conditions.wide.reason, `layout.breakpoint.md is ${text}; a breakpoint is a positive width`, what);
      assert.equal(c.report.conditions.short.state, "declared", `${what}: the other condition is untouched`);
      const r = await compileSource({ sourcePath: c.sourcePath, rootDir: c.dir, kit: [shellEntry] });
      const css = r.outputs["conditions.css"];
      assert.doesNotMatch(css, /width >=/, `${what}: no wide rule`);
      assert.match(css, /\/\* wide: invalid \(/, what);
    } finally {
      c.cleanup();
    }
  }
});

test("a breakpoint in a unit a media feature does not take is refused by the guide with a SourceError, before any condition", async (t) => {
  const json = exampleJson();
  json.layout.breakpoint.md.$value = { value: 48, unit: "%" };
  const dir = tmpDir("cond-bp-unit");
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "design"));
  const sourcePath = path.join(dir, "design", "language.dtcg.json");
  fs.writeFileSync(sourcePath, JSON.stringify(json));
  await assert.rejects(compileSource({ sourcePath, rootDir: dir, kit: [shellEntry] }), (e) => {
    assert.ok(e instanceof SourceError, `a SourceError, not ${e?.constructor?.name}`);
    assert.match(e.message, /layout\.breakpoint\.md is 48%; a guide breakpoint is a px, rem or em length/);
    return true;
  });
});

test("a condition's lengths are emitted unrounded: the breakpoint as stated, the quotient at 12 significant digits", async () => {
  const cases = [
    // toFixed(4) made this `height < 0px`, a condition that never holds.
    ["a bar of 1e-7px", (j) => (j.layout.shell.bar.$value = { value: 1e-7, unit: "px" }), "short", "@media (height < 0.000001px)"],
    [
      "47 / 0.3",
      (j) => {
        j.layout.shell.bar.$value = { value: 47, unit: "px" };
        j.budgets.shell.max_pinned_share.$value = 0.3;
      },
      "short",
      `@media (height < ${computedLength(47 / 0.3)}px)`,
    ],
    ["a breakpoint with six decimals", (j) => (j.layout.breakpoint.md.$value = { value: 48.123456, unit: "rem" }), "wide", "@media (width >= 48.123456rem)"],
  ];
  for (const [what, mutate, cond, media] of cases) {
    const json = exampleJson();
    mutate(json);
    const c = await compileJson(json, "cond-precise");
    try {
      assert.equal(c.report.conditions[cond].state, "declared", what);
      assert.equal(c.report.conditions[cond].media, media, what);
      const r = await compileSource({ sourcePath: c.sourcePath, rootDir: c.dir, kit: [shellEntry] });
      assert.ok(r.outputs["conditions.css"].includes(`${media} {`), `${what}: conditions.css carries ${media}`);
    } finally {
      c.cleanup();
    }
  }
  // The formatter the expectation above shares with the emitter, read as literals.
  assert.equal(computedLength(47 / 0.3), "156.666666667");
  assert.equal(computedLength(48 / 0.1), "480");
});

test("the guide takes a component's root class from its first unconditional rule, never a `when` rule", async () => {
  const c = await compileSource({ sourcePath: EXAMPLE_SOURCE, rootDir: ROOT });
  const button = COMPONENTS[0];
  const root = button.styles.rules.find((x) => x.when === undefined).selector;
  const conditionalFirst = { def: button.def, styles: { ...button.styles, rules: [{ when: "wide", selector: ".dk-conditional-first", decls: {} }, ...button.styles.rules] } };
  const g = buildGuide("guide-root", c.entries, [conditionalFirst]);
  const selectors = JSON.stringify(g.rules);
  assert.ok(!selectors.includes(".dk-conditional-first"), "a when rule's selector is not the root class");
  assert.ok(selectors.includes(JSON.stringify(root)), `the root class ${root} is used`);
});

// ---------------------------------------------------------------- the page, driven through the Bridge

let pagePromise;
// The fixture's temp dir outlives each case (the page is compiled once); remove it after the last.
after(async () => {
  if (pagePromise) fs.rmSync((await pagePromise).dir, { recursive: true, force: true });
});
/** The fixture page: tokens, the unconditional rules, then conditions.css, served from a temp dir. */
function shellPage() {
  pagePromise ??= (async () => {
    const c = await compileSource({ sourcePath: EXAMPLE_SOURCE, rootDir: ROOT, kit: [shellEntry] });
    const dir = tmpDir("shell");
    fs.writeFileSync(path.join(dir, "tokens.css"), c.outputs["tokens.css"]);
    fs.writeFileSync(path.join(dir, "base.css"), renderRules(shellEntry.styles.rules) + "\n");
    fs.writeFileSync(path.join(dir, "conditions.css"), c.outputs["conditions.css"]);
    fs.copyFileSync(path.join(FIXTURE, "index.html"), path.join(dir, "index.html"));
    const share = c.leaves.find((l) => l.path === "budgets.shell.max_pinned_share").value;
    return { dir, share };
  })();
  return pagePromise;
}

/** Run named steps at a viewport; returns { [name]: result }. Any step error fails the test. */
async function drive(dir, viewport, steps) {
  const server = await serveDir(dir);
  try {
    const run = await runInject(`${server.url}/index.html`, steps.map(({ action, payload }) => ({ action, payload })), { viewport });
    assert.ok(run.lines.length === steps.length, `door returned ${run.lines.length} of ${steps.length} lines (exit ${run.code}): ${run.stderr.slice(0, 400)}`);
    const out = {};
    steps.forEach((s, i) => {
      const line = run.lines[i];
      assert.ok(!line.error, `${viewport} step ${s.name} (${s.action}): ${JSON.stringify(line.error)}`);
      out[s.name] = line.result;
    });
    // Every run that scrolls to the end shows that it got there: the end-of-page element is in view.
    if (out.endEl) assert.ok(inView(out.endEl), `${viewport}: the end of the page is in view after the scroll: ${JSON.stringify(reading(out.endEl))}`);
    return out;
  } finally {
    await server.close();
  }
}

const get = (name, id) => ({ name, action: "getElement", payload: { id } });
const act = (name, id, action) => ({ name, action: "executeElementAction", payload: { id, request: { action } } });
const scrollBy = (name, top) => ({ name, action: "pageScroll", payload: { top } });
const DISCOVER = { name: "discover", action: "discover", payload: {} };
// To the end of the page with the Bridge's page scroll (it clamps at the end), then read the end-of-page
// element. Not scrollIntoView: on @qontinui/ui-bridge 0.54.0 it was observed to answer before the page had
// finished moving, so a reading taken next landed mid-scroll (observed during development in this worktree's
// 0.54.0 floor-leg run, 2026-11-26).
const TO_END = [
  { name: "end", action: "pageScroll", payload: { top: 100000 } },
  { name: "endEl", action: "getElement", payload: { id: "dom-page-end" } },
];
const MENU = "dom-shell-menu";
const FIRST = "dom-nav-1";
const LAST = "dom-nav-8";
const ENTRIES = Array.from({ length: 8 }, (_, i) => `dom-nav-${i + 1}`);
const CONTROL = "dom-body-control";

const box = (r) => r.state.rect;
const reading = (r) => ({ inViewport: r.state.inViewport, visibilityReason: r.state.visibilityReason ?? null, top: box(r).top, bottom: box(r).bottom, right: box(r).right });

function record(name, viewport, values) {
  const line = { case: name, viewport, ui_bridge: UI_BRIDGE_VERSION, ...values };
  console.log(`shell-conditions: ${JSON.stringify(line)}`);
}

test("1280 x 800, sidebar: scrolled to the end an entry is in view; nav_steps_at_depth is 0; no pinned height on the first screen", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const { dir } = await shellPage();
  const W = 1280;
  const H = 800;
  const r = await drive(dir, `${W}x${H}`, [
    DISCOVER,
    get("first", FIRST),
    get("menu0", MENU),
    ...ENTRIES.map((id) => get(`start:${id}`, id)),
    ...TO_END,
    scrollBy("at", 0),
    get("firstEnd", FIRST),
    get("menuEnd", MENU),
    ...ENTRIES.map((id) => get(`end:${id}`, id)),
  ]);
  const scrollY = r.at.after.scrollY;
  assert.ok(scrollY > 3000, `the page scrolled to its end (scrollY ${scrollY})`);
  assert.ok(inView(r.firstEnd), `entry at the end: ${JSON.stringify(reading(r.firstEnd))}`);
  const reach = navReachAtDepth({
    H,
    documentHeight: scrollY + H,
    nav: { position: r.firstEnd.state.computedStyles.position, top: box(r.first).top, behindMenu: !inView(r.first), atEnd: atEndOf(r.firstEnd) },
  });
  assert.deepEqual(reach, { reach: 0, steps: 0, basis: "read-at-end" });
  assert.ok(!inView(r.menu0) && !inView(r.menuEnd), "no menu control at this width");
  // Measured: the pinned parts the controls show, and the height of those at least W/2 wide (the density rule).
  const pinned = pinnedHeight([MENU, ...ENTRIES].map((id) => ({ start: id === MENU ? r.menu0 : r[`start:${id}`], end: id === MENU ? r.menuEnd : r[`end:${id}`] })), W);
  assert.ok(pinned.parts.length > 0, `the sidebar is pinned: ${JSON.stringify(pinned)}`);
  assert.equal(pinned.height, 0, `no pinned height on the first screen: ${JSON.stringify(pinned)}`);
  record("wide-sidebar-end", `${W}x${H}`, { scrollY, entry: reading(r.firstEnd), nav_steps_at_depth: reach.steps, pinned_height: pinned.height, pinned_parts: pinned.parts });
});

test("360 x 740: scrolled to the end the menu control is in view; nav_steps_at_depth is 1; the bar is within its budget", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const { dir, share } = await shellPage();
  const W = 360;
  const H = 740;
  const r = await drive(dir, `${W}x${H}`, [
    DISCOVER,
    get("menu0", MENU),
    get("first0", FIRST),
    ...TO_END,
    scrollBy("at", 0),
    get("menuEnd", MENU),
    act("open", MENU, "click"),
    get("firstOpen", FIRST),
  ]);
  const scrollY = r.at.after.scrollY;
  assert.ok(scrollY > 3000, `the page scrolled to its end (scrollY ${scrollY})`);
  assert.ok(!inView(r.first0), "the entries sit behind the closed menu");
  assert.ok(inView(r.menuEnd), `menu control at the end: ${JSON.stringify(reading(r.menuEnd))}`);
  const reach = navReachAtDepth({
    H,
    documentHeight: scrollY + H,
    nav: { position: r.menuEnd.state.computedStyles.position, top: box(r.menu0).top, behindMenu: !inView(r.first0), atEnd: atEndOf(r.menuEnd) },
  });
  assert.deepEqual(reach, { reach: 0, steps: 1, basis: "read-at-end" });
  // One step: opening the menu puts an entry in view.
  assert.ok(inView(r.firstOpen), `entry after opening the menu: ${JSON.stringify(reading(r.firstOpen))}`);
  // The bar is the menu control's height (the control fills it), pinned at the top.
  assert.equal(box(r.menuEnd).top, 0);
  const pinnedHeight = box(r.menuEnd).bottom;
  assert.ok(pinnedHeight > 0 && pinnedHeight <= share * H, `pinned height ${pinnedHeight} within ${share} x ${H}`);
  record("narrow-bar-end", `${W}x${H}`, { scrollY, menu: reading(r.menuEnd), nav_steps_at_depth: reach.steps, pinned_height: pinnedHeight, budget: share * H });
});

test("a focused control is never wholly behind the pinned bar", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const { dir } = await shellPage();
  const viewport = "360x740";
  const first = await drive(dir, viewport, [DISCOVER, get("control", CONTROL), get("menu", MENU)]);
  const barBottom = box(first.menu).bottom;
  // Scroll so the control sits wholly under the bar, then move focus to it with the Bridge's focus action.
  const offset = 5;
  const r = await drive(dir, viewport, [
    DISCOVER,
    scrollBy("under", box(first.control).top - offset),
    get("before", CONTROL),
    get("menu", MENU),
    act("focus", CONTROL, "focus"),
    get("after", CONTROL),
  ]);
  assert.equal(box(r.menu).bottom, barBottom, "the bar is still pinned");
  assert.ok(box(r.before).top >= 0 && box(r.before).bottom <= barBottom, `before focus the control is wholly behind the bar: ${JSON.stringify(reading(r.before))}`);
  assert.equal(r.after.state.focused, true, "the control has focus");
  assert.ok(box(r.after).top >= barBottom, `focused control top ${box(r.after).top} is at or below the bar's bottom ${barBottom}`);
  record("focus-not-obscured", viewport, { bar_bottom: barBottom, before: reading(r.before), after: reading(r.after) });
});

test("short viewports: at 360 x 320 the bar is not pinned, at 1280 x 400 the sidebar scrolls within itself; the last entry is reachable in both", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const { dir, share } = await shellPage();

  const narrow = await drive(dir, "360x320", [
    DISCOVER,
    get("menu0", MENU),
    ...TO_END,
    get("menuEnd", MENU),
    // Back to the top with the Bridge's page scroll (it clamps at 0), then open the menu.
    // Not scrollIntoView on the menu control: on 0.56.0 it answered NO_SCROLL_EFFECT for a control at
    // the document's top although the page moved (observed intermittently by two runs on 2026-11-26; not
    // deterministic), so the test does not depend on it.
    scrollBy("toTop", -100000),
    act("open", MENU, "click"),
    act("toLast", LAST, "scrollIntoView"),
    get("last", LAST),
  ]);
  const bar = box(narrow.menu0).bottom - box(narrow.menu0).top;
  assert.ok(bar / 320 > share, `the bar (${bar}) would take more than ${share} of 320, so the short condition holds`);
  assert.ok(!inView(narrow.menuEnd), `the bar is not pinned: at the end its menu control reads ${JSON.stringify(reading(narrow.menuEnd))}`);
  assert.equal(narrow.menuEnd.state.visibilityReason, "off-screen");
  assert.equal(narrow.toTop.after.scrollY, 0);
  assert.ok(inView(narrow.last), `last entry reached: ${JSON.stringify(reading(narrow.last))}`);

  const wide = await drive(dir, "1280x400", [
    DISCOVER,
    ...TO_END,
    scrollBy("at", 0),
    get("firstEnd", FIRST),
    get("lastEnd", LAST),
    act("toLast", LAST, "scrollIntoView"),
    scrollBy("after", 0),
    get("last", LAST),
  ]);
  assert.ok(inView(wide.firstEnd), `the sidebar stays in view at the end: ${JSON.stringify(reading(wide.firstEnd))}`);
  // The sidebar is taller than the viewport: its last entry ends below the viewport's bottom.
  assert.ok(box(wide.lastEnd).bottom > 400, `the sidebar is taller than the viewport: ${JSON.stringify(reading(wide.lastEnd))}`);
  assert.ok(inView(wide.last) && box(wide.last).bottom <= 400, `last entry reached, wholly in view: ${JSON.stringify(reading(wide.last))}`);
  assert.equal(wide.after.after.scrollY, wide.at.after.scrollY, "the page did not move: the sidebar scrolled within itself");
  record("short-narrow", "360x320", { bar, menu_at_end: reading(narrow.menuEnd), last: reading(narrow.last) });
  record("short-wide", "1280x400", { scrollY: wide.at.after.scrollY, first_at_end: reading(wide.firstEnd), last_before: reading(wide.lastEnd), last: reading(wide.last) });
});

// ---------------------------------------------------------------- the theme's md: breakpoint (step 5)

test("the compiled theme's md: variant applies at the source's breakpoint", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const c = await compileSource({ sourcePath: EXAMPLE_SOURCE, rootDir: ROOT });
  // Inside the repo so `@import "tailwindcss"` resolves from its node_modules.
  fs.mkdirSync(path.join(ROOT, ".dk-cache"), { recursive: true });
  const work = fs.mkdtempSync(path.join(ROOT, ".dk-cache", "md-"));
  const dir = tmpDir("md");
  t.after(() => {
    fs.rmSync(work, { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const html = `<!doctype html><html><head><link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="app.css"></head><body><button id="md-probe" type="button" class="hidden md:inline-block">At md and above</button></body></html>`;
  fs.writeFileSync(path.join(work, "theme.css"), c.outputs["theme.css"]);
  fs.writeFileSync(path.join(work, "content.html"), html);
  fs.writeFileSync(path.join(work, "app.css"), `@import "tailwindcss" source(none);\n@import "./theme.css";\n@source "./content.html";\n`);
  const css = await compileTailwind(path.join(work, "app.css"), ROOT);
  assert.match(css, /@media \(width >= 768px\)/);
  fs.writeFileSync(path.join(dir, "app.css"), css);
  fs.writeFileSync(path.join(dir, "tokens.css"), c.outputs["tokens.css"]);
  fs.writeFileSync(path.join(dir, "index.html"), html);
  const steps = [DISCOVER, get("probe", "dom-md-probe")];
  const wide = await drive(dir, "1280x800", steps);
  const narrow = await drive(dir, "360x740", steps);
  assert.ok(inView(wide.probe), `md:inline-block applies at 1280: ${JSON.stringify(reading(wide.probe))}`);
  assert.ok(!inView(narrow.probe) && narrow.probe.state.visibilityReason !== undefined, `hidden below md at 360: ${JSON.stringify(reading(narrow.probe))}`);
  record("theme-md", "1280x800,360x740", { wide: reading(wide.probe), narrow: reading(narrow.probe) });
});
