// Plan 2026-11-26-the-app-shell-is-never-derived-from-what-every-role-does-on-
// every-page, Phase 3: the kit's AppShell pattern on the compiled conditions.
//
// The unit cases render the component to static markup with literal fixtures.
// The browser cases load the page a scaffold loads (tokens, then kitCss(), then
// conditions.css after it), hydrate the component, and drive it through the
// UI Bridge exec door exactly as test/shell-conditions.test.js drives the shell
// fixture: the browser is only launched and sized (`--viewport`); every
// scroll, focus, click and reading is a Bridge step.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import * as React from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { AppShell, compileSource, kitCss, PATTERNS } from "../dist/index.js";
import { ROOT } from "./helpers.js";
import { EXAMPLE_SOURCE, needDoor, tmpDir } from "./kit-helpers.js";
import { runInject, serveDir } from "./inject.js";
import { atEndOf, inView, navReachAtDepth, pinnedHeight } from "./reach.js";
import { PERMITTED, SPEC, page } from "./fixtures/app-shell/page.js";

const require = createRequire(import.meta.url);
const UI_BRIDGE_VERSION = JSON.parse(fs.readFileSync(require.resolve("@qontinui/ui-bridge/package.json"), "utf8")).version;

// ---------------------------------------------------------------- unit cases, on static markup

const h = React.createElement;
const allow = (held) => (p) => held.includes(p);
const render = (props) => renderToStaticMarkup(h(AppShell, { id: "s", product: "Shop", sections: [], can: allow([]), ...props }));

/** The opening tag and the text content of the element with this DOM id (null when there is none). */
function element(html, id) {
  const open = new RegExp(`<([a-z]+)\\b[^>]*\\bid="${id}"[^>]*>`).exec(html);
  if (!open) return null;
  const close = html.indexOf(`</${open[1]}>`, open.index);
  return { tag: open[0], text: html.slice(open.index + open[0].length, close).replace(/<[^>]+>/g, "") };
}

const ENTRY = (id, extra = {}) => ({ id, label: id.toUpperCase(), href: `#${id}`, ...extra });

test("AppShell is the kit's second working-screen pattern", () => {
  assert.deepEqual(PATTERNS.map((p) => p.def.name), ["RecordListPage", "AppShell"]);
  const shell = PATTERNS[1];
  assert.deepEqual(shell.def.props, { variant: ["sidebar", "topbar"] });
  assert.deepEqual([...shell.def.states], ["default"]);
  assert.deepEqual([...new Set(shell.styles.rules.filter((r) => r.when).map((r) => r.when))], ["wide", "short"]);
});

test("an entry the role may not use is hidden by default, and disabled with its reason under whenDenied: disable", () => {
  const sections = [{ id: "a", label: "A", entries: [ENTRY("open"), ENTRY("hidden", { requires: "x" }), ENTRY("off", { requires: "y", whenDenied: "disable", reason: "Owners only" })] }];
  const html = render({ sections });
  assert.ok(element(html, "s-open").tag.includes('href="#open"'));
  assert.equal(element(html, "s-hidden"), null, "a denied entry is not rendered by default");
  assert.ok(!html.includes("#hidden"));
  const off = element(html, "s-off");
  assert.ok(off.tag.includes('aria-disabled="true"'), off.tag);
  assert.ok(!off.tag.includes("href="), "a disabled entry links nowhere");
  assert.equal(off.text, "OFFOwners only", "the reason is visible text in the entry");
  // Permitted, the same entries are plain links.
  const granted = render({ sections, can: allow(["x", "y"]) });
  assert.ok(element(granted, "s-hidden").tag.includes('href="#hidden"'));
  assert.ok(!element(granted, "s-off").tag.includes("aria-disabled"));
  assert.ok(!granted.includes("Owners only"));
});

test("a section left empty is not rendered, and neither is a section whose own permission is denied", () => {
  const html = render({
    sections: [
      { id: "kept", label: "Kept", entries: [ENTRY("one")] },
      { id: "empty", label: "Emptied", entries: [ENTRY("two", { requires: "x" })] },
      { id: "none", label: "Nothing", entries: [] },
      { id: "gated", label: "Gated", requires: "y", entries: [ENTRY("three")] },
    ],
  });
  assert.ok(element(html, "s-kept-label"));
  for (const id of ["empty", "none", "gated"]) assert.equal(element(html, `s-${id}-label`), null, `section ${id}`);
  assert.ok(!html.includes("Emptied") && !html.includes("Nothing") && !html.includes("Gated"));
  // A section with only a disabled entry is not empty: the entry is shown.
  const disabledOnly = render({ sections: [{ id: "d", label: "D", entries: [ENTRY("e", { requires: "x", whenDenied: "disable", reason: "Why" })] }] });
  assert.ok(element(disabledOnly, "s-d-label"));
});

test("the account control shows the role, and the name only when given", () => {
  const named = render({ account: { name: "Ada Lovelace", role: "Owner" } });
  const control = element(named, "s-account");
  assert.match(control.tag, /^<button/);
  assert.equal(control.text, "OwnerAda Lovelace", "role and name in the control");
  // The name also sits in the account menu, for the widths where the control shows only the role.
  assert.equal(element(named, "s-account-menu").text, "Ada Lovelace");

  const roleOnly = render({ account: { role: "Purchasing" } });
  assert.equal(element(roleOnly, "s-account").text, "Purchasing");
  assert.equal(element(roleOnly, "s-account-menu"), null, "nothing to open: no menu");
  assert.ok(!roleOnly.includes("dk-app-shell-account-name"), "no placeholder for an absent name");

  const withItems = render({ account: { role: "Owner", items: [{ id: "out", label: "Sign out", href: "/logout" }] } });
  assert.ok(element(withItems, "s-out").tag.includes('href="/logout"'));
  assert.ok(element(withItems, "s-account-menu").tag.includes("hidden"), "the account menu starts closed");

  assert.ok(!render({}).includes("dk-app-shell-account"), "no account area without an account");
});

test("the cart slot renders only when passed", () => {
  assert.equal(element(render({}), "s-cart"), null);
  assert.ok(!render({}).includes("dk-app-shell-cart"));
  const cart = element(render({ cart: { label: "Cart", href: "/cart", count: 3 } }), "s-cart");
  assert.ok(cart.tag.includes('href="/cart"'));
  assert.equal(cart.text, "Cart3");
  assert.equal(element(render({ cart: { label: "Cart", href: "/cart" } }), "s-cart").text, "Cart", "no count when none is passed");
});

test("the current entry carries aria-current, and no other does", () => {
  const html = render({ sections: [{ id: "a", label: "A", entries: [ENTRY("one"), ENTRY("two")] }], current: "two" });
  assert.ok(element(html, "s-two").tag.includes('aria-current="page"'));
  assert.ok(!element(html, "s-one").tag.includes("aria-current"));
  assert.equal((html.match(/aria-current=/g) ?? []).length, 1);
});

test("the menu control carries aria-expanded and aria-controls naming the navigation", () => {
  const html = render({ sections: [{ id: "a", label: "A", entries: [ENTRY("one")] }], menuLabel: "Menü" });
  const menu = element(html, "s-menu");
  assert.match(menu.tag, /^<button/);
  assert.ok(menu.tag.includes('aria-expanded="false"'), menu.tag);
  assert.ok(menu.tag.includes('aria-controls="s-nav"'), menu.tag);
  assert.equal(menu.text, "Menü");
  assert.ok(element(html, "s-nav").tag.startsWith("<nav"));
  // Without an id, the ids are generated and still pair the control with the navigation.
  const anon = renderToStaticMarkup(h(AppShell, { product: "P", sections: [], can: allow([]) }));
  const controls = /aria-controls="([^"]+)"/.exec(anon)[1];
  assert.ok(anon.includes(`<nav id="${controls}"`), `aria-controls ${controls} names the nav`);
  // The page goes in <main>.
  assert.match(renderToStaticMarkup(h(AppShell, { id: "m", product: "P", sections: [], can: allow([]) }, h("p", null, "Body"))), /<main class="dk-app-shell-main"><p>Body<\/p><\/main>/);
});

// ---------------------------------------------------------------- the page, hydrated and driven through the Bridge

// React's production CommonJS builds, as one classic script with a minimal
// `require`, exposed to the module graph through an import map of small ESM
// shims. The kit's own dist/kit modules are served as they are built.
const VENDOR = {
  react: "react/cjs/react.production.js",
  "react/jsx-runtime": "react/cjs/react-jsx-runtime.production.js",
  "react-dom": "react-dom/cjs/react-dom.production.js",
  "react-dom/client": "react-dom/cjs/react-dom-client.production.js",
  scheduler: "scheduler/cjs/scheduler.production.js",
};
const EXPOSED = ["react", "react/jsx-runtime", "react-dom/client"];
const IDENT = /^[A-Za-z_$][\w$]*$/;

function vendorScript() {
  const defs = Object.entries(VENDOR).map(([name, file]) => {
    const src = fs.readFileSync(path.join(ROOT, "node_modules", file), "utf8");
    return `defs[${JSON.stringify(name)}] = function (module, exports, require) {\n${src}\n};`;
  });
  return `(function () {\nvar defs = {}, cache = {};\nfunction req(n) { if (cache[n]) return cache[n].exports; if (!defs[n]) throw new Error("vendor: no module " + n); var m = { exports: {} }; cache[n] = m; defs[n](m, m.exports, req); return m.exports; }\n${defs.join("\n")}\nwindow.__dkVendor = { ${EXPOSED.map((n) => `${JSON.stringify(n)}: req(${JSON.stringify(n)})`).join(", ")} };\n})();\n`;
}

function shim(name) {
  const keys = Object.keys(require(name)).filter((k) => IDENT.test(k) && k !== "default");
  return `const m = window.__dkVendor[${JSON.stringify(name)}];\nexport default m;\nexport const { ${keys.join(", ")} } = m;\n`;
}

const MAIN = `import { createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { AppShell } from "./kit/app-shell.js";
import { page } from "./page.js";
const spec = JSON.parse(document.getElementById("spec").textContent);
hydrateRoot(document.getElementById("root"), page(createElement, AppShell, spec));
`;

const pages = new Map();
after(() => {
  for (const { dir } of pages.values()) fs.rmSync(dir, { recursive: true, force: true });
});

/** The AppShell page for a spec: served from a temp dir, compiled once per spec. */
async function shellPage(spec = SPEC) {
  const key = JSON.stringify(spec);
  if (pages.has(key)) return pages.get(key);
  const c = await compileSource({ sourcePath: EXAMPLE_SOURCE, rootDir: ROOT });
  const dir = tmpDir("app-shell");
  fs.cpSync(path.join(ROOT, "dist", "kit"), path.join(dir, "kit"), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "test", "fixtures", "app-shell", "page.js"), path.join(dir, "page.js"));
  fs.writeFileSync(path.join(dir, "vendor.js"), vendorScript());
  const imports = {};
  for (const name of EXPOSED) {
    const file = `shim-${name.replace(/\//g, "-")}.js`;
    fs.writeFileSync(path.join(dir, file), shim(name));
    imports[name] = `./${file}`;
  }
  fs.writeFileSync(path.join(dir, "main.js"), MAIN);
  fs.writeFileSync(path.join(dir, "tokens.css"), c.outputs["tokens.css"]);
  const markup = renderToString(page(h, AppShell, spec));
  const json = JSON.stringify(spec).replace(/</g, "\\u003c");
  // The order a scaffold loads them: tokens, then kitCss() and conditions.css after it, in one style element.
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AppShell</title>
<link rel="stylesheet" href="tokens.css">
<style>
${kitCss()}
${c.outputs["conditions.css"]}
</style>
<script type="importmap">${JSON.stringify({ imports })}</script>
</head>
<body>
<div id="root">${markup}</div>
<script type="application/json" id="spec">${json}</script>
<script src="vendor.js"></script>
<script type="module" src="main.js"></script>
</body>
</html>
`;
  fs.writeFileSync(path.join(dir, "index.html"), html);
  const share = c.leaves.find((l) => l.path === "budgets.shell.max_pinned_share").value;
  const out = { dir, share };
  pages.set(key, out);
  return out;
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
const TO_END = [
  { name: "end", action: "pageScroll", payload: { top: 100000 } },
  { name: "endEl", action: "getElement", payload: { id: "dom-page-end" } },
];
const MENU = "dom-shell-menu";
const bridgeId = (entry) => `dom-shell-${entry}`;
const FIRST = bridgeId(PERMITTED[0]);
const LAST = bridgeId(PERMITTED[PERMITTED.length - 1]);
const CONTROL = "dom-body-control";

const box = (r) => r.state.rect;
const reading = (r) => ({ inViewport: r.state.inViewport, visibilityReason: r.state.visibilityReason ?? null, top: box(r).top, bottom: box(r).bottom, left: box(r).left, right: box(r).right });

function record(name, viewport, values) {
  console.log(`app-shell: ${JSON.stringify({ case: name, viewport, ui_bridge: UI_BRIDGE_VERSION, ...values })}`);
}

test("keeps every permitted entry one step from the end of the page", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const { dir, share } = await shellPage();

  // 1280 x 800, the sidebar: at the end every permitted entry is in view (no step), beside the content.
  {
    const W = 1280;
    const H = 800;
    const r = await drive(dir, `${W}x${H}`, [
      DISCOVER,
      get("first", FIRST),
      get("menu0", MENU),
      ...PERMITTED.map((e) => get(`start:${e}`, bridgeId(e))),
      ...TO_END,
      scrollBy("at", 0),
      get("control", CONTROL),
      ...PERMITTED.map((e) => get(`end:${e}`, bridgeId(e))),
    ]);
    const scrollY = r.at.after.scrollY;
    assert.ok(scrollY > 3000, `the page scrolled to its end (scrollY ${scrollY})`);
    for (const e of PERMITTED) assert.ok(inView(r[`end:${e}`]), `${e} at the end: ${JSON.stringify(reading(r[`end:${e}`]))}`);
    const firstEnd = r[`end:${PERMITTED[0]}`];
    const reach = navReachAtDepth({
      H,
      documentHeight: scrollY + H,
      nav: { position: firstEnd.state.computedStyles.position, top: box(r.first).top, behindMenu: !inView(r.first), atEnd: atEndOf(firstEnd) },
    });
    assert.deepEqual(reach, { reach: 0, steps: 0, basis: "read-at-end" });
    assert.ok(!inView(r.menu0), "no menu control at this width");
    // Beside the content: the page's own control starts right of the sidebar's entries.
    assert.ok(box(r.control).left >= box(firstEnd).right, `content ${JSON.stringify(reading(r.control))} beside the sidebar ${JSON.stringify(reading(firstEnd))}`);
    const pinned = pinnedHeight(PERMITTED.map((e) => ({ start: r[`start:${e}`], end: r[`end:${e}`] })), W);
    assert.ok(pinned.parts.length > 0, `the sidebar is pinned: ${JSON.stringify(pinned)}`);
    assert.equal(pinned.height, 0, `no pinned height on the first screen: ${JSON.stringify(pinned)}`);
    record("wide-sidebar-end", `${W}x${H}`, { scrollY, entry: reading(firstEnd), nav_steps_at_depth: reach.steps, pinned_height: pinned.height, pinned_parts: pinned.parts });
  }

  // 360 x 740, the bar: at the end the menu control is in view, and opening it shows every permitted entry (one step).
  {
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
      get("menuOpen", MENU),
      ...PERMITTED.map((e) => get(`open:${e}`, bridgeId(e))),
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
    assert.equal(r.menuEnd.state.ariaExpanded, false, "the menu starts closed");
    assert.equal(r.menuOpen.state.ariaExpanded, true, "the click opened it (the page is hydrated)");
    for (const e of PERMITTED) assert.ok(inView(r[`open:${e}`]), `${e} after opening the menu: ${JSON.stringify(reading(r[`open:${e}`]))}`);
    // The bar is one control's height, pinned at the top, within its budget.
    assert.equal(box(r.menuEnd).top, 0);
    const pinned = box(r.menuEnd).bottom;
    assert.ok(pinned > 0 && pinned <= share * H, `pinned height ${pinned} within ${share} x ${H}`);
    record("narrow-bar-end", `${W}x${H}`, { scrollY, menu: reading(r.menuEnd), nav_steps_at_depth: reach.steps, pinned_height: pinned, budget: share * H });
  }
});

test("an entry the role may not use is shown disabled with the reason the Bridge reads, and a hidden one is absent", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const { dir } = await shellPage();
  const r = await drive(dir, "1280x800", [DISCOVER, get("users", bridgeId("users"))]);
  const users = r.users.state;
  assert.equal(users.ariaDisabled, true, JSON.stringify(users));
  assert.ok(inView(r.users), `the disabled entry is in view: ${JSON.stringify(reading(r.users))}`);
  assert.match(users.textContent, /Only an owner manages users/, `the reason is read: ${users.textContent}`);
  assert.match(users.accessibleName, /Only an owner manages users/);
  const ids = r.discover.elements.map((e) => e.id);
  assert.ok(!ids.includes(bridgeId("settings")), "the hidden entry is not on the page");
  record("disabled-entry", "1280x800", { aria_disabled: users.ariaDisabled, text: users.textContent });
});

test("a focused control is never wholly behind the pinned bar", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const { dir } = await shellPage();
  const viewport = "360x740";
  const first = await drive(dir, viewport, [DISCOVER, get("control", CONTROL), get("menu", MENU)]);
  const barBottom = box(first.menu).bottom;
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
  assert.ok(box(wide.lastEnd).bottom > 400, `the sidebar is taller than the viewport: ${JSON.stringify(reading(wide.lastEnd))}`);
  assert.ok(inView(wide.last) && box(wide.last).bottom <= 400, `last entry reached, wholly in view: ${JSON.stringify(reading(wide.last))}`);
  assert.equal(wide.after.after.scrollY, wide.at.after.scrollY, "the page did not move: the sidebar scrolled within itself");
  record("short-narrow", "360x320", { bar, menu_at_end: reading(narrow.menuEnd), last: reading(narrow.last) });
  record("short-wide", "1280x400", { scrollY: wide.at.after.scrollY, first_at_end: reading(wide.firstEnd), last_before: reading(wide.lastEnd), last: reading(wide.last) });
});

test("variant topbar at 1280 x 800: one pinned row of one control's height, every permitted entry in view at the end", async (t) => {
  if (!(await needDoor(t, assert))) return;
  const { dir } = await shellPage({ ...SPEC, variant: "topbar" });
  const r = await drive(dir, "1280x800", [DISCOVER, get("menu0", MENU), ...TO_END, scrollBy("at", 0), get("account", "dom-shell-account"), ...PERMITTED.map((e) => get(`end:${e}`, bridgeId(e)))]);
  assert.ok(r.at.after.scrollY > 3000);
  assert.ok(!inView(r.menu0), "no menu control at this width");
  const bar = box(r.account).bottom - box(r.account).top;
  for (const e of PERMITTED) {
    const x = r[`end:${e}`];
    // An entry may sit past the row's end (the row scrolls sideways); it is never out of view vertically.
    assert.ok(box(x).top >= 0 && box(x).bottom <= bar, `${e} in the pinned row: ${JSON.stringify(reading(x))}`);
  }
  assert.ok(inView(r[`end:${PERMITTED[0]}`]));
  record("wide-topbar-end", "1280x800", { bar, first: reading(r[`end:${PERMITTED[0]}`]) });
});
