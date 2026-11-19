// Compiled by test/kit.test.js with `tsc --noEmit`. Each `@ts-expect-error`
// line proves that omitting a state prop of RecordListPage is a compile error:
// if the prop stopped being required, tsc would report the directive unused.
import * as React from "react";
import { RecordListPage } from "../../../dist/index.js";

interface Row {
  n: string;
}
const base = {
  title: "T",
  columns: [{ key: "n", header: "N", render: (r: Row) => r.n }],
  rows: [] as Row[],
  rowKey: (r: Row) => r.n,
  isLoading: false,
  isFiltered: false,
  failed: false,
};

export const complete = <RecordListPage {...base} empty="e" loading="l" error="x" filteredEmpty="f" />;

// @ts-expect-error `empty` is required
export const noEmpty = <RecordListPage {...base} loading="l" error="x" filteredEmpty="f" />;

// @ts-expect-error `loading` is required
export const noLoading = <RecordListPage {...base} empty="e" error="x" filteredEmpty="f" />;

// @ts-expect-error `error` is required
export const noError = <RecordListPage {...base} empty="e" loading="l" filteredEmpty="f" />;

// @ts-expect-error `filteredEmpty` is required
export const noFilteredEmpty = <RecordListPage {...base} empty="e" loading="l" error="x" />;

export const unused: React.ReactElement[] = [complete, noEmpty, noLoading, noError, noFilteredEmpty];
