# qontinui-design-kit

Design-language compiler, exclusive Tailwind v4 theme, state-complete component kit and specimen for Qontinui-built products. MIT.

Status: Phases 1 to 6 of plan `2026-11-19-the-visual-system-is-prose-no-build-step-compiles-and-the-project-template-ships-no-design` (the repo, three probes, the compiler core, the token-package adapter, the rule-bearing guide with budgets and thresholds, the state-complete kit slice with its specimen and state check, and the generated component index). The template wiring is a later phase.

## Use

```sh
npm install github:qontinui/qontinui-design-kit#<tag-or-sha>   # prepare builds dist/
npx design-kit compile            # design/language.dtcg.json -> src/design/{tokens.css,tokens.ts,theme.css,compile-report.json}
npx design-kit compile --check    # exit 1 when the committed outputs differ from a fresh compile
npx design-kit status             # each group's state and the next undeclared group
npx design-kit diff --base origin/main      # LOOSENED lines for budgets and thresholds that moved toward permissive; exit 0 always
npx design-kit lint-classes src             # arbitrary-value classes and inline literal colours or lengths in .tsx files
npx design-kit specimen [--check]           # specimen.html: every component x variant x state, plus a design-system board
npx design-kit check-states specimen.html   # forced-state measurement through the published exec door -> state-coverage.json
npx design-kit validate-guide src/design/<app>.styleguide.uibridge.json specimen.html
npx design-kit index [--check]              # the component index between the markers in CLAUDE.md
```

Exit codes: 0 ok, 1 drift (`--check`) or findings, 2 the source was refused or the command was misused, 3 UNKNOWN (the instrument could not measure).

## The source: `design/language.dtcg.json`

A DTCG 2025.10 document. Every leaf carries `$extensions.qontinui.source`, one of:

| source | meaning |
|---|---|
| `declared` | the owner or the tenant's visual system states it |
| `resolved(<package>@<ref>)` | read from an imported token package; only an import produces it, a source file cannot state it |
| `authored(<notification_ref>)` | structural only (a spacing scale, a density budget, a state contract); without a ref it is listed as `unverified-provenance`, stage `draft` |
| `derived(<rule>)` | computed from a stated rule (`modular-scale`, `spacing-multiple`) with its inputs recorded |
| `undeclared` | a compile state: no value is emitted and the report says so; a default is never substituted |

Groups: `color`, `type`, `space`, `layout`, `motion`, `states`, `budgets`, `thresholds`, `imagery`, `exceptions`.

Identity values (every `color` leaf, `type.family.*`, `imagery.style.*`) can never be `authored`: the compiler refuses the whole source and names the policy clause `ux-priorities/style-is-resolved-from-the-tenants-declared-visual-system`.

An undeclared identity renders as a CSS **system keyword** (`Canvas`, `CanvasText`, `ButtonFace`, `GrayText`, `Highlight`, `system-ui`, ...) plus state deltas (`color-mix(in oklab, CanvasText 8%, Canvas)`). Those are the browser's values, not a palette the fleet chose. The report says `identity.state: "undeclared"` and lists the roles that fell back.

Resolve first: `"$extensions": { "qontinui": { "import": [{ "package": "@qontinui/design-tokens", "ref": "415be45", "groups": ["typeScale", "durations"] }] } }` reads the built package (at a git ref, or the installed version when `ref` is absent) and labels every leaf `resolved(@qontinui/design-tokens@<ref|version>)`. A source never copies a hex value. The web type scale needs a declared surface unit (`type.unit`, a number) because the package scale is drawn at a 1080px reference frame; with none, `type.scale` stays `undeclared`. A group the package does not export stays `undeclared`. Env: `DESIGN_TOKENS_REPO` (where to clone from), `DESIGN_KIT_CACHE` (where built refs are cached).

The outputs of Phase 2 are `tokens.css` (`--dk-*` custom properties), `tokens.ts` (typed `tokens` / `vars` constants), `theme.css` (a Tailwind v4 `@theme inline` block that begins `--*: initial`) and `compile-report.json`. Use `@import "tailwindcss"; @import "./design/tokens.css"; @import "./design/theme.css";`. A theme does not stop arbitrary values (`bg-[#f00]`); a later phase ships `design-kit lint-classes` for that.

Craft bands (`src/craft/arithmetic.ts`, `draft`, listed in the report as `out_of_band`, never an error): body line height 120% to 145%, measure 45 to 75 characters, interface motion 100 to 300 ms (a zero duration is a step), contrast as an OKLCH lightness difference of at least 0.40, one shadow light source.

## Guide, budgets and thresholds (Phase 4)

`compile` also writes, beside the tokens:

- `<app>.styleguide.uibridge.json`, a `StyleGuideConfig` (ui-bridge `specs/style-types.ts`) generated from the compiled tokens and the kit's own component data: a colour is a role of the palette, a radius is on the scale, a heading's size is a declared step above the body step, and each kit component declares its state matrix through the `--dk-kit-states` custom property (a hand-rolled button declares none and fails `button-state-declaration`). A rule whose group is undeclared is omitted, not invented. Token values are written in computed form where statically known (a hex colour is `rgb(r, g, b)`); `validate-guide` canonicalises every other spelling (`Canvas`, `color-mix(...)`) through the browser before it runs the published `validateElement` over the page's `getDesignSnapshot` elements. Exit 1 on any `error` rule failure.
- `design-budgets.json` (the `budgets` group and the craft bands as `draft` thresholds) and `visual-system.thresholds.json` (the `thresholds` group and `imagery.threshold.*`). Each entry carries `value`, `source` (`declared`, `draft` or `undeclared`), `check_version` (the first 16 hex of the sha256 of the check name, a newline and the JSON value) and `stage`. The two imagery thresholds `domain_spec/visual-system` lists as undeclared (`image_resolution_sufficient.min_effective`, `image_palette_within.max_delta_e`) are emitted as `undeclared` with a null value, never 0, unless the source states them.

**Stage is computed (D5).** `declared` for a declared or resolved value; `draft` for an authored or derived one; `shown` when `design/threshold-evidence.json` (`{"records":[{"check","check_version","injected_violation","failed":true}]}`) holds a failing record for that exact `check_version`. Changing the value changes the hash, so the record stops matching and the stage falls back to `draft` on the next compile. The compiler never reads a merge state; no stage is a gate. A leaf's `$extensions.qontinui.bound` (`max`, `min` or `none`) says which way it loosens; without it a leaf named `max`/`max_*` is a max bound and `min` likewise.

**A loosening is marked, never failed (D6).** `diff --base <ref>` compares the base's committed `design-budgets.json` and `visual-system.thresholds.json` with a fresh compile and prints `LOOSENED <check> <old> -> <new>` (a raised `max`, a lowered `min`, a removed or withdrawn bound); a change in a bound with no declared direction prints `MOVED`. It appends the same list to `$GITHUB_STEP_SUMMARY` when set and exits 0.

**`lint-classes <dir>`** closes the gap Probe 1 recorded: Tailwind v4 emits arbitrary values whatever `--*: initial` says. It reports, with file:line:column, arbitrary-value classes (`bg-[#f00]`, `p-[13px]`), arbitrary variants, and inline literal colours and lengths in `.tsx` files (comment lines are skipped). A line carrying `design-kit-exception: <id>` where `<id>` is an `exceptions` entry of the source is waived; an unknown id waives nothing and is itself a finding. Exit 1 on findings.

## The kit slice, the specimen and the state check (Phase 5)

`defineComponent({ name, props, states })` stores a component's states as data from the closed list `default | hover | focus-visible | active | disabled | loading | error | selected`. The slice is `Button`, `TextInput`, `Select`, `Checkbox`, `Switch`, `Tabs`, `Dialog` and `DataTable` over Radix (or the native element), plus the working-screen pattern `RecordListPage`, whose `empty`, `loading`, `error` and `filteredEmpty` props are required (omitting one is a compile error, proved by a `@ts-expect-error` fixture). The kit ships no skin: every declaration in `kitCss()` reads `var(--dk-*)` (a test reads every rule for a literal), so a source must provide the tokens the kit reads (`kitTokenContract()`; `design/language.dtcg.json` in this repo is a complete example whose identity groups are undeclared and whose structural groups are authored). Disabled is visibly different from enabled in every control. Components are imported from the package root; `@qontinui/design-kit/specimen` exports `generateSpecimen`. React 18 or 19 and the Radix packages are peers.

`design-kit specimen` writes a static `specimen.html` (no script): one cell per component, variant and state (56 for this slice), a design-system board of the compiled roles, scale, spacing, radius and motion, the `RecordListPage` states, and, when identity is undeclared, `data-design-identity="undeclared"` on `<html>` with a banner.

`design-kit check-states <url|file>` drives `ui-bridge-inject --exec-stdin` (the published `@qontinui/ui-bridge-wrapper`) with `getElementStateStyles` and writes `state-coverage.json`: per cell, `changedProperties` (a count), whether every changed value is token-derived, and `complete`.

- `hover` and `active` are forced on the cell's element. `disabled`, `loading`, `error` and `selected` are carried by the attribute the component reads, and the cell is compared with the same variant's default cell (visual properties only).
- **Token-derived** is decided by value: the door reports computed values, so a changed value is token-derived when each colour or length in it equals the computed value of some `--dk-*` custom property in the page (read through a probe element by `pageEvaluate`). A literal that equals no token is a `non-token-delta` finding; a literal that happens to equal a token value passes, which is the limit of the method.
- A changed property whose value has no colour or length (`cursor`) is ignored as `keyword`; one whose value contains `none` (`outline: 3px none <colour>`, which paints nothing) is ignored as `inert`. Both are listed in `ignoredProperties`, not counted.
- A measured cell with no counted change is a `no-delta` finding.
- `focus-visible` is not emulated by the published door (Probe 3): those cells are `unknown(focus-visible-not-emulated)`, never a pass. Any other unknown (the door answered fewer steps than asked, an element is missing) exits 3.

## The component index (Phase 6)

`design-kit index` writes, between `<!-- design-kit-index:start -->` and `<!-- design-kit-index:end -->` in the project's `CLAUDE.md` (appended when there are no markers), one entry per component: its JSDoc summary and `@use` / `@avoid` notes, its props read from the TypeScript source or declarations (the compiler API), its variants and states from the component data, and the tokens it reads. `index --check` exits 1 on drift or missing markers; a hand edit between the markers is overwritten by the next `index`. The index of the slice is at most 8,192 bytes, asserted as a literal; a component that pushes it past the limit gets trimmed JSDoc, never a higher limit. `typescript` is a peer of this verb.

Peers for the verbs that measure: `@qontinui/ui-bridge-wrapper@0.12.0`, `@qontinui/ui-bridge-headless@0.7.0`, `@qontinui/ui-bridge@0.54.0` and Playwright's Chromium (`npx playwright install chromium`). The tests that need Chromium skip locally with `unknown(instrument-cannot-force)` when it cannot run and fail under `CI`.

## Probe record (plan Phase 1), measured 2026-11-19

Node v24.19.0, npm 11.17.0, Chromium via Playwright 1.65.1.

**Probe 1, the exclusive theme** (`test/probe-exclusive-theme.test.js`, `tailwindcss` / `@tailwindcss/postcss` 4.3.x). Confirms every plan assumption. With `@theme { --*: initial; --color-surface: ...; --spacing: 4px }`: `bg-surface` and `p-3` are emitted; `bg-red-500`, `text-lg` and the `md:` variant are not. Without `--spacing`, `p-3` is not emitted. Arbitrary values (`bg-[#f00]`, `p-[13px]`) ARE emitted regardless. No plan assumption was contradicted, so Phase 2 emits breakpoints and the spacing base explicitly from the source. One addition: the compiler writes `@theme inline` and the theme variables read `var(--dk-*)`, which is why `tokens.css` must be imported too.

**Probe 2, delivery** (`test/probe-git-dependency.test.js`). Arm chosen: **`prepare` builds `dist/` on a git install; no tracked `dist/`, no registry**. `npm install github:qontinui/qontinui-design-kit#<sha>` was run against the real pushed repo with npm 11.17.0 at `2b5773de59d46066c71fbae598ba981788542f7f`; `dist/` was built and `import('@qontinui/design-kit')` loaded. Note: npm 11 prints `npm warn allow-scripts ... @qontinui/design-kit@0.1.0 (prepare: npm run build)`, a warning only on this version (the script still ran). If a later npm turns it into a block, the fallback in the plan applies: a tag whose commit carries `dist/`. The in-repo test installs a one-commit copy of the HEAD tree through a local `git+file://` URL (a CI checkout is shallow) so it holds before anything is pushed.

**Probe 3, the exec door** (`test/probe-exec-door.test.js`). `@qontinui/ui-bridge-wrapper@0.12.0` (with `@qontinui/ui-bridge@0.54.0`), `ui-bridge-inject --exec-stdin`, action `getElementStateStyles`. The door measures forced states: on the fixture button, `hover` changes `color, backgroundColor, outline`, `active` changes `backgroundColor`, `disabled` changes `opacity`, and a rule-less control reports an empty change set for `hover` and `active`. Three facts differ from, or add to, the plan's wording:
- The result shape is `result.stateStyles[].diffFromDefault`, not a `changes` set.
- The door's state vocabulary is `hover | focus | active | disabled`. A `focus-visible` request is dropped (only `default` comes back): **`focus-visible-not-emulated`**. `focus` does report an `outline` change, but it cannot be told apart from `:focus`, so Phase 5 records `focus-visible` cells as `unknown(focus-visible-not-emulated)`.
- A bare `npx @qontinui/ui-bridge-wrapper@0.12.0` does NOT work: `ui-bridge-inject` needs the optional `@qontinui/ui-bridge-headless` peer (and Playwright's Chromium). This repo pins `@qontinui/ui-bridge-wrapper@0.12.0` and `@qontinui/ui-bridge-headless@0.7.0` as exact devDependencies and runs the local bin. CI provisions Chromium (`npx playwright install --with-deps chromium`).
If Chromium cannot run on a machine, the Probe 3 test is skipped with the explicit result `unknown(instrument-cannot-force)`, which is not a pass; under `CI` the same condition fails instead.

## Development

```sh
npm ci
npx playwright install --with-deps chromium
npm run typecheck && npm run lint && npm test
```

`npm test` builds `dist/` first. The adapter tests build `@qontinui/design-tokens` at `415be45` from a clone of `$DESIGN_TOKENS_REPO` (a sibling `../qontinui-design-tokens` checkout, else GitHub) into `.dk-cache/`.

## Licence

MIT. A kit compiled into someone else's app cannot be AGPL (decision record `design-kit-is-mit-licensed`).
