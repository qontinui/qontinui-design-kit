import type { Entry } from "../compile/model.js";
import { GENERATED_HEADER, varName } from "./names.js";

type Tree = { [k: string]: Tree | string };

function nest(entries: Entry[], pick: (e: Entry) => string): Tree {
  const root: Tree = {};
  for (const e of entries) {
    const segs = e.path.split(".");
    let node = root;
    for (const s of segs.slice(0, -1)) {
      const next = node[s];
      if (typeof next === "string") throw new Error(`token path ${e.path} collides with the value at ${s}`);
      node = (node[s] ??= {}) as Tree;
    }
    const leafKey = segs[segs.length - 1] as string;
    if (typeof node[leafKey] === "object") throw new Error(`token path ${e.path} collides with a group of the same name`);
    node[leafKey] = pick(e);
  }
  return root;
}

/** `tokens.ts`: typed constants. `tokens` holds values, `vars` the `var(--dk-*)` reads, `identity` D3's state. */
export function emitTokensTs(entries: Entry[], identity: "declared" | "undeclared", undeclared: string[]): string {
  // `tokens` holds values (every alias resolved); `vars` the reads that follow a runtime change.
  const tokens = nest(entries, (e) => e.resolvedCss);
  const vars = nest(entries, (e) => `var(${varName(e.path)})`);
  return [
    `// ${GENERATED_HEADER}`,
    `export const identity = ${JSON.stringify(identity)} as const;`,
    `export const tokens = ${JSON.stringify(tokens, null, 2)} as const;`,
    `export const vars = ${JSON.stringify(vars, null, 2)} as const;`,
    `export const undeclared = ${JSON.stringify(undeclared, null, 2)} as const;`,
    "",
  ].join("\n");
}
