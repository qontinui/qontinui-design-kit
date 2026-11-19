/**
 * The design-language source format: `design/language.dtcg.json`, a DTCG
 * (2025.10) interchange document with a `qontinui` `$extensions` block.
 *
 * Every leaf carries a `source` (plan D2): `declared`, `resolved(<package>@<ref>)`,
 * `authored(<notification_ref>)`, `derived(<rule>)` or `undeclared`.
 * `undeclared` is a compile state, never a default.
 */

/** The groups a source may carry. Anything else at the top level is an error. */
export const GROUPS = [
  "color",
  "type",
  "space",
  "layout",
  "motion",
  "states",
  "budgets",
  "thresholds",
  "imagery",
  "exceptions",
] as const;
export type GroupName = (typeof GROUPS)[number];

/** The groups the Phase 2 emitters turn into CSS/TS values. */
export const EMITTED_GROUPS: readonly GroupName[] = ["color", "type", "space", "layout", "motion"];

export type SourceKind = "declared" | "resolved" | "authored" | "derived" | "undeclared";

export interface Source {
  kind: SourceKind;
  /** `resolved`: `<package>@<ref>`; `authored`: the notification_ref; `derived`: the rule. */
  arg: string | null;
}

/** `$type` values the compiler knows how to render. */
export const VALUE_TYPES = [
  "color",
  "dimension",
  "duration",
  "cubicBezier",
  "fontFamily",
  "fontWeight",
  "number",
  "shadow",
  "string",
  "boolean",
] as const;
export type ValueType = (typeof VALUE_TYPES)[number];

/** A rule a leaf states instead of a literal (recorded `derived(rule)` with its inputs). */
export type DeriveSpec =
  | { rule: "modular-scale"; from: number; ratio: number; step: number; unit: string }
  | { rule: "spacing-multiple"; base: number; multiple: number; unit: string };

export interface Leaf {
  /** Dotted path, e.g. `color.role.surface`. */
  path: string;
  group: GroupName;
  type: ValueType | null;
  /** The DTCG `$value` (possibly an alias string `{a.b}`), or null for `undeclared` / unresolved `derived`. */
  value: unknown;
  source: Source;
  derive: DeriveSpec | null;
  /** Extra inputs an adapter used (e.g. the surface unit a resolved type scale was multiplied by). */
  inputs: Record<string, unknown> | null;
}

/** The groups an `import` entry may ask a package adapter for. */
export const IMPORT_GROUPS = ["color", "fontFamilies", "typeScale", "durations", "easings", "reducedMotion"] as const;
export type ImportGroup = (typeof IMPORT_GROUPS)[number];

export interface ImportSpec {
  package: string;
  /** A git ref (sha, tag) to build the package at. Absent: the installed version. */
  ref: string | null;
  /** Which export groups to read. Absent: all of them. */
  groups: ImportGroup[] | null;
}

export interface CraftInputs {
  /** Pairs of colour paths [foreground, background] to check with the contrast band. */
  contrastPairs: [string, string][];
}

export interface DesignSource {
  name: string;
  imports: ImportSpec[];
  craft: CraftInputs;
  leaves: Leaf[];
}

/**
 * Identity values: hue and chroma anchors (every `color` leaf), type families,
 * imagery style. The compiler refuses `authored(...)` on them (plan D2).
 */
export function isIdentityPath(path: string): boolean {
  const under = (prefix: string): boolean => path === prefix || path.startsWith(prefix + ".");
  return under("color") || under("type.family") || under("imagery.style");
}

/** The policy clause an identity refusal names. */
export const IDENTITY_CLAUSE = "ux-priorities/style-is-resolved-from-the-tenants-declared-visual-system";

export class SourceError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(problems.join("\n"));
    this.name = "SourceError";
    this.problems = problems;
  }
}
