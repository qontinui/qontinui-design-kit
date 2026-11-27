import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Entry } from "../compile/model.js";
import { varName } from "../emit/names.js";
import { AppShell, type AppShellSection } from "../kit/app-shell.js";
import { RecordListPage } from "../kit/record-list-page.js";
import { COMPONENTS, kitCss } from "../kit/registry.js";
import { t } from "../kit/style.js";
import { cellsOf, renderCell, type Cell } from "./cells.js";

export interface SpecimenInput {
  /** `tokens.css` of the compile. */
  tokensCss: string;
  /** The compiled entries, for the design-system board. */
  entries: Entry[];
  /** `declared` unless an identity role rendered as a platform keyword (plan D3). */
  identity: "declared" | "undeclared";
  /** Override the kit stylesheet (the seeded-violation tests remove a rule from a copy). */
  kitCss?: string;
}

/** Layout of the specimen page itself. It reads the same tokens, so the page has no skin of its own. */
const CHROME_CSS = `
.sp-page { margin: 0; padding: ${t("space-scale-6")}; background-color: ${t("color-role-surface")}; color: ${t("color-role-text")}; font-family: ${t("type-family-sans")}; font-size: ${t("type-scale-md")}; }
.sp-page h1 { font-size: ${t("type-scale-xl")}; }
.sp-page h2, .sp-page h3 { font-size: ${t("type-scale-lg")}; }
.sp-page code { font-family: ${t("type-family-mono")}; font-size: ${t("type-scale-sm")}; }
.sp-banner { padding: ${t("space-scale-2")} ${t("space-scale-4")}; border: ${t("space-border-width")} solid ${t("color-role-border")}; margin-bottom: ${t("space-scale-6")}; }
.sp-section { margin-bottom: ${t("space-scale-6")}; }
.sp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(calc(${t("space-scale-6")} * 12), 1fr)); gap: ${t("space-scale-4")}; }
.sp-cell { padding: ${t("space-scale-3")}; border: ${t("space-border-width")} solid ${t("color-role-border")}; border-radius: ${t("space-radius-md")}; }
.sp-cell-label { margin: 0 0 ${t("space-scale-2")}; color: ${t("color-role-muted")}; font-size: ${t("type-scale-sm")}; }
.sp-swatch { display: inline-block; box-sizing: border-box; width: ${t("space-scale-6")}; height: ${t("space-scale-6")}; border: ${t("space-border-width")} solid ${t("color-role-border")}; vertical-align: middle; margin-right: ${t("space-scale-2")}; }
.sp-row { margin: ${t("space-scale-1")} 0; }
.sp-shell-frame { contain: layout paint; height: calc(${t("space-scale-6")} * 8); overflow: auto; border: ${t("space-border-width")} solid ${t("color-role-border")}; }
.sp-bar { display: inline-block; height: ${t("space-scale-2")}; background-color: ${t("color-role-text")}; vertical-align: middle; margin-right: ${t("space-scale-2")}; }
`;


function Board({ entries }: { entries: Entry[] }): React.ReactElement {
  const under = (prefix: string): Entry[] => entries.filter((e) => e.path.startsWith(prefix));
  return (
    <section className="sp-section" id="board" aria-label="Design-system board">
      <h2>Design-system board</h2>
      <h3>Colour roles</h3>
      {under("color.role.").map((e) => (
        <div className="sp-row" key={e.path}>
          <span className="sp-swatch" style={{ backgroundColor: `var(${varName(e.path)})` }} />
          {e.path.replace("color.role.", "")} <code>{e.css}</code>
        </div>
      ))}
      <h3>Type scale</h3>
      {under("type.scale.").map((e) => (
        <div className="sp-row" key={e.path} style={{ fontSize: `var(${varName(e.path)})` }}>
          {e.path.replace("type.scale.", "")} <code>{e.css}</code>
        </div>
      ))}
      <h3>Spacing</h3>
      {under("space.scale.").map((e) => (
        <div className="sp-row" key={e.path}>
          <span className="sp-bar" style={{ width: `var(${varName(e.path)})` }} />
          {e.path.replace("space.scale.", "")} <code>{e.css}</code>
        </div>
      ))}
      <h3>Radius</h3>
      {under("space.radius.").map((e) => (
        <div className="sp-row" key={e.path}>
          <span className="sp-swatch" style={{ borderRadius: `var(${varName(e.path)})` }} />
          {e.path.replace("space.radius.", "")} <code>{e.css}</code>
        </div>
      ))}
      <h3>Motion</h3>
      {under("motion.").map((e) => (
        <div className="sp-row" key={e.path}>
          {e.path.replace("motion.", "")} <code>{e.css}</code>
        </div>
      ))}
    </section>
  );
}

const PATTERN_COLUMNS = [
  { key: "name", header: "Name", render: (r: { name: string }) => r.name },
  { key: "owner", header: "Owner", render: (r: { owner: string }) => r.owner },
];

function Patterns(): React.ReactElement {
  const base = { title: "Records", columns: PATTERN_COLUMNS, rowKey: (r: { name: string }) => r.name, isLoading: false, isFiltered: false, failed: false };
  const copy = {
    empty: "No records yet. A record is one item you track; add the first one.",
    loading: "Loading records.",
    error: "Records could not be loaded. Check the connection and retry.",
    filteredEmpty: "No records match this filter. Clear the filter to see all records.",
  };
  const rows = [{ name: "Alpha", owner: "Ada" }];
  return (
    <section className="sp-section" id="patterns" aria-label="Working-screen patterns">
      <h2>RecordListPage</h2>
      <div className="sp-grid">
        {(
          [
            ["ready", { rows }],
            ["empty", { rows: [] }],
            ["loading", { rows: [], isLoading: true }],
            ["error", { rows: [], failed: true }],
            ["filtered-empty", { rows: [], isFiltered: true }],
          ] as const
        ).map(([name, over]) => (
          <div className="sp-cell" key={name} data-pattern-state={name}>
            <p className="sp-cell-label">RecordListPage / {name}</p>
            <RecordListPage {...base} {...copy} {...over} />
          </div>
        ))}
      </div>
    </section>
  );
}

const SHELL_SECTIONS: readonly AppShellSection[] = [
  { id: "work", label: "Work", entries: [{ id: "orders", label: "Orders", href: "#orders" }, { id: "reports", label: "Reports", href: "#reports" }] },
  { id: "admin", label: "Admin", entries: [{ id: "users", label: "Users", href: "#users", requires: "users.manage", whenDenied: "disable", reason: "Owners only" }] },
];

/** AppShell in each variant, in its narrow form (the specimen loads no conditions.css), framed so its fixed bar stays in the cell. */
function Shells(): React.ReactElement {
  return (
    <section className="sp-section" id="shells" aria-label="App shell">
      <h2>AppShell</h2>
      <div className="sp-grid">
        {(["sidebar", "topbar"] as const).map((variant) => (
          <div className="sp-cell" key={variant} data-pattern-state={variant}>
            <p className="sp-cell-label">AppShell / {variant}</p>
            <div className="sp-shell-frame">
              <AppShell
                id={`sp-shell-${variant}`}
                variant={variant}
                product="Product"
                sections={SHELL_SECTIONS}
                can={() => false}
                current="orders"
                account={{ name: "Ada Lovelace", role: "Purchasing" }}
                {...(variant === "sidebar" ? { cart: { label: "Cart", href: "#cart", count: 2 } } : {})}
              >
                <p>The page.</p>
              </AppShell>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Matrix({ cells }: { cells: Cell[] }): React.ReactElement {
  return (
    <section className="sp-section" id="matrix" aria-label="State matrix">
      <h2>State matrix</h2>
      <div className="sp-grid">
        {cells.map((c) => (
          <div className="sp-cell" key={c.id} data-component={c.component} data-variant={c.variant} data-state={c.state}>
            <p className="sp-cell-label">
              {c.component} / {c.variant} / {c.state}
            </p>
            {renderCell(c)}
          </div>
        ))}
      </div>
    </section>
  );
}

/** The specimen: one cell per (component, variant, state), a design-system board and the two patterns. Static HTML, no script. */
export function generateSpecimen(input: SpecimenInput): string {
  const cells = cellsOf(COMPONENTS);
  const body = renderToStaticMarkup(
    <main className="sp-page">
      <h1>design-kit specimen</h1>
      {input.identity === "undeclared" ? (
        <p className="sp-banner" id="identity-banner">
          Identity undeclared: colours and typeface render as the platform&apos;s own system values until the owner declares them.
        </p>
      ) : null}
      <Board entries={input.entries} />
      <Matrix cells={cells} />
      <Patterns />
      <Shells />
    </main>,
  );
  const data = JSON.stringify(cells).replace(/</g, "\\u003c");
  return (
    `<!doctype html>\n<html lang="en" data-design-identity="${input.identity}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<title>design-kit specimen</title>\n<style>\n${input.tokensCss}\n${input.kitCss ?? kitCss()}\n${CHROME_CSS}</style>\n</head>\n<body>\n${body}\n` +
    `<script type="application/json" id="dk-specimen-cells">${data}</script>\n</body>\n</html>\n`
  );
}

