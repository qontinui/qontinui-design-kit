/** The package name, exported so a consumer (and the delivery probe) can tell the module loaded. */
export const designKitName = "@qontinui/design-kit";

export { compileSource, driftedOutputs, writeOutputs, OUTPUT_FILES } from "./compile/compile.js";
export type { CompileOptions, CompileReport, CompileResult } from "./compile/compile.js";
// The kit's width and height conditions, compiled per project into conditions.css.
export { computedLength, conditionsOf, emitConditions, CONDITION_LEAVES } from "./emit/conditions.js";
export type { ConditionalSource, ConditionsReport, ConditionState } from "./emit/conditions.js";
export { parseSource } from "./source/parse.js";
export { SourceError, GROUPS } from "./source/schema.js";
export type { DesignSource, Leaf, GroupName, SourceKind } from "./source/schema.js";
export * as craft from "./craft/arithmetic.js";
export { loadTokenPackage, tokenLeaves, TOKEN_PACKAGE } from "./adapters/design-tokens.js";

// Phase 4: the guide, budgets and thresholds, the computed stage, the diff and the class lint.
export { buildGuide, emitGuide, guideFileName, canonical, atRoot, headingSizes, GUIDE_VERSION } from "./emit/guide.js";
export type { StyleGuideConfig, StyleRule, StyleConstraint, DesignTokens } from "./emit/guide.js";
export { budgetEntries, emitBudgets, emitThresholds, UNDECLARED_IMAGERY_THRESHOLDS } from "./emit/budgets.js";
export type { ThresholdEntry } from "./emit/budgets.js";
export { checkVersion, stageOf, sourceOf, boundOf, loadEvidence } from "./threshold/stage.js";
export type { Stage, Evidence, EvidenceRecord } from "./threshold/stage.js";
export { compareBounds, formatMove } from "./diff/diff.js";
export { lintText, lintDir } from "./lint/classes.js";
export type { Finding } from "./lint/classes.js";

// Phase 5: states as data and the kit slice. Components are exported by name.
export { defineComponent, STATES, variantsOf } from "./kit/define.js";
export type { ComponentDef, State } from "./kit/define.js";
export { CONDITIONS } from "./kit/style.js";
export type { Condition, Rule } from "./kit/style.js";
export { COMPONENTS, PATTERNS, ALL, kitCss, kitTokenContract, tokensOf } from "./kit/registry.js";
export { Button } from "./kit/button.js";
export type { ButtonProps } from "./kit/button.js";
export { TextInput } from "./kit/text-input.js";
export type { TextInputProps } from "./kit/text-input.js";
export { Select } from "./kit/select.js";
export type { SelectProps, SelectOption } from "./kit/select.js";
export { Checkbox } from "./kit/checkbox.js";
export type { CheckboxProps } from "./kit/checkbox.js";
export { Switch } from "./kit/switch.js";
export type { SwitchProps } from "./kit/switch.js";
export { Tabs } from "./kit/tabs.js";
export type { TabsProps, TabItem } from "./kit/tabs.js";
export { Dialog } from "./kit/dialog.js";
export type { DialogProps } from "./kit/dialog.js";
export { DataTable } from "./kit/data-table.js";
export type { DataTableProps, DataTableColumn } from "./kit/data-table.js";
export { RecordListPage } from "./kit/record-list-page.js";
export type { RecordListPageProps } from "./kit/record-list-page.js";
export { AppShell } from "./kit/app-shell.js";
export type { AppShellProps, AppShellSection, AppShellEntry, AppShellAccount, AppShellCart, AppShellLink } from "./kit/app-shell.js";
