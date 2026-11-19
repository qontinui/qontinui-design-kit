import * as React from "react";
import { defineComponent } from "./define.js";
import { statesRule, t, type ComponentStyles } from "./style.js";

export const dataTableDef = defineComponent({
  name: "DataTable",
  props: {},
  states: ["default", "hover", "focus-visible", "selected"],
});

export interface DataTableColumn<T> {
  /** A unique key for the column. */
  key: string;
  header: string;
  /** Renders the cell for a row. */
  render: (row: T) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  /** A unique, stable key per row. */
  rowKey: (row: T) => string;
  /** The key of the selected row, if any. */
  selectedKey?: string;
  /** Makes rows focusable and clickable. Without it rows are plain rows. */
  onRowClick?: (row: T) => void;
  /** A caption naming the table for assistive technology. */
  caption: string;
  /** Prefix for each row's DOM id (`<prefix>-<rowKey>`). */
  idPrefix?: string;
}

/**
 * A table of records: header row, one row per record, an optional selected row.
 * @use Showing many records of the same shape that a user compares or picks from.
 * @avoid Layout; a single record (use a detail view). Always wrap it in RecordListPage for the empty, loading and error states.
 */
export function DataTable<T>({ columns, rows, rowKey, selectedKey, onRowClick, caption, idPrefix }: DataTableProps<T>): React.ReactElement {
  return (
    <table className="dk-table">
      <caption className="dk-table-caption">{caption}</caption>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} scope="col" className="dk-table-head">
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const key = rowKey(row);
          const selected = key === selectedKey;
          return (
            <tr
              key={key}
              id={idPrefix ? `${idPrefix}-${key}` : undefined}
              className="dk-row"
              data-dk-state={selected ? "selected" : undefined}
              aria-selected={onRowClick ? selected : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      // A control inside a cell keeps its own keyboard activation.
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
            >
              {columns.map((c) => (
                <td key={c.key} className="dk-cell">
                  {c.render(row)}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export const dataTableStyles: ComponentStyles = {
  elementType: "generic",
  rules: [
    statesRule(".dk-row", dataTableDef),
    {
      selector: ".dk-table",
      decls: { width: "100%", "border-collapse": "collapse", "font-family": t("type-family-sans"), "font-size": t("type-scale-md"), color: t("color-role-text") },
    },
    { selector: ".dk-table-caption", decls: { "text-align": "left", color: t("color-role-muted"), padding: t("space-scale-2") } },
    {
      selector: ".dk-table-head",
      decls: {
        "text-align": "left",
        padding: `${t("space-scale-2")} ${t("space-scale-3")}`,
        "font-weight": t("type-weight-strong"),
        "border-bottom": `${t("space-border-emphasis")} solid ${t("color-role-border")}`,
      },
    },
    { selector: ".dk-cell", decls: { padding: `${t("space-scale-2")} ${t("space-scale-3")}`, "border-bottom": `${t("space-border-width")} solid ${t("color-role-border")}` } },
    { selector: ".dk-row", decls: { "background-color": t("color-role-surface"), color: t("color-role-text") } },
    { selector: ".dk-row[tabindex]:not([data-dk-state]):hover", decls: { "background-color": t("color-role-surface-hover") } },
    {
      selector: ".dk-row:focus-visible",
      decls: { outline: `${t("space-focus-width")} solid ${t("color-role-accent")}`, "outline-offset": `calc(${t("space-focus-offset")} * -1)` },
    },
    { selector: '.dk-row[data-dk-state="selected"]', decls: { "background-color": t("color-role-accent"), color: t("color-role-accent-text") } },
  ],
};
