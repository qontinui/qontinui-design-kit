/**
 * `<app>.styleguide.uibridge.json`: a `StyleGuideConfig` (ui-bridge
 * `specs/style-types.ts`) generated from the compiled entries and the kit's own
 * component data, never hand-written. The rules are per kit role: a colour on
 * the palette, a radius on the scale, a heading size from the declared scale,
 * and one rule per component that its state matrix is declared.
 */
import type { Entry } from "../compile/model.js";
import { COMPONENTS, type KitEntry } from "../kit/registry.js";
import { STATES_PROPERTY } from "../kit/style.js";
import { GENERATED_HEADER, kebab } from "./names.js";

export type StyleConstraint =
  | { type: "exact"; property: string; value: string }
  | { type: "oneOf"; property: string; values: string[] };

export interface StyleRule {
  id: string;
  description: string;
  selector?: string;
  elementType?: string;
  constraints: StyleConstraint[];
  severity: "error" | "warning" | "info";
}

export interface DesignTokens {
  colors: Record<string, string>;
  typography: {
    fontFamilies: Record<string, string>;
    fontSizes: Record<string, string>;
    fontWeights: Record<string, string>;
    lineHeights: Record<string, string>;
    letterSpacings: Record<string, string>;
  };
  spacing: Record<string, string>;
  borderRadius: Record<string, string>;
  shadows: Record<string, string>;
  breakpoints: Record<string, number>;
}

export interface StyleGuideConfig {
  version: string;
  name: string;
  description: string;
  tokens: DesignTokens;
  rules: StyleRule[];
}

export const GUIDE_VERSION = "1.0.0";

/** The file name of a source's guide. */
export const guideFileName = (name: string): string => `${kebab(name)}.styleguide.uibridge.json`;

/**
 * The computed-style spelling of a value where it is statically known: a hex
 * colour is `rgb(r, g, b)` (or `rgba(...)`), and a `rem` length is `px` at the
 * 16px root. An `em` length is returned as written: its px value depends on
 * the font size of the element it is set on, which no root conversion knows
 * (a `0.025em` tracking is `0.35px` on 14px text, not `0.4px`). The guide
 * writes tracking this way; font sizes, spacing and radii go through
 * `atRoot`, which keeps the 0.1.x conversion. Anything else (a platform
 * keyword, `color-mix`) stays as the source spells it; `design-kit
 * validate-guide` canonicalises those through the browser before it compares.
 *
 * No guide rule reads `letterSpacing` today. A future tracking rule must
 * compare the element's computed `letterSpacing` divided by its computed
 * `fontSize` against the em value, per element: the browser canonicalisation
 * probe (`canonicalizeExpression` in `validate/guide.ts`) has no element font
 * size, so it cannot turn an `em` constraint into the px an element computes.
 */
export function canonical(css: string): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(css.trim());
  if (hex) {
    let h = hex[1] as string;
    if (h.length === 3) h = [...h].map((c) => c + c).join("");
    const n = (i: number): number => parseInt(h.slice(i, i + 2), 16);
    if (h.length === 8) return `rgba(${n(0)}, ${n(2)}, ${n(4)}, ${Math.round((n(6) / 255) * 1000) / 1000})`;
    return `rgb(${n(0)}, ${n(2)}, ${n(4)})`;
  }
  const len = /^(-?\d*\.?\d+)rem$/.exec(css.trim());
  if (len) return `${Math.round(parseFloat(len[1] as string) * 16 * 1000) / 1000}px`;
  return css.trim();
}

/**
 * `canonical`, with an `em` length also converted to px at the 16px root, as
 * 0.1.x converted every one. The guide lists font sizes, spacing and radii
 * this way: handing `1em` to `validate-guide`'s browser probe would resolve it
 * against the page body's font size instead, and change those verdicts.
 */
export function atRoot(css: string): string {
  const em = /^(-?\d*\.?\d+)em$/.exec(css.trim());
  return em ? `${Math.round(parseFloat(em[1] as string) * 16 * 1000) / 1000}px` : canonical(css);
}

function under(entries: Entry[], prefix: string): Entry[] {
  return entries.filter((e) => e.path.startsWith(prefix));
}

const nameAfter = (e: Entry, prefix: string): string => e.path.slice(prefix.length).split(".").map(kebab).join("-");

/** The guide states resolved values: a shadow whose colour is an alias lists the colour, not its variable. */
function record(entries: Entry[], prefix: string, map: (e: Entry) => string = (e) => canonical(e.resolvedCss)): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of under(entries, prefix)) out[nameAfter(e, prefix)] = map(e);
  return out;
}

/**
 * A length in px for ORDERING and for a media query: px as written, `rem` and
 * `em` at the 16px initial font size (a media query resolves `em` against the
 * initial value, not an element). Null for anything else. The guide still
 * writes an `em` tracking as `em` (see `canonical`); this is only how two
 * lengths are compared.
 */
const lengthPx = (s: string): number | null => {
  const m = /^(-?\d*\.?\d+)(px|rem|em)$/.exec(s.trim());
  if (!m) return null;
  const v = parseFloat(m[1] as string);
  return m[2] === "px" ? v : Math.round(v * 16 * 1000) / 1000;
};

/** Heading sizes: the declared scale steps above the `md` body step, or the whole scale when it has no `md`. */
export function headingSizes(scale: Record<string, string>): string[] {
  const body = scale["md"] !== undefined ? lengthPx(scale["md"]) : null;
  const all = Object.values(scale);
  if (body === null) return all;
  return all.filter((v) => (lengthPx(v) ?? 0) > body);
}

function tokensOf(entries: Entry[]): DesignTokens {
  // A breakpoint the guide cannot state in px is refused, never dropped from the guide.
  const breakpoints: Record<string, number> = {};
  for (const e of under(entries, "layout.breakpoint.")) {
    const v = canonical(e.resolvedCss);
    const n = lengthPx(v);
    if (n === null) throw new Error(`${e.path} is ${v}; a guide breakpoint is a px, rem or em length`);
    breakpoints[nameAfter(e, "layout.breakpoint.")] = n;
  }
  return {
    colors: record(entries, "color."),
    typography: {
      fontFamilies: record(entries, "type.family."),
      fontSizes: record(entries, "type.scale.", (e) => atRoot(e.resolvedCss)),
      fontWeights: record(entries, "type.weight."),
      lineHeights: record(entries, "type.leading."),
      letterSpacings: record(entries, "type.tracking."),
    },
    spacing: record(entries, "space.scale.", (e) => atRoot(e.resolvedCss)),
    borderRadius: record(entries, "space.radius.", (e) => atRoot(e.resolvedCss)),
    shadows: record(entries, "space.depth."),
    breakpoints,
  };
}

const unique = (xs: string[]): string[] => [...new Set(xs)];

/** The root class of a kit component: its first rule's selector, written by `statesRule`. */
function rootClass(e: KitEntry): string {
  return (e.styles.rules[0] as { selector: string }).selector;
}

export function buildGuide(name: string, entries: Entry[], kit: readonly KitEntry[] = COMPONENTS): StyleGuideConfig {
  const tokens = tokensOf(entries);
  const rules: StyleRule[] = [];
  const rule = (r: Omit<StyleRule, "severity">): void => {
    rules.push({ ...r, severity: "error" });
  };

  const palette = unique(Object.values(tokens.colors));
  if (palette.length > 0) {
    rule({
      id: "palette-color",
      description: "Text colour is a colour role of the declared palette.",
      constraints: [{ type: "oneOf", property: "color", values: palette }],
    });
    rule({
      id: "palette-background-color",
      description: "Background colour is a colour role of the declared palette, or transparent.",
      constraints: [{ type: "oneOf", property: "backgroundColor", values: [...palette, "rgba(0, 0, 0, 0)"] }],
    });
  }

  const sizes = unique(Object.values(tokens.typography.fontSizes));
  if (sizes.length > 0) {
    rule({
      id: "font-size-on-scale",
      description: "Font size is a step of the declared type scale.",
      constraints: [{ type: "oneOf", property: "fontSize", values: sizes }],
    });
    const headings = headingSizes(tokens.typography.fontSizes);
    if (headings.length > 0) {
      rule({
        id: "heading-size-on-scale",
        description: "A heading's size is a declared scale step above the body step.",
        elementType: "heading",
        constraints: [{ type: "oneOf", property: "fontSize", values: unique(headings) }],
      });
    }
  }

  const radii = unique([...Object.values(tokens.borderRadius), ...Object.values(tokens.spacing), "0px"]);
  if (Object.keys(tokens.borderRadius).length > 0) {
    rule({
      id: "border-radius-on-scale",
      description: "Border radius is a declared radius (or a spacing step for a pill), never a literal.",
      constraints: [{ type: "oneOf", property: "borderRadius", values: radii }],
    });
  }

  // One rule per kit role: the component declares its state matrix (STATES_PROPERTY).
  for (const k of kit) {
    rule({
      id: `${kebab(k.def.name)}-states-declared`,
      description: `${k.def.name} declares its state matrix: ${k.def.states.join(", ")}.`,
      selector: rootClass(k),
      elementType: k.styles.elementType,
      constraints: [{ type: "exact", property: STATES_PROPERTY, value: JSON.stringify(k.def.states.join(" ")) }],
    });
  }
  // A control that is not the kit's (a hand-rolled button) declares no state matrix at all.
  const buttonStates = unique(kit.filter((k) => k.styles.elementType === "button").map((k) => JSON.stringify(k.def.states.join(" "))));
  if (buttonStates.length > 0) {
    rule({
      id: "button-state-declaration",
      description: "Every button declares a state matrix; one that does not is not a kit component.",
      elementType: "button",
      constraints: [{ type: "oneOf", property: STATES_PROPERTY, values: buttonStates }],
    });
  }

  return { version: GUIDE_VERSION, name, description: GENERATED_HEADER, tokens, rules };
}

export function emitGuide(name: string, entries: Entry[]): string {
  return JSON.stringify(buildGuide(name, entries), null, 2) + "\n";
}
