/**
 * Did the page's stylesheets load? A page whose sheet did not load renders
 * browser defaults, so a verdict over it describes the defaults and not the
 * design: it is UNKNOWN, never a pass or a fail. The signals:
 *
 * - the kit's loopback server records each `.css` request it answered 404
 *   (`missed()`; always empty for a URL target, which the kit does not serve);
 * - page-side, for every enabled `<link rel="stylesheet">` (a `disabled` link
 *   never has a sheet, by design, and is not counted) and every `@import` in a
 *   readable sheet: the page's resource timing entry. A `responseStatus` of 400
 *   or more, or a `contentType` that is not `text/css` (a dev server answering
 *   a missing `.css` path with its HTML shell, which Chromium refuses to apply),
 *   is a sheet that did not load. Chromium gives both a non-null, empty `sheet`,
 *   so the timing entry is what catches them on a URL target. A link with no
 *   sheet despite a response is counted as not loaded too;
 * - a link with no sheet and no recorded response is `pending`: still loading,
 *   or blocked before any response. That is UNKNOWN, not a load failure;
 * - every `document.styleSheets` entry whose `cssRules` throws is `unreadable`:
 *   a sheet fetched without CORS from another origin (the link has no
 *   `crossorigin` attribute, or its server sends no
 *   `Access-Control-Allow-Origin`), whose loading cannot be read.
 *
 * Limits: a cross-origin stylesheet fetched without CORS reports status 0 and no
 * content type, which say nothing; the resource timing buffer (250 entries by
 * default) can drop entries on a page that loads more resources than that,
 * leaving the kit server's own record as the only signal for a file target; and
 * the `@import`s of an unreadable sheet cannot be walked.
 *
 * `validate-guide` and `check-states` read the same check.
 */

export interface StylesheetLoad {
  /** The enabled `<link rel="stylesheet">` elements the page requested. */
  requested: number;
  /** Sheets (linked or `@import`-ed) that did not load: a decoded path on the page's origin, else the full URL. */
  failed: string[];
  /** Sheets whose rules cannot be read (another origin, no CORS), so whether they loaded is unknown. */
  unreadable: string[];
  /** Linked sheets with no stylesheet and no recorded response when the page was read: still loading, or blocked. */
  pending: string[];
}

/** Page-side expression: `{ requested, failed, unreadable, pending }` with each sheet's absolute href. */
export const STYLESHEET_LOAD_EXPRESSION = `(() => {
  const seen = new Map();
  for (const e of performance.getEntriesByType('resource')) {
    seen.set(e.name, {
      code: typeof e.responseStatus === 'number' && e.responseStatus > 0 ? e.responseStatus : 0,
      type: typeof e.contentType === 'string' ? e.contentType.split(';')[0].trim().toLowerCase() : '',
    });
  }
  // A response that is an error, or that is not CSS, is a sheet that did not load.
  const badResponse = (i) => i !== undefined && (i.code >= 400 || (i.type !== '' && i.type !== 'text/css'));
  const failed = [];
  const pending = [];
  const unreadable = [];
  const links = Array.from(document.querySelectorAll('link[rel~="stylesheet" i]')).filter((l) => !l.disabled);
  for (const l of links) {
    const href = l.href || l.getAttribute('href') || '<link with no href>';
    const i = seen.get(l.href);
    if (badResponse(i)) failed.push(href);
    else if (!l.sheet) (i === undefined || i.code === 0 ? pending : failed).push(href);
  }
  const walk = (sheet, depth) => {
    let rules;
    try { rules = sheet.cssRules; } catch (e) { unreadable.push(sheet.href || '<inline style>'); return; }
    if (depth > 8) return;
    for (const r of Array.from(rules)) {
      if (!(r instanceof CSSImportRule)) continue;
      let href = r.href;
      try { href = new URL(r.href, sheet.href || document.baseURI).href; } catch (e) { /* keep as written */ }
      if (badResponse(seen.get(href))) failed.push(href);
      else if (r.styleSheet) walk(r.styleSheet, depth + 1);
    }
  };
  for (const s of Array.from(document.styleSheets)) walk(s, 0);
  return { requested: links.length, failed, unreadable, pending };
})()`;

/**
 * Merge the page's answer with the server's misses. Null when the page gave no
 * answer, which is UNKNOWN to the caller, never "every sheet loaded".
 */
export function stylesheetLoad(pageValue: unknown, pageUrl: string, missed: readonly string[]): StylesheetLoad | null {
  const v = pageValue as { requested?: unknown; failed?: unknown; unreadable?: unknown; pending?: unknown } | null | undefined;
  if (!v || typeof v.requested !== "number" || !Array.isArray(v.failed) || !Array.isArray(v.unreadable) || !Array.isArray(v.pending)) return null;
  let origin: string | null = null;
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    origin = null;
  }
  // The server records the decoded request path; name a same-origin sheet the same way so the two signals agree.
  const sheetPath = (href: string): string => {
    try {
      const u = new URL(href);
      if (u.origin !== origin) return href;
      try {
        return decodeURIComponent(u.pathname);
      } catch {
        return u.pathname;
      }
    } catch {
      return href;
    }
  };
  const failed = [...new Set([...missed, ...v.failed.map((f) => sheetPath(String(f)))])].sort();
  const rest = (xs: unknown[]): string[] => [...new Set(xs.map((f) => sheetPath(String(f))))].filter((f) => !failed.includes(f)).sort();
  return { requested: v.requested, failed, unreadable: rest(v.unreadable), pending: rest(v.pending) };
}

/** The UNKNOWN a stylesheet that did not load reads as. */
export const stylesheetMissing = (failed: readonly string[]): string => `unknown(stylesheet-missing): ${failed.join(", ")} did not load`;

/** The UNKNOWN a stylesheet whose rules cannot be read reads as. */
export const stylesheetUnreadable = (unreadable: readonly string[]): string =>
  `unknown(stylesheet-unreadable): ${unreadable.join(", ")} was fetched without CORS (the link has no crossorigin attribute, or its server sends no Access-Control-Allow-Origin), so whether it carries the page's styles cannot be read`;

/** The UNKNOWN a stylesheet that had not loaded when the page was read reads as. */
export const stylesheetPending = (pending: readonly string[]): string =>
  `unknown(stylesheet-pending): ${pending.join(", ")} had no stylesheet when the page was read (still loading, or blocked before any response)`;

/** The first UNKNOWN a stylesheet load reads as, in order of certainty; null when every sheet loaded. */
export function stylesheetUnknown(load: StylesheetLoad): string | null {
  if (load.failed.length > 0) return stylesheetMissing(load.failed);
  if (load.pending.length > 0) return stylesheetPending(load.pending);
  if (load.unreadable.length > 0) return stylesheetUnreadable(load.unreadable);
  return null;
}
