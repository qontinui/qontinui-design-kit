/**
 * Did the page's stylesheets load? A page whose sheet did not load renders
 * browser defaults, so a verdict over it describes the defaults and not the
 * design: it is UNKNOWN, never a pass or a fail. The signals:
 *
 * - the kit's loopback server records each `.css` request it answered 404
 *   (`missed()`; always empty for a URL target, which the kit does not serve);
 * - page-side, for every enabled `<link rel="stylesheet">` with an `href` (a
 *   `disabled` link never has a sheet, by design, and a link with no `href`
 *   requests nothing; neither is counted) and every `@import` in a
 *   readable sheet: the page's resource timing entry. A `responseStatus` of 400
 *   or more, or a `contentType` that is not `text/css` (a dev server answering
 *   a missing `.css` path with its HTML shell, which Chromium refuses to apply
 *   in a standards-mode page), is a sheet that did not load. So is a response
 *   whose status is visible, whose type resource timing reports as empty and
 *   whose sheet has no rules: Chromium refuses `application/octet-stream` and
 *   reports it so (an empty sheet sent with no Content-Type reads the same way,
 *   toward UNKNOWN). A quirks-mode page (no doctype) applies a same-origin
 *   sheet served as `text/plain`, which this rule still counts as not loaded:
 *   the error is toward UNKNOWN, never a pass. Chromium gives both a non-null,
 *   empty `sheet`, so the timing entry is what catches them on a URL target. A link with no
 *   sheet despite a response is counted as not loaded too;
 * - a link or an `@import` with no sheet and no recorded response is `pending`:
 *   still loading, or blocked before any response. So is one whose sheet has no
 *   rules and no recorded response: a 404'd sheet whose timing entry was cleared
 *   looks exactly like it. That is UNKNOWN, not a load failure. An `@import`
 *   naming a sheet above it (a cycle, which the browser does not follow), or
 *   one whose `supports()` condition is false (fetched, never applied, whatever
 *   its response), has no sheet by design and is not counted;
 * - a `.css` a `<link>` requested whose response timing reports bad (a preload
 *   whose `onload` never swapped its `rel`, a link removed on error) did not
 *   load, though no stylesheet link names it, as the kit's server records for a
 *   file target;
 * - every `document.styleSheets` entry whose `cssRules` throws is `unreadable`:
 *   a sheet fetched without CORS from another origin (the link has no
 *   `crossorigin` attribute, its server sends no `Access-Control-Allow-Origin`,
 *   or it is a cross-origin `@import`, which the browser always fetches without
 *   CORS), whose loading cannot be read.
 *
 * Limits: a cross-origin stylesheet fetched without CORS reports status 0 and no
 * content type, which say nothing; the resource timing buffer (250 entries by
 * default) can drop entries on a page that loads more resources than that,
 * leaving the kit server's own record as the only signal for a file target;
 * the `@import`s of an unreadable sheet cannot be walked; a browser whose
 * resource timing has no `responseStatus` or `contentType` (the pinned Chromium
 * has both) would read a 404'd sheet on a URL target as loaded; sheets inside a shadow
 * root are not read; and a sheet for another medium (`media="print"`) is read
 * like any other, so its 404 makes the page UNKNOWN too.
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
      initiator: e.initiatorType,
    });
  }
  // A response that is an error, or that is not CSS, is a sheet that did not load.
  const badResponse = (i) => i !== undefined && (i.code >= 400 || (i.type !== '' && i.type !== 'text/css'));
  // Chromium reports the content type of a sheet it refuses as octet-stream as "", so a response with a visible
  // status, no reported type and a sheet holding no rules was refused, not applied. The body size is not asked for:
  // a CORS response without Timing-Allow-Origin reports 0. A sheet sent with no Content-Type at all is applied and
  // has rules; an empty or comment-only one read this way is UNKNOWN, never a pass.
  const refusedSheet = (sheet, i) => {
    if (!sheet || i === undefined || i.code === 0 || i.type !== '') return false;
    try { return sheet.cssRules.length === 0; } catch (e) { return false; }
  };
  // A readable sheet with no rules and no recorded response is unproven: a 404'd sheet whose timing entry was
  // cleared (or never kept, the buffer being full) looks exactly like it, so it is pending, not loaded.
  const emptySheet = (sheet) => { try { return sheet.cssRules.length === 0; } catch (e) { return false; } };
  const failed = [];
  const pending = [];
  const unreadable = [];
  // A disabled link has no sheet by design; one whose type is not CSS (by MIME essence: "text/css; charset=utf-8"
  // is CSS) is never fetched; one with no href attribute requests nothing. None of them is counted.
  const isCss = (t) => t.split(';')[0].trim().toLowerCase() === 'text/css';
  const links = Array.from(document.querySelectorAll('link[rel~="stylesheet" i]')).filter((l) => !l.disabled && l.hasAttribute('href') && (!l.type || isCss(l.type)));
  for (const l of links) {
    // An empty href resolves to the page itself and never loads: a sheet that did not load, not one still loading.
    if (l.getAttribute('href').trim() === '') { failed.push('<link with an empty href>'); continue; }
    const href = l.href;
    const i = seen.get(l.href);
    if (badResponse(i) || refusedSheet(l.sheet, i)) failed.push(href);
    else if (!l.sheet) (i === undefined || i.code === 0 ? pending : failed).push(href);
    else if (i === undefined && emptySheet(l.sheet)) pending.push(href);
  }
  // ancestors: the hrefs of the sheets above this one. The browser does not follow an @import naming one of them
  // (a cycle), so that rule has no sheet by design, not because a load failed. The walk has no depth cap: it follows
  // only the imports the browser loaded, and a page too deep for it throws, which reads as no answer (UNKNOWN).
  const walkSheet = (sheet, ancestors) => {
    let rules;
    try { rules = sheet.cssRules; } catch (e) { unreadable.push(sheet.href || '<inline style>'); return; }
    const chain = sheet.href ? [...ancestors, sheet.href] : ancestors;
    for (const r of Array.from(rules)) {
      if (!(r instanceof CSSImportRule)) continue;
      // The imported sheet's own href is the URL the browser requested; a parent reached through a redirect
      // keeps its pre-redirect href, so resolving the rule's text against it would miss the timing entry.
      let href = r.styleSheet && r.styleSheet.href ? r.styleSheet.href : r.href;
      if (!(r.styleSheet && r.styleSheet.href)) {
        try { href = new URL(r.href, sheet.href || document.baseURI).href; } catch (e) { /* keep as written */ }
      }
      // An @import whose supports() condition is false is fetched but never applied, by design: whatever its response,
      // it is not counted.
      if (typeof r.supportsText === 'string' && r.supportsText !== '' && !CSS.supports(r.supportsText)) continue;
      const i = seen.get(href);
      if (badResponse(i) || refusedSheet(r.styleSheet, i)) failed.push(href);
      else if (r.styleSheet && i === undefined && emptySheet(r.styleSheet)) pending.push(href);
      else if (r.styleSheet) walkSheet(r.styleSheet, chain);
      else if (!chain.includes(href)) (i === undefined || i.code === 0 ? pending : failed).push(href);
    }
  };
  for (const s of Array.from(document.styleSheets)) walkSheet(s, []);
  // A .css a <link> requested that failed did not load even with no stylesheet link naming it now (a preload whose
  // onload never swapped its rel, a link removed on error), as the kit's server records it for a file target.
  for (const [name, i] of seen) {
    if (i.initiator !== 'link' || !badResponse(i) || failed.includes(name)) continue;
    try { if (new URL(name).pathname.toLowerCase().endsWith('.css')) failed.push(name); } catch (e) { /* not a URL */ }
  }
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
  // Another origin's sheet is named by origin and path: a signed URL's query stays out of logs and the report.
  const sheetPath = (href: string): string => {
    try {
      const u = new URL(href);
      if (u.origin !== origin) return u.origin + u.pathname;
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

/**
 * The check is read before the page's elements are read and again after (the
 * door's steps run one after another), so a sheet still loading at the first
 * read stays pending though it loaded by the last: the snapshot between them
 * may have read the page without it. A failure or an unreadable sheet at
 * either read counts. Null when either read gave no answer.
 */
export function mergeStylesheetLoads(before: StylesheetLoad | null, after: StylesheetLoad | null): StylesheetLoad | null {
  if (before === null || after === null) return null;
  const union = (a: string[], b: string[]): string[] => [...new Set([...a, ...b])].sort();
  const failed = union(before.failed, after.failed);
  const rest = (a: string[], b: string[]): string[] => union(a, b).filter((f) => !failed.includes(f));
  return { requested: after.requested, failed, unreadable: rest(before.unreadable, after.unreadable), pending: rest(before.pending, after.pending) };
}

/** The UNKNOWN a stylesheet that did not load reads as. */
export const stylesheetMissing = (failed: readonly string[]): string => `unknown(stylesheet-missing): ${failed.join(", ")} did not load`;

/** The UNKNOWN a stylesheet whose rules cannot be read reads as. */
export const stylesheetUnreadable = (unreadable: readonly string[]): string =>
  `unknown(stylesheet-unreadable): ${unreadable.join(", ")} was fetched without CORS (a link with no crossorigin attribute, a server that sends no Access-Control-Allow-Origin, or a cross-origin @import, which the browser fetches without CORS whatever its server sends), so whether it carries the page's styles cannot be read`;

/** The UNKNOWN a stylesheet that had not loaded when the page was read reads as. */
export const stylesheetPending = (pending: readonly string[]): string =>
  `unknown(stylesheet-pending): ${pending.join(", ")} had no stylesheet, or an empty one with no recorded response, when the page was read (still loading, blocked before any response, or its timing entry was cleared)`;

/** The first UNKNOWN a stylesheet load reads as, in order of certainty; null when every sheet loaded. */
export function stylesheetUnknown(load: StylesheetLoad): string | null {
  if (load.failed.length > 0) return stylesheetMissing(load.failed);
  if (load.pending.length > 0) return stylesheetPending(load.pending);
  if (load.unreadable.length > 0) return stylesheetUnreadable(load.unreadable);
  return null;
}
