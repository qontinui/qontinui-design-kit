/**
 * Did the page's stylesheets load? A page whose sheet did not load renders
 * browser defaults, so a verdict over it describes the defaults and not the
 * design: it is UNKNOWN, never a pass or a fail. The signals:
 *
 * - the kit's loopback server records each `.css` request it answered 404
 *   (`missed()`; always empty for a URL target, which the kit does not serve);
 * - page-side, every `<link rel="stylesheet">` whose `sheet` is null, or whose
 *   request the page's resource timing reports with a `responseStatus` of 400
 *   or more. Chromium gives a 404'd stylesheet a non-null, empty `sheet`, so
 *   the status is what catches a 404 on a URL target. A cross-origin request
 *   with no `Timing-Allow-Origin` reports status 0, which says nothing, and the
 *   resource timing buffer (250 entries by default) can drop entries on a page
 *   that loads more resources than that;
 * - page-side, every `document.styleSheets` entry whose `cssRules` throws: a
 *   sheet from another origin with no CORS. Whether it loaded cannot be read,
 *   so it is listed as `unreadable`, a different UNKNOWN from `failed`.
 *
 * `validate-guide` and `check-states` read the same check.
 */

export interface StylesheetLoad {
  /** The `<link rel="stylesheet">` elements the page requested. */
  requested: number;
  /** Sheets that did not load: a decoded path on the page's origin, else the full URL. */
  failed: string[];
  /** Sheets whose rules cannot be read (another origin, no CORS), so whether they loaded is unknown. */
  unreadable: string[];
}

/** Page-side expression: `{ requested, failed, unreadable }` with each sheet's absolute href. */
export const STYLESHEET_LOAD_EXPRESSION = `(() => {
  const status = new Map();
  for (const e of performance.getEntriesByType('resource')) {
    if (typeof e.responseStatus === 'number' && e.responseStatus > 0) status.set(e.name, e.responseStatus);
  }
  const failed = [];
  const links = Array.from(document.querySelectorAll('link[rel~="stylesheet" i]'));
  for (const l of links) {
    const code = status.get(l.href);
    if (!l.sheet || (code !== undefined && code >= 400)) failed.push(l.href || l.getAttribute('href') || '<link with no href>');
  }
  const unreadable = [];
  for (const s of Array.from(document.styleSheets)) {
    try { void s.cssRules; } catch (e) { unreadable.push(s.href || '<inline style>'); }
  }
  return { requested: links.length, failed, unreadable };
})()`;

/**
 * Merge the page's answer with the server's misses. Null when the page gave no
 * answer, which is UNKNOWN to the caller, never "every sheet loaded".
 */
export function stylesheetLoad(pageValue: unknown, pageUrl: string, missed: readonly string[]): StylesheetLoad | null {
  const v = pageValue as { requested?: unknown; failed?: unknown; unreadable?: unknown } | null | undefined;
  if (!v || typeof v.requested !== "number" || !Array.isArray(v.failed) || !Array.isArray(v.unreadable)) return null;
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
  const unreadable = [...new Set(v.unreadable.map((f) => sheetPath(String(f))))].filter((f) => !failed.includes(f)).sort();
  return { requested: v.requested, failed, unreadable };
}

/** The UNKNOWN a stylesheet that did not load reads as. */
export const stylesheetMissing = (failed: readonly string[]): string => `unknown(stylesheet-missing): ${failed.join(", ")} did not load`;

/** The UNKNOWN a stylesheet whose rules cannot be read reads as. */
export const stylesheetUnreadable = (unreadable: readonly string[]): string =>
  `unknown(stylesheet-unreadable): ${unreadable.join(", ")} cannot be read (another origin, no CORS), so whether it carries the page's styles is unknown`;
