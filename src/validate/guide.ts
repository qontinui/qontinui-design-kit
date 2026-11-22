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
import { evalValue, isUrlTarget, openPage, runDoor } from "../door/inject.js";
import { STYLESHEET_LOAD_EXPRESSION, mergeStylesheetLoads, stylesheetLoad, stylesheetUnknown, type StylesheetLoad } from "../door/stylesheets.js";
import type { StyleConstraint, StyleGuideConfig, StyleRule } from "../emit/guide.js";

export interface GuideFailure {
  elementId: string;
  ruleId: string;
  severity: "error" | "warning" | "info";
  messages: string[];
}

export interface GuideReport {
  guide: string;
  /** The page as given: a URL or a local file. */
  target: string;
  elements: number;
  rules: number;
  failures: GuideFailure[];
  /** Rules that matched no element on the page: not a failure, but not a pass either. */
  unmatchedRules: string[];
  /** The page's linked stylesheets; a failed, pending or unreadable one makes the run UNKNOWN (exit 3), never a verdict. */
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

/** What a run that stopped at UNKNOWN still knows: null where it never got that far. */
export interface GuidePartial {
  guide: string;
  target: string;
  rules: number;
  elements: number | null;
  stylesheets: StylesheetLoad | null;
  instrument: string | null;
}

/** An `unknown(...)` verdict (exit 3) that carries what the run had read when it stopped. */
export class GuideUnknown extends Error {
  readonly partial: GuidePartial;
  constructor(message: string, partial: GuidePartial) {
    super(message);
    this.name = "GuideUnknown";
    this.partial = partial;
  }
}

/** What `validate-guide --json` writes: the report, its exit code, and on exit 3 the `unknown(...)` reason. */
export interface GuideJson {
  schema: 1;
  guide: string;
  target: string;
  exitCode: 0 | 1 | 3;
  /** The `unknown(...)` reason on exit 3, else null. */
  unknown: string | null;
  /** Null on a run that stopped before it read the target's whole element list (a redirect, a truncated snapshot). */
  elements: number | null;
  rules: number;
  /** Null on a run that stopped before it evaluated a rule: never `[]`, which would read as "nothing failed". */
  failures: GuideFailure[] | null;
  /** Rule id -> the elements that failed it; null as `failures`. */
  failuresByRule: Record<string, string[]> | null;
  unmatchedRules: string[] | null;
  stylesheets: StylesheetLoad | null;
  instrument: string | null;
}

export function guideJson(r: GuideReport | GuidePartial, exitCode: GuideJson["exitCode"], unknown: string | null): GuideJson {
  const evaluated = "failures" in r;
  let byRule: Record<string, string[]> | null = null;
  if (evaluated) {
    byRule = {};
    for (const id of [...new Set(r.failures.map((f) => f.ruleId))].sort()) {
      byRule[id] = [...new Set(r.failures.filter((f) => f.ruleId === id).map((f) => f.elementId))];
    }
  }
  return {
    schema: 1,
    guide: r.guide,
    target: r.target,
    exitCode,
    unknown,
    elements: r.elements,
    rules: r.rules,
    failures: evaluated ? r.failures : null,
    failuresByRule: byRule,
    unmatchedRules: evaluated ? r.unmatchedRules : null,
    stylesheets: r.stylesheets,
    instrument: r.instrument,
  };
}

/** A URL's path with percent-escapes decoded, so two spellings of one path compare equal. */
function decodedPath(u: URL): string {
  try {
    return decodeURIComponent(u.pathname);
  } catch {
    return u.pathname;
  }
}

/**
 * The page the door read is the page it was sent to: the same origin and path. A
 * redirect (an expired --storage-state sent to the login page, a trailing slash
 * added or dropped) ends on another page, and a verdict there is not about the target.
 */
function samePage(requested: string, read: string): boolean {
  try {
    const a = new URL(requested);
    const b = new URL(read);
    // Decoded: the browser escapes some characters Node's parser keeps (`|` is `%7C` in location.href).
    return a.origin === b.origin && decodedPath(a) === decodedPath(b);
  } catch {
    return false;
  }
}

/** A page's origin and path: the part `samePage` compares, and all a reason names (a query or fragment may carry a code or token). */
function pageOf(url: string): string {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url;
  }
}

export interface ValidateOptions {
  /** A Playwright storageState file for the door's browser context (an authed route). */
  storageState?: string;
}

export async function validateGuide(guideFile: string, target: string, rootDir: string, opts: ValidateOptions = {}): Promise<GuideReport> {
  const guide = readGuide(guideFile);
  const pairs = pairsOf(guide.rules);
  const page = await openPage(target);
  const known: GuidePartial = { guide: guideFile, target, rules: guide.rules.length, elements: null, stylesheets: null, instrument: null };
  const unknownVerdict = (message: string): GuideUnknown => new GuideUnknown(message, { ...known });
  try {
    const run = await runDoor(
      rootDir,
      page.url,
      // The stylesheet check brackets the read of the page: a sheet still loading before it is UNKNOWN even if it loaded after.
      [
        { action: "pageEvaluate", payload: { expression: STYLESHEET_LOAD_EXPRESSION } },
        { action: "discover", payload: {} },
        { action: "getDesignSnapshot", payload: { limit: 1000 } },
        { action: "pageEvaluate", payload: { expression: canonicalizeExpression(pairs) } },
        { action: "pageEvaluate", payload: { expression: STYLESHEET_LOAD_EXPRESSION } },
        // Read last, so a redirect at any point before it (server or client side) is seen.
        { action: "pageEvaluate", payload: { expression: "location.href" } },
      ],
      opts.storageState ? { storageState: opts.storageState } : {},
    );
    known.instrument = run.instrument;
    const snap = run.lines[2]?.result as { elements?: unknown[]; truncated?: boolean } | undefined;
    const canon = evalValue(run.lines[3]);
    if (!snap?.elements || !Array.isArray(canon)) {
      throw unknownVerdict(`unknown(instrument-cannot-read): ${run.instrument} gave no design snapshot (${run.stderr.slice(0, 160).replace(/\s+/g, " ")})`);
    }
    const readUrl = evalValue(run.lines[5]);
    if (typeof readUrl !== "string") throw unknownVerdict(`unknown(instrument-cannot-read): ${run.instrument} did not say which page it read`);
    if (!samePage(page.url, readUrl)) {
      const named = isUrlTarget(target) ? pageOf(target) : target;
      throw unknownVerdict(`unknown(redirected): ${named} was answered by ${pageOf(readUrl)}; a verdict there is not a verdict on the target`);
    }
    // The count is the target's only once the page is the target and the snapshot is whole; a truncated one is a floor.
    if (!snap.truncated) known.elements = snap.elements.length;
    // A missing sheet leaves the page on browser defaults: whatever the rules say about it is not about the design.
    const stylesheets = mergeStylesheetLoads(
      stylesheetLoad(evalValue(run.lines[0]), page.url, []),
      stylesheetLoad(evalValue(run.lines[4]), page.url, page.missed()),
    );
    if (!stylesheets) throw unknownVerdict(`unknown(instrument-cannot-read): ${run.instrument} did not answer the stylesheet-load check`);
    known.stylesheets = stylesheets;
    const sheetUnknown = stylesheetUnknown(stylesheets);
    if (sheetUnknown !== null) {
      throw unknownVerdict(
        stylesheets.failed.length > 0 ? `${sheetUnknown}; a guide evaluated without its stylesheets reads browser defaults, not the page` : sheetUnknown,
      );
    }
    if (snap.elements.length === 0) throw unknownVerdict("unknown(no-elements): the page returned no registered elements; a guide that read nothing is not a pass");
    if (snap.truncated) throw unknownVerdict("unknown(snapshot-truncated): the page has more elements than one snapshot returns");
    if (canon.length !== pairs.length) throw unknownVerdict("unknown(instrument-cannot-read): the canonicalisation answered a different number of values than asked");
    const map = new Map<string, string>();
    pairs.forEach(([p, v], i) => map.set(`${p}\0${v}`, String(canon[i])));
    const rules = applyCanonical(guide.rules, map);
    const { failures, matched } = await validateElementsDetailed(guide, rules, snap.elements);
    const unmatchedRules = rules.map((r) => r.id).filter((id) => !matched.has(id));
    return { guide: guideFile, target, elements: snap.elements.length, rules: rules.length, failures, unmatchedRules, stylesheets, instrument: run.instrument };
  } finally {
    await page.close();
  }
}
