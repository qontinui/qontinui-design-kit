/**
 * The craft arithmetic the design-loop report names, as pure functions, each
 * with its band. The bands are the `draft` thresholds of the budget group
 * (plan D5): they are not errors, and a value outside one is listed in the
 * compile report, never refused.
 */

export interface Band {
  min: number;
  max: number | null;
  unit: string;
}

/** The bands, by check name. Inclusive at both edges. */
export const BANDS = {
  /** Body line height, a unitless ratio (120% to 145%). */
  "line-height": { min: 1.2, max: 1.45, unit: "ratio" },
  /** Measure, characters per line. */
  measure: { min: 45, max: 75, unit: "characters" },
  /** Interface motion duration. */
  "motion-duration": { min: 100, max: 300, unit: "ms" },
  /** Minimum OKLCH lightness difference between a text colour and its ground (0..1). */
  contrast: { min: 0.4, max: null, unit: "oklch-lightness" },
} as const satisfies Record<string, Band>;
export type BandName = keyof typeof BANDS;

export interface BandResult {
  check: BandName;
  value: number;
  band: Band;
  ok: boolean;
}

// Compare with a tolerance so 1.2 written as 120% (120 / 100 = 1.2) and the
// literal 1.2 land on the same side of the edge.
const EPS = 1e-9;

export function inBand(check: BandName, value: number): BandResult {
  const band: Band = BANDS[check];
  const ok = value >= band.min - EPS && (band.max === null || value <= band.max + EPS);
  return { check, value, band, ok };
}

export const lineHeightBand = (ratio: number): BandResult => inBand("line-height", ratio);
export const measureBand = (characters: number): BandResult => inBand("measure", characters);
export const motionDurationBand = (ms: number): BandResult => inBand("motion-duration", ms);

// ---------------------------------------------------------------------------
// Contrast from an OKLCH lightness difference
// ---------------------------------------------------------------------------

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Parse `#rgb`, `#rrggbb` (alpha, if any, is ignored). Returns 0..1 sRGB or null. */
export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1] as string;
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

/** OKLab lightness L (0..1) of an sRGB colour (Ottosson's matrices). */
export function oklchLightness(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map(srgbToLinear) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

/** |L(a) - L(b)| for two hex colours; null when either is not a hex colour. */
export function lightnessDifference(a: string, b: string): number | null {
  const ra = parseHex(a);
  const rb = parseHex(b);
  if (!ra || !rb) return null;
  return Math.abs(oklchLightness(ra) - oklchLightness(rb));
}

export function contrastBand(foreground: string, ground: string): BandResult | null {
  const d = lightnessDifference(foreground, ground);
  return d === null ? null : inBand("contrast", d);
}

// ---------------------------------------------------------------------------
// One shadow light source
// ---------------------------------------------------------------------------

export interface ShadowOffset {
  offsetX: number;
  offsetY: number;
}

/**
 * True when every non-zero offset sits in the same quadrant: a shadow cast
 * down-right and another cast up-left name two light sources.
 */
export function singleLightSource(shadows: ShadowOffset[]): boolean {
  let sx = 0;
  let sy = 0;
  for (const { offsetX, offsetY } of shadows) {
    const x = Math.sign(offsetX);
    const y = Math.sign(offsetY);
    if (x !== 0) {
      if (sx !== 0 && sx !== x) return false;
      sx = x;
    }
    if (y !== 0) {
      if (sy !== 0 && sy !== y) return false;
      sy = y;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// `derive` helpers: let a source state a rule instead of a literal
// ---------------------------------------------------------------------------

const round = (n: number): number => Math.round(n * 1000) / 1000;

/** `scale: ratio(1.25) from 17px`: the value `step` steps from `from` (step 0 is `from`). */
export function modularScale(from: number, ratio: number, step: number): number {
  return round(from * ratio ** step);
}

/** A spacing scale: `multiple` times a base unit. */
export function spacingMultiple(base: number, multiple: number): number {
  return round(base * multiple);
}
