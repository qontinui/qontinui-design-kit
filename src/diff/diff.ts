/**
 * `design-kit diff --base <ref>` (plan D6): a loosening is marked, never
 * failed. Every budget or threshold whose bound moved toward permissive is
 * listed as a `LOOSENED` line. The moved check's `check_version` changes, which
 * returns it to `draft` (plan D5). The verb exits 0 whatever it finds.
 */
import type { ThresholdEntry } from "../emit/budgets.js";

export interface Move {
  kind: "LOOSENED" | "MOVED";
  check: string;
  from: string;
  to: string;
  note?: string;
}

const show = (v: unknown): string => (v === null || v === undefined ? "undeclared" : String(v));

/**
 * Compare the base's entries with the current ones. A `max` bound that rose, a
 * `min` bound that fell, a bound that was removed or withdrawn (undeclared) is
 * `LOOSENED`. A change in a bound with no declared direction is `MOVED`: it
 * cannot be called permissive or strict, so it is listed and not claimed.
 */
export function compareBounds(base: readonly ThresholdEntry[], now: readonly ThresholdEntry[]): Move[] {
  const current = new Map(now.map((e) => [e.check, e]));
  const moves: Move[] = [];
  for (const b of base) {
    if (b.value === null || b.value === undefined) continue;
    const n = current.get(b.check);
    const bound = b.bound;
    if (n === undefined || n.value === null || n.value === undefined) {
      if (bound !== "none") moves.push({ kind: "LOOSENED", check: b.check, from: show(b.value), to: n === undefined ? "removed" : "undeclared" });
      continue;
    }
    if (n.value === b.value) continue;
    if (typeof b.value === "number" && typeof n.value === "number" && bound !== "none") {
      const looser = bound === "max" ? n.value > b.value : n.value < b.value;
      if (looser) moves.push({ kind: "LOOSENED", check: b.check, from: show(b.value), to: show(n.value) });
      continue;
    }
    moves.push({ kind: "MOVED", check: b.check, from: show(b.value), to: show(n.value), note: "direction not declared" });
  }
  return moves.sort((a, b) => (a.check < b.check ? -1 : a.check > b.check ? 1 : 0));
}

export function formatMove(m: Move): string {
  return `${m.kind} ${m.check} ${m.from} -> ${m.to}${m.note ? ` (${m.note})` : ""}`;
}

export function stepSummary(base: string, moves: Move[]): string {
  const loosened = moves.filter((m) => m.kind === "LOOSENED");
  const lines = [`### design-kit: bounds changed against \`${base}\``, ""];
  if (moves.length === 0) lines.push("No budget or threshold moved.");
  else lines.push(...moves.map((m) => `- \`${formatMove(m)}\``));
  lines.push("", `${loosened.length} loosened. A loosened check returns to \`draft\` (its \`check_version\` changed). Marked, not failed.`, "");
  return lines.join("\n");
}
