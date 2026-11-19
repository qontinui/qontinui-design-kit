/**
 * A threshold's stage is computed (plan D5), never granted:
 *
 * - `declared`  the owner or the tenant's visual system states the value
 *               (source `declared` or `resolved(...)`);
 * - `draft`     an agent-authored or derived value (advisory);
 * - `shown`     a draft whose exact `check_version` has a record in
 *               `design/threshold-evidence.json` showing the check failing on
 *               an injected violation. A value change changes `check_version`,
 *               so the record stops matching and the stage falls back to
 *               `draft` on the next compile;
 * - `undeclared` no value; a check that needs it reads UNKNOWN.
 *
 * The compiler never reads a merge state, so no stage here is a gate.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import type { SourceKind } from "../source/schema.js";

export type Stage = "declared" | "draft" | "shown" | "undeclared";
/** The `source` field of a threshold entry: who stands behind the value. */
export type ThresholdSource = "declared" | "draft" | "undeclared";
/** Which way a bound is permissive: a `max` bound loosens upward, a `min` bound downward. */
export type Bound = "max" | "min" | "none";

export interface EvidenceRecord {
  check: string;
  check_version: string;
  /** What was injected to make the check fail. */
  injected_violation: string;
  /** Must be `true`: the record shows the check failing. */
  failed: boolean;
  recorded_at?: string;
}

export interface Evidence {
  records: EvidenceRecord[];
}

/** A hash of the check's name and value. A different value is a different check. */
export function checkVersion(check: string, value: unknown): string {
  return createHash("sha256").update(`${check}\n${JSON.stringify(value)}`).digest("hex").slice(0, 16);
}

/** `declared` and `resolved` leaves are declarations; `authored` and `derived` are drafts. */
export function sourceOf(kind: SourceKind): ThresholdSource {
  if (kind === "declared" || kind === "resolved") return "declared";
  if (kind === "undeclared") return "undeclared";
  return "draft";
}

export function stageOf(source: ThresholdSource, version: string, evidence: Evidence): Stage {
  if (source === "declared") return "declared";
  if (source === "undeclared") return "undeclared";
  const shown = evidence.records.some((r) => r.check_version === version && r.failed === true);
  return shown ? "shown" : "draft";
}

/**
 * Which way a bound is permissive. An explicit `bound` wins; otherwise a leaf
 * named `max` / `max_*` / `*_max` is a max bound and `min` likewise.
 */
export function boundOf(path: string, explicit: unknown): Bound {
  if (explicit === "max" || explicit === "min" || explicit === "none") return explicit;
  const last = path.split(".").pop() ?? "";
  if (/(^|[_-])max($|[_-])/.test(last)) return "max";
  if (/(^|[_-])min($|[_-])/.test(last)) return "min";
  return "none";
}

/** Read `design/threshold-evidence.json`. An absent file is an empty record set, so every draft stays `draft`. */
export function loadEvidence(file: string): Evidence {
  if (!fs.existsSync(file)) return { records: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`cannot read ${file}: ${(e as Error).message}`);
  }
  const records = (raw as { records?: unknown }).records;
  if (!Array.isArray(records)) throw new Error(`${file}: expected { "records": [...] }`);
  const out: EvidenceRecord[] = [];
  for (const r of records) {
    const o = r as Partial<EvidenceRecord>;
    if (typeof o.check !== "string" || typeof o.check_version !== "string" || typeof o.failed !== "boolean") {
      throw new Error(`${file}: a record needs check, check_version and failed`);
    }
    out.push({
      check: o.check,
      check_version: o.check_version,
      injected_violation: typeof o.injected_violation === "string" ? o.injected_violation : "",
      failed: o.failed,
      ...(typeof o.recorded_at === "string" ? { recorded_at: o.recorded_at } : {}),
    });
  }
  return { records: out };
}
