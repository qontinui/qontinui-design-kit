/**
 * `design-kit check-states <url|file>`: drive the PUBLISHED exec door
 * (`ui-bridge-inject --exec-stdin`) with `getElementStateStyles` for each
 * interactive cell of the specimen and write `state-coverage.json`.
 *
 * Per cell: `changedProperties` (a count), whether each changed value is a
 * `var(--dk-*)` read (token-derived), and `complete`. A cell with no delta, or
 * a delta that is not token-derived, is a finding. `focus-visible` is not
 * emulated by the published door (Probe 3), so those cells are
 * `unknown(focus-visible-not-emulated)`, never a pass.
 *
 * A state a pseudo-class can force (hover, active) is forced on the cell's
 * element. A state the component reads from an attribute (disabled, loading,
 * error, selected) is compared with the same variant's default cell.
 */
import { evalValue, openPage, runDoor, type DoorLine, type DoorStep } from "../door/inject.js";
import { STYLESHEET_LOAD_EXPRESSION, stylesheetLoad, stylesheetMissing, type StylesheetLoad } from "../door/stylesheets.js";
import { FORCEABLE_STATES, type State } from "../kit/define.js";
import type { Cell } from "./cells.js";
import { TOKEN_VALUES_EXPRESSION, classifyDelta, visualDiff, type Diff } from "./delta.js";

export type CellStatus = "baseline" | "measured" | "unknown";

export interface CellResult {
  component: string;
  variant: string;
  state: State;
  id: string;
  status: CellStatus;
  /** `unknown(<reason>)` when the instrument cannot measure the cell. */
  unknown: string | null;
  /** Count of value-bearing changed properties; null when not measured. */
  changedProperties: number | null;
  /** Counted properties, for reading. */
  properties: string[];
  /** Properties that changed but carry no token-checkable value. */
  ignoredProperties: string[];
  /** true: every changed value is a `--dk-*` read; false: one is not; null: not measured or no delta. */
  tokenDerived: boolean | null;
  nonTokenProperties: string[];
  /** true: a delta exists and it is token-derived; false: a finding; null: unknown or baseline. */
  complete: boolean | null;
}

export interface StateCoverage {
  schema: 1;
  /** The page measured. */
  url: string;
  /** The published door that measured, e.g. `@qontinui/ui-bridge-wrapper@0.12.0`. */
  instrument: string;
  summary: { cells: number; measured: number; baseline: number; unknown: number; findings: number };
  /** The page's linked stylesheets; null when the instrument did not answer. A failed sheet makes every cell UNKNOWN. */
  stylesheets: StylesheetLoad | null;
  findings: { id: string; finding: "no-delta" | "non-token-delta"; detail: string }[];
  cells: CellResult[];
}

export const FOCUS_VISIBLE_UNKNOWN = "unknown(focus-visible-not-emulated)";

const unknownCell = (c: Cell, why: string): CellResult => ({
  component: c.component,
  variant: c.variant,
  state: c.state,
  id: c.id,
  status: "unknown",
  unknown: why,
  changedProperties: null,
  properties: [],
  ignoredProperties: [],
  tokenDerived: null,
  nonTokenProperties: [],
  complete: null,
});

interface StateStyles {
  state: string;
  styles: Record<string, unknown>;
  diffFromDefault: Diff[];
}

function stylesOf(line: DoorLine | undefined): StateStyles[] | null {
  if (!line || line.error) return null;
  const s = (line.result as { stateStyles?: StateStyles[] } | undefined)?.stateStyles;
  return Array.isArray(s) ? s : null;
}

/** Read the cell list the specimen embeds. */
export async function fetchCells(url: string): Promise<Cell[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const html = await res.text();
  const m = /<script type="application\/json" id="dk-specimen-cells">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error(`${url}: no #dk-specimen-cells block; is it a design-kit specimen?`);
  return JSON.parse(m[1] as string) as Cell[];
}

export async function checkStates(target: string, rootDir: string): Promise<StateCoverage> {
  const page = await openPage(target);
  try {
    const cells = await fetchCells(page.url);
    if (cells.length === 0) throw new Error(`${target}: the specimen lists no cells; a check that measured nothing is UNKNOWN, not complete`);
    const steps: DoorStep[] = [{ action: "discover", payload: {} }];
    const stepOf = new Map<string, number>();
    for (const c of cells) {
      if (c.state === "focus-visible") continue;
      const forced = (FORCEABLE_STATES as readonly string[]).includes(c.state);
      stepOf.set(c.id, steps.length);
      // The door requires at least one state name; `hover` is requested and ignored for an attribute cell.
      steps.push({ action: "getElementStateStyles", payload: { id: `dom-${c.target}`, states: [forced ? c.state : "hover"] } });
    }
    const tokenStep = steps.length;
    steps.push({ action: "pageEvaluate", payload: { expression: TOKEN_VALUES_EXPRESSION } });
    const sheetStep = steps.length;
    steps.push({ action: "pageEvaluate", payload: { expression: STYLESHEET_LOAD_EXPRESSION } });

    const run = await runDoor(rootDir, page.url, steps);
    const instrument = run.instrument;
    if (run.lines.length !== steps.length) {
      const why = `unknown(instrument-cannot-force): ${instrument} answered ${run.lines.length} of ${steps.length} steps (${run.stderr.slice(0, 160).replace(/\s+/g, " ")})`;
      return finish(target, instrument, null, cells.map((c) => unknownCell(c, why)));
    }
    const tokenValue = evalValue(run.lines[tokenStep]) as { count?: number; values?: string[] } | undefined;
    const tokenValues = new Set(tokenValue?.values ?? []);
    // Known only when every linked sheet loaded AND the page declares a token other than the kit's own state list.
    const stylesheets = stylesheetLoad(evalValue(run.lines[sheetStep]), page.url, page.missed());
    const tokensUnknown =
      stylesheets === null
        ? `unknown(instrument-cannot-read): ${instrument} did not answer the stylesheet-load check`
        : stylesheets.failed.length > 0
          ? stylesheetMissing(stylesheets.failed)
          : (tokenValue?.count ?? 0) > 0
            ? null
            : "unknown(no-token-values): the page declares no --dk-* custom property other than --dk-kit-states";

    const defaultStyles = new Map<string, Record<string, unknown>>();
    for (const c of cells) {
      if (c.state !== "default") continue;
      const s = stylesOf(run.lines[stepOf.get(c.id) as number]);
      const d = s?.find((x) => x.state === "default");
      if (d) defaultStyles.set(`${c.component}/${c.variant}`, d.styles);
    }

    const results: CellResult[] = [];
    for (const c of cells) {
      if (c.state === "default") {
        results.push({ ...unknownCell(c, ""), status: "baseline", unknown: null });
        continue;
      }
      if (c.state === "focus-visible") {
        results.push(unknownCell(c, FOCUS_VISIBLE_UNKNOWN));
        continue;
      }
      const line = run.lines[stepOf.get(c.id) as number];
      const states = stylesOf(line);
      if (!states) {
        results.push(unknownCell(c, `unknown(element-not-measured): ${line?.error?.message ?? "no stateStyles"}`.slice(0, 200)));
        continue;
      }
      if (tokensUnknown !== null) {
        results.push(unknownCell(c, tokensUnknown));
        continue;
      }
      let diffs: Diff[];
      if ((FORCEABLE_STATES as readonly string[]).includes(c.state)) {
        const forced = states.find((x) => x.state === c.state);
        if (!forced) {
          results.push(unknownCell(c, `unknown(state-not-forced): the door returned no ${c.state} entry`));
          continue;
        }
        diffs = forced.diffFromDefault;
      } else {
        const base = defaultStyles.get(`${c.component}/${c.variant}`);
        const own = states.find((x) => x.state === "default");
        if (!base || !own) {
          results.push(unknownCell(c, "unknown(no-default-cell)"));
          continue;
        }
        diffs = visualDiff(base, own.styles);
      }
      const cls = classifyDelta(diffs, tokenValues);
      const hasDelta = cls.counted.length > 0;
      results.push({
        component: c.component,
        variant: c.variant,
        state: c.state,
        id: c.id,
        status: "measured",
        unknown: null,
        changedProperties: cls.counted.length,
        properties: cls.counted,
        ignoredProperties: cls.ignored.map((i) => i.property),
        tokenDerived: hasDelta ? cls.nonToken.length === 0 : null,
        nonTokenProperties: cls.nonToken,
        complete: hasDelta && cls.nonToken.length === 0,
      });
    }
    return finish(target, instrument, stylesheets, results);
  } finally {
    await page.close();
  }
}

function finish(url: string, instrument: string, stylesheets: StylesheetLoad | null, cells: CellResult[]): StateCoverage {
  const findings: StateCoverage["findings"] = [];
  for (const r of cells) {
    if (r.status !== "measured") continue;
    if (r.changedProperties === 0) {
      findings.push({ id: r.id, finding: "no-delta", detail: `${r.component} ${r.variant} ${r.state}: the state changes no value-bearing property` });
    } else if (r.nonTokenProperties.length > 0) {
      findings.push({ id: r.id, finding: "non-token-delta", detail: `${r.component} ${r.variant} ${r.state}: ${r.nonTokenProperties.join(", ")} is not a var(--dk-*) read` });
    }
  }
  return {
    schema: 1,
    url,
    instrument,
    summary: {
      cells: cells.length,
      measured: cells.filter((c) => c.status === "measured").length,
      baseline: cells.filter((c) => c.status === "baseline").length,
      unknown: cells.filter((c) => c.status === "unknown").length,
      findings: findings.length,
    },
    stylesheets,
    findings,
    cells,
  };
}

/** The unknown cells other than the documented focus-visible gap: an instrument or page problem, not a finding. */
export function unexpectedUnknowns(c: StateCoverage): CellResult[] {
  return c.cells.filter((x) => x.status === "unknown" && x.unknown !== FOCUS_VISIBLE_UNKNOWN);
}
