import * as React from "react";
import * as RadixSelect from "@radix-ui/react-select";
import { defineComponent } from "./define.js";
import { fieldRules, statesRule, t, type ComponentStyles } from "./style.js";

export const selectDef = defineComponent({
  name: "Select",
  props: {},
  states: ["default", "hover", "focus-visible", "active", "disabled", "error"],
});

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  /** The choices, in display order. Values are non-empty strings. */
  options: readonly SelectOption[];
  /** The selected value (controlled). */
  value?: string;
  /** The initial value (uncontrolled). */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Shown while no value is selected. */
  placeholder?: string;
  /** Disables the control and shows the disabled state. */
  disabled?: boolean;
  /** Marks the value invalid: sets `aria-invalid` and shows the error state. */
  error?: boolean;
  /** The DOM id of the trigger. */
  id?: string;
  /** The accessible name when no visible label is associated. */
  "aria-label"?: string;
}

/**
 * A single-choice dropdown over Radix Select.
 * @use Choosing one value from a short, fixed list.
 * @avoid Free text (use TextInput); two options that are on or off (use Switch).
 */
export function Select({ options, value, defaultValue, onValueChange, placeholder, disabled, error, id, "aria-label": ariaLabel }: SelectProps): React.ReactElement {
  const root: RadixSelect.SelectProps = { ...(value !== undefined ? { value } : {}), ...(defaultValue !== undefined ? { defaultValue } : {}), ...(onValueChange ? { onValueChange } : {}), ...(disabled ? { disabled } : {}) };
  return (
    <RadixSelect.Root {...root}>
      <RadixSelect.Trigger className="dk-select-trigger" id={id} aria-label={ariaLabel} aria-invalid={error || undefined}>
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon className="dk-select-icon">{"▾"}</RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content className="dk-select-content" position="popper" sideOffset={4}>
          <RadixSelect.Viewport>
            {options.map((o) => (
              <RadixSelect.Item key={o.value} value={o.value} disabled={o.disabled} className="dk-select-item">
                <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}

export const selectStyles: ComponentStyles = {
  elementType: "combobox",
  rules: [
    statesRule(".dk-select-trigger", selectDef),
    ...fieldRules(".dk-select-trigger"),
    { selector: ".dk-select-trigger:not(:disabled):active", decls: { "background-color": t("color-role-surface-active") } },
    // Radix renders a visually hidden native select beside the trigger; it reads the same scale as the trigger.
    { selector: 'select[aria-hidden="true"]', decls: { "font-size": t("type-scale-md") } },
    { selector: ".dk-select-icon", decls: { color: t("color-role-muted"), "margin-left": t("space-scale-2") } },
    {
      selector: ".dk-select-content",
      decls: {
        "background-color": t("color-role-field"),
        color: t("color-role-field-text"),
        border: `${t("space-border-width")} solid ${t("color-role-border")}`,
        "border-radius": t("space-radius-sm"),
        "font-family": t("type-family-sans"),
        "font-size": t("type-scale-md"),
        "z-index": "1",
      },
    },
    { selector: ".dk-select-item", decls: { padding: `${t("space-scale-2")} ${t("space-scale-3")}`, cursor: "pointer", outline: "none" } },
    { selector: '.dk-select-item[data-highlighted]', decls: { "background-color": t("color-role-accent"), color: t("color-role-accent-text") } },
    { selector: '.dk-select-item[data-disabled]', decls: { color: t("color-role-muted"), cursor: "not-allowed" } },
  ],
};
