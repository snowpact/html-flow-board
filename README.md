# html-flow-board

Standalone JS+CSS library to create interactive storyboards: screens connected by SVG
arrows, with a **diagram-as-code** side panel. Zero runtime dependencies, importable via CDN.

**[Live Demo](https://snowpact.github.io/html-flow-board/)**

---

## What it is

FlowBoard renders a pannable/zoomable canvas of **screens** (cards) grouped into **epics**
and linked by **arrows**. Alongside the canvas sits a **Flow-ML** editor — a tiny, readable
text format that is the *single source of truth* for the board:

- Type in the panel → the diagram updates.
- Drag, resize, hide, or wire screens on the canvas → the text rewrites itself.

This two-way binding (think dbdiagram.io / Mermaid, but for storyboards) means a board is just a
short text document you can version, diff, copy, and paste.

```
!name = My App

@auth, t=Authentication, c=#6366f1

:login, t=Login, p=form, f=phone, e=auth, x=120, y=80
:home,  t=Dashboard, p=dashboard, f=desktop, e=auth, x=560, y=80

login -> home, l=Login OK
login --> home          # dashed = secondary path
```

---

## Installation

### CDN (recommended)

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/snowpact/html-flow-board@main/flowboard.css">
<script src="https://cdn.jsdelivr.net/gh/snowpact/html-flow-board@main/flowboard.js"></script>
```

Pin a release for stability: replace `@main` with a tag, e.g. `@v0.3.0`. Use `flowboard.min.js`
in production.

### Self-hosted

Download `flowboard.js` (or `flowboard.min.js`) and `flowboard.css` and include them.

---

## Quick start

```html
<link rel="stylesheet" href="flowboard.css">
<script src="flowboard.js"></script>

<div id="app" style="width:100vw;height:100vh"></div>

<script>
FlowBoard.init({
  container: '#app',
  project: {
    name: "My Storyboard",
    epics: [
      { id: "auth", label: "Authentication", color: "#6366f1" }
    ],
    screens: [
      { id: "login", title: "Login", epic: "auth", preset: "form",  format: "phone" },
      { id: "home",  title: "Home",  epic: "auth", preset: "dashboard", format: "desktop",
        notes: "US-1.1" }
    ],
    arrows: [
      { from: "login", to: "home", label: "Login OK" }
    ]
  }
});
</script>
```

On first load FlowBoard renders your `project`, then serializes it into the Flow-ML panel and
**persists the text** in `localStorage`. From then on, the saved text is what loads (see
[Persistence](#persistence)).

---

## Flow-ML — the diagram-as-code format

The left panel is a small editor with a **line-number gutter**, **syntax highlighting**, and a
**`?` cheat-sheet** that documents the syntax in the same colors. Flow-ML is line-based and uses
short, comma-separated attributes.

### Lines at a glance

| Line | Meaning |
|---|---|
| `!name = My App` | Project name (directive) |
| `@auth, t=Authentication, c=#6366f1` | **Epic** — a group, with a color |
| `:login, t=Login, p=form, f=phone, e=auth` | **Screen** (note the `:` prefix) |
| ` ``` ` … ` ``` ` (fenced block under a screen) | Raw HTML body (rendered when preset is `custom`) |
| `login -> home, l=ok` | **Arrow** (solid) |
| `login --> home` | **Arrow** (dashed) |
| `# anything` | Comment (ignored) |

Each line is identified by its first character — `:` screen, `@` epic, `!` directive, `#` comment,
or an `->`/`-->` for an arrow — so a screen and an arrow are never ambiguous at a glance.

### Screen attributes

A screen line starts with `:` then its **id**, followed by `key=value` attributes (any order):

| Key | Meaning | Example |
|---|---|---|
| `t` | Title | `t=Login` or `t="My screen"` |
| `p` | [Preset](#presets) (body skeleton); omit ⇒ `custom` | `p=form` |
| `f` | [Format](#formats) (proportions) | `f=phone` |
| `e` | Epic id | `e=auth` |
| `n` | Note (shown in the footer) | `n="US-1.1"` |
| `x` `y` | Position on the canvas | `x=120, y=80` |
| `h` | Hidden flag (no value) | `… , h` |
| `sz` `w` `hg` | Legacy size / width / height (px) | `w=400, hg=300` |

### Epic attributes

`@id` followed by `t=` (label) and `c=` (CSS color, e.g. `c=#6366f1`).

### Arrows

`from -> to` (solid) or `from --> to` (dashed), with optional attributes:

| Key | Meaning |
|---|---|
| `l` | Label on the arrow |
| `fs` | From side — source anchor (see [Anchors](#arrow-anchor-points)) |
| `ts` | To side — target anchor |

### Custom HTML content

A fenced block immediately **after** a screen line becomes that screen's HTML body (rendered with
the `custom` preset). Use the [`fb-*` wireframe classes](#wireframe-classes-fb-) inside:

````
:prefs, t=Settings
```
<div class="fb-text title">Preferences</div>
<div class="fb-input">Email</div>
<div class="fb-btn">Save</div>
```
````

The fence auto-grows (CommonMark style) if your content itself contains a ` ``` ` line, so HTML/
Markdown bodies round-trip safely.

### Quoting & escaping

Values containing a space, comma, quote, or backslash are wrapped in `"…"`. Inside quotes,
newlines/quotes/backslashes are escaped (`\n`, `\"`, `\\`) so any value survives a round-trip on a
single line. You normally never type this by hand — the serializer does it for you.

---

## Presets

`p=` selects the screen body. `custom` (the default) renders your HTML `content`; the rest render a
neutral grey wireframe skeleton — handy for sketching before the real markup exists.

```
custom · blank · form · list · table · dashboard · cardgrid ·
detail · auth · feed · settings · kanban · modal · gallery · nav
```

Right-click an empty part of the canvas → **Create a screen** to pick a preset from a visual grid.
Right-click a screen → **Change layout** to swap its preset. Switching presets never destroys the
HTML you authored — it is kept in the model and reused if you switch back to `custom`.

## Formats

`f=` sets a screen's proportions:

| Format | Size (w × h) |
|---|---|
| `desktop` | 400 × 240 (fixed) |
| `phone` | 240 × 420 (fixed) |
| `fluid` | min 280 × 180, grows with content |

`fluid` is the right pick for `custom` HTML bodies: it sets only a minimum and lets the
card size to its content (so nothing is clipped).

---

## Interactions

- **Drag to pan** — grab the background and move (in Drag mode); wheel to pan, Ctrl+wheel to zoom.
- **Mode switch** (bottom-right) — **Drag** (pan) vs **Select** (cursor). Keys: `V` / `H` / `Esc`.
- **Select mode** — rubber-band multi-select, click / Cmd-click to toggle, move a group rigidly.
- **Drag screens** — free repositioning; positions live in the Flow-ML text.
- **Anchor dots** — hover a screen to reveal anchors, click-drag to create a new arrow.
- **Arrow popup** (click a handle) — swap direction, toggle dashed, edit label, delete.
- **Screen popup** (right-click) — change layout/format, edit title, hide/show, **delete**.
- **Legend** (toolbar) — toggle epic visibility with accent-colored checkboxes.
- **Auto-layout** — cycle Flow (BFS columns) / Epics (grouped) / Grid.
- **Dotted grid** — constant on-screen size at any zoom; excluded from PNG export.
- **Code panel** — syntax highlighting, line-number gutter, current-line indicator, a
  copy-to-clipboard button, and a `?` cheat-sheet.
- **Export PNG** · **Reset** (restores the default layout + visibility; your text stays the
  source of truth).

---

## API

### `FlowBoard.init(config)`

| Field | Type | Description |
|---|---|---|
| `config.container` | `string \| HTMLElement` | CSS selector or DOM element |
| `config.project` | `Project` | Initial board (see below) |
| `config.state` | `State?` | Optional restore blob; **takes priority over any saved Flow-ML doc** |

### Project

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Project name (also the localStorage key prefix) |
| `epics` | `Epic[]` | Logical screen groupings |
| `screens` | `Screen[]` | Screens |
| `arrows` | `Arrow[]` | Connections |

### Epic

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique id |
| `label` | `string` | Name shown in the legend |
| `color` | `string` | CSS color (screen header + legend) |

### Screen

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique id |
| `title` | `string` | Header title |
| `epic` | `string` | Epic id (drives the header color) |
| `preset` | `PresetId` | Body skeleton; absent ⇒ `custom` |
| `format` | `"desktop" \| "phone" \| "fluid"` | Proportions (`fluid` = min-size, content-driven) |
| `notes` | `string` | Footer annotation (togglable) |
| `content` | `string` | Raw HTML body (used by the `custom` preset) |
| `hidden` | `boolean` | Hidden via the legend/eye toggle |
| `size` | `"sm" \| "md" \| "lg" \| "xl"` | **Legacy** width (240/320/400/520px); prefer `format` |

### Arrow

| Field | Type | Description |
|---|---|---|
| `from` / `to` | `string` | Source / destination screen id |
| `label` | `string` | Text on the arrow |
| `dashed` | `boolean` | Dashed style |
| `fromSide` / `toSide` | `string` | Anchor sides (see below) |

### `config.state`

Restore a specific board snapshot. When passed, it takes priority over any saved Flow-ML doc.

| Field | Type | Description |
|---|---|---|
| `positions` | `{ [id]: { x, y } }` | Screen positions |
| `hiddenScreens` | `{ [id]: true }` | Hidden screens |
| `arrows` | `Arrow[]` | Arrow set |
| `zoom` / `panX` / `panY` | `number` | Viewport |

---

## Persistence

Flow-ML is the source of truth. Keys are namespaced by project name:

| Key | Holds |
|---|---|
| `fb-<name>-flowml` | The whole board, as Flow-ML text |
| `fb-<name>-zoom` | Viewport (`zoom`, `panX`, `panY`) — kept separate from the doc |

Notes:

- The storage key is **pinned** to the `name` you pass to `init()`, so editing `!name =` in the
  panel changes the displayed title without orphaning the saved document.
- On reload, a saved `fb-<name>-flowml` doc **supersedes** the passed `config.project` — unless you
  pass an explicit `config.state`, which always wins.
- Boards saved with the older per-feature keys (`-pos`, `-hidden`, `-arrowmods`) are migrated to a
  Flow-ML doc on first load, then the legacy keys are removed.

---

## Arrow anchor points

Each screen exposes 16 anchor points. By default FlowBoard picks the best side; drag an arrow
endpoint handle (or set `fs=`/`ts=` in Flow-ML) to pin one.

- **Left / right** — 5 positions each at 1/6…5/6 of the height: `left-top`, `left-upper`,
  `left-middle`, `left-lower`, `left-bottom` (same for `right-*`). `left` / `right` ⇒ the middle.
- **Top / bottom** — 3 positions each at 1/4, 1/2, 3/4 of the width: `top-left`, `top`, `top-right`
  (same for `bottom-*`).

When several arrows connect the same pair, they auto-spread across sub-positions to avoid overlap.

---

## Wireframe classes `fb-*`

Use these inside a screen's custom `content` (or a fenced Flow-ML block) to sketch UI.

**Structure** — `.fb-bar` `.fb-card` `.fb-row` (`.spread` `.wrap`) `.fb-sep` `.fb-section-label`
**Forms** — `.fb-input` `.fb-btn` (`.outline` `.danger` `.secondary` `.small`)
**Data** — `.fb-table` `.fb-stat-card` `.fb-list` `.fb-list-item` `.fb-badge` (`.green/.blue/.orange/.red/.purple`) `.fb-chip`
**Media & UI** — `.fb-img` `.fb-grid-images` `.fb-icon` (`.round` `.lg`) `.fb-avatar` (`.sm`) `.fb-richtext` `.fb-tabs`/`.fb-tab` (`.active`) `.fb-progress`/`.fb-progress-fill`
**Text** — `.fb-text` (`.title` `.subtitle` `.small` `.muted`)
**Helpers** — `.fb-flex-1` `.fb-gap-4`/`.fb-gap-8` `.fb-mt-4`/`.fb-mt-8`

---

## Performance

The Flow-ML engine is the hot path (the highlighter re-runs on every keystroke), so it's kept
allocation-light and O(n). Indicative means on a synthetic board (`npm run bench`, vitest + jsdom):

| Op | 50 screens | 200 screens | 500 screens |
|---|---|---|---|
| `serialize` | ~0.03 ms | ~0.11 ms | ~0.27 ms |
| `parse` | ~0.08 ms | ~0.30 ms | ~0.75 ms |
| `highlight` | ~0.13 ms | ~0.50 ms | ~1.2 ms |

Text → diagram rebuilds are debounced (300 ms) and screens are inserted via a `DocumentFragment`
(one reflow). A transient/empty edit never wipes the board.

---

## Development

```bash
npm run dev         # watch-rebuild src/ + static server on :3000 (loads the built bundle)
npm run build       # bundle src/ -> flowboard.js + flowboard.min.js (tsup/esbuild)
npm run typecheck   # tsc --noEmit (the type gate; CI-enforced)
npm test            # build, then run the vitest + jsdom suite (163 tests)
npm run test:watch  # vitest watch
npm run bench       # vitest bench (Flow-ML serialize/parse/highlight + rebuild)
```

Source is TypeScript in `src/` (one module per responsibility); a build step bundles it to a single
browser IIFE. **The committed `flowboard.js` / `flowboard.min.js` must match the source** — CI fails
if they're stale. See [`CLAUDE.md`](./CLAUDE.md) for the module map.

## Files

| File | Description |
|---|---|
| `flowboard.js` / `flowboard.min.js` | Build outputs (committed, served on the CDN) |
| `flowboard.css` | Library styles (all classes prefixed `fb-`) |
| `src/` | TypeScript source |
| `index.html` | GitHub Pages demo |
| `*.test.js`, `bench/` | vitest suites + benchmarks |

## License

MIT
