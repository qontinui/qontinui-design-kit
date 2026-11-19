import * as React from "react";
import { defineComponent } from "./define.js";
import { statesRule, t, type ComponentStyles, type Rule } from "./style.js";

export const buttonDef = defineComponent({
  name: "Button",
  props: { variant: ["primary", "secondary", "quiet"] },
  states: ["default", "hover", "focus-visible", "active", "disabled", "loading"],
});

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  /** Visual weight: `primary` for the one main action on a screen, `secondary` for the rest, `quiet` for low-emphasis actions. */
  variant?: "primary" | "secondary" | "quiet";
  /** Shows the loading state and sets `aria-busy`; the button stays in place and ignores clicks. */
  loading?: boolean;
  /** The native button type. Defaults to `button`, never `submit`. */
  type?: "button" | "submit" | "reset";
}

/**
 * A button over the native element.
 * @use Any action a user triggers: save, add, confirm. One `primary` per screen.
 * @avoid Navigation to another page (use a link); a toggle (use Switch or Checkbox).
 */
export function Button({ variant = "secondary", loading = false, type = "button", onClick, ...rest }: ButtonProps): React.ReactElement {
  return (
    <button
      {...rest}
      type={type}
      className="dk-button"
      data-variant={variant}
      data-dk-state={loading ? "loading" : undefined}
      aria-busy={loading || undefined}
      onClick={loading ? undefined : onClick}
    />
  );
}

const ROLE: Record<string, { bg: string; fg: string; border: string }> = {
  primary: { bg: "accent", fg: "accent-text", border: "accent" },
  secondary: { bg: "control", fg: "control-text", border: "border" },
  quiet: { bg: "surface", fg: "text", border: "surface" },
};

function variantRules(): Rule[] {
  const out: Rule[] = [];
  const idle = ":not(:disabled):not([data-dk-state])";
  for (const [v, r] of Object.entries(ROLE)) {
    const sel = `.dk-button[data-variant="${v}"]`;
    out.push({
      selector: sel,
      decls: { "background-color": t(`color-role-${r.bg}`), color: t(`color-role-${r.fg}`), "border-color": t(`color-role-${r.border}`) },
    });
    out.push({ selector: `${sel}${idle}:hover`, decls: { "background-color": t(`color-role-${r.bg}-hover`) } });
    out.push({ selector: `${sel}${idle}:active`, decls: { "background-color": t(`color-role-${r.bg}-active`) } });
  }
  return out;
}

export const buttonStyles: ComponentStyles = {
  elementType: "button",
  rules: [
    statesRule(".dk-button", buttonDef),
    {
      selector: ".dk-button",
      decls: {
        display: "inline-flex",
        "align-items": "center",
        gap: t("space-scale-2"),
        padding: `${t("space-scale-2")} ${t("space-scale-4")}`,
        border: `${t("space-border-width")} solid ${t("color-role-border")}`,
        "border-radius": t("space-radius-md"),
        "font-family": t("type-family-sans"),
        "font-size": t("type-scale-md"),
        "font-weight": t("type-weight-strong"),
        "line-height": t("type-leading-body"),
        cursor: "pointer",
        transition: `background-color ${t("motion-duration-fast")} ${t("motion-easing-standard")}`,
      },
    },
    ...variantRules(),
    {
      selector: ".dk-button:focus-visible",
      decls: { outline: `${t("space-focus-width")} solid ${t("color-role-accent")}`, "outline-offset": t("space-focus-offset") },
    },
    {
      selector: '.dk-button:disabled',
      decls: { "background-color": t("color-role-surface-hover"), color: t("color-role-muted"), "border-color": t("color-role-muted"), cursor: "not-allowed" },
    },
    {
      selector: '.dk-button[data-dk-state="loading"]',
      decls: { "background-color": t("color-role-surface-active"), color: t("color-role-muted"), cursor: "progress" },
    },
  ],
};
