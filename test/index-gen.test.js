// Phase 6: the generated component index. Literals only; each check has a
// seeded violation that reddens it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { ALL, COMPONENTS, defineComponent } from "../dist/index.js";
import { INDEX_BYTE_LIMIT, MARK_END, MARK_START, applyIndex, checkIndex, generateIndex, groupTokens } from "../dist/index-gen/generate.js";
import { main } from "../dist/cli.js";
import { ROOT } from "./helpers.js";
import { tmpDir } from "./kit-helpers.js";

const KIT_DECLARATIONS = path.join(ROOT, "dist", "kit");
const KIT_SOURCES = path.join(ROOT, "src", "kit");
const gen = (dir = KIT_DECLARATIONS, entries = ALL) => generateIndex({ sourceDir: dir, entries, typescript: ts });

/** A copy of the kit's tsx sources the test can edit. */
function sourceCopy() {
  const dir = tmpDir("kit-src");
  fs.cpSync(KIT_SOURCES, dir, { recursive: true });
  return dir;
}

test("the index of the eight-component slice (plus the two patterns) is at most 8192 bytes", () => {
  assert.equal(INDEX_BYTE_LIMIT, 8192);
  const bytes = Buffer.byteLength(gen());
  assert.ok(bytes <= 8192, `the index is ${bytes} bytes; trim JSDoc, never raise the limit`);
  assert.ok(bytes > 4000, "the index is not empty");
  // Seeded violation: a ninth component with a long usage note pushes it past the limit, and the same assertion goes red.
  const dir = sourceCopy();
  try {
    const big = "x".repeat(1400);
    fs.writeFileSync(
      path.join(dir, "chip.tsx"),
      `/**\n * A chip.\n * @use ${big}\n * @avoid ${big}\n */\nexport function Chip(props: ChipProps) {\n  return props;\n}\nexport interface ChipProps {\n  label: string;\n}\n`,
    );
    const chip = { def: defineComponent({ name: "Chip", props: {}, states: ["default", "hover"] }), styles: { elementType: "button", rules: [] } };
    const withNinth = Buffer.byteLength(gen(dir, [...ALL, chip]));
    assert.ok(withNinth > 8192, `expected the seeded ninth component to overflow, saw ${withNinth}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the index reads props from types, variants and states from data, and the usage note from JSDoc", () => {
  const body = gen();
  assert.match(body, /^### Button\nA button over the native element\.\nUse: Any action a user triggers: save, add, confirm\. One `primary` per screen\.\n/m);
  assert.match(body, /Props: variant\?: "primary" \| "secondary" \| "quiet"; loading\?: boolean; type\?: "button" \| "submit" \| "reset"\n/);
  assert.match(body, /Variants: variant=primary\|secondary\|quiet\nStates: default, hover, focus-visible, active, disabled, loading\n/);
  assert.match(body, /### DataTable\n/);
  // RecordListPage's four state props are required: no `?`.
  assert.match(body, /empty: React\.ReactNode; loading: React\.ReactNode; error: React\.ReactNode; filteredEmpty: React\.ReactNode;/);
  assert.match(body, /Tokens: color-role-\{accent,/);
  assert.equal((body.match(/^### /gm) ?? []).length, 10);
});

test("generated from the sources or from the declarations, the index is the same bytes", () => {
  assert.equal(gen(KIT_SOURCES), gen(KIT_DECLARATIONS));
});

test("regenerating twice yields identical bytes", () => {
  assert.equal(gen(), gen());
  const once = applyIndex("# P\n", gen());
  assert.equal(applyIndex(once, gen()), once);
});

test("deleting a JSDoc usage note changes the index", () => {
  const dir = sourceCopy();
  try {
    const f = path.join(dir, "button.tsx");
    const before = gen(dir);
    fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace(/^ \* @use .*\n/m, ""));
    const after = gen(dir);
    assert.notEqual(after, before);
    assert.match(before, /Use: Any action a user triggers/);
    assert.doesNotMatch(after, /Use: Any action a user triggers/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("adding a prop to a component changes the index", () => {
  const dir = sourceCopy();
  try {
    const f = path.join(dir, "button.tsx");
    const before = gen(dir);
    fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("  loading?: boolean;", '  loading?: boolean;\n  /** Density. */\n  size?: "sm" | "md";'));
    const after = gen(dir);
    assert.notEqual(after, before);
    assert.match(after, /loading\?: boolean; size\?: "sm" \| "md"; type\?:/);
    assert.doesNotMatch(before, /size\?:/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a component with no source is named in the index, never silently skipped", () => {
  const dir = tmpDir("empty-src");
  try {
    const body = gen(dir, COMPONENTS.slice(0, 1));
    assert.match(body, /### Button\n\(no source found for Button; cannot read its props\)\n/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("tokens are grouped by family", () => {
  assert.equal(groupTokens(["--dk-color-role-accent", "--dk-color-role-text", "--dk-space-scale-2", "--dk-odd-token"]), "color-role-{accent,text} space-scale-{2} odd-token");
});

test("a hand edit between the markers is overwritten by the next index and reported by --check", async () => {
  const dir = tmpDir("claude-md");
  try {
    const file = path.join(dir, "CLAUDE.md");
    fs.writeFileSync(file, "# Project\n\nKeep this paragraph.\n");
    const cli = async (...a) => {
      const lines = [];
      const code = await main([...a, "--root", dir, "--kit-dir", KIT_DECLARATIONS], (s) => lines.push(s));
      return { code, lines };
    };
    // No markers yet: the check names it.
    assert.deepEqual(await cli("index", "--check"), { code: 1, lines: ["design-kit: the component index in CLAUDE.md is missing-markers (run `design-kit index`)"] });

    const wrote = await cli("index");
    assert.equal(wrote.code, 0);
    assert.match(wrote.lines[0], /^design-kit: wrote the component index \(\d+ bytes\) to CLAUDE\.md$/);
    const first = fs.readFileSync(file, "utf8");
    assert.ok(first.startsWith("# Project\n\nKeep this paragraph.\n"), "prose outside the markers is preserved");
    assert.ok(first.includes(MARK_START) && first.includes(MARK_END));
    assert.deepEqual(await cli("index", "--check"), { code: 0, lines: ["design-kit: the component index is current"] });

    // Seeded violation: a hand edit between the markers.
    fs.writeFileSync(file, first.replace("### Button\n", "### Button\nHand-written note.\n"));
    assert.deepEqual(await cli("index", "--check"), { code: 1, lines: ["design-kit: the component index in CLAUDE.md is drift (run `design-kit index`)"] });

    // The next index overwrites it, byte for byte.
    assert.equal((await cli("index")).code, 0);
    assert.equal(fs.readFileSync(file, "utf8"), first);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("checkIndex distinguishes current, drift and missing markers", () => {
  const body = "## x\n";
  const file = applyIndex("# T\n", body);
  assert.equal(checkIndex(file, body), "current");
  assert.equal(checkIndex(file, "## y\n"), "drift");
  assert.equal(checkIndex("# T\n", body), "missing-markers");
  assert.equal(checkIndex(`${MARK_END}\n${MARK_START}\n`, body), "missing-markers", "reversed markers are not a block");
});
