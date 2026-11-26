// Reach at depth (plan 2026-11-26-the-app-shell-is-never-derived-from-what-
// every-role-does-on-every-page, D3): from the end of a page, how many scroll
// gestures pass before a navigation control is in view, and how many
// deliberate actions before an entry can be chosen. Every implementation must
// pass the plan's vectors V1-V7 (test/shell-conditions.test.js).
//
// Input, for one page, role and viewport W x H:
//   { H, documentHeight, pinTop = 0, pinBottom = 0, nav }
// `nav` is null when no navigation item is registered, else the navigation's
// first control (the row, or the control that opens the navigation menu, with
// the smallest top in document space):
//   { position: "static" | "relative" | "sticky" | "fixed",
//     top,                 // document-space top, from a capture at scroll 0
//     boxInViewport,       // fixed only: its box lies inside the viewport
//     behindMenu,          // the entries sit behind a closed menu or disclosure
//     atEnd }              // optional: the Bridge's reading with the page
//                          // scrolled to its end: { inView, top, reason }, where
//                          // inView is `inViewport: true` and no
//                          // `visibilityReason`, top is the viewport-space top
//                          // and reason the `visibilityReason` (or null)
// Output: { reach, steps, basis: "read-at-end" | "computed" } or
// { unknown: "input_missing", why }. An unknown is never a number.
//
// A reading at the end that is NOT in view is still a verdict: a control
// above the viewport (`off-screen`, top < 0) is `pinTop - top` pixels of
// scrolling away, whatever its position. One out of view for any other reason
// (no layout, hidden, occluded) is not a matter of scrolling, so it is unknown.

const GESTURE_SHARE = 0.8;

const gestures = (distance, usable) => Math.ceil(Math.max(0, distance) / (GESTURE_SHARE * usable));

export function navReachAtDepth({ H, documentHeight, pinTop = 0, pinBottom = 0, nav }) {
  if (nav === null || nav === undefined) return { unknown: "input_missing", why: "no navigation item is registered" };
  const steps = (reach) => reach + (nav.behindMenu ? 1 : 0);
  if (nav.atEnd?.inView === true) return { reach: 0, steps: steps(0), basis: "read-at-end" };
  const usable = H - pinTop - pinBottom;
  if (!Number.isFinite(usable) || usable <= 0) {
    return { unknown: "input_missing", why: `no usable height (H ${H} - pinTop ${pinTop} - pinBottom ${pinBottom}); a gesture moves nothing` };
  }
  if (nav.atEnd && nav.atEnd.inView === false) {
    const { top, reason } = nav.atEnd;
    if (reason === "off-screen" && Number.isFinite(top) && top < 0) {
      const reach = gestures(pinTop - top, usable);
      return { reach, steps: steps(reach), basis: "read-at-end" };
    }
    return { unknown: "input_missing", why: `not in view at the end for a reason scrolling up does not settle (${reason ?? "none"}, top ${top})` };
  }
  switch (nav.position) {
    case "fixed":
      if (nav.boxInViewport === true) return { reach: 0, steps: steps(0), basis: "computed" };
      return { unknown: "input_missing", why: "a fixed control whose box is not inside the viewport" };
    case "static":
    case "relative": {
      if (![H, documentHeight, nav.top].every(Number.isFinite)) return { unknown: "input_missing", why: "a height or the navigation's top is missing" };
      const scrollYmax = Math.max(0, documentHeight - H);
      const reach = gestures(scrollYmax + pinTop - nav.top, usable);
      return { reach, steps: steps(reach), basis: "computed" };
    }
    case "sticky":
      return { unknown: "input_missing", why: "a sticky control's place at the end is not in a scroll-0 capture; read it at the end" };
    default:
      return { unknown: "input_missing", why: `position ${JSON.stringify(nav.position)}` };
  }
}

/** The Bridge's own in-view verdict for an element reading (`getElement` result). */
export function inView(reading) {
  const s = reading?.state;
  return s?.inViewport === true && s.visibilityReason === undefined;
}

/** A reading at the end, in the shape `navReachAtDepth`'s `atEnd` takes. */
export function atEndOf(reading) {
  return { inView: inView(reading), top: reading.state.rect.top, reason: reading.state.visibilityReason ?? null };
}

/**
 * The pinned height a set of controls shows on the first screen, by the
 * density rule: only a pinned part at least W/2 wide takes first-screen height.
 * `pairs` is [{ start, end }] for each control: its getElement reading at
 * scroll 0 and with the page scrolled to its end (the page must have moved).
 * A control is pinned when it is in view in both readings at the same
 * viewport top. Pinned controls whose boxes touch or overlap form one part;
 * the result sums the heights of the parts at least W/2 wide, and lists every
 * part with its width, so a reading can be recorded.
 *
 * The Bridge registers controls and content, not their containers, so a part's
 * width is the union of its controls' boxes: exact for full-width rows (the
 * fixture's sidebar entries are display: block), a lower bound otherwise.
 */
export function pinnedHeight(pairs, W) {
  const boxes = pairs
    .filter(({ start, end }) => inView(start) && inView(end) && start.state.rect.top === end.state.rect.top)
    .map(({ end }) => ({ ...end.state.rect }))
    .sort((a, b) => a.top - b.top);
  const parts = [];
  for (const b of boxes) {
    const p = parts.find((q) => b.top <= q.bottom && b.bottom >= q.top && b.left <= q.right && b.right >= q.left);
    if (p) {
      p.top = Math.min(p.top, b.top);
      p.bottom = Math.max(p.bottom, b.bottom);
      p.left = Math.min(p.left, b.left);
      p.right = Math.max(p.right, b.right);
    } else parts.push({ top: b.top, bottom: b.bottom, left: b.left, right: b.right });
  }
  const measured = parts.map((p) => ({ width: p.right - p.left, height: p.bottom - p.top, counted: p.right - p.left >= W / 2 }));
  return { height: measured.filter((p) => p.counted).reduce((n, p) => n + p.height, 0), parts: measured };
}
