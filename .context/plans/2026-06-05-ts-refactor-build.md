# TypeScript Refactor + Build Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the single ~2629-line vanilla-JS IIFE (`flowboard.js`) into an organized TypeScript `src/` tree that builds, via `tsup`, into a single self-contained IIFE served on jsDelivr exactly as today (`flowboard.js` + `flowboard.min.js` at repo root, global `window.FlowBoard`), with no behavior change.

**Architecture:** Big-bang source migration, but **behavior-preserving**. The build entry assigns `window.FlowBoard = { init, _internal }` (same runtime shape as today), so the existing 104 black-box tests — which `eval` the built file in jsdom and drive `window.FlowBoard` — keep passing throughout the migration with zero per-function test edits. esbuild (via tsup) strips types without type-checking, so the build stays green while types are tightened separately under `tsc --noEmit`.

**Tech Stack:** TypeScript, tsup (esbuild), vitest + jsdom (unchanged), concurrently + serve (dev), GitHub Actions, jsDelivr (GitHub-as-CDN, option A).

---

## Hard constraints (do not break)

1. **CDN URLs must keep working.** Existing consumers load `https://cdn.jsdelivr.net/gh/snowpact/html-flow-board@main/flowboard.js` and `@v0.2.0/flowboard.js`. The build output MUST land at repo-root `flowboard.js`. (Plus new `flowboard.min.js`.)
2. **Runtime shape identical:** the built file is an IIFE that sets `window.FlowBoard = { init, _internal }`. Same `init(config)` signature, same `_internal` surface (so tests + any external callers are unaffected).
3. **localStorage keys & formats unchanged** (`fb-{project}-pos/-zoom/-hidden/-arrowmods`) — existing users' saved boards must still load.
4. **`flowboard.css` stays a hand-authored root file** — its distribution does not change in this work.
5. **`index.html` keeps loading `flowboard.js` + `flowboard.css`** as today (it loads the built artifact).
6. **tsup `clean: false`** with `outDir: '.'` — never let the bundler clean the repo root.

---

## Target file structure

```
src/
  index.ts            # side-effect entry: imports init + internals, sets window.FlowBoard = { init, _internal }
  constants.ts        # CANVAS_W/H, ZOOM_*, SIZES, GAP_*, ARROW_*, SELECT_DRAG_THRESHOLD, DOT_*, ICON_*, LAYOUT_STRATEGIES
  types.ts            # Project, Epic, Screen, Arrow, Position, FlowState interfaces
  state.ts            # the singleton `state` object (typed) + reset helpers
  storage.ts          # saveZoom/loadZoom, savePositions/loadPositions, hidden/arrowmods persistence
  geometry.ts         # pure helpers: rectsIntersect, toggleSelection, getPrimarySide
  layout.ts           # autoLayout, bfsDepth, centerPositions, layoutByEpics, layoutGrid
  arrows.ts           # getAnchor, computeControlPoints, getAllAnchorPoints, getBestSides, buildSpreadMap,
                      #   resolveArrowSides, drawArrows, updateHandles, freezeArrowSides
  render/
    toolbar.ts        # renderToolbar, legend, toggleEpic, toggleNotesVisibility
    screen.ts         # renderScreen, applyScreenVisibility
    anchors.ts        # showAnchorDots, showAllAnchorDots, hideAnchorDots, schedule/cancelHide
    popups.ts         # screen popup (resize/edit/hide), arrow popup, close helpers
    modeSwitch.ts     # renderModeSwitch
  interactions/
    transform.ts      # applyTransform (incl. dot counter-scale), setZoom, fitToContent
    pan.ts            # initPan (wheel + drag-background pan)
    screens.ts        # initDrag, startScreenDrag, updateSelectionStyles
    selection.ts      # initSelection (rubber-band + clear)
    arrowDrag.ts      # initArrowDrag, startArrowCreation
    mode.ts           # setMode, initModeKeys
  export.ts           # doExport (PNG), collectExportBounds, loadHtml2Canvas (+ module-level html2canvasLoaded cache), doExportConfig
  board.ts            # init(config): assembles DOM, loads state, wires interactions; doReset, cycleLayout, getEpic, getScreen

flowboard.js          # BUILD OUTPUT (IIFE, readable) — committed, served on CDN
flowboard.min.js      # BUILD OUTPUT (minified)  — committed, served on CDN
flowboard.css         # unchanged, root, hand-authored
index.html            # unchanged (loads ./flowboard.js + ./flowboard.css)
tsconfig.json         # new
tsup.config.ts        # new
```

**Module dependency rule (cycles are OK):** Only `constants`, `types`, `geometry`, and `state` are true leaves. `render/*` legitimately *imports from* `interactions/*` (e.g. `renderModeSwitch` calls `setMode`; screen/arrow popups call `drawArrows` + persistence) and vice-versa. **That is fine with ES modules** as long as no cross-module symbol is *called at module top-level* — every such reference here is a deferred function call wired at runtime, not executed during module evaluation. Do NOT try to break these import cycles; they are not a problem. The only thing to avoid is *executing* an imported symbol while a module is still initializing (none do). The 104 black-box tests catch any real breakage per task.

---

## Phase 0 — Tooling scaffold (no real code moved yet)

### Task 0.1: Add tooling config + deps

**Files:** Create `tsconfig.json`, `tsup.config.ts`; Modify `package.json`.

- [ ] **Step 1: `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2019",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2019", "DOM"],
    "strict": true,
    "noImplicitAny": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"],
    "noEmit": true
  },
  "include": ["src", "*.test.ts"]
}
```

- [ ] **Step 2: `tsup.config.ts`** (emits BOTH outputs to repo root; `clean:false` is critical)

```ts
import { defineConfig } from 'tsup';

const base = {
  entry: { flowboard: 'src/index.ts' },
  format: ['iife'] as const,
  platform: 'browser' as const,
  target: 'es2019',
  outDir: '.',
  clean: false,   // NEVER clean the repo root
  dts: false,
  splitting: false,
  sourcemap: false,
};

export default defineConfig([
  { ...base, minify: false, outExtension: () => ({ js: '.js' }) },       // flowboard.js
  { ...base, minify: true,  outExtension: () => ({ js: '.min.js' }) },   // flowboard.min.js
]);
```

- [ ] **Step 3: `package.json` scripts + devDeps**

```jsonc
"scripts": {
  "build": "tsup",
  "dev": "concurrently -k \"tsup --watch\" \"serve . -l 3000\"",
  "typecheck": "tsc --noEmit",
  "pretest": "tsup",
  "test": "vitest run",
  "test:watch": "vitest"
},
"devDependencies": {
  "typescript": "^5.6.0",
  "tsup": "^8.3.0",
  "concurrently": "^9.0.0",
  "serve": "^14.2.0",
  "jsdom": "^28.1.0",
  "vitest": "^4.0.18"
}
```

- [ ] **Step 4: install** — Run: `npm install`. Expected: no errors; `node_modules/.bin/tsup` exists; a **`package-lock.json` is generated** (the repo currently has none). This lockfile MUST be committed — CI uses `npm ci`, which fails hard without it, and it pins esbuild's exact version so the committed bundle is reproducible (otherwise the Phase 4 stale-bundle guard can fail spuriously when a runner resolves a different esbuild patch).

- [ ] **Step 5: smoke the toolchain** — temporarily create `src/index.ts` with `;(window as any).FlowBoard = { init: function(){}, _internal: {} };`
  Run: `npm run build`. Expected: `flowboard.js` and `flowboard.min.js` regenerate at root, each a runnable IIFE. **Verify tsup emits ONLY those two files to the root** — no `flowboard.d.ts`, `metafile-*.json`, or chunk files (with `dts:false`/`splitting:false` it shouldn't; but since `outDir:'.'`, any stray emit lands in the repo root and could get committed — if you see one, turn that output off before committing). (This placeholder is replaced in Phase 1; do not commit it alone.)

- [ ] **Step 6: ensure `.gitignore` has `node_modules`** (add if missing). Do NOT gitignore `flowboard.js`/`flowboard.min.js` — they are committed dist.

- [ ] **Step 7: Commit** — `git add tsconfig.json tsup.config.ts package.json package-lock.json .gitignore && git commit -m "build: add TypeScript + tsup toolchain"`

---

## Phase 1 — Move the monolith into TS source, identical artifact

### Task 1.1: Port the IIFE body to `src/` as TS (single file first)

**Files:** Create `src/index.ts` (initially the whole thing); the existing `flowboard.js` becomes a build output.

- [ ] **Step 1:** Copy the current `flowboard.js` IIFE **body** (everything between `(function () { 'use strict';` and the closing `})();`) into `src/index.ts`. Put `// @ts-nocheck` on line 1 (types come in Phase 3). Remove the outer `(function(){ ... })()` wrapper AND the now-redundant `'use strict';` directive — tsup wraps in the IIFE and esbuild output is implicitly strict. Keep the trailing `window.FlowBoard = { init: init, _internal: { ... } };` **exactly as-is**: the `_internal` object must retain all 15 symbols the tests reference — `state, autoLayout, bfsDepth, centerPositions, layoutByEpics, layoutGrid, getAnchor, getPrimarySide, computeControlPoints, getAllAnchorPoints, getBestSides, buildSpreadMap, resolveArrowSides, rectsIntersect, toggleSelection`. Drop any one → tests go red.
- [ ] **Step 2:** Point the test harness at the build output. In `flowboard.test.js` and `flowboard.interactions.test.js`, `loadFlowBoard()` already reads `flowboard.js` from disk — keep that path; it now reads the built artifact. No other test edits.
- [ ] **Step 3: build** — Run: `npm run build`. Expected: root `flowboard.js` is now the tsup IIFE that sets `window.FlowBoard`.
- [ ] **Step 4: run tests** — Run: `npm test` (pretest builds first). Expected: **104 passed**. If any fail, the IIFE shape or an import is wrong — fix before proceeding.
- [ ] **Step 5: manual smoke** — `npm run dev`, open `localhost:3000`, hard-reload, verify the demo loads and a couple of features work (pan, select, dots, export).
- [ ] **Step 6: Commit** — `git add -A && git commit -m "refactor: move flowboard IIFE into src/index.ts (built via tsup)"`

> After this commit, the repo builds the byte-for-behavior-equal artifact from TS source, and the 104 tests are green against it. The rest is pure internal reorganization, continuously verified by the same tests.

---

## Phase 2 — Split `src/index.ts` into the module tree

Split in dependency order (leaves first). **After every task: `npm test` must stay at 104 green** (black-box tests don't care about internal module layout). Keep `// @ts-nocheck` on moved files for now.

For each task below: cut the named functions/constants out of `src/index.ts` into the target module, add `export`s, add `import`s where the code is used, build, run tests, commit.

- [ ] **Task 2.1 — `src/constants.ts` + `src/types.ts`** (interfaces from how `state`/`project` are used). Build, `npm test` → 104. Commit.
- [ ] **Task 2.2 — `src/geometry.ts`** (`rectsIntersect`, `toggleSelection`, `getPrimarySide`). Build, test → 104. Commit.
- [ ] **Task 2.3 — `src/state.ts`** (the `state` object). Every consumer imports `{ state }`. Build, test → 104. Commit.
- [ ] **Task 2.4 — `src/storage.ts`**. Build, test → 104. Commit.
- [ ] **Task 2.5 — `src/layout.ts`**. Build, test → 104. Commit.
- [ ] **Task 2.6 — `src/arrows.ts`**. Build, test → 104. Commit.
- [ ] **Task 2.7 — `src/render/*`** (toolbar, screen, anchors, popups, modeSwitch). Build, test → 104. Commit per file or per group.
- [ ] **Task 2.8 — `src/interactions/*`** (transform, pan, screens, selection, arrowDrag, mode). Build, test → 104. Commit per file.
- [ ] **Task 2.9 — `src/export.ts`**. Build, test → 104. Commit.
- [ ] **Task 2.10 — `src/board.ts`** (`init`, `doReset`, `cycleLayout`, `getEpic`, `getScreen`). `src/index.ts` shrinks to: imports + `window.FlowBoard = { init, _internal: {...} }`. Build, test → 104. Commit.

**Watch for:** import cycles (build will warn / runtime `undefined`). Resolve by moving the shared symbol to its leaf module. If a test goes red, the last split broke a reference — `git diff` the last task only.

---

## Phase 3 — Types pass

- [ ] **Task 3.1:** Remove `// @ts-nocheck` from leaf modules first (`types`, `constants`, `geometry`, `state`, `storage`, `layout`, `arrows`), fixing types as you go. Run `npm run typecheck` after each; build + `npm test` stay green (esbuild ignores type errors, so tests never gate on types — `typecheck` is the gate).
- [ ] **Task 3.2:** Remove `// @ts-nocheck` from `render/*`, `interactions/*`, `export.ts`, `board.ts`, `index.ts`. `npm run typecheck` → 0 errors.
- [ ] **Step: Commit** per module or per phase. Final: `npm run typecheck` clean, `npm test` → 104, `npm run build` produces both files.

---

## Phase 4 — Dev workflow, CI, docs

### Task 4.1: CI — build, anti-drift guard, typecheck

**Files:** Modify `.github/workflows/ci.yml` (the `ci` job).

- [ ] **Step 1:** In the `ci` job, after `npm ci`, add steps. Call vitest directly (not `npm test`) so the `pretest: tsup` hook doesn't trigger a redundant second build after the guard:

```yaml
      - name: Typecheck
        run: npm run typecheck

      - name: Build bundle
        run: npm run build

      - name: Fail if committed bundle is stale
        run: git diff --exit-code -- flowboard.js flowboard.min.js

      - name: Run tests
        run: npx vitest run
```

- [ ] **Step 2:** Leave the `deploy` (Pages) job unchanged. **Why the guard is load-bearing:** `deploy` has `needs: ci` and uploads the committed `flowboard.js` *without rebuilding it*, so the stale-bundle guard in `ci` is the only thing stopping an out-of-date bundle from being published to Pages. The guard MUST stay in the `ci` job, and the Phase 0 lockfile keeps it deterministic across runners.
- [ ] **Step 3: Commit** — `git commit -am "ci: typecheck, build, and stale-bundle guard"`

### Task 4.2: jsDelivr purge on release

**Files:** Create `.github/workflows/release.yml`.

- [ ] **Step 1:**

```yaml
name: Release purge
on:
  push:
    tags: ['v*']
jobs:
  purge:
    runs-on: ubuntu-latest
    steps:
      - name: Purge jsDelivr floating refs
        run: |
          for f in flowboard.js flowboard.min.js flowboard.css; do
            curl -fsS "https://purge.jsdelivr.net/gh/snowpact/html-flow-board@main/$f" || true
            curl -fsS "https://purge.jsdelivr.net/gh/snowpact/html-flow-board@latest/$f" || true
          done
```

- [ ] **Step 2: Commit** — `git commit -am "ci: purge jsDelivr @main/@latest on tag push"`

### Task 4.3: Docs

**Files:** Modify `CLAUDE.md` (and optionally `README.md`).

- [ ] **Step 1:** Update `CLAUDE.md`: replace the obsolete conventions (zero-dep / no-build / ES5 vanilla / single IIFE) with the new reality — TS source in `src/`, tsup build to root `flowboard.js`+`flowboard.min.js`, `npm run build|dev|test|typecheck`, module map. Keep: `fb-` CSS prefix, localStorage key scheme, public `FlowBoard.init` API, screen sizes.
- [ ] **Step 2 (optional):** README — note that source is now TS; install URLs unchanged. Optionally recommend pinning `@v0.3.0`.
- [ ] **Step 3: Commit** — `git commit -am "docs: update CLAUDE.md for the TS build pipeline"`

---

## Phase 5 — Final verification

- [ ] **Automated:** `npm run typecheck` (0 errors) → `npm run build` → `npm test` (**104 passed**) → `git diff --exit-code flowboard.js flowboard.min.js` (clean, bundle committed).
- [ ] **Bundle sanity:** `flowboard.js` is a readable IIFE ending in a `window.FlowBoard = {...}` assignment; `flowboard.min.js` is minified; both at repo root.
- [ ] **Manual smoke (demo, fresh load / incognito):**
  - Pan background (drag mode); wheel pan + Ctrl/Cmd-wheel zoom.
  - Mode switch (bottom-right) + `V`/`H`/`Esc`.
  - Select mode: rubber-band (touch select), click, Cmd+click toggle, rigid group move.
  - Dots stay constant size across zoom; **absent from Export PNG**.
  - Drag individual screens; arrows follow.
  - Anchor-dot → create arrow; arrow handle drag; arrow popup (swap/dashed/label/delete).
  - Screen right-click popup (sm/md/lg/xl, edit title, hide/show); legend toggles.
  - 3 layouts (Flow/Epics/Grid); Reset; Copy Init.
  - Reload → positions/zoom/hidden persisted (localStorage keys unchanged).
- [ ] **CDN path check:** confirm `@main/flowboard.js`, `@main/flowboard.min.js`, `@main/flowboard.css` all resolve to the committed files (paths unchanged).

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| tsup `clean:true` wipes repo root | `clean:false` set in config (Phase 0) |
| IIFE doesn't set `window.FlowBoard` under jsdom eval | Side-effect entry assigns `window.FlowBoard` explicitly (not tsup `globalName`) — verified in Task 1.1 Step 4 |
| Import cycles after split | Leaf-first split + dependency rule; same 104 tests catch breakage per task |
| Stale committed bundle served on CDN | CI `git diff --exit-code` guard (Task 4.1) |
| Type errors block progress | esbuild ignores types; `typecheck` is a separate non-build gate; `@ts-nocheck` until Phase 3 |
| Existing consumers break | Runtime shape + `init`/`_internal` + CDN paths all preserved; manual + automated verification in Phase 5 |

## Out of scope (optional follow-ups)
- Modernizing tests from `eval`-the-bundle to direct module imports (drop `_internal`).
- Moving CSS into `src/` + emitting `flowboard.min.css`.
- ESM build + `.d.ts` for npm consumers.
