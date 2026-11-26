// The shell fixture's rules, as kit style data (selector, decls, when). The
// unconditional rules are rendered by renderRules (the kit's base stylesheet
// path); the `when` rules reach the page only through the compiled
// conditions.css, loaded after them, exactly as a scaffold loads kitCss() and
// then conditions.css. Every declaration reads var(--dk-*); the one literal
// extent is the viewport bound 100dvh (structure, not skin; plan D5).
//
// Narrow (the default): a compact pinned bar of one control's height holding
// the menu control; the navigation sits in a menu panel. Wide: a sidebar beside
// the content that stays in view and scrolls within itself. Short: the bar
// unpins. The wide sidebar is selected with a higher specificity
// (`.fx-shell > .fx-shell-top`), so the short rule that unpins the narrow bar
// never unpins the sidebar where both conditions hold (1280 x 400).
export const shellDef = { name: "ShellFixture" };

const v = (name) => `var(--dk-${name})`;

export const shellRules = [
  { selector: "html", decls: { "scroll-padding-top": v("layout-shell-bar") } },
  { selector: "body", decls: { margin: "0" } },
  {
    selector: ".fx-shell-top",
    decls: { position: "sticky", top: "0", "z-index": "1", "background-color": v("color-role-surface") },
  },
  {
    selector: ".fx-shell-bar",
    decls: { display: "flex", "align-items": "stretch", "box-sizing": "border-box", height: v("layout-shell-bar") },
  },
  { selector: ".fx-shell-menu", decls: { "box-sizing": "border-box", height: v("layout-shell-bar"), margin: "0" } },
  { selector: ".fx-shell-nav", decls: { display: "none" } },
  {
    selector: '.fx-shell[data-open="true"] .fx-shell-nav',
    decls: { display: "block", "max-height": `calc(100dvh - ${v("layout-shell-bar")})`, "overflow-y": "auto" },
  },
  {
    selector: ".fx-shell-entry",
    decls: { display: "block", "box-sizing": "border-box", "min-height": v("layout-shell-bar"), padding: v("space-scale-2") },
  },

  { when: "wide", selector: "html", decls: { "scroll-padding-top": "0" } },
  {
    when: "wide",
    selector: ".fx-shell",
    decls: { display: "grid", "grid-template-columns": `${v("layout-shell-sidebar")} minmax(0, 1fr)`, "align-items": "start" },
  },
  {
    when: "wide",
    selector: ".fx-shell > .fx-shell-top",
    decls: { position: "sticky", top: "0", "max-height": "100dvh", "overflow-y": "auto" },
  },
  { when: "wide", selector: ".fx-shell-menu", decls: { display: "none" } },
  { when: "wide", selector: ".fx-shell-nav", decls: { display: "block" } },

  { when: "short", selector: "html", decls: { "scroll-padding-top": "0" } },
  { when: "short", selector: ".fx-shell-top", decls: { position: "static" } },
  { when: "short", selector: '.fx-shell[data-open="true"] .fx-shell-nav', decls: { "max-height": "none" } },
];

export const shellEntry = { def: shellDef, styles: { elementType: "nav", rules: shellRules } };
