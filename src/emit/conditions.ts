/**
 * `conditions.css`: the kit's conditional rules, scoped by the project's own
 * width and height conditions. A kit rule names its condition (`wide`,
 * `short`); the value comes from the source and appears only in the `@media`
 * prelude, so every declaration still reads `var(--dk-*)` (the no-skin rule).
 *
 * A custom property cannot be used in a media feature (`@media (width >=
 * var(--x))` never applies), which is why the condition is compiled rather
 * than read from `tokens.css` at run time.
 *
 * A project loads this file AFTER the kit's stylesheet (`kitCss()`): a
 * conditional rule overrides a base rule of equal specificity only by coming
 * later.
 */
import type { Entry } from "../compile/model.js";
import type { UndeclaredEntry } from "../compile/state.js";
import { CONDITIONS, type Condition, type Rule } from "../kit/style.js";
import type { Leaf } from "../source/schema.js";
import { isMeasured } from "../source/value.js";
import { GENERATED_HEADER, MEDIA_LENGTH, MEDIA_LENGTH_PHRASE, MEDIA_LENGTH_UNITS } from "./names.js";

/** The source leaves each condition is computed from. */
export const CONDITION_LEAVES: Readonly<Record<Condition, readonly string[]>> = {
  wide: ["layout.breakpoint.md"],
  short: ["layout.shell.bar", "budgets.shell.max_pinned_share"],
};

/** A kit entry as this emitter reads it: a name and its rules. */
export interface ConditionalSource {
  def: { name: string };
  styles: { rules: readonly Rule[] };
}

export interface ConditionState {
  /**
   * `declared`: every leaf the condition needs is stated with a usable value.
   * `undeclared`: one is not stated. `invalid`: each is stated, but a value
   * cannot make a condition (`reason` says which). Neither of the last two
   * emits a rule, and neither fails the compile.
   */
  state: "declared" | "undeclared" | "invalid";
  /** The `@media` prelude, or null when the condition is not `declared`. */
  media: string | null;
  /** Why an `invalid` condition is invalid; null otherwise. */
  reason: string | null;
  /** How many kit rules name this condition. */
  rules: number;
  /** The leaves the condition needs that the source does not state. */
  undeclared: string[];
}

export type ConditionsReport = Record<Condition, ConditionState>;

const UNITS: ReadonlySet<string> = new Set(MEDIA_LENGTH_UNITS);

/** Thrown inside this module only: a stated value that cannot make a condition. Never leaves `conditionsOf`. */
class InvalidCondition extends Error {}

/**
 * A dimension's number (as `text`, written the way the source states it) and
 * unit, from its alias-resolved value. Only a media-feature unit is a length
 * here: any other (`%`, none, `48foo`) is a value the browser would drop the
 * whole query for, so it is invalid rather than emitted.
 */
function lengthOf(e: Entry): { value: number; unit: string; text: string } {
  const why = `${e.path} is ${JSON.stringify(e.value)}; a condition needs a ${MEDIA_LENGTH_PHRASE} length`;
  if (isMeasured(e.value)) {
    if (!UNITS.has(e.value.unit) || !Number.isFinite(e.value.value)) throw new InvalidCondition(why);
    return { value: e.value.value, unit: e.value.unit, text: String(e.value.value) };
  }
  const m = typeof e.value === "string" ? MEDIA_LENGTH.exec(e.value.trim()) : null;
  if (m) return { value: Number(m[1]), unit: m[2] as string, text: m[1] as string };
  throw new InvalidCondition(why);
}

/**
 * A computed length, at 12 significant digits: enough to drop a division's
 * float noise (47 / 0.3 is 156.66666666666669) without rounding a small real
 * value away (1e-7 / 0.1 stays 0.000001). Tests format their expectations
 * with this same function.
 */
export const computedLength = (n: number): string => String(Number(n.toPrecision(12)));

function prelude(c: Condition, entries: ReadonlyMap<string, Entry>, leaves: ReadonlyMap<string, Leaf>): string {
  switch (c) {
    case "wide": {
      const bp = entries.get("layout.breakpoint.md") as Entry;
      const { value, text, unit } = lengthOf(bp);
      // `width >= 0` (or less) holds at every width: the wide rules would apply everywhere.
      if (!(value > 0)) throw new InvalidCondition(`layout.breakpoint.md is ${text}${unit}; a breakpoint is a positive width`);
      return `@media (width >= ${text}${unit})`;
    }
    case "short": {
      const bar = lengthOf(entries.get("layout.shell.bar") as Entry);
      const share = (leaves.get("budgets.shell.max_pinned_share") as Leaf).value;
      if (typeof share !== "number" || !(share > 0 && share <= 1)) {
        throw new InvalidCondition(`budgets.shell.max_pinned_share is ${JSON.stringify(share)}; it is a number above 0 and at most 1`);
      }
      if (!(bar.value > 0)) throw new InvalidCondition(`layout.shell.bar is ${bar.value}${bar.unit}; a pinned bar has a positive height`);
      const q = computedLength(bar.value / share);
      if (!(Number(q) > 0 && Number.isFinite(Number(q)))) {
        throw new InvalidCondition(`layout.shell.bar / budgets.shell.max_pinned_share is ${q}${bar.unit}; the height condition is a positive finite length`);
      }
      return `@media (height < ${q}${bar.unit})`;
    }
  }
}

/** Is the leaf stated with a value (not absent, not `undeclared`)? */
function stated(path: string, entries: ReadonlyMap<string, Entry>, leaves: ReadonlyMap<string, Leaf>): boolean {
  const leaf = leaves.get(path);
  if (!leaf || leaf.source.kind === "undeclared") return false;
  // An emitted group's leaf must also have rendered as a value-bearing entry.
  return leaf.group === "budgets" || entries.has(path);
}

/** Each condition's state and prelude, computed from the source's own leaves; no default is filled in. */
export function conditionsOf(sources: readonly ConditionalSource[], leaves: readonly Leaf[], entries: readonly Entry[]): ConditionsReport {
  const byEntry = new Map(entries.filter((e) => e.origin === "leaf").map((e) => [e.path, e]));
  const byLeaf = new Map(leaves.map((l) => [l.path, l]));
  const out = {} as ConditionsReport;
  for (const c of CONDITIONS) {
    const rules = sources.reduce((n, s) => n + s.styles.rules.filter((r) => r.when === c).length, 0);
    const undeclared = CONDITION_LEAVES[c].filter((p) => !stated(p, byEntry, byLeaf));
    if (undeclared.length > 0) {
      out[c] = { state: "undeclared", media: null, reason: null, rules, undeclared };
      continue;
    }
    try {
      out[c] = { state: "declared", media: prelude(c, byEntry, byLeaf), reason: null, rules, undeclared: [] };
    } catch (e) {
      // A bad value is a state of the condition, never a failed compile: a project whose kit names no
      // condition compiles whatever its bar and share hold, and one that does gets no rule, and the reason.
      // Not so for the breakpoint's unit: a layout.breakpoint.md that is not a px, rem or em length is stored
      // here as invalid, and the guide (emitGuide, later in the same compile) then refuses it with a
      // SourceError, so the compile fails either way. The guide alone refuses a bad breakpoint under any
      // other layout.breakpoint.* key, which no condition reads. A non-positive md breakpoint is refused only here.
      if (!(e instanceof InvalidCondition)) throw e;
      out[c] = { state: "invalid", media: null, reason: e.message, rules, undeclared: [] };
    }
  }
  return out;
}

/**
 * Every leaf a condition needs that the source does not state, for
 * `compile-report.json`, whether or not a kit rule names the condition yet.
 */
export function conditionUndeclared(report: ConditionsReport): UndeclaredEntry[] {
  const out: UndeclaredEntry[] = [];
  for (const c of CONDITIONS) {
    for (const p of report[c].undeclared) out.push({ path: p, reason: `the kit's \`${c}\` condition needs it; conditions.css emits no \`${c}\` rule` });
  }
  return out;
}

function ruleText(r: Rule, indent: string): string {
  const decls = Object.entries(r.decls).map(([p, v]) => `${indent}  ${p}: ${v};`);
  return `${indent}${r.selector} {\n${decls.join("\n")}\n${indent}}`;
}

/**
 * The stylesheet. Conditions are written in a fixed order (`wide`, then
 * `short`), so where both hold, a `short` rule wins over a `wide` rule of
 * equal specificity. A condition no rule names, or one the source leaves
 * undeclared or states with an invalid value, writes no `@media` block.
 */
export function emitConditions(sources: readonly ConditionalSource[], report: ConditionsReport): string {
  const blocks: string[] = [];
  for (const c of CONDITIONS) {
    const s = report[c];
    if (s.rules === 0) continue;
    if (s.media === null) {
      const why = s.state === "invalid" ? `invalid (${s.reason})` : `undeclared (${s.undeclared.join(", ")})`;
      // A reason quotes a source value; keep it from closing the comment early.
      blocks.push(`/* ${c}: ${why.split("*/").join("* /")}; no rule emitted */`);
      continue;
    }
    const body: string[] = [];
    for (const src of sources) {
      const rules = src.styles.rules.filter((r) => r.when === c);
      if (rules.length === 0) continue;
      body.push(`  /* ${src.def.name} */`, ...rules.map((r) => ruleText(r, "  ")));
    }
    blocks.push(`/* ${c} */\n${s.media} {\n${body.join("\n")}\n}`);
  }
  const head = `/* ${GENERATED_HEADER} */\n/* Load after the kit stylesheet (kitCss()): a rule here overrides a base rule of equal specificity only by coming later. */\n`;
  return head + (blocks.length ? blocks.join("\n") + "\n" : "");
}
