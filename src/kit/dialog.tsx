import * as React from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { defineComponent } from "./define.js";
import { statesRule, t, type ComponentStyles } from "./style.js";

export const dialogDef = defineComponent({
  name: "Dialog",
  props: {},
  states: ["default", "hover", "focus-visible", "active", "disabled"],
});

export interface DialogProps {
  /** The label of the button that opens the dialog. */
  triggerLabel: string;
  /** The dialog's title; it is also its accessible name. */
  title: string;
  /** One sentence saying what the dialog is for. */
  description: string;
  /** The dialog body. */
  children?: React.ReactNode;
  /** Open state (controlled). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Disables the trigger and shows the disabled state. */
  disabled?: boolean;
  /** The DOM id of the trigger. */
  id?: string;
}

/**
 * A modal dialog over Radix Dialog, opened by its own trigger button.
 * @use A decision or a short form that must be answered before the user continues.
 * @avoid Content the user needs beside the page (use a panel); a message that needs no answer.
 */
export function Dialog({ triggerLabel, title, description, children, open, onOpenChange, disabled, id }: DialogProps): React.ReactElement {
  const root: RadixDialog.DialogProps = { ...(open !== undefined ? { open } : {}), ...(onOpenChange ? { onOpenChange } : {}) };
  return (
    <RadixDialog.Root {...root}>
      <RadixDialog.Trigger className="dk-dialog-trigger" id={id} disabled={disabled}>
        {triggerLabel}
      </RadixDialog.Trigger>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="dk-dialog-overlay" />
        <RadixDialog.Content className="dk-dialog-content">
          <RadixDialog.Title className="dk-dialog-title">{title}</RadixDialog.Title>
          <RadixDialog.Description className="dk-dialog-description">{description}</RadixDialog.Description>
          {children}
          <RadixDialog.Close className="dk-dialog-close" aria-label="Close">
            {"×"}
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export const dialogStyles: ComponentStyles = {
  elementType: "button",
  rules: [
    statesRule(".dk-dialog-trigger", dialogDef),
    {
      selector: ".dk-dialog-trigger",
      decls: {
        display: "inline-flex",
        "align-items": "center",
        padding: `${t("space-scale-2")} ${t("space-scale-4")}`,
        "background-color": t("color-role-control"),
        color: t("color-role-control-text"),
        border: `${t("space-border-width")} solid ${t("color-role-border")}`,
        "border-radius": t("space-radius-md"),
        "font-family": t("type-family-sans"),
        "font-size": t("type-scale-md"),
        "font-weight": t("type-weight-strong"),
        cursor: "pointer",
        transition: `background-color ${t("motion-duration-fast")} ${t("motion-easing-standard")}`,
      },
    },
    { selector: ".dk-dialog-trigger:not(:disabled):hover", decls: { "background-color": t("color-role-control-hover") } },
    { selector: ".dk-dialog-trigger:not(:disabled):active", decls: { "background-color": t("color-role-control-active") } },
    {
      selector: ".dk-dialog-trigger:focus-visible",
      decls: { outline: `${t("space-focus-width")} solid ${t("color-role-accent")}`, "outline-offset": t("space-focus-offset") },
    },
    {
      selector: ".dk-dialog-trigger:disabled",
      decls: { "background-color": t("color-role-surface-hover"), color: t("color-role-muted"), "border-color": t("color-role-muted"), cursor: "not-allowed" },
    },
    { selector: ".dk-dialog-overlay", decls: { position: "fixed", inset: "0", "background-color": `color-mix(in oklab, ${t("color-role-text")} 40%, transparent)` } },
    {
      selector: ".dk-dialog-content",
      decls: {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        "box-sizing": "border-box",
        padding: t("space-scale-6"),
        "background-color": t("color-role-surface"),
        color: t("color-role-text"),
        border: `${t("space-border-emphasis")} solid ${t("color-role-text")}`,
        "border-radius": t("space-radius-md"),
        "font-family": t("type-family-sans"),
        "font-size": t("type-scale-md"),
      },
    },
    { selector: ".dk-dialog-title", decls: { margin: "0", "font-size": t("type-scale-xl"), "font-weight": t("type-weight-strong") } },
    { selector: ".dk-dialog-description", decls: { color: t("color-role-muted"), margin: `${t("space-scale-2")} 0 ${t("space-scale-4")}` } },
    {
      selector: ".dk-dialog-close",
      decls: { position: "absolute", top: t("space-scale-2"), right: t("space-scale-2"), "background-color": t("color-role-surface"), color: t("color-role-text"), border: "0", cursor: "pointer" },
    },
  ],
};
