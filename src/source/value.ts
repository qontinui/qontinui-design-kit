import type { Leaf } from "./schema.js";

/** A dimension or duration value: `{ value, unit }` (DTCG 2025.10) or a plain CSS string. */
export interface Measured {
  value: number;
  unit: string;
}

export function isMeasured(v: unknown): v is Measured {
  return (
    typeof v === "object" && v !== null && typeof (v as Measured).value === "number" && typeof (v as Measured).unit === "string"
  );
}

function measured(v: unknown): string {
  if (typeof v === "string") return v;
  if (isMeasured(v)) return `${v.value}${v.unit}`;
  if (typeof v === "number") return String(v);
  throw new Error(`not a dimension: ${JSON.stringify(v)}`);
}

function fontFamily(v: unknown): string {
  // A string is an already-formed CSS font stack; an array is a list of names.
  if (typeof v === "string") return v;
  if (!Array.isArray(v)) throw new Error("expected a string or an array of names");
  return (v as string[]).map((n) => (/[\s"]/.test(n) ? JSON.stringify(n) : n)).join(", ");
}

/**
 * One shadow layer: `[inset] offsetX offsetY blur spread color` (DTCG 2025.10
 * shadow fields). A string layer is an already-formed CSS shadow.
 */
function shadowLayer(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error("a shadow layer is an object or a string");
  const s = v as Record<string, unknown>;
  if (s["inset"] !== undefined && typeof s["inset"] !== "boolean") throw new Error("inset must be true or false");
  if (typeof s["color"] !== "string") throw new Error("a shadow layer needs a color");
  const parts = [measured(s["offsetX"]), measured(s["offsetY"]), measured(s["blur"]), measured(s["spread"] ?? "0px"), s["color"]];
  return (s["inset"] === true ? "inset " : "") + parts.join(" ");
}

/**
 * The CSS spelling of a leaf's value. Throws on a value that has no CSS form.
 * The compiler passes it twice: once with each composite-field alias as its
 * `var(--dk-*)` read (tokens.css), once with every alias resolved (the guide).
 */
export function cssValue(leaf: Pick<Leaf, "type" | "value" | "path">): string {
  const { type, value } = leaf;
  try {
    switch (type) {
      case "dimension":
      case "duration":
        return measured(value);
      case "cubicBezier": {
        if (!Array.isArray(value) || value.length !== 4) throw new Error("expected four control points");
        return `cubic-bezier(${value.join(", ")})`;
      }
      case "fontFamily":
        return fontFamily(value);
      case "shadow": {
        // A list of layers is one comma-separated box-shadow.
        if (Array.isArray(value)) {
          if (value.length === 0) throw new Error("an empty shadow list");
          return value.map(shadowLayer).join(", ");
        }
        return shadowLayer(value);
      }
      default:
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
        throw new Error("no CSS form");
    }
  } catch (e) {
    throw new Error(`leaf ${leaf.path}: cannot render ${JSON.stringify(value)} as ${type ?? "untyped"} (${(e as Error).message})`);
  }
}

const ALIAS = /^\{([^{}]+)\}$/;

/** `{a.b.c}` → `a.b.c`, or null when the value is not an alias. */
export function aliasTarget(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = ALIAS.exec(value);
  return m ? (m[1] as string) : null;
}
