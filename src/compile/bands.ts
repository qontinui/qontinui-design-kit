import { BANDS, contrastBand, inBand, motionDurationBand, singleLightSource, type BandName } from "../craft/arithmetic.js";
import type { DesignSource } from "../source/schema.js";
import { isMeasured } from "../source/value.js";
import type { Entry } from "./model.js";

export interface OutOfBand {
  path: string;
  check: BandName | "single-light-source";
  value: number | string;
  band: string;
}

const bandText = (c: BandName): string => `${BANDS[c].min}..${BANDS[c].max ?? "inf"} ${BANDS[c].unit}`;

/** Values outside a craft band. Listed in the report, never an error (plan Phase 3). */
export function outOfBand(entries: Entry[], source: DesignSource): OutOfBand[] {
  const out: OutOfBand[] = [];
  const byPath = new Map(entries.map((e) => [e.path, e]));

  for (const e of entries) {
    if (e.path.startsWith("type.leading.") && typeof e.value === "number") {
      const r = inBand("line-height", e.value);
      if (!r.ok) out.push({ path: e.path, check: "line-height", value: e.value, band: bandText("line-height") });
    } else if (e.path.startsWith("layout.measure.") && typeof e.value === "number") {
      const r = inBand("measure", e.value);
      if (!r.ok) out.push({ path: e.path, check: "measure", value: e.value, band: bandText("measure") });
    } else if (e.path.startsWith("motion.duration.") && isMeasured(e.value)) {
      const ms = e.value.unit === "s" ? e.value.value * 1000 : e.value.value;
      // A zero duration is a step, not a transition.
      if (ms !== 0 && !motionDurationBand(ms).ok) out.push({ path: e.path, check: "motion-duration", value: ms, band: bandText("motion-duration") });
    }
  }

  for (const [fg, ground] of source.craft.contrastPairs) {
    const a = byPath.get(fg);
    const b = byPath.get(ground);
    if (!a || !b || typeof a.value !== "string" || typeof b.value !== "string") continue;
    const r = contrastBand(a.value, b.value);
    if (r && !r.ok) out.push({ path: `${fg} on ${ground}`, check: "contrast", value: Math.round(r.value * 1000) / 1000, band: bandText("contrast") });
  }

  // Every layer of every shadow, an array shadow's layers included; a string layer states no readable offset.
  const layers = entries
    .filter((e) => e.path.startsWith("space.depth."))
    .flatMap((e) => (Array.isArray(e.value) ? e.value : [e.value]))
    .filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v));
  const num = (x: unknown): number => (isMeasured(x) ? x.value : typeof x === "number" ? x : 0);
  const offsets = layers.map((v) => ({ offsetX: num(v["offsetX"]), offsetY: num(v["offsetY"]) }));
  if (layers.length > 1 && !singleLightSource(offsets)) {
    out.push({ path: "space.depth", check: "single-light-source", value: layers.length, band: "one light source" });
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
