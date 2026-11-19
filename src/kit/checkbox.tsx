import * as React from "react";
import * as RadixCheckbox from "@radix-ui/react-checkbox";
import { defineComponent } from "./define.js";
import { statesRule, t, type ComponentStyles } from "./style.js";

export const checkboxDef = defineComponent({
  name: "Checkbox",
  props: {},
  states: ["default", "hover", "focus-visible", "active", "disabled", "selected"],
});

export interface CheckboxProps {
  /** Checked state (controlled). */
  checked?: boolean;
  /** Initial checked state (uncontrolled). */
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Disables the control and shows the disabled state. */
  disabled?: boolean;
  /** The DOM id of the control. */
  id?: string;
  /** The accessible name when no visible label is associated. */
  "aria-label"?: string;
}

/**
 * A checkbox over Radix Checkbox.
 * @use One independent yes/no choice in a form or a list of options.
 * @avoid An immediate on/off setting (use Switch); one choice among several (use Select).
 */
export function Checkbox({ checked, defaultChecked, onCheckedChange, disabled, id, "aria-label": ariaLabel }: CheckboxProps): React.ReactElement {
  const root: RadixCheckbox.CheckboxProps = {
    ...(checked !== undefined ? { checked } : {}),
    ...(defaultChecked !== undefined ? { defaultChecked } : {}),
    ...(onCheckedChange ? { onCheckedChange: (c) => onCheckedChange(c === true) } : {}),
    ...(disabled ? { disabled } : {}),
  };
  return (
    <RadixCheckbox.Root {...root} id={id} aria-label={ariaLabel} className="dk-checkbox">
      <RadixCheckbox.Indicator className="dk-checkbox-indicator">{"✓"}</RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );
}

export const checkboxStyles: ComponentStyles = {
  elementType: "checkbox",
  rules: [
    statesRule(".dk-checkbox", checkboxDef),
    {
      selector: ".dk-checkbox",
      decls: {
        display: "inline-flex",
        "align-items": "center",
        "justify-content": "center",
        "box-sizing": "border-box",
        width: t("space-scale-4"),
        height: t("space-scale-4"),
        padding: "0",
        "background-color": t("color-role-field"),
        color: t("color-role-accent-text"),
        border: `${t("space-border-width")} solid ${t("color-role-border")}`,
        "border-radius": t("space-radius-sm"),
        "font-size": t("type-scale-sm"),
        cursor: "pointer",
        transition: `background-color ${t("motion-duration-fast")} ${t("motion-easing-standard")}`,
      },
    },
    // Radix renders a visually hidden native input beside a checkbox or switch; it reads the same scale and palette.
    { selector: 'input[aria-hidden="true"]', decls: { "font-size": t("type-scale-md"), color: t("color-role-text") } },
    { selector: 'input[aria-hidden="true"]:disabled', decls: { color: t("color-role-muted") } },
    { selector: '.dk-checkbox:not(:disabled):not([data-state="checked"]):hover', decls: { "border-color": t("color-role-accent") } },
    { selector: '.dk-checkbox:not(:disabled):not([data-state="checked"]):active', decls: { "background-color": t("color-role-surface-active") } },
    { selector: '.dk-checkbox[data-state="checked"]', decls: { "background-color": t("color-role-accent"), "border-color": t("color-role-accent") } },
    { selector: '.dk-checkbox[data-state="checked"]:not(:disabled):hover', decls: { "background-color": t("color-role-accent-hover") } },
    {
      selector: ".dk-checkbox:focus-visible",
      decls: { outline: `${t("space-focus-width")} solid ${t("color-role-accent")}`, "outline-offset": t("space-focus-offset") },
    },
    {
      selector: ".dk-checkbox:disabled",
      decls: { "background-color": t("color-role-surface-hover"), color: t("color-role-muted"), "border-color": t("color-role-muted"), cursor: "not-allowed" },
    },
  ],
};
