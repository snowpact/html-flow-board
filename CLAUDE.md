# FlowBoard

Interactive storyboarding / flow-diagram library. Zero external dependencies — vanilla JS + CSS.

## Architecture

Single IIFE (`flowboard.js`) exposing `window.FlowBoard`. Companion stylesheet `flowboard.css`.
No build step, no bundler, no transpiler. Distributed as raw files via CDN or self-hosted.

## Files

- `flowboard.js` — all logic (state, rendering, interactions, layout algorithms, popups)
- `flowboard.css` — all styles, every class prefixed `fb-`
- `index.html` — demo / GitHub Pages entry point
- `flowboard.test.js` — unit tests (vitest + jsdom), 77 tests

## Conventions

- **No external dependencies.** Everything is vanilla JS. Do not install npm packages.
- All CSS classes use the `fb-` prefix to avoid collisions.
- Code style: ES5-compatible (var, function, no arrow functions, no template literals in lib code).
- State is centralized in a single `state` object inside the IIFE.
- localStorage keys follow the pattern `fb-{projectName}-{suffix}` (-pos, -zoom, -hidden, -arrowmods).

## Commands

- `npm run dev` — local dev server (`npx serve .`)
- `npm test` — run tests
- `npm run test:watch` — run tests in watch mode

## API

- `FlowBoard.init(config)` — initialize with `{ container, project, state? }`
- `config.state` — optional: restore positions, zoom, hiddenScreens
- `config.project` — `{ name, epics[], screens[], arrows[] }`
- Arrow objects carry `fromSide`/`toSide`/`label`/`dashed` directly (no separate overrides).
- Screen sizes: `sm` (240px), `md` (320px), `lg` (400px), `xl` (520px)

## Features

- **Drag & pan** — drag screens, wheel to pan/zoom
- **3 layout modes** — Flow (BFS columns), Epics (grouped by epic), Grid
- **Arrows** — SVG bezier curves, auto-spread for overlapping pairs, 16 anchor points per screen
- **Arrow popup** (click handle) — swap direction, toggle dashed, edit label, delete
- **Screen popup** (right-click) — resize (sm/md/lg/xl), edit title, hide/show
- **Anchor dots** — hover to see, click-drag to create new arrows
- **Legend** — toggle epic visibility with accent-colored checkboxes
- **Export PNG** — html2canvas snapshot
- **Export Init** — full JS file with `FlowBoard.init({...})` preserving all state
- **Reset** — restore default layout and arrows

## Internal API (exposed via `_internal` for testing)

`state`, `autoLayout`, `bfsDepth`, `centerPositions`, `layoutByEpics`, `layoutGrid`,
`getAnchor`, `getPrimarySide`, `computeControlPoints`, `getAllAnchorPoints`,
`getBestSides`, `buildSpreadMap`, `resolveArrowSides`

## Testing

Tests use vitest + jsdom. The `loadFlowBoard()` helper evals the IIFE in jsdom.
`setupState()` creates mock screens with `Object.defineProperty` for offsetWidth/offsetHeight (320x300).
Test suites cover: getPrimarySide, getAnchor, computeControlPoints, getAllAnchorPoints,
getBestSides, buildSpreadMap, resolveArrowSides, autoLayout, bfsDepth, centerPositions,
layoutByEpics, layoutGrid — plus edge case suites for each.
