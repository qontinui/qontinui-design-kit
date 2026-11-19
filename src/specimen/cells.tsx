import * as React from "react";
import { Button } from "../kit/button.js";
import { Checkbox } from "../kit/checkbox.js";
import { DataTable } from "../kit/data-table.js";
import { variantsOf, type State } from "../kit/define.js";
import { Dialog } from "../kit/dialog.js";
import { COMPONENTS, type KitEntry } from "../kit/registry.js";
import { Select } from "../kit/select.js";
import { Switch } from "../kit/switch.js";
import { Tabs } from "../kit/tabs.js";
import { TextInput } from "../kit/text-input.js";

/**
 * One cell of the matrix: a component, a variant and a state. The state is
 * forced by the door where a pseudo-class can force it (`hover`, `active`) and
 * rendered through the attribute the component reads where it cannot.
 */
export interface Cell {
  component: string;
  variant: string;
  state: State;
  /** The DOM id of the cell's root. */
  id: string;
  /** The DOM id of the element the state check measures (a table cell measures its first row). */
  target: string;
}

const kebab = (s: string): string => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

export function cellId(component: string, variant: string, state: State): string {
  return `cell-${kebab(component)}-${variant}-${state}`;
}

export function cellsOf(entries: readonly KitEntry[] = COMPONENTS): Cell[] {
  const out: Cell[] = [];
  for (const { def } of entries) {
    for (const variant of variantsOf(def)) {
      for (const state of def.states) {
        const id = cellId(def.name, variant, state);
        out.push({ component: def.name, variant, state, id, target: def.name === "DataTable" ? `${id}-r1` : id });
      }
    }
  }
  return out;
}

const OPTIONS = [
  { value: "a", label: "First option" },
  { value: "b", label: "Second option" },
];

interface Row {
  key: string;
  name: string;
  owner: string;
}
const ROWS: Row[] = [
  { key: "r1", name: "Alpha", owner: "Ada" },
  { key: "r2", name: "Beta", owner: "Grace" },
];

/** Render a cell's component. A component with no renderer here is a defect the registry test names. */
export function renderCell(cell: Cell): React.ReactElement {
  const { id, state, variant } = cell;
  const disabled = state === "disabled";
  switch (cell.component) {
    case "Button":
      return (
        <Button id={id} variant={variant as "primary" | "secondary" | "quiet"} disabled={disabled} loading={state === "loading"}>
          Save changes
        </Button>
      );
    case "TextInput":
      return <TextInput id={id} aria-label="Name" defaultValue="Ada Lovelace" disabled={disabled} error={state === "error"} />;
    case "Select":
      return <Select id={id} aria-label="Option" options={OPTIONS} defaultValue="a" disabled={disabled} error={state === "error"} />;
    case "Checkbox":
      return <Checkbox id={id} aria-label="Accept" defaultChecked={state === "selected"} disabled={disabled} />;
    case "Switch":
      return <Switch id={id} aria-label="Enabled" defaultChecked={state === "selected"} disabled={disabled} />;
    case "Tabs":
      return (
        <Tabs
          defaultValue={state === "selected" ? "a" : "b"}
          tabs={[
            { value: "a", label: "Overview", id, content: "Overview content", disabled },
            { value: "b", label: "History", id: `${id}-b`, content: "History content" },
          ]}
        />
      );
    case "Dialog":
      return <Dialog id={id} triggerLabel="Open dialog" title="Confirm" description="Confirm the change." disabled={disabled} />;
    case "DataTable":
      return (
        <DataTable
          caption="Records"
          idPrefix={id}
          columns={[
            { key: "name", header: "Name", render: (r: Row) => r.name },
            { key: "owner", header: "Owner", render: (r: Row) => r.owner },
          ]}
          rows={ROWS}
          rowKey={(r: Row) => r.key}
          {...(state === "selected" ? { selectedKey: "r1" } : {})}
          onRowClick={() => undefined}
        />
      );
    default:
      throw new Error(`specimen: no renderer for component ${cell.component}`);
  }
}
