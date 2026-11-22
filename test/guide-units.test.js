// Plan 2026-11-21-design-kit-compiler-gaps Phase 2: the guide's length units
// as the package root exports them. On its own file, so the CLI tests beside
// the door still load against a build that predates `atRoot`.
import test from "node:test";
import assert from "node:assert/strict";
import { atRoot, canonical, headingSizes } from "../dist/index.js";

test("the package root exports atRoot, which keeps 0.1.x's em-to-px conversion; headingSizes orders rem and em steps at 16px", () => {
  assert.equal(atRoot("1em"), "16px");
  assert.equal(atRoot("0.875em"), "14px");
  assert.equal(atRoot("1rem"), "16px");
  assert.equal(canonical("1em"), "1em");
  assert.deepEqual(headingSizes({ sm: "0.875rem", md: "1rem", lg: "1.5rem" }), ["1.5rem"]);
});
