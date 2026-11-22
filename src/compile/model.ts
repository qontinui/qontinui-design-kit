import type { GroupName, ValueType } from "../source/schema.js";

/** One value-bearing entry the emitters write. */
export interface Entry {
  path: string;
  group: GroupName;
  type: ValueType | null;
  /** The alias-resolved value. */
  value: unknown;
  /**
   * Its CSS spelling, as `tokens.css` writes it. A field of a composite value
   * that is an alias (a shadow's `color: "{color.glow.primary}"`) is written as
   * that leaf's variable, `var(--dk-color-glow-primary)`, so a palette change on
   * the root element flows through (`theme.css` reads this variable, so it
   * follows too). An override on a subtree does not: the shadow's own variable
   * is substituted where it is declared, on `:root`.
   */
  css: string;
  /** Its CSS spelling with every alias replaced by the value it names: the guide's and `tokens.ts`'s spelling. */
  resolvedCss: string;
  /** `leaf`: stated or resolved by the source; `system-fallback`: a platform keyword for an undeclared identity role (plan D3). */
  origin: "leaf" | "system-fallback";
}
