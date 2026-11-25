// Probe 3 (plan Phase 1): does the PUBLISHED exec door measure a forced state?
// Door: @qontinui/ui-bridge-wrapper@0.12.0 `ui-bridge-inject --exec-stdin`,
// action `getElementStateStyles`. A green run against the real published
// packages is the only evidence the door measures a state; there is no mock.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./helpers.js";
import { runInject, serveDir, stateDiffs } from "./inject.js";

const PAGE = "states.html";

// The installed @qontinui/ui-bridge (the peer is a range, >=0.54.0 <1; CI runs
// this file against the 0.56.0 devDependency and the 0.54.0 floor). The
// focus-visible behaviour of the door differs between the two.
const UI_BRIDGE_VERSION = JSON.parse(
  readFileSync(path.join(ROOT, "node_modules", "@qontinui", "ui-bridge", "package.json"), "utf8"),
).version;
const [uiBridgeMajor, uiBridgeMinor] = UI_BRIDGE_VERSION.split(".").map(Number);
const EMULATES_FOCUS_VISIBLE = uiBridgeMajor > 0 || uiBridgeMinor >= 56;

async function probe() {
  const server = await serveDir(path.join(ROOT, "test", "fixtures", "probe"));
  try {
    return await runInject(`${server.url}/${PAGE}`, [
      { action: "discover", payload: {} },
      { action: "getElementStateStyles", payload: { id: "dom-b", states: ["hover", "active", "focus", "disabled"] } },
      { action: "getElementStateStyles", payload: { id: "dom-plain", states: ["hover", "active"] } },
      { action: "getElementStateStyles", payload: { id: "dom-b", states: ["focus-visible"] } },
      { action: "getElementStateStyles", payload: { id: "dom-plain", states: ["focus-visible"] } },
    ]);
  } finally {
    await server.close();
  }
}

test("exec door: forced hover and active report a non-empty change set; a rule-less control reports none", async (t) => {
  const run = await probe();
  if (run.lines.length === 0) {
    // The instrument cannot run here (no Chromium, no display). Never a pass:
    // the recorded result is unknown(instrument-cannot-force). CI provisions
    // Chromium, so there the same condition is a failure, not a skip.
    const why = `unknown(instrument-cannot-force): published @qontinui/ui-bridge-wrapper@0.12.0 produced no output (${run.stderr.slice(0, 200).replace(/\n/g, " ")})`;
    assert.ok(!process.env.CI, why);
    t.skip(why);
    return;
  }
  assert.ok(run.ok, `door exited ${run.code}: ${run.stderr}`);
  const [, forced, plain, focusVisible, plainFocusVisible] = run.lines;

  const diffs = stateDiffs(forced);
  assert.deepEqual(diffs.hover, ["color", "backgroundColor", "outline"]);
  assert.deepEqual(diffs.active, ["backgroundColor"]);
  assert.deepEqual(diffs.disabled, ["opacity"]);

  // Seeded rule-less control: the same door reports an EMPTY set, so a
  // non-empty set above is a measurement and not an artifact of the reader.
  const plainDiffs = stateDiffs(plain);
  assert.deepEqual(plainDiffs.hover, []);
  assert.deepEqual(plainDiffs.active, []);

  // focus-visible. With @qontinui/ui-bridge 0.54.x the door's state
  // vocabulary is hover | focus | active | disabled: a `focus-visible` request
  // is dropped (only `default` comes back), recorded as
  // focus-visible-not-emulated. From 0.56.0 the door emulates it: the styled
  // button reports its AUTHORED :focus-visible outline (2px solid #123456),
  // and the rule-less control reports the browser's default focus ring, not
  // the authored one. check-states still records every focus-visible cell as
  // unknown(focus-visible-not-emulated), which is true at the 0.54.0 floor.
  if (EMULATES_FOCUS_VISIBLE) {
    const fv = focusVisible.result.stateStyles.find((s) => s.state === "focus-visible");
    assert.ok(fv, `ui-bridge ${UI_BRIDGE_VERSION}: focus-visible not reported`);
    assert.deepEqual(fv.diffFromDefault.map((d) => d.property), ["outline"]);
    assert.match(fv.diffFromDefault[0].stateValue, /^2px solid rgb\(18, 52, 86\)$/);
    const plainFv = plainFocusVisible.result.stateStyles.find((s) => s.state === "focus-visible");
    assert.ok(plainFv, `ui-bridge ${UI_BRIDGE_VERSION}: focus-visible not reported on the control`);
    assert.doesNotMatch(plainFv.diffFromDefault.map((d) => d.stateValue).join(" "), /rgb\(18, 52, 86\)/);
  } else {
    assert.deepEqual(Object.keys(stateDiffs(focusVisible)), ["default"]);
    assert.deepEqual(Object.keys(stateDiffs(plainFocusVisible)), ["default"]);
  }
  assert.deepEqual(diffs.focus, ["outline"]);
});
