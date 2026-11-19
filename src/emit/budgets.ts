import { BANDS } from "../craft/arithmetic.js";
import type { Leaf } from "../source/schema.js";
import { boundOf, checkVersion, sourceOf, stageOf, type Bound, type Evidence, type Stage, type ThresholdSource } from "../threshold/stage.js";
import { GENERATED_HEADER } from "./names.js";

export interface ThresholdEntry {
  /** The leaf path (or, for a craft band, `craft.<band>.<min|max>`). */
  check: string;
  /** The bound's value; null when `undeclared`. Never 0 for an unknown. */
  value: unknown;
  bound: Bound;
  source: ThresholdSource;
  /** The leaf's own source spelling: `declared`, `authored(<ref>)`, `derived(craft-band)`, `undeclared`. */
  source_detail: string;
  /** A hash of the check's name and value; null when `undeclared`. */
  check_version: string | null;
  stage: Stage;
}

/**
 * The imagery thresholds `domain_spec/visual-system` lists as undeclared. A
 * source that states none of them still emits each as `undeclared`, so a check
 * that needs one reads UNKNOWN by construction. A source states one itself
 * (declared, or `undeclared` with a reason) to replace the default entry.
 */
export const UNDECLARED_IMAGERY_THRESHOLDS = [
  "imagery.threshold.image_resolution_sufficient.min_effective",
  "imagery.threshold.image_palette_within.max_delta_e",
] as const;

function spelling(l: Leaf): string {
  return l.source.arg === null ? l.source.kind : `${l.source.kind}(${l.source.arg})`;
}

function entryFor(l: Leaf, ev: Evidence): ThresholdEntry {
  const source = sourceOf(l.source.kind);
  const undeclared = source === "undeclared";
  const value = undeclared ? null : l.value;
  const version = undeclared ? null : checkVersion(l.path, value);
  return {
    check: l.path,
    value,
    bound: boundOf(l.path, l.bound),
    source,
    source_detail: spelling(l),
    check_version: version,
    stage: stageOf(source, version ?? "", ev),
  };
}

/** The craft bands as `draft` thresholds of the budget group (plan D5). */
function craftEntries(ev: Evidence): ThresholdEntry[] {
  const out: ThresholdEntry[] = [];
  for (const [name, band] of Object.entries(BANDS)) {
    const edges: [string, number | null, Bound][] = [
      ["min", band.min, "min"],
      ["max", band.max, "max"],
    ];
    for (const [edge, value, bound] of edges) {
      if (value === null) continue;
      const check = `craft.${name}.${edge}`;
      const version = checkVersion(check, value);
      out.push({ check, value, bound, source: "draft", source_detail: "derived(craft-band)", check_version: version, stage: stageOf("draft", version, ev) });
    }
  }
  return out;
}

const byCheck = (a: ThresholdEntry, b: ThresholdEntry): number => (a.check < b.check ? -1 : a.check > b.check ? 1 : 0);

export interface BudgetFiles {
  budgets: ThresholdEntry[];
  thresholds: ThresholdEntry[];
}

export function budgetEntries(leaves: Leaf[], ev: Evidence): BudgetFiles {
  const budgets = leaves.filter((l) => l.group === "budgets").map((l) => entryFor(l, ev));
  budgets.push(...craftEntries(ev));
  const stated = new Set(leaves.map((l) => l.path));
  const thresholds = leaves
    .filter((l) => l.group === "thresholds" || (l.group === "imagery" && l.path.startsWith("imagery.threshold.")))
    .map((l) => entryFor(l, ev));
  for (const p of UNDECLARED_IMAGERY_THRESHOLDS) {
    if (stated.has(p)) continue;
    thresholds.push({ check: p, value: null, bound: boundOf(p, undefined), source: "undeclared", source_detail: "undeclared", check_version: null, stage: "undeclared" });
  }
  return { budgets: budgets.sort(byCheck), thresholds: thresholds.sort(byCheck) };
}

/** `design-budgets.json`: the density budget and first-viewport counts, with the craft bands. */
export function emitBudgets(entries: ThresholdEntry[]): string {
  return JSON.stringify({ schema: 1, generated: GENERATED_HEADER, budgets: entries }, null, 2) + "\n";
}

/** `visual-system.thresholds.json`: per D5, each threshold carries value, source, check_version and stage. */
export function emitThresholds(entries: ThresholdEntry[]): string {
  return JSON.stringify({ schema: 1, generated: GENERATED_HEADER, thresholds: entries }, null, 2) + "\n";
}
