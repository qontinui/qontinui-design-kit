import * as React from "react";
import * as RadixSwitch from "@radix-ui/react-switch";
import { defineComponent } from "./define.js";
import { statesRule, t, type ComponentStyles } from "./style.js";

export const switchDef = defineComponent({
  name: "Switch",
  props: {},
  states: ["default", "hover", "focus-visible", "active", "disabled", "selected"],
});

export interface SwitchProps {
  /** On state (controlled). */
  checked?: boolean;
  /** Initial on state (uncontrolled). */
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
 * A two-position switch over Radix Switch.
 * @use A setting that takes effect the moment it is flipped.
 * @avoid A choice submitted later with a form (use Checkbox).
 */
export function Switch({ checked, defaultChecked, onCheckedChange, disabled, id, "aria-label": ariaLabel }: SwitchProps): React.ReactElement {
  const root: RadixSwitch.SwitchProps = {
    ...(checked !== undefined ? { checked } : {}),
    ...(defaultChecked !== undefined ? { defaultChecked } : {}),
    ...(onCheckedChange ? { onCheckedChange } : {}),
    ...(disabled ? { disabled } : {}),
  };
  return (
    <RadixSwitch.Root {...root} id={id} aria-label={ariaLabel} className="dk-switch">
      <RadixSwitch.Thumb className="dk-switch-thumb" />
    </RadixSwitch.Root>
  );
}

export const switchStyles: ComponentStyles = {
  elementType: "switch",
  rules: [
    statesRule(".dk-switch", switchDef),
    {
      selector: ".dk-switch",
      decls: {
        display: "inline-flex",
        "align-items": "center",
        "box-sizing": "border-box",
        width: `calc(${t("space-scale-6")} * 2)`,
        height: t("space-scale-6"),
        padding: t("space-border-emphasis"),
        "background-color": t("color-role-control"),
        color: t("color-role-text"),
        "font-family": t("type-family-sans"),
        "font-size": t("type-scale-md"),
        border: `${t("space-border-width")} solid ${t("color-role-border")}`,
        "border-radius": t("space-scale-6"),
        cursor: "pointer",
        transition: `background-color ${t("motion-duration-fast")} ${t("motion-easing-standard")}`,
      },
    },
    { selector: '.dk-switch:not(:disabled):not([data-state="checked"]):hover', decls: { "background-color": t("color-role-control-hover") } },
    { selector: '.dk-switch:not(:disabled):not([data-state="checked"]):active', decls: { "background-color": t("color-role-control-active") } },
    { selector: '.dk-switch[data-state="checked"]', decls: { "background-color": t("color-role-accent"), "border-color": t("color-role-accent") } },
    { selector: '.dk-switch[data-state="checked"]:not(:disabled):hover', decls: { "background-color": t("color-role-accent-hover") } },
    {
      selector: ".dk-switch:focus-visible",
      decls: { outline: `${t("space-focus-width")} solid ${t("color-role-accent")}`, "outline-offset": t("space-focus-offset") },
    },
    { selector: ".dk-switch:disabled", decls: { color: t("color-role-muted"), "background-color": t("color-role-surface-hover"), "border-color": t("color-role-muted"), cursor: "not-allowed" } },
    {
      selector: ".dk-switch-thumb",
      decls: {
        display: "block",
        width: t("space-scale-4"),
        height: t("space-scale-4"),
        "background-color": t("color-role-surface"),
        "border-radius": t("space-scale-4"),
        transition: `transform ${t("motion-duration-fast")} ${t("motion-easing-standard")}`,
      },
    },
    { selector: '.dk-switch[data-state="checked"] .dk-switch-thumb', decls: { transform: `translateX(${t("space-scale-6")})` } },
  ],
};
