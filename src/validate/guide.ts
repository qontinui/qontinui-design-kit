/**
 * `design-kit validate-guide <guide> <url|file>`: the first evaluator of a
 * `.styleguide.uibridge.json` anywhere in the fleet. It reads the page's
 * elements through the published exec door (`getDesignSnapshot`), then runs
 * `validateElement` from the published `@qontinui/ui-bridge` package over each.
 *
 * A guide token may be spelled the way the source states it (`Canvas`,
 * `color-mix(...)`, `1rem`); the browser canonicalises every constraint value to
 * its computed form first, because `validateElement` compares computed strings.
 */
import fs from "node:fs";
import { evalValue, openPage, runDoor } from "../door/inject.js";
import { STYLESHEET_LOAD_EXPRESSION, stylesheetLoad, stylesheetMissing, type StylesheetLoad } from "../door/stylesheets.js";
import type { StyleConstraint, StyleGuideConfig, StyleRule } from "../emit/guide.js";

export interface GuideFailure {
  elementId: string;
  ruleId: string;
  severity: "error" | "warning" | "info";
  messages: string[];
}

export interface GuideReport {
  guide: string;
  elements: number;
  rules: number;
  failures: GuideFailure[];
  /** Rules that matched no element on the page: not a failure, but not a pass either. */
  unmatchedRules: string[];
  /** The page's linked stylesheets; any failed one makes the run UNKNOWN (exit 3), never a verdict. */
  stylesheets: StylesheetLoad;
  instrument: string;
}

type Pair = [string, string];

function constraintValues(c: StyleConstraint): string[] {
  return c.type === "exact" ? [c.value] : c.values;
}

/** Page-side: the computed spelling of each (property, value) pair; an invalid pair comes back unchanged. */
export function canonicalizeExpression(pairs: Pair[]): string {
  return `(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;left:-9999px;top:0';
    document.body.appendChild(probe);
    const out = ${JSON.stringify(pairs)}.map(([p, v]) => {
      probe.style[p] = '';
      probe.style[p] = v;
      const c = probe.style[p] ? getComputedStyle(probe)[p] : null;
      probe.style[p] = '';
      return c === null || c === '' ? v : c;
    });
    probe.remove();
    return out;
  })()`;
}

/** Replace every constraint value with its canonical spelling (`map` is keyed by `property\0value`). */
export function applyCanonical(rules: StyleRule[], map: ReadonlyMap<string, string>): StyleRule[] {
  const sub = (property: string, v: string): string => map.get(`${property}\0${v}`) ?? v;
  return rules.map((r) => ({
    ...r,
    constraints: r.constraints.map((c): StyleConstraint =>
      c.type === "exact" ? { ...c, value: sub(c.property, c.value) } : { ...c, values: c.values.map((v) => sub(c.property, v)) },
    ),
  }));
}

export function pairsOf(rules: StyleRule[]): Pair[] {
  const seen = new Set<string>();
  const out: Pair[] = [];
  for (const r of rules) {
    for (const c of r.constraints) {
      if (c.property.startsWith("--")) continue;
      for (const v of constraintValues(c)) {
        const k = `${c.property}\0${v}`;
        if (!seen.has(k)) {
          seen.add(k);
          out.push([c.property, v]);
        }
      }
    }
  }
  return out;
}

export function readGuide(file: string): StyleGuideConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`cannot read guide ${file}: ${(e as Error).message}`);
  }
  const g = raw as Partial<StyleGuideConfig>;
  if (typeof g.version !== "string" || typeof g.name !== "string" || typeof g.tokens !== "object" || !Array.isArray(g.rules)) {
    throw new Error(`${file}: not a StyleGuideConfig (needs version, name, tokens, rules)`);
  }
  return g as StyleGuideConfig;
}

/** Run `validateElement` over elements; used by the CLI and, with synthetic elements, by the tests. */
export async function validateElements(guide: StyleGuideConfig, rules: StyleRule[], elements: unknown[]): Promise<GuideFailure[]> {
  return (await validateElementsDetailed(guide, rules, elements)).failures;
}

/** As `validateElements`, and which rules matched at least one element. */
export async function validateElementsDetailed(
  guide: StyleGuideConfig,
  rules: StyleRule[],
  elements: unknown[],
): Promise<{ failures: GuideFailure[]; matched: Set<string> }> {
  const specs = await import("@qontinui/ui-bridge/specs");
  const failures: GuideFailure[] = [];
  const matched = new Set<string>();
  for (const el of elements) {
    const results = specs.validateElement(el as Parameters<typeof specs.validateElement>[0], rules as Parameters<typeof specs.validateElement>[1], guide.tokens as Parameters<typeof specs.validateElement>[2]);
    for (const r of results) {
      matched.add(r.ruleId);
      if (r.passed) continue;
      failures.push({
        elementId: r.elementId,
        ruleId: r.ruleId,
        severity: r.severity,
        messages: r.constraintResults.filter((c) => !c.passed).map((c) => c.message ?? `${c.constraint.property} failed`),
      });
    }
  }
  return { failures, matched };
}

export async function validateGuide(guideFile: string, target: string, rootDir: string): Promise<GuideReport> {
  const guide = readGuide(guideFile);
  const pairs = pairsOf(guide.rules);
  const page = await openPage(target);
  try {
    const run = await runDoor(rootDir, page.url, [
      { action: "discover", payload: {} },
      { action: "getDesignSnapshot", payload: { limit: 1000 } },
      { action: "pageEvaluate", payload: { expression: canonicalizeExpression(pairs) } },
      { action: "pageEvaluate", payload: { expression: STYLESHEET_LOAD_EXPRESSION } },
    ]);
    const snap = run.lines[1]?.result as { elements?: unknown[]; truncated?: boolean } | undefined;
    const canon = evalValue(run.lines[2]);
    if (!snap?.elements || !Array.isArray(canon)) {
      throw new Error(`unknown(instrument-cannot-read): ${run.instrument} gave no design snapshot (${run.stderr.slice(0, 160).replace(/\s+/g, " ")})`);
    }
    // A missing sheet leaves the page on browser defaults: whatever the rules say about it is not about the design.
    const stylesheets = stylesheetLoad(evalValue(run.lines[3]), page.url, page.missed());
    if (!stylesheets) throw new Error(`unknown(instrument-cannot-read): ${run.instrument} did not answer the stylesheet-load check`);
    if (stylesheets.failed.length > 0) {
      throw new Error(`${stylesheetMissing(stylesheets.failed)}; a guide evaluated without its stylesheets reads browser defaults, not the page`);
    }
    if (snap.elements.length === 0) throw new Error("unknown(no-elements): the page returned no registered elements; a guide that read nothing is not a pass");
    if (snap.truncated) throw new Error("unknown(snapshot-truncated): the page has more elements than one snapshot returns");
    if (canon.length !== pairs.length) throw new Error("unknown(instrument-cannot-read): the canonicalisation answered a different number of values than asked");
    const map = new Map<string, string>();
    pairs.forEach(([p, v], i) => map.set(`${p}\0${v}`, String(canon[i])));
    const rules = applyCanonical(guide.rules, map);
    const { failures, matched } = await validateElementsDetailed(guide, rules, snap.elements);
    const unmatchedRules = rules.map((r) => r.id).filter((id) => !matched.has(id));
    return { guide: guideFile, elements: snap.elements.length, rules: rules.length, failures, unmatchedRules, stylesheets, instrument: run.instrument };
  } finally {
    await page.close();
  }
}
