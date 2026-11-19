/**
 * Component styles are data: a list of CSS rules whose declarations read
 * `var(--dk-*)`. The kit ships no skin, so a literal colour or length in a
 * declaration is a defect (a test reads every rule for one). The same data
 * renders the stylesheet, the guide's rules and the index's "tokens read".
 */
import type { ComponentDef } from "./define.js";

export type Decls = Readonly<Record<string, string>>;
export interface Rule {
  selector: string;
  decls: Decls;
}
export interface ComponentStyles {
  /** The UI Bridge element type the component's root interactive element reports (`button`, `input`, ...). */
  elementType: string;
  rules: readonly Rule[];
}

/** `var(--dk-<path>)`, with the path in its custom-property spelling (`color-role-accent`). */
export const t = (name: string): string => `var(--dk-${name})`;

/** The custom property every kit component's root declares: its state matrix, for a guide to check. */
export const STATES_PROPERTY = "--dk-kit-states";

/** A rule declaring the component's state list on its root selector. */
export function statesRule(selector: string, def: ComponentDef): Rule {
  return { selector, decls: { [STATES_PROPERTY]: JSON.stringify(def.states.join(" ")) } };
}

export function renderRules(rules: readonly Rule[]): string {
  return rules
    .map((r) => `${r.selector} {\n${Object.entries(r.decls).map(([p, v]) => `  ${p}: ${v};`).join("\n")}\n}`)
    .join("\n");
}

const TOKEN_READ = /var\((--dk-[a-z0-9-]+)\)/g;

/** The `--dk-*` custom properties a rule list reads, sorted and unique. */
export function tokensRead(rules: readonly Rule[]): string[] {
  const out = new Set<string>();
  for (const r of rules) for (const v of Object.values(r.decls)) for (const m of v.matchAll(TOKEN_READ)) out.add(m[1] as string);
  return [...out].sort();
}

/** The shared look of a text-entry control (TextInput and the Select trigger). */
export function fieldRules(sel: string): Rule[] {
  const enabled = `${sel}:not(:disabled):not([aria-invalid="true"])`;
  return [
    {
      selector: sel,
      decls: {
        "box-sizing": "border-box",
        display: "inline-flex",
        "align-items": "center",
        "justify-content": "space-between",
        "min-width": "0",
        padding: `${t("space-scale-2")} ${t("space-scale-3")}`,
        "background-color": t("color-role-field"),
        color: t("color-role-field-text"),
        border: `${t("space-border-width")} solid ${t("color-role-border")}`,
        "border-radius": t("space-radius-sm"),
        "font-family": t("type-family-sans"),
        "font-size": t("type-scale-md"),
        "line-height": t("type-leading-body"),
        transition: `border-color ${t("motion-duration-fast")} ${t("motion-easing-standard")}`,
      },
    },
    { selector: `${enabled}:hover`, decls: { "border-color": t("color-role-accent") } },
    {
      selector: `${sel}:focus-visible`,
      decls: { outline: `${t("space-focus-width")} solid ${t("color-role-accent")}`, "outline-offset": t("space-focus-offset") },
    },
    {
      selector: `${sel}:disabled`,
      decls: { "background-color": t("color-role-surface-hover"), color: t("color-role-muted"), "border-color": t("color-role-muted"), cursor: "not-allowed" },
    },
    {
      selector: `${sel}[aria-invalid="true"]`,
      decls: { "border-width": t("space-border-emphasis"), "border-color": t("color-role-text") },
    },
  ];
}
