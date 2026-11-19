/**
 * The slice: eight components and one working-screen pattern. Every consumer
 * of component data (the stylesheet, the specimen, the state check, the guide
 * and the generated index) reads these lists and nothing else.
 */
import { buttonDef, buttonStyles } from "./button.js";
import { checkboxDef, checkboxStyles } from "./checkbox.js";
import { dataTableDef, dataTableStyles } from "./data-table.js";
import type { ComponentDef } from "./define.js";
import { dialogDef, dialogStyles } from "./dialog.js";
import { recordListPageDef, recordListPageStyles } from "./record-list-page.js";
import { selectDef, selectStyles } from "./select.js";
import { renderRules, tokensRead, type ComponentStyles } from "./style.js";
import { switchDef, switchStyles } from "./switch.js";
import { tabsDef, tabsStyles } from "./tabs.js";
import { textInputDef, textInputStyles } from "./text-input.js";

export interface KitEntry {
  def: ComponentDef;
  styles: ComponentStyles;
}

/** The eight components of the slice, in index order. */
export const COMPONENTS: readonly KitEntry[] = [
  { def: buttonDef, styles: buttonStyles },
  { def: textInputDef, styles: textInputStyles },
  { def: selectDef, styles: selectStyles },
  { def: checkboxDef, styles: checkboxStyles },
  { def: switchDef, styles: switchStyles },
  { def: tabsDef, styles: tabsStyles },
  { def: dialogDef, styles: dialogStyles },
  { def: dataTableDef, styles: dataTableStyles },
];

/** The working-screen patterns (composed of the components above). */
export const PATTERNS: readonly KitEntry[] = [{ def: recordListPageDef, styles: recordListPageStyles }];

export const ALL: readonly KitEntry[] = [...COMPONENTS, ...PATTERNS];

/** The kit stylesheet: every component's rules, in slice order. No skin: each declaration reads `var(--dk-*)`. */
export function kitCss(entries: readonly KitEntry[] = ALL): string {
  return entries.map((e) => `/* ${e.def.name} */\n${renderRules(e.styles.rules)}`).join("\n") + "\n";
}

/** Tokens (custom property names) a component reads. */
export function tokensOf(entry: KitEntry): string[] {
  return tokensRead(entry.styles.rules);
}

/** Every token the whole kit reads: what a design-language source must provide. */
export function kitTokenContract(entries: readonly KitEntry[] = ALL): string[] {
  return [...new Set(entries.flatMap(tokensOf))].sort();
}
