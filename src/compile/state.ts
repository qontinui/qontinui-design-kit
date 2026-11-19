/**
 * `undeclared` is a compile state (plan D2): the compiler classifies every
 * group, lists every undeclared leaf, and never substitutes a default.
 */
import type { GroupName, Leaf, SourceKind } from "../source/schema.js";
import { GROUPS } from "../source/schema.js";

export type GroupState = "declared" | "resolved" | "authored" | "undeclared" | "mixed";

export interface GroupReport {
  state: GroupState;
  leaves: number;
  counts: Record<SourceKind, number>;
}

const emptyCounts = (): Record<SourceKind, number> => ({ declared: 0, resolved: 0, authored: 0, derived: 0, undeclared: 0 });

/** A `derived` leaf is a rule the source states without a literal, so it classifies as authored. */
function stateOf(counts: Record<SourceKind, number>): GroupState {
  const present: GroupState[] = [];
  if (counts.declared > 0) present.push("declared");
  if (counts.resolved > 0) present.push("resolved");
  if (counts.authored + counts.derived > 0) present.push("authored");
  if (counts.undeclared > 0 && present.length === 0) return "undeclared";
  // A group holding both value-bearing leaves and undeclared ones is mixed.
  if (counts.undeclared > 0) return "mixed";
  if (present.length === 0) return "undeclared";
  return present.length === 1 ? (present[0] as GroupState) : "mixed";
}

export function classifyGroups(leaves: Leaf[]): Record<GroupName, GroupReport> {
  const out = {} as Record<GroupName, GroupReport>;
  for (const g of GROUPS) {
    const counts = emptyCounts();
    let n = 0;
    for (const l of leaves) {
      if (l.group !== g) continue;
      counts[l.source.kind]++;
      n++;
    }
    out[g] = { state: stateOf(counts), leaves: n, counts };
  }
  return out;
}

export interface UndeclaredEntry {
  path: string;
  reason: string;
}

export interface ProvenanceEntry {
  path: string;
  source: string;
  stage: "draft";
}

export function undeclaredLeaves(leaves: Leaf[]): UndeclaredEntry[] {
  return leaves
    .filter((l) => l.source.kind === "undeclared")
    .map((l) => ({ path: l.path, reason: typeof l.inputs?.["reason"] === "string" ? (l.inputs["reason"] as string) : "stated undeclared in the source" }));
}

/** Every authored leaf with no notification_ref: reported, stage draft, never an error. */
export function unverifiedProvenance(leaves: Leaf[]): ProvenanceEntry[] {
  return leaves
    .filter((l) => l.source.kind === "authored" && l.source.arg === null)
    .map((l) => ({ path: l.path, source: "authored", stage: "draft" as const }));
}

/** The first group, in canonical order, whose state is undeclared. */
export function nextUndeclaredGroup(groups: Record<GroupName, GroupReport>): GroupName | null {
  for (const g of GROUPS) if (groups[g].state === "undeclared") return g;
  return null;
}
