import * as React from "react";
import * as RadixTabs from "@radix-ui/react-tabs";
import { defineComponent } from "./define.js";
import { statesRule, t, type ComponentStyles } from "./style.js";

export const tabsDef = defineComponent({
  name: "Tabs",
  props: {},
  states: ["default", "hover", "focus-visible", "active", "disabled", "selected"],
});

export interface TabItem {
  /** A unique, non-empty id; the active tab's value. */
  value: string;
  label: string;
  /** The panel shown while this tab is active. */
  content: React.ReactNode;
  disabled?: boolean;
  /** The DOM id of the tab trigger. */
  id?: string;
}

export interface TabsProps {
  tabs: readonly TabItem[];
  /** The active tab (controlled). */
  value?: string;
  /** The initial active tab (uncontrolled). Defaults to the first tab. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

/**
 * Tabs over Radix Tabs: one panel visible at a time.
 * @use Switching between views of the same record or screen.
 * @avoid Steps that must be completed in order; navigation between pages.
 */
export function Tabs({ tabs, value, defaultValue, onValueChange }: TabsProps): React.ReactElement {
  const first = tabs[0]?.value;
  const root: RadixTabs.TabsProps = {
    ...(value !== undefined ? { value } : { defaultValue: defaultValue ?? first }),
    ...(onValueChange ? { onValueChange } : {}),
  };
  return (
    <RadixTabs.Root {...root} className="dk-tabs">
      <RadixTabs.List className="dk-tabs-list">
        {tabs.map((tab) => (
          <RadixTabs.Trigger key={tab.value} value={tab.value} disabled={tab.disabled} id={tab.id} className="dk-tabs-trigger">
            {tab.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {tabs.map((tab) => (
        <RadixTabs.Content key={tab.value} value={tab.value} className="dk-tabs-content">
          {tab.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}

export const tabsStyles: ComponentStyles = {
  elementType: "tab",
  rules: [
    statesRule(".dk-tabs-trigger", tabsDef),
    { selector: ".dk-tabs-list", decls: { display: "flex", "border-bottom": `${t("space-border-width")} solid ${t("color-role-border")}` } },
    {
      selector: ".dk-tabs-trigger",
      decls: {
        padding: `${t("space-scale-2")} ${t("space-scale-4")}`,
        "background-color": t("color-role-surface"),
        color: t("color-role-muted"),
        border: "0",
        "border-bottom": `${t("space-border-emphasis")} solid ${t("color-role-surface")}`,
        "font-family": t("type-family-sans"),
        "font-size": t("type-scale-md"),
        "font-weight": t("type-weight-strong"),
        cursor: "pointer",
        transition: `background-color ${t("motion-duration-fast")} ${t("motion-easing-standard")}`,
      },
    },
    { selector: '.dk-tabs-trigger:not(:disabled):not([data-state="active"]):hover', decls: { "background-color": t("color-role-surface-hover") } },
    { selector: '.dk-tabs-trigger:not(:disabled):not([data-state="active"]):active', decls: { "background-color": t("color-role-surface-active") } },
    { selector: '.dk-tabs-trigger[data-state="active"]', decls: { color: t("color-role-text"), "border-bottom-color": t("color-role-accent") } },
    {
      selector: ".dk-tabs-trigger:focus-visible",
      decls: { outline: `${t("space-focus-width")} solid ${t("color-role-accent")}`, "outline-offset": t("space-focus-offset") },
    },
    { selector: ".dk-tabs-trigger:disabled", decls: { color: t("color-role-muted"), "background-color": t("color-role-surface-hover"), cursor: "not-allowed" } },
    { selector: ".dk-tabs-content", decls: { padding: t("space-scale-4"), color: t("color-role-text"), "font-family": t("type-family-sans") } },
  ],
};
