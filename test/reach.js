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
//     atEnd }              // optional: the Bridge's own verdict with the page
//                          // scrolled to its end, { inView } where inView is
//                          // `inViewport: true` and no `visibilityReason`
// Output: { reach, steps, basis: "read-at-end" | "computed" } or
// { unknown: "input_missing", why }. An unknown is never a number.

const GESTURE_SHARE = 0.8;

export function navReachAtDepth({ H, documentHeight, pinTop = 0, pinBottom = 0, nav }) {
  if (nav === null || nav === undefined) return { unknown: "input_missing", why: "no navigation item is registered" };
  const steps = (reach) => reach + (nav.behindMenu ? 1 : 0);
  if (nav.atEnd?.inView === true) return { reach: 0, steps: steps(0), basis: "read-at-end" };
  switch (nav.position) {
    case "fixed":
      if (nav.boxInViewport === true) return { reach: 0, steps: steps(0), basis: "computed" };
      return { unknown: "input_missing", why: "a fixed control whose box is not inside the viewport" };
    case "static":
    case "relative": {
      if (![H, documentHeight, nav.top].every(Number.isFinite)) return { unknown: "input_missing", why: "a height or the navigation's top is missing" };
      const scrollYmax = Math.max(0, documentHeight - H);
      const usable = H - pinTop - pinBottom;
      const reach = Math.ceil(Math.max(0, scrollYmax + pinTop - nav.top) / (GESTURE_SHARE * usable));
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
