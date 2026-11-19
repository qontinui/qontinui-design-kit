import type { GroupName, ValueType } from "../source/schema.js";

/** One value-bearing entry the emitters write. */
export interface Entry {
  path: string;
  group: GroupName;
  type: ValueType | null;
  /** The alias-resolved value. */
  value: unknown;
  /** Its CSS spelling. */
  css: string;
  /** `leaf`: stated or resolved by the source; `system-fallback`: a platform keyword for an undeclared identity role (plan D3). */
  origin: "leaf" | "system-fallback";
}
