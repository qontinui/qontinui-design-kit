import * as React from "react";
import { defineComponent } from "./define.js";
import { fieldRules, statesRule, type ComponentStyles } from "./style.js";

export const textInputDef = defineComponent({
  name: "TextInput",
  props: {},
  states: ["default", "hover", "focus-visible", "disabled", "error"],
});

export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Marks the value invalid: sets `aria-invalid` and shows the error state. Pair it with a message the user can read. */
  error?: boolean;
}

/**
 * A single-line text field over the native input.
 * @use Free text, numbers, search and other one-line input.
 * @avoid A fixed set of choices (use Select); long text (use a textarea).
 */
export function TextInput({ error = false, ...rest }: TextInputProps): React.ReactElement {
  return <input {...rest} className="dk-input" aria-invalid={error || undefined} />;
}

export const textInputStyles: ComponentStyles = {
  elementType: "input",
  rules: [statesRule(".dk-input", textInputDef), ...fieldRules(".dk-input")],
};
