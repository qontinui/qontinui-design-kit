import * as React from "react";
import { Button } from "./button.js";
import { defineComponent } from "./define.js";
import { statesRule, t, type ComponentStyles, type Rule } from "./style.js";

export const appShellDef = defineComponent({
  name: "AppShell",
  props: { variant: ["sidebar", "topbar"] },
  states: ["default"],
});

/** One navigation entry. Denied (`can(requires)` false): hidden, or with `whenDenied: "disable"` shown disabled with its `reason`. */
export type AppShellEntry = { id: string; label: string; href: string; requires?: string } & (
  | { whenDenied?: "hide"; reason?: never }
  | { whenDenied: "disable"; reason: string }
);

/** A group of entries. A denied `requires` hides it; one with no entry left is not rendered. */
export interface AppShellSection {
  id: string;
  label: string;
  requires?: string;
  entries: readonly AppShellEntry[];
}

/** A link in the account menu (the app's profile page, sign-out). */
export interface AppShellLink {
  id: string;
  label: string;
  href: string;
}

/** Who is acting. The role always shows in the control; the name where the width allows, else in its menu. */
export interface AppShellAccount {
  name?: string;
  role: string;
  items?: readonly AppShellLink[];
}

export interface AppShellCart {
  label: string;
  href: string;
  count?: number;
}

export interface AppShellProps {
  variant?: "sidebar" | "topbar";
  product: string;
  sections: readonly AppShellSection[];
  can: (permission: string) => boolean;
  current?: string;
  account?: AppShellAccount;
  cart?: AppShellCart;
  menuLabel?: string;
  /** DOM id prefix of the shell's controls (`<id>-menu`, `<id>-<entry id>`). */
  id?: string;
  children?: React.ReactNode;
}

/**
 * The app shell: navigation grouped by permission, the acting account and role, and an optional cart, one step from any scroll position.
 * @use The default shell of a product; derive its entries from every role's tasks. A declared design replaces it.
 * @avoid A product whose declared design has its own shell.
 */
export function AppShell(props: AppShellProps): React.ReactElement {
  const { variant = "sidebar", product, sections, can, current, account, cart, menuLabel = "Menu", children } = props;
  const generated = React.useId();
  const base = props.id ?? `dk-shell-${generated}`;
  const [open, setOpen] = React.useState(false);
  const [accountOpen, setAccountOpen] = React.useState(false);
  const navId = `${base}-nav`;
  const accountMenuId = `${base}-account-menu`;

  const shown = sections
    .filter((s) => s.requires === undefined || can(s.requires))
    .map((s) => ({ ...s, entries: s.entries.filter((e) => e.requires === undefined || can(e.requires) || e.whenDenied === "disable") }))
    .filter((s) => s.entries.length > 0);

  const entry = (e: AppShellEntry): React.ReactElement => {
    const id = `${base}-${e.id}`;
    if (e.requires !== undefined && !can(e.requires)) {
      // Only `whenDenied: "disable"` reaches here: shown, not usable, and saying why.
      return (
        <a id={id} className="dk-app-shell-entry" role="link" aria-disabled="true" tabIndex={0}>
          {e.label}
          <span className="dk-app-shell-reason">{e.reason}</span>
        </a>
      );
    }
    return (
      <a id={id} className="dk-app-shell-entry" href={e.href} aria-current={e.id === current ? "page" : undefined} onClick={() => setOpen(false)}>
        {e.label}
      </a>
    );
  };

  const hasAccountMenu = account !== undefined && (account.name !== undefined || (account.items?.length ?? 0) > 0);
  return (
    <div className="dk-app-shell" data-variant={variant} data-open={open ? "true" : "false"}>
      <div className="dk-app-shell-top">
        <div className="dk-app-shell-bar">
          <span className="dk-app-shell-product">{product}</span>
          <span className="dk-app-shell-tools">
            {account === undefined ? null : (
              <span className="dk-app-shell-account">
                {hasAccountMenu ? (
                  <Button id={`${base}-account`} variant="quiet" aria-expanded={accountOpen} aria-controls={accountMenuId} onClick={() => setAccountOpen((o) => !o)}>
                    <span className="dk-app-shell-role">{account.role}</span>
                    {account.name === undefined ? null : <span className="dk-app-shell-account-name">{account.name}</span>}
                  </Button>
                ) : (
                  <span id={`${base}-account`} className="dk-app-shell-role">
                    {account.role}
                  </span>
                )}
                {hasAccountMenu ? (
                  <span id={accountMenuId} className="dk-app-shell-account-menu" hidden={!accountOpen}>
                    {account.name === undefined ? null : <span className="dk-app-shell-account-menu-name">{account.name}</span>}
                    {(account.items ?? []).map((i) => (
                      <a key={i.id} id={`${base}-${i.id}`} className="dk-app-shell-entry" href={i.href}>
                        {i.label}
                      </a>
                    ))}
                  </span>
                ) : null}
              </span>
            )}
            {cart === undefined ? null : (
              <a id={`${base}-cart`} className="dk-app-shell-cart" href={cart.href}>
                {cart.label}
                {cart.count === undefined ? null : <span className="dk-app-shell-count">{cart.count}</span>}
              </a>
            )}
          </span>
          <span className="dk-app-shell-menu">
            <Button id={`${base}-menu`} variant="quiet" aria-expanded={open} aria-controls={navId} onClick={() => setOpen((o) => !o)}>
              {menuLabel}
            </Button>
          </span>
        </div>
        <nav id={navId} className="dk-app-shell-nav" aria-label={menuLabel}>
          {shown.map((s) => (
            <div key={s.id} className="dk-app-shell-section" role="group" aria-labelledby={`${base}-${s.id}-label`}>
              <span id={`${base}-${s.id}-label`} className="dk-app-shell-section-label">
                {s.label}
              </span>
              {s.entries.map((e) => (
                <React.Fragment key={e.id}>{entry(e)}</React.Fragment>
              ))}
            </div>
          ))}
        </nav>
      </div>
      <main className="dk-app-shell-main">{children}</main>
    </div>
  );
}

const BAR = t("layout-shell-bar");
const SIDEBAR = '.dk-app-shell[data-variant="sidebar"]';
const TOPBAR = '.dk-app-shell[data-variant="topbar"]';
const control = { "box-sizing": "border-box", height: BAR, display: "inline-flex", "align-items": "center", gap: t("space-scale-2") };

/**
 * Narrow (the default): a fixed bar of one control's height; the entries sit in
 * a menu panel. `wide`: the sidebar (sticky, beside the content, scrolling
 * within itself) or the top bar with the entries inline. `short`: the bar
 * unpins. Scroll padding equals the pinned height (WCAG 2.4.11). The one
 * literal extent is the viewport bound 100dvh (structure, not skin; plan D5).
 */
const rules: Rule[] = [
  statesRule(".dk-app-shell", appShellDef),
  {
    selector: ".dk-app-shell",
    decls: { "padding-top": BAR, "font-family": t("type-family-sans"), "font-size": t("type-scale-md"), color: t("color-role-text"), "background-color": t("color-role-surface") },
  },
  { selector: "html:has(.dk-app-shell)", decls: { "scroll-padding-top": BAR } },
  { selector: "body:has(.dk-app-shell)", decls: { margin: "0" } },
  {
    selector: ".dk-app-shell-top",
    decls: { position: "fixed", top: "0", left: "0", right: "0", "z-index": "1", "background-color": t("color-role-surface"), "box-shadow": `0 ${t("space-border-width")} 0 ${t("color-role-border")}` },
  },
  { selector: ".dk-app-shell-bar", decls: { display: "flex", "align-items": "stretch", gap: t("space-scale-2"), "box-sizing": "border-box", height: BAR, "padding-left": t("space-scale-3") } },
  { selector: ".dk-app-shell-product", decls: { flex: "1 1 auto", "min-width": "0", "align-self": "center", overflow: "hidden", "white-space": "nowrap", "text-overflow": "ellipsis", "font-weight": t("type-weight-strong") } },
  { selector: ".dk-app-shell-tools, .dk-app-shell-menu, .dk-app-shell-account", decls: { display: "flex", "align-items": "stretch", gap: t("space-scale-2") } },
  { selector: ".dk-app-shell-account", decls: { position: "relative" } },
  { selector: ".dk-app-shell-bar .dk-button, .dk-app-shell-cart, .dk-app-shell-account > .dk-app-shell-role", decls: { ...control, margin: "0", "border-radius": "0" } },
  { selector: ".dk-app-shell-cart", decls: { padding: `0 ${t("space-scale-3")}`, color: t("color-role-text"), "text-decoration": "none" } },
  { selector: ".dk-app-shell-count", decls: { "font-weight": t("type-weight-strong"), color: t("color-role-accent") } },
  { selector: ".dk-app-shell-account-name", decls: { display: "none" } },
  {
    selector: ".dk-app-shell-account-menu",
    decls: { position: "absolute", right: "0", top: "100%", "z-index": "1", display: "flex", "flex-direction": "column", "background-color": t("color-role-surface"), border: `${t("space-border-width")} solid ${t("color-role-border")}` },
  },
  { selector: ".dk-app-shell-account-menu[hidden]", decls: { display: "none" } },
  { selector: ".dk-app-shell-account-menu-name", decls: { padding: t("space-scale-2"), color: t("color-role-muted") } },
  { selector: ".dk-app-shell-nav", decls: { display: "none" } },
  { selector: '.dk-app-shell[data-open="true"] .dk-app-shell-nav', decls: { display: "block", "max-height": `calc(100dvh - ${BAR})`, "overflow-y": "auto" } },
  { selector: ".dk-app-shell-section-label", decls: { display: "block", padding: `${t("space-scale-2")} ${t("space-scale-3")}`, color: t("color-role-muted"), "font-size": t("type-scale-sm") } },
  {
    selector: ".dk-app-shell-entry",
    decls: { display: "block", "box-sizing": "border-box", "min-height": BAR, padding: `${t("space-scale-2")} ${t("space-scale-3")}`, color: t("color-role-text"), "text-decoration": "none" },
  },
  { selector: '.dk-app-shell-entry[aria-current="page"]', decls: { "font-weight": t("type-weight-strong"), "background-color": t("color-role-surface-hover") } },
  { selector: '.dk-app-shell-entry[aria-disabled="true"]', decls: { color: t("color-role-muted"), cursor: "not-allowed" } },
  { selector: ".dk-app-shell-entry:focus-visible", decls: { outline: `${t("space-focus-width")} solid ${t("color-role-accent")}`, "outline-offset": `calc(-1 * ${t("space-focus-width")})` } },
  { selector: ".dk-app-shell-reason", decls: { display: "block", "font-size": t("type-scale-sm") } },
  { selector: ".dk-app-shell-main", decls: { "min-width": "0" } },

  // wide, sidebar: beside the content, in view while it scrolls, scrolling within itself when taller than the viewport.
  { when: "wide", selector: SIDEBAR, decls: { display: "grid", "grid-template-columns": `${t("layout-shell-sidebar")} minmax(0, 1fr)`, "align-items": "start", "padding-top": "0" } },
  { when: "wide", selector: `html:has(${SIDEBAR})`, decls: { "scroll-padding-top": "0" } },
  {
    when: "wide",
    selector: `${SIDEBAR} > .dk-app-shell-top`,
    decls: { position: "sticky", "max-height": "100dvh", "overflow-y": "auto", "box-shadow": `${t("space-border-width")} 0 0 ${t("color-role-border")}` },
  },
  { when: "wide", selector: `${SIDEBAR} .dk-app-shell-bar`, decls: { "flex-wrap": "wrap", height: "auto", "min-height": BAR } },
  { when: "wide", selector: ".dk-app-shell-menu", decls: { display: "none" } },
  { when: "wide", selector: ".dk-app-shell-nav", decls: { display: "block" } },
  { when: "wide", selector: ".dk-app-shell-account-name", decls: { display: "inline" } },
  { when: "wide", selector: ".dk-app-shell-account-menu-name", decls: { display: "none" } },
  // wide, top bar: one row of one control's height, the entries inline between the product and the tools.
  { when: "wide", selector: `${TOPBAR} > .dk-app-shell-top`, decls: { display: "grid", "grid-template-columns": "auto minmax(0, 1fr) auto", height: BAR } },
  { when: "wide", selector: `${TOPBAR} .dk-app-shell-bar`, decls: { display: "contents" } },
  { when: "wide", selector: `${TOPBAR} .dk-app-shell-product`, decls: { "grid-column": "1", "grid-row": "1" } },
  { when: "wide", selector: `${TOPBAR} .dk-app-shell-nav`, decls: { display: "flex", "grid-column": "2", "grid-row": "1", "overflow-x": "auto" } },
  { when: "wide", selector: `${TOPBAR} .dk-app-shell-tools`, decls: { "grid-column": "3", "grid-row": "1" } },
  { when: "wide", selector: `${TOPBAR} .dk-app-shell-section`, decls: { display: "flex", "align-items": "center", "white-space": "nowrap" } },
  { when: "wide", selector: `${TOPBAR} .dk-app-shell-entry`, decls: { display: "flex", "flex-direction": "column", "justify-content": "center", height: BAR, "min-height": "0", "padding-top": "0", "padding-bottom": "0" } },

  // short: the pinned bar would take more than its budget, so it unpins (the sidebar's higher specificity keeps it in view).
  { when: "short", selector: ".dk-app-shell", decls: { "padding-top": "0" } },
  { when: "short", selector: "html:has(.dk-app-shell)", decls: { "scroll-padding-top": "0" } },
  { when: "short", selector: ".dk-app-shell-top", decls: { position: "static" } },
  { when: "short", selector: '.dk-app-shell[data-open="true"] .dk-app-shell-nav', decls: { "max-height": "none" } },
];

export const appShellStyles: ComponentStyles = { elementType: "nav", rules };
