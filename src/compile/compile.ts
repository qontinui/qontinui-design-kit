import fs from "node:fs";
import path from "node:path";
import { TOKEN_PACKAGE, loadTokenPackage, tokenLeaves, type LoadContext } from "../adapters/design-tokens.js";
import { budgetEntries, emitBudgets, emitThresholds } from "../emit/budgets.js";
import { emitGuide, guideFileName } from "../emit/guide.js";
import { varName } from "../emit/names.js";
import { emitTheme } from "../emit/theme.js";
import { loadEvidence } from "../threshold/stage.js";
import { emitTokensCss } from "../emit/tokens-css.js";
import { emitTokensTs } from "../emit/tokens-ts.js";
import { parseSource } from "../source/parse.js";
import {
  EMITTED_GROUPS,
  SourceError,
  type DesignSource,
  type GroupName,
  type Leaf,
  type SourceKind,
  type ValueType,
} from "../source/schema.js";
import { aliasTarget, cssValue } from "../source/value.js";
import { outOfBand, type OutOfBand } from "./bands.js";
import type { Entry } from "./model.js";
import { COLOR_ROLES, FONT_FAMILY_ROLES, STATE_MIX } from "./roles.js";
import {
  classifyGroups,
  nextUndeclaredGroup,
  undeclaredLeaves,
  unverifiedProvenance,
  type GroupReport,
  type ProvenanceEntry,
  type UndeclaredEntry,
} from "./state.js";

export interface CompileOptions {
  /** Path of `design/language.dtcg.json`. */
  sourcePath: string;
  /** The project root (where an installed token package is resolved from). Default: the cwd. */
  rootDir?: string;
  tokensRepo?: string;
  cacheDir?: string;
  /** `design/threshold-evidence.json`. Default: beside the source. Absent: every draft stays `draft`. */
  evidencePath?: string;
}

export interface CompileReport {
  schema: 1;
  name: string;
  groups: Record<GroupName, GroupReport>;
  /** `undeclared` when any identity role rendered as a platform keyword (plan D3). */
  identity: { state: "declared" | "undeclared"; system_fallbacks: string[] };
  undeclared: UndeclaredEntry[];
  unverified_provenance: ProvenanceEntry[];
  resolved_from: { package: string; ref: string | null; version: string; sha: string | null; label: string }[];
  /** Every leaf read from an imported package, with its `resolved(...)` label. */
  resolved_leaves: { path: string; source: string }[];
  derived: { path: string; rule: string; inputs: Record<string, unknown> }[];
  /** Import leaves the source states itself (the source wins). */
  imports_shadowed: string[];
  out_of_band: OutOfBand[];
  next_undeclared_group: GroupName | null;
}

export interface CompileResult {
  /** Output file name (relative to the out dir) -> content. */
  outputs: Record<string, string>;
  report: CompileReport;
  /** Every leaf after imports were merged. */
  leaves: Leaf[];
  /** Every value-bearing entry the emitters wrote, including the platform-keyword fallbacks. */
  entries: Entry[];
}

/** The fixed files `design-kit compile` writes; the guide is also written, named `<app>.styleguide.uibridge.json`. */
export const OUTPUT_FILES = ["tokens.css", "tokens.ts", "theme.css", "compile-report.json", "design-budgets.json", "visual-system.thresholds.json"] as const;

const byPath = <T extends { path: string }>(a: T, b: T): number => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

/** Does `candidate` equal, sit under, or sit above a path the source already states? */
function covered(stated: Set<string>, candidate: string): boolean {
  for (const s of stated) {
    if (s === candidate || s.startsWith(candidate + ".") || candidate.startsWith(s + ".")) return true;
  }
  return false;
}

async function mergeImports(source: DesignSource, ctx: LoadContext, report: Pick<CompileReport, "resolved_from" | "imports_shadowed">): Promise<Leaf[]> {
  const unitLeaf = source.leaves.find((l) => l.path === "type.unit");
  const surfaceUnit = unitLeaf && unitLeaf.source.kind !== "undeclared" && typeof unitLeaf.value === "number" ? unitLeaf.value : null;

  const stated = new Set(source.leaves.map((l) => l.path));
  const leaves = [...source.leaves];
  for (const spec of source.imports) {
    if (spec.package !== TOKEN_PACKAGE) {
      throw new SourceError([`import ${spec.package}: no adapter; the supported package is ${TOKEN_PACKAGE}`]);
    }
    const pkg = await loadTokenPackage(spec, ctx);
    report.resolved_from.push({ package: spec.package, ref: pkg.ref, version: pkg.version, sha: pkg.sha, label: pkg.label });
    for (const l of tokenLeaves(pkg, spec.groups, surfaceUnit).leaves) {
      if (covered(stated, l.path)) {
        report.imports_shadowed.push(l.path);
        continue;
      }
      leaves.push(l);
      stated.add(l.path);
    }
  }
  report.imports_shadowed.sort();
  return leaves;
}

/** An alias written inside a longer string (`0 0 12px {color.glow.primary}`). */
const EMBEDDED_ALIAS = /\{[^{}\s]+\}/;

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The leaf type a shadow field alias must name, by the field it fills (`layer`: an element of a shadow array). */
const SHADOW_SLOT_TYPES: Readonly<Record<string, ValueType>> = {
  color: "color",
  offsetX: "dimension",
  offsetY: "dimension",
  blur: "dimension",
  spread: "dimension",
  layer: "shadow",
};

/** A leaf's value with every alias resolved, and the spelling `tokens.css` writes (a composite field alias as its variable). */
interface Resolved {
  value: unknown;
  css: unknown;
}

/**
 * Resolve `{a.b}` aliases (cycle-checked) and render every value-bearing leaf.
 * A whole `$value` may be an alias, and so may each field of a shadow object
 * and each element of a shadow array, provided it names a leaf of the type
 * that field holds (`color` a colour, an offset, blur or spread a dimension,
 * an array element a one-layer shadow; `inset` is never an alias). An alias
 * inside any other composite value (a font-family list, a cubic-bezier) is
 * refused. An alias
 * that names no leaf, an undeclared leaf, or a leaf that emits no variable is
 * refused; so is an alias embedded in a longer string, which would otherwise
 * reach the CSS as literal `{a.b}` text.
 */
function entriesFor(leaves: Leaf[]): Entry[] {
  const byLeaf = new Map(leaves.map((l) => [l.path, l]));
  const targetOf = (owner: string, name: string): Leaf => {
    const t = byLeaf.get(name);
    if (!t) throw new SourceError([`leaf ${owner}: alias {${name}} names no leaf`]);
    if (t.source.kind === "undeclared") throw new SourceError([`leaf ${owner}: alias {${name}} points at an undeclared leaf`]);
    return t;
  };
  // A leaf's type, following whole-value aliases for one that states none.
  const typeOf = (l: Leaf): ValueType | null => {
    let cur: Leaf | undefined = l;
    for (let hops = 0; cur && hops < leaves.length; hops++) {
      if (cur.type !== null) return cur.type;
      const next = aliasTarget(cur.value);
      cur = next === null ? undefined : byLeaf.get(next);
    }
    return null;
  };
  const resolveLeaf = (l: Leaf, trail: string[]): Resolved => {
    if (trail.includes(l.path)) throw new SourceError([`alias cycle: ${[...trail, l.path].join(" -> ")}`]);
    const next = [...trail, l.path];
    const whole = aliasTarget(l.value);
    if (whole !== null) return resolveLeaf(targetOf(l.path, whole), next);
    return resolveParts(l.value, l, next, true, null);
  };
  // `slot` is the shadow field a value fills (`layer` for an array element), or null.
  const resolveParts = (v: unknown, owner: Leaf, trail: string[], top: boolean, slot: string | null): Resolved => {
    if (Array.isArray(v)) {
      const parts = v.map((x) => resolveParts(x, owner, trail, false, "layer"));
      return { value: parts.map((p) => p.value), css: parts.map((p) => p.css) };
    }
    if (isPlainObject(v)) {
      const value: Record<string, unknown> = {};
      const css: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) {
        const r = resolveParts(x, owner, trail, false, k);
        value[k] = r.value;
        css[k] = r.css;
      }
      return { value, css };
    }
    if (typeof v !== "string") return { value: v, css: v };
    const field = top ? null : aliasTarget(v);
    if (field !== null) {
      if (owner.type !== "shadow") {
        throw new SourceError([`leaf ${owner.path}: alias {${field}} inside a ${owner.type ?? "untyped"} value; only a shadow's fields and layers may be aliases`]);
      }
      if (slot === "inset") throw new SourceError([`leaf ${owner.path}: inset is true or false, never an alias`]);
      const t = targetOf(owner.path, field);
      if (!EMITTED_GROUPS.includes(t.group)) {
        throw new SourceError([`leaf ${owner.path}: alias {${field}} names a leaf in ${t.group}, which emits no CSS variable to read`]);
      }
      const need = slot === null ? undefined : SHADOW_SLOT_TYPES[slot];
      if (need === undefined) throw new SourceError([`leaf ${owner.path}: alias {${field}} fills ${slot ?? "no field"}, which is not a shadow field`]);
      // Resolve first, so a broken or cyclic chain behind the target is named as such, not as a type mismatch.
      const value = resolveLeaf(t, trail).value;
      const got = typeOf(t);
      if (got !== need) throw new SourceError([`leaf ${owner.path}: alias {${field}} fills ${slot}, which needs a ${need} leaf; ${t.path} is ${got ?? "untyped"}`]);
      if (slot === "layer" && Array.isArray(value)) {
        throw new SourceError([`leaf ${owner.path}: alias {${field}} names a multi-layer shadow; a shadow-array element is one layer`]);
      }
      return { value, css: `var(${varName(t.path)})` };
    }
    // A `string` leaf is free text; any other value cannot carry an alias inside a longer string.
    if ((owner.type !== "string" || !top) && EMBEDDED_ALIAS.test(v)) {
      throw new SourceError([`leaf ${owner.path}: an alias may be a whole value or a whole field of a composite value, not embedded in a string: ${JSON.stringify(v)}`]);
    }
    return { value: v, css: v };
  };
  const out: Entry[] = [];
  for (const l of leaves) {
    if (l.source.kind === "undeclared" || !EMITTED_GROUPS.includes(l.group)) continue;
    const r = resolveLeaf(l, []);
    // An alias takes the type of its target when it states none, through any number of alias hops.
    const type = typeOf(l);
    out.push({
      path: l.path,
      group: l.group,
      type,
      value: r.value,
      css: cssValue({ path: l.path, type, value: r.css }),
      resolvedCss: cssValue({ path: l.path, type, value: r.value }),
      origin: "leaf",
    });
  }
  return out;
}

/**
 * Plan D3: a role of an identity group (colour roles, type families) that the
 * source neither states nor imports renders as a platform keyword. The
 * fallbacks are separate entries marked `system-fallback`: never labelled
 * declared, never a palette or a face the fleet chose.
 */
function identityFallbacks(entries: Entry[]): Entry[] {
  const have = new Set(entries.map((e) => e.path));
  const out: Entry[] = [];
  const add = (p: string, group: GroupName, type: Entry["type"], css: string): void => {
    out.push({ path: p, group, type, value: css, css, resolvedCss: css, origin: "system-fallback" });
  };
  for (const r of COLOR_ROLES) {
    const p = `color.role.${r.name}`;
    if (have.has(p)) continue;
    add(p, "color", "color", r.keyword);
    if (r.mixWith) {
      for (const [state, pct] of Object.entries(STATE_MIX)) {
        const sp = `${p}-${state}`;
        if (!have.has(sp)) add(sp, "color", "color", `color-mix(in oklab, ${r.mixWith} ${pct}%, ${r.keyword})`);
      }
    }
  }
  for (const f of FONT_FAMILY_ROLES) {
    const p = `type.family.${f.name}`;
    if (!have.has(p)) add(p, "type", "fontFamily", f.keyword);
  }
  return out;
}

export async function compileSource(opts: CompileOptions): Promise<CompileResult> {
  const rootDir = opts.rootDir ?? process.cwd();
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(opts.sourcePath, "utf8"));
  } catch (e) {
    throw new SourceError([`cannot read ${opts.sourcePath}: ${(e as Error).message}`]);
  }
  const source = parseSource(raw);
  const partial = { resolved_from: [] as CompileReport["resolved_from"], imports_shadowed: [] as string[] };
  const loadCtx: LoadContext = { rootDir, ...(opts.tokensRepo ? { tokensRepo: opts.tokensRepo } : {}), ...(opts.cacheDir ? { cacheDir: opts.cacheDir } : {}) };
  const leaves = await mergeImports(source, loadCtx, partial);

  const valueEntries = entriesFor(leaves);
  const fallbacks = identityFallbacks(valueEntries);
  const entries = [...valueEntries, ...fallbacks].sort(byPath);

  const groups = classifyGroups(leaves);
  const stated = undeclaredLeaves(leaves);
  const statedPaths = new Set(stated.map((u) => u.path));
  const undeclared = [
    ...stated,
    ...fallbacks
      .filter((f) => !/-(hover|active)$/.test(f.path) && !statedPaths.has(f.path))
      .map((f) => ({ path: f.path, reason: "identity role not stated or imported; renders as a platform keyword" })),
  ].sort(byPath);

  const report: CompileReport = {
    schema: 1,
    name: source.name,
    groups,
    identity: { state: fallbacks.length > 0 ? "undeclared" : "declared", system_fallbacks: fallbacks.map((f) => f.path).sort() },
    undeclared,
    unverified_provenance: unverifiedProvenance(leaves).sort(byPath),
    resolved_from: partial.resolved_from,
    resolved_leaves: leaves
      .filter((l) => l.source.kind === "resolved")
      .map((l) => ({ path: l.path, source: `resolved(${l.source.arg})` }))
      .sort(byPath),
    derived: leaves
      .filter((l) => l.source.kind === "derived" && l.derive)
      .map((l) => ({ path: l.path, rule: (l.derive as NonNullable<Leaf["derive"]>).rule, inputs: l.inputs ?? {} }))
      .sort(byPath),
    imports_shadowed: partial.imports_shadowed,
    out_of_band: outOfBand(entries, source),
    next_undeclared_group: nextUndeclaredGroup(groups),
  };

  const evidencePath = opts.evidencePath ?? path.join(path.dirname(opts.sourcePath), "threshold-evidence.json");
  const budgets = budgetEntries(leaves, loadEvidence(evidencePath));

  const outputs: Record<string, string> = {
    "tokens.css": emitTokensCss(entries),
    "tokens.ts": emitTokensTs(entries, report.identity.state, undeclared.map((u) => u.path)),
    "theme.css": emitTheme(entries),
    "compile-report.json": JSON.stringify(report, null, 2) + "\n",
    [guideFileName(source.name)]: emitGuide(source.name, entries),
    "design-budgets.json": emitBudgets(budgets.budgets),
    "visual-system.thresholds.json": emitThresholds(budgets.thresholds),
  };
  return { outputs, report, leaves, entries };
}

/** Write the outputs under `outDir`. */
export function writeOutputs(outDir: string, outputs: Record<string, string>): void {
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, content] of Object.entries(outputs)) fs.writeFileSync(path.join(outDir, name), content);
}

/** The output files whose committed content differs from a fresh compile (missing counts as different). */
export function driftedOutputs(outDir: string, outputs: Record<string, string>): string[] {
  const drifted: string[] = [];
  for (const [name, content] of Object.entries(outputs)) {
    const file = path.join(outDir, name);
    if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== content) drifted.push(name);
  }
  return drifted;
}

export type { SourceKind };
