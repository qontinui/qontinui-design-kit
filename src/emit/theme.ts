import type { Entry } from "../compile/model.js";
import { GENERATED_HEADER, kebab, varName } from "./names.js";

/**
 * The Tailwind v4 variable a path maps to, or null when Tailwind has no
 * namespace for it. Spacing is dynamic in v4 (`calc(var(--spacing) * N)`), so
 * only `space.unit` is a theme variable.
 */
export function themeVariable(path: string): string | null {
  const segs = path.split(".").map(kebab);
  const [group, a, ...rest] = segs;
  const tail = rest.join("-");
  const named = (prefix: string): string | null => (tail || a ? `--${prefix}-${[a, tail].filter(Boolean).join("-")}` : null);
  switch (group) {
    case "color":
      // Roles are the utility names (`bg-surface`); any other colour (an imported
      // palette) lives under `palette-` so it can never collide with a role.
      return a === "role" ? `--color-${tail}` : named("color-palette");
    case "type":
      switch (a) {
        case "family":
          return `--font-${tail}`;
        case "scale":
          return `--text-${tail}`;
        case "weight":
          return `--font-weight-${tail}`;
        case "leading":
          return `--leading-${tail}`;
        case "tracking":
          return `--tracking-${tail}`;
        default:
          return null;
      }
    case "space":
      if (a === "unit" && rest.length === 0) return "--spacing";
      if (a === "radius") return `--radius-${tail}`;
      if (a === "depth") return `--shadow-${tail}`;
      return null;
    case "layout":
      return a === "breakpoint" ? `--breakpoint-${tail}` : null;
    case "motion":
      return a === "easing" ? `--ease-${tail}` : null;
    default:
      return null;
  }
}

/**
 * `theme.css`: an EXCLUSIVE Tailwind v4 theme. It begins `--*: initial`, which
 * removes every default (colours, type scale, breakpoints, the spacing base),
 * then re-defines the groups the source declares, each reading the
 * `--dk-*` property `tokens.css` carries. A group the source leaves undeclared
 * defines nothing, so its utilities do not exist. Arbitrary values are NOT
 * stopped by a theme (Probe 1); `design-kit lint-classes` covers them.
 */
export function emitTheme(entries: Entry[]): string {
  const seen = new Map<string, string>();
  const lines: string[] = [];
  for (const e of entries) {
    const v = themeVariable(e.path);
    if (v === null) continue;
    const prior = seen.get(v);
    if (prior) throw new Error(`theme variable ${v} is produced by both ${prior} and ${e.path}`);
    seen.set(v, e.path);
    lines.push(`  ${v}: var(${varName(e.path)});`);
  }
  return `/* ${GENERATED_HEADER} */\n@theme inline {\n  --*: initial;\n${lines.join("\n")}${lines.length ? "\n" : ""}}\n`;
}
