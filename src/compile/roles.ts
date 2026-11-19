/**
 * What an undeclared identity group renders as (plan D3): a CSS system keyword
 * the platform supplies. These are the browser's values, not a palette or a
 * face the fleet chose.
 */

export interface ColorRole {
  name: string;
  keyword: string;
  /** For roles that carry state deltas: the keyword mixed into the base. */
  mixWith?: string;
}

export const COLOR_ROLES: readonly ColorRole[] = [
  { name: "surface", keyword: "Canvas", mixWith: "CanvasText" },
  { name: "text", keyword: "CanvasText" },
  { name: "muted", keyword: "GrayText" },
  { name: "accent", keyword: "Highlight", mixWith: "HighlightText" },
  { name: "accent-text", keyword: "HighlightText" },
  { name: "control", keyword: "ButtonFace", mixWith: "ButtonText" },
  { name: "control-text", keyword: "ButtonText" },
  { name: "border", keyword: "ButtonBorder" },
  { name: "field", keyword: "Field" },
  { name: "field-text", keyword: "FieldText" },
  { name: "link", keyword: "LinkText" },
];

/** Percentages of the text colour mixed into a base for a state delta. */
export const STATE_MIX = { hover: 8, active: 14 } as const;

export const FONT_FAMILY_ROLES: readonly { name: string; keyword: string }[] = [
  { name: "sans", keyword: "system-ui" },
  { name: "mono", keyword: "ui-monospace" },
];
