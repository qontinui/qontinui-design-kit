// Probe 3 (plan Phase 1): does the PUBLISHED exec door measure a forced state?
// Door: @qontinui/ui-bridge-wrapper@0.12.0 `ui-bridge-inject --exec-stdin`,
// action `getElementStateStyles`. A green run against the real published
// packages is the only evidence the door measures a state; there is no mock.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { ROOT } from "./helpers.js";
import { runInject, serveDir, stateDiffs } from "./inject.js";

const PAGE = "states.html";

async function probe() {
  const server = await serveDir(path.join(ROOT, "test", "fixtures", "probe"));
  try {
    return await runInject(`${server.url}/${PAGE}`, [
      { action: "discover", payload: {} },
      { action: "getElementStateStyles", payload: { id: "dom-b", states: ["hover", "active", "focus", "disabled"] } },
      { action: "getElementStateStyles", payload: { id: "dom-plain", states: ["hover", "active"] } },
      { action: "getElementStateStyles", payload: { id: "dom-b", states: ["focus-visible"] } },
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
  const [, forced, plain, focusVisible] = run.lines;

  const diffs = stateDiffs(forced);
  assert.deepEqual(diffs.hover, ["color", "backgroundColor", "outline"]);
  assert.deepEqual(diffs.active, ["backgroundColor"]);
  assert.deepEqual(diffs.disabled, ["opacity"]);

  // Seeded rule-less control: the same door reports an EMPTY set, so a
  // non-empty set above is a measurement and not an artifact of the reader.
  const plainDiffs = stateDiffs(plain);
  assert.deepEqual(plainDiffs.hover, []);
  assert.deepEqual(plainDiffs.active, []);

  // focus-visible: the door's state vocabulary is hover | focus | active |
  // disabled. A `focus-visible` request is dropped (only `default` comes
  // back), so it is not emulated by this published version. Recorded as
  // focus-visible-not-emulated; if a later published door reports it, this
  // assertion reddens and the README record is updated.
  assert.deepEqual(Object.keys(stateDiffs(focusVisible)), ["default"]);
  assert.deepEqual(diffs.focus, ["outline"]);
});
