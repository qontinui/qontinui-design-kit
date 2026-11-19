import * as React from "react";
import { defineComponent } from "./define.js";
import { DataTable, type DataTableColumn } from "./data-table.js";
import { t, type ComponentStyles } from "./style.js";

export const recordListPageDef = defineComponent({
  name: "RecordListPage",
  props: {},
  states: ["default", "loading", "error"],
});

export interface RecordListPageProps<T> {
  /** The page title. */
  title: string;
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** True while the first load is in flight. */
  isLoading: boolean;
  /** True when a filter or search is applied; an empty result then shows `filteredEmpty`. */
  isFiltered: boolean;
  /** Set when the load failed; shows `error`. */
  failed: boolean;
  /** REQUIRED. What the user sees when there are no records at all: say what a record is and how to add one. */
  empty: React.ReactNode;
  /** REQUIRED. What the user sees while loading. */
  loading: React.ReactNode;
  /** REQUIRED. What the user sees when the load failed: say what failed and what to do. */
  error: React.ReactNode;
  /** REQUIRED. What the user sees when a filter matches nothing: say so and offer to clear it. */
  filteredEmpty: React.ReactNode;
  /** Controls and filters shown beside the title. */
  actions?: React.ReactNode;
  selectedKey?: string;
  onRowClick?: (row: T) => void;
}

/**
 * The working-screen pattern for a list of records. Its four state props are required, so a screen without an empty, loading, error or filtered-empty state does not compile.
 * @use Any screen that lists records fetched from a service.
 * @avoid A static table of fixed content (use DataTable directly).
 */
export function RecordListPage<T>(props: RecordListPageProps<T>): React.ReactElement {
  const { title, columns, rows, rowKey, isLoading, isFiltered, failed, empty, loading, error, filteredEmpty, actions, selectedKey, onRowClick } = props;
  let body: React.ReactNode;
  let state: string;
  if (isLoading) {
    body = loading;
    state = "loading";
  } else if (failed) {
    body = error;
    state = "error";
  } else if (rows.length === 0) {
    body = isFiltered ? filteredEmpty : empty;
    state = isFiltered ? "filtered-empty" : "empty";
  } else {
    body = <DataTable columns={columns} rows={rows} rowKey={rowKey} caption={title} {...(selectedKey !== undefined ? { selectedKey } : {})} {...(onRowClick ? { onRowClick } : {})} />;
    state = "ready";
  }
  return (
    <section className="dk-record-list-page" data-dk-page-state={state}>
      <header className="dk-record-list-header">
        <h1 className="dk-heading">{title}</h1>
        {actions}
      </header>
      <div className="dk-record-list-body" role={state === "error" ? "alert" : state === "loading" ? "status" : undefined}>
        {body}
      </div>
    </section>
  );
}

export const recordListPageStyles: ComponentStyles = {
  elementType: "section",
  rules: [
    {
      selector: ".dk-record-list-page",
      decls: { "font-family": t("type-family-sans"), color: t("color-role-text"), "background-color": t("color-role-surface"), padding: t("space-scale-4") },
    },
    {
      selector: ".dk-record-list-header",
      decls: { display: "flex", "align-items": "center", "justify-content": "space-between", "margin-bottom": t("space-scale-4"), gap: t("space-scale-4") },
    },
    { selector: ".dk-heading", decls: { margin: "0", "font-size": t("type-scale-xl"), "font-weight": t("type-weight-strong"), "line-height": t("type-leading-body") } },
    {
      selector: ".dk-record-list-body > :not(table)",
      decls: { padding: t("space-scale-6"), color: t("color-role-muted"), "font-size": t("type-scale-md"), border: `${t("space-border-width")} dashed ${t("color-role-border")}`, "border-radius": t("space-radius-md") },
    },
    { selector: '.dk-record-list-page[data-dk-page-state="error"] .dk-record-list-body', decls: { color: t("color-role-text") } },
  ],
};
