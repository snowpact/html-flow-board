# FlowBoard

Interactive storyboarding / flow-diagram library. Ships as a single self-contained
file with **zero runtime dependencies**. Source is TypeScript; a build step bundles
it into one IIFE for the CDN.

## Architecture

TypeScript source in `src/` (one module per responsibility). `tsup` (esbuild) bundles
`src/index.ts` into a single browser **IIFE** that assigns `window.FlowBoard = { init, _internal }`.
Two build outputs live at the repo root and are committed (so jsDelivr serves them):
`flowboard.js` (readable) and `flowboard.min.js` (minified). Companion stylesheet `flowboard.css`.

## Files

- `src/` — TS modules: `constants`, `types`, `state` (singleton + data accessors), `storage`
  (localStorage), `geometry` (pure helpers), `layout`, `arrows`, `render`, `popups`, `anchors`,
  `interactions` (pan/drag/selection/mode/zoom), `export`, `board` (`init` + orchestration), `index` (entry).
- `flowboard.js` / `flowboard.min.js` — **build outputs**, committed, served on the CDN. Do not hand-edit.
- `flowboard.css` — all styles, every class prefixed `fb-` (hand-authored, root).
- `index.html` — demo / GitHub Pages entry point (loads `flowboard.js` + `flowboard.css`).
- `flowboard.test.js`, `flowboard.interactions.test.js` — vitest + jsdom, 104 tests.

## Conventions

- **No runtime dependencies** in the shipped bundle. Dev dependencies (tsup, typescript, vitest,
  serve, concurrently) are fine.
- All CSS classes use the `fb-` prefix to avoid collisions.
- State is centralized in a single `state` object in `src/state.ts`, imported where needed.
- localStorage keys follow `fb-{projectName}-{suffix}` (-pos, -zoom, -hidden, -arrowmods). Do not change keys/formats (breaks saved boards).
- **The committed bundle must match the source.** After editing `src/`, run `npm run build` and commit
  `flowboard.js` + `flowboard.min.js`. CI fails if they are stale (`git diff --exit-code`).
- `src/` is currently `// @ts-nocheck` (esbuild strips types without checking). Progressive strict
  typing under `tsc --noEmit` is an in-progress follow-up.

## Commands

- `npm run build` — bundle `src/` → `flowboard.js` + `flowboard.min.js` (tsup)
- `npm run dev` — watch-rebuild + static server on :3000 (loads the built bundle, like prod)
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — build then run tests (`pretest` builds the bundle the tests load)
- `npm run test:watch` — vitest watch

## Distribution

jsDelivr, GitHub-as-CDN. Consumers load root files by ref:
`https://cdn.jsdelivr.net/gh/snowpact/html-flow-board@v0.3.0/flowboard.js` (or `@main`, or `flowboard.min.js`).
A tag push triggers `.github/workflows/release.yml` to purge jsDelivr's `@main`/`@latest` cache.

## API

- `FlowBoard.init(config)` — initialize with `{ container, project, state? }`
- `config.state` — optional: restore positions, zoom, hiddenScreens
- `config.project` — `{ name, epics[], screens[], arrows[] }`
- Arrow objects carry `fromSide`/`toSide`/`label`/`dashed` directly (no separate overrides).
- Screen sizes: `sm` (240px), `md` (320px), `lg` (400px), `xl` (520px)

## Features

- **Drag & pan** — drag screens; drag the background to pan (drag mode); wheel pan / Ctrl-wheel zoom
- **Mode switch** (bottom-right) — Drag (pan) vs Select (cursor); keys `V` / `H` / `Esc`
- **Select mode** — rubber-band multi-select (touch), click / Cmd+click toggle, rigid group move
- **Dotted grid** — constant on-screen size at any zoom; excluded from PNG export
- **3 layout modes** — Flow (BFS columns), Epics (grouped by epic), Grid
- **Arrows** — SVG bezier curves, auto-spread for overlapping pairs, 16 anchor points per screen
- **Arrow popup** (click handle) — swap direction, toggle dashed, edit label, delete
- **Screen popup** (right-click) — resize (sm/md/lg/xl), edit title, hide/show
- **Anchor dots** — hover to see, click-drag to create new arrows
- **Legend** — toggle epic visibility with accent-colored checkboxes
- **Export PNG** — html2canvas snapshot · **Copy Init** — clipboard JS preserving all state · **Reset**

## Internal API (exposed via `_internal` for testing)

`state`, `autoLayout`, `bfsDepth`, `centerPositions`, `layoutByEpics`, `layoutGrid`,
`getAnchor`, `getPrimarySide`, `computeControlPoints`, `getAllAnchorPoints`,
`getBestSides`, `buildSpreadMap`, `resolveArrowSides`, `rectsIntersect`, `toggleSelection`

## Testing

vitest + jsdom. `loadFlowBoard()` reads and `eval`s the **built** `flowboard.js` (so `pretest` builds
first) and drives `window.FlowBoard` — tests are black-box and independent of the internal module split.
`setupState()` mocks screen elements with `Object.defineProperty` for offsetWidth/offsetHeight (320x300).
Suites: pure-logic (getPrimarySide, getAnchor, computeControlPoints, getAllAnchorPoints, getBestSides,
buildSpreadMap, resolveArrowSides, autoLayout, bfsDepth, centerPositions, layoutByEpics, layoutGrid,
rectsIntersect, toggleSelection) + an interaction suite (mode switch, selection, group move, dot-grid zoom).
