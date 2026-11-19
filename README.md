# qontinui-design-kit

Design-language compiler, exclusive Tailwind v4 theme, state-complete component kit and specimen for Qontinui-built products. MIT.

Status: Phases 1 to 3 of plan `2026-11-19-the-visual-system-is-prose-no-build-step-compiles-and-the-project-template-ships-no-design` (the repo, three probes, the compiler core and the token-package adapter). The component kit, specimen, index and the template wiring are later phases.

## Use

```sh
npm install github:qontinui/qontinui-design-kit#<tag-or-sha>   # prepare builds dist/
npx design-kit compile            # design/language.dtcg.json -> src/design/{tokens.css,tokens.ts,theme.css,compile-report.json}
npx design-kit compile --check    # exit 1 when the committed outputs differ from a fresh compile
npx design-kit status             # each group's state and the next undeclared group
```

Exit codes: 0 ok, 1 drift (`--check`), 2 the source was refused or the command was misused.

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

## Probe record (plan Phase 1), measured 2026-11-19

Node v24.19.0, npm 11.17.0, Chromium via Playwright 1.65.1.

**Probe 1, the exclusive theme** (`test/probe-exclusive-theme.test.js`, `tailwindcss` / `@tailwindcss/postcss` 4.3.x). Confirms every plan assumption. With `@theme { --*: initial; --color-surface: ...; --spacing: 4px }`: `bg-surface` and `p-3` are emitted; `bg-red-500`, `text-lg` and the `md:` variant are not. Without `--spacing`, `p-3` is not emitted. Arbitrary values (`bg-[#f00]`, `p-[13px]`) ARE emitted regardless. No plan assumption was contradicted, so Phase 2 emits breakpoints and the spacing base explicitly from the source. One addition: the compiler writes `@theme inline` and the theme variables read `var(--dk-*)`, which is why `tokens.css` must be imported too.

**Probe 2, delivery** (`test/probe-git-dependency.test.js`). Arm chosen: **`prepare` builds `dist/` on a git install; no tracked `dist/`, no registry**. `npm install github:qontinui/qontinui-design-kit#<sha>` was run against the real pushed repo with npm 11.17.0 at `2b5773de59d46066c71fbae598ba981788542f7f`; `dist/` was built and `import('@qontinui/design-kit')` loaded. Note: npm 11 prints `npm warn allow-scripts ... @qontinui/design-kit@0.1.0 (prepare: npm run build)`, a warning only on this version (the script still ran). If a later npm turns it into a block, the fallback in the plan applies: a tag whose commit carries `dist/`. The in-repo test installs a one-commit copy of the HEAD tree through a local `git+file://` URL (a CI checkout is shallow) so it holds before anything is pushed.

**Probe 3, the exec door** (`test/probe-exec-door.test.js`). `@qontinui/ui-bridge-wrapper@0.12.0` (with `@qontinui/ui-bridge@0.53.0`), `ui-bridge-inject --exec-stdin`, action `getElementStateStyles`. The door measures forced states: on the fixture button, `hover` changes `color, backgroundColor, outline`, `active` changes `backgroundColor`, `disabled` changes `opacity`, and a rule-less control reports an empty change set for `hover` and `active`. Three facts differ from, or add to, the plan's wording:
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
