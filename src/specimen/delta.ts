/**
 * Is a state's delta token-derived? The door reports COMPUTED values
 * (`rgb(18, 52, 86)`), so a `var(--dk-*)` read is recognised by value: a
 * changed value is token-derived when each colour or length it is made of
 * equals the computed value of some `--dk-*` custom property in the page. A
 * literal that happens to equal a token value passes; one that equals none is
 * a non-token delta.
 */
import { STATES_PROPERTY } from "../kit/style.js";

export interface Diff {
  property: string;
  defaultValue: string;
  stateValue: string;
}

export interface DeltaClass {
  /** Properties that count as a visible, value-bearing change. */
  counted: string[];
  /** Properties that changed but carry no token-checkable value, with the reason. */
  ignored: { property: string; reason: "keyword" | "inert" }[];
  /** Counted properties with a component that equals no token value. */
  nonToken: string[];
}

/** Split a CSS value on top-level whitespace (parentheses keep their spaces). */
export function components(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

const COLOUR = /^(?:#|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\()/;
const NUMBER = /^-?\d*\.?\d+(?:px|em|rem|%|ms|s|deg)?$/;
const ZERO = /^-?0*\.?0+(?:px|em|rem|%|ms|s|deg)?$/;

export type ComponentKind = "colour" | "number" | "zero" | "keyword";

export function kindOf(component: string): ComponentKind {
  if (COLOUR.test(component)) return "colour";
  if (ZERO.test(component)) return "zero";
  if (NUMBER.test(component)) return "number";
  return "keyword";
}

export function classifyDelta(diffs: readonly Diff[], tokenValues: ReadonlySet<string>): DeltaClass {
  const out: DeltaClass = { counted: [], ignored: [], nonToken: [] };
  for (const d of diffs) {
    const parts = components(d.stateValue);
    // `outline: 3px none <colour>` paints nothing: a delta in it is the colour following `color`, not a state rule.
    if (parts.includes("none") || parts.includes("hidden")) {
      out.ignored.push({ property: d.property, reason: "inert" });
      continue;
    }
    const valued = parts.filter((p) => ["colour", "number"].includes(kindOf(p)));
    if (valued.length === 0) {
      out.ignored.push({ property: d.property, reason: "keyword" });
      continue;
    }
    out.counted.push(d.property);
    if (!valued.every((p) => tokenValues.has(p))) out.nonToken.push(d.property);
  }
  return out;
}

/** The properties compared between two rendered cells when a state is carried by an attribute (layout is not compared). */
export const VISUAL_PROPERTIES = [
  "color",
  "backgroundColor",
  "backgroundImage",
  "border",
  "borderRadius",
  "boxShadow",
  "opacity",
  "outline",
  "textDecoration",
  "fontWeight",
  "fontFamily",
  "letterSpacing",
  "transform",
] as const;

/** The visual properties that differ between two computed-style maps. */
export function visualDiff(base: Record<string, unknown>, other: Record<string, unknown>): Diff[] {
  const out: Diff[] = [];
  for (const p of VISUAL_PROPERTIES) {
    const a = String(base[p] ?? "");
    const b = String(other[p] ?? "");
    if (a !== b) out.push({ property: p, defaultValue: a, stateValue: b });
  }
  return out;
}

/**
 * Page-side expression: the computed value of every `--dk-*` custom property,
 * read through a probe element for each property a token can feed. A
 * declaration that is invalid for the property computes to its fallback, so a
 * value equal to that baseline is not taken as a token value.
 *
 * The kit's own state declaration (`--dk-kit-states`, on every component root)
 * is not a token: it is excluded from `count`, so a page whose token sheet is
 * absent but whose kit stylesheet loaded counts 0, not 8.
 */
export const TOKEN_VALUES_EXPRESSION = `(() => {
  const names = new Set();
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch (e) { continue; }
    for (const r of rules) {
      if (!r.style) continue;
      for (const p of r.style) if (p.startsWith('--dk-') && p !== ${JSON.stringify(STATES_PROPERTY)}) names.add(p);
    }
  }
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-9999px;top:0;color:rgb(1, 2, 3)';
  document.body.appendChild(host);
  const probe = document.createElement('div');
  probe.style.cssText = 'border-style:solid;outline-style:solid';
  host.appendChild(probe);
  const props = ['color', 'backgroundColor', 'width', 'borderTopWidth', 'outlineWidth', 'fontSize', 'transitionDuration', 'lineHeight', 'fontWeight', 'opacity', 'letterSpacing', 'boxShadow', 'transform'];
  const base = {};
  for (const p of props) { probe.style[p] = 'var(--dk-nonexistent-probe)'; base[p] = getComputedStyle(probe)[p]; probe.style[p] = ''; }
  const values = new Set();
  for (const n of names) {
    for (const p of props) {
      probe.style[p] = 'var(' + n + ')';
      const v = getComputedStyle(probe)[p];
      probe.style[p] = '';
      if (v && v !== base[p]) values.add(v);
    }
  }
  host.remove();
  return { count: names.size, values: Array.from(values) };
})()`;
