/**
 * Did the page's stylesheets load? A page whose sheet 404s renders browser
 * defaults, so a verdict over it describes the defaults and not the design: it
 * is UNKNOWN, never a pass or a fail. Two signals, each blind where the other
 * sees:
 *
 * - the kit's loopback server records each `.css` request it answered 404
 *   (`missed()`; always empty for a URL target, which the kit does not serve);
 * - page-side, every `<link rel="stylesheet">` whose `sheet` is null (it never
 *   loaded) and every `document.styleSheets` entry whose `cssRules` throws.
 *
 * `validate-guide` and `check-states` read the same check.
 */

export interface StylesheetLoad {
  /** The `<link rel="stylesheet">` elements the page requested. */
  requested: number;
  /** Sheets that did not load or cannot be read: a path on the page's origin, else the full URL. */
  failed: string[];
}

/** Page-side expression: `{ requested, failed }` with each failed sheet's absolute href. */
export const STYLESHEET_LOAD_EXPRESSION = `(() => {
  const failed = [];
  const links = Array.from(document.querySelectorAll('link[rel~="stylesheet" i]'));
  for (const l of links) if (!l.sheet) failed.push(l.href || l.getAttribute('href') || '<link with no href>');
  for (const s of Array.from(document.styleSheets)) {
    try { void s.cssRules; } catch (e) { failed.push(s.href || '<inline style>'); }
  }
  return { requested: links.length, failed };
})()`;

/**
 * Merge the page's answer with the server's misses. Null when the page gave no
 * answer, which is UNKNOWN to the caller, never "every sheet loaded".
 */
export function stylesheetLoad(pageValue: unknown, pageUrl: string, missed: readonly string[]): StylesheetLoad | null {
  const v = pageValue as { requested?: unknown; failed?: unknown } | null | undefined;
  if (!v || typeof v.requested !== "number" || !Array.isArray(v.failed)) return null;
  let origin: string | null = null;
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    origin = null;
  }
  const sheetPath = (href: string): string => {
    try {
      const u = new URL(href);
      return u.origin === origin ? u.pathname : href;
    } catch {
      return href;
    }
  };
  const failed = [...new Set([...missed, ...v.failed.map((f) => sheetPath(String(f)))])].sort();
  return { requested: v.requested, failed };
}

/** The UNKNOWN a missing stylesheet reads as. */
export const stylesheetMissing = (failed: readonly string[]): string => `unknown(stylesheet-missing): ${failed.join(", ")} did not load`;
