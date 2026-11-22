// Plan 2026-11-21-design-kit-compiler-gaps Phase 2: stylesheetLoad merges the
// page-side answer with the kit server's misses. A unit test of the merge on
// its own file, so the CLI tests beside the door can load against a build
// that predates the module.
import test from "node:test";
import assert from "node:assert/strict";
import { mergeStylesheetLoads, stylesheetLoad } from "../dist/door/stylesheets.js";

const PAGE = "http://127.0.0.1:5/p.html";

test("stylesheetLoad names a percent-encoded sheet once, by its decoded path; an answer missing a list is UNKNOWN (null)", () => {
  assert.deepEqual(
    stylesheetLoad({ requested: 1, failed: ["http://127.0.0.1:5/my%20sheet.css"], unreadable: [], pending: [] }, PAGE, ["/my sheet.css"]),
    { requested: 1, failed: ["/my sheet.css"], unreadable: [], pending: [] },
  );
  assert.equal(stylesheetLoad({ requested: 1, failed: [], unreadable: [] }, PAGE, []), null);
});

test("a sheet that did not load is listed once, under failed, even when the page also reads it as pending or unreadable", () => {
  assert.deepEqual(
    stylesheetLoad({ requested: 1, failed: [], unreadable: ["http://127.0.0.1:5/a.css"], pending: ["http://127.0.0.1:5/a.css", "http://127.0.0.1:5/b.css"] }, PAGE, ["/a.css"]),
    { requested: 1, failed: ["/a.css"], unreadable: [], pending: ["/b.css"] },
  );
});

test("a sheet pending when the page was first read stays pending though it loaded by the last read; failures from either read count", () => {
  const before = { requested: 1, failed: ["/gone.css"], unreadable: [], pending: ["/late.css"] };
  const after = { requested: 2, failed: [], unreadable: ["http://cdn/x.css"], pending: [] };
  assert.deepEqual(mergeStylesheetLoads(before, after), { requested: 2, failed: ["/gone.css"], unreadable: ["http://cdn/x.css"], pending: ["/late.css"] });
  assert.equal(mergeStylesheetLoads(null, after), null);
  assert.equal(mergeStylesheetLoads(before, null), null);
});
