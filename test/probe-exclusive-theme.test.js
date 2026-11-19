// Probe 1 (plan Phase 1): what does a Tailwind v4 theme that begins
// `--*: initial` remove, and what does it leave in place?
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { ROOT, compileTailwind, emittedClasses } from "./helpers.js";

const fx = (name) => path.join(ROOT, "test", "fixtures", "probe", name);

test("exclusive theme: a themed utility emits, named utilities outside the theme do not", async () => {
  const classes = emittedClasses(await compileTailwind(fx("exclusive.css")));
  assert.ok(classes.has("bg-surface"), "bg-surface is in the theme");
  assert.ok(!classes.has("bg-red-500"), "bg-red-500 is not in the theme");
  assert.ok(!classes.has("text-lg"), "text-lg is not in the theme");
});

test("exclusive theme: spacing is dynamic, so p-3 emits exactly when --spacing is defined", async () => {
  const withSpacing = emittedClasses(await compileTailwind(fx("exclusive.css")));
  assert.ok(withSpacing.has("p-3"));
  const without = emittedClasses(await compileTailwind(fx("exclusive-no-spacing.css")));
  assert.ok(!without.has("p-3"));
  assert.ok(without.has("bg-surface"));
});

test("exclusive theme: arbitrary values are emitted whatever --*: initial says", async () => {
  // Records that the theme alone does not stop a literal; Phase 4's
  // `lint-classes` is the answer.
  const classes = emittedClasses(await compileTailwind(fx("exclusive.css")));
  assert.ok(classes.has("bg-[#f00]"));
  assert.ok(classes.has("p-[13px]"));
});

test("exclusive theme: removes the breakpoint variants, which the compiler must define itself", async () => {
  const exclusive = emittedClasses(await compileTailwind(fx("exclusive.css")));
  assert.ok(!exclusive.has("md:p-3"));
  const inclusive = emittedClasses(await compileTailwind(fx("inclusive.css")));
  assert.ok(inclusive.has("md:p-3"), "without --*: initial the default md breakpoint exists");
  assert.ok(inclusive.has("bg-red-500"));
  assert.ok(inclusive.has("text-lg"));
});

// Seeded violation: the inverse of the first assertion must be RED. If this
// test passed, the probe's emitted-class reader could not tell a present class
// from an absent one (plan Phase 1 Arming).
test("seeded violation: expecting bg-red-500 to be emitted by the exclusive theme fails", async () => {
  const classes = emittedClasses(await compileTailwind(fx("exclusive.css")));
  assert.throws(() => assert.ok(classes.has("bg-red-500")));
});
