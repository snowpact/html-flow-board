---
name: flowboard
description: Generate html-flow-board storyboard files for UI/UX wireframing. Use when the user asks to create a flowboard, storyboard, wireframe, or screen flow.
---

# FlowBoard — HTML Storyboard Generator

Generate interactive storyboard HTML files using the [html-flow-board](https://github.com/snowpact/html-flow-board) library.

## What is html-flow-board

A zero-dependency JS/CSS library that renders a zoomable, pannable board of **screens**
(wireframe cards) grouped into **epics** and linked by **arrows**. One HTML file = one
complete storyboard. The board has a left **Flow-ML** panel (diagram-as-code) that is the
source of truth and two-way-syncs with the canvas; a board persists itself in `localStorage`.

You author a storyboard in **either** representation — they describe the same model:

- **JS config** — `FlowBoard.init({ project: { epics, screens, arrows } })` in an HTML file. Use this when generating a file.
- **Flow-ML** — the compact text the in-app panel uses. Use this when the user pastes panel text or asks for it.

## Output format (HTML file)

Always produce a **single self-contained HTML file**. Pin a released version when you can
(`@v0.4.0`); `@main` always serves the latest.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{Project Name} — Storyboard</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/snowpact/html-flow-board@main/flowboard.css">
  <script src="https://cdn.jsdelivr.net/gh/snowpact/html-flow-board@main/flowboard.js"></script>
</head>
<body>
<div id="app" style="width:100vw;height:100vh"></div>
<script>
FlowBoard.init({
  container: '#app',
  project: {
    name: '{Project Name}',
    epics: [ /* ... */ ],
    screens: [ /* ... */ ],
    arrows: [ /* ... */ ],
  },
});
</script>
</body>
</html>
```

## Config schema

### Epics

Group screens by feature/domain. Each epic colors its screens' headers and the legend.

```js
epics: [
  { id: 'auth',   label: `Authentication`, color: '#6366f1' },
  { id: 'home',   label: `Home`,           color: '#264653' },
  { id: 'report', label: `Reports`,        color: '#2a9d8f' },
]
```

### Screens

Each screen is a card. Pick a **preset** for the body (a grey wireframe skeleton) OR keep
`custom` and supply your own `content` HTML.

Use **backtick** strings for every human-text field (`title`, `notes`, `name`, `label`,
`content`) — see [Quoting](#quoting). Text often contains apostrophes (`c'est`, `l'écran`).

```js
{
  id: 'login',            // unique, kebab-case (used in arrows)
  title: `Login`,         // card header
  epic: 'auth',           // an epic id
  preset: 'form',         // body skeleton (see Presets); omit ⇒ 'custom'
  format: 'phone',        // min proportions: 'desktop' | 'phone' | 'square'
  notes: `OTP login flow`,// footer note (toggled by the Notes switch)
  content: `...`,         // raw HTML body — only rendered when preset is 'custom'
}
```

- `preset` and `content` coexist: switching presets never destroys authored HTML.
- `hidden: true` hides a screen (legend/eye toggle).
- Legacy `size: 'sm'|'md'|'lg'|'xl'` is still accepted but prefer `format`.

### Arrows

```js
arrows: [
  { from: 'login', to: 'home', label: `Login OK` },
  { from: 'home',  to: 'report', dashed: true },           // dashed = secondary path
  { from: 'home',  to: 'report', fs: 'right', ts: 'left' },// pin anchor sides (optional)
]
```

Fields: `from`, `to` (screen ids), `label`, `dashed` (bool), `fromSide`/`toSide` (anchor sides).
There is no arrow `color`.

## Presets (`preset`)

`custom` renders your `content`; the rest render a neutral grey skeleton (great for sketching
before real markup exists):

```
custom · blank · form · list · table · dashboard · cardgrid ·
detail · auth · feed · settings · kanban · modal · gallery · nav
```

## Formats (`format`)

Every format is a **minimum** — the card grows past it to fit content (never clips, never scrolls).

| Format    | Min size  | Use for |
|-----------|-----------|---------|
| `desktop` | 460 × 280 | dashboards, tables, sidebars |
| `phone`   | 270 × 480 | mobile screens |
| `square`  | 360 × 360 | square-ish / flexible cards |

## Flow-ML (the in-app text format)

The left panel edits the board as text. Each line is identified by its first character:

```
!name = My App                 # project name

@auth, t=Authentication, c=#6366f1   # epic (t = title, c = color)

:login, t=Login, p=form, f=phone, e=auth   # screen — note the ":" prefix
:home,  t=Dashboard, p=dashboard, f=desktop, e=auth, x=560, y=80

login -> home, l=Login OK      # arrow (solid),  l = label
login --> home                 # arrow (dashed)
```

- Screen attrs: `t` title · `p` preset · `f` format · `e` epic · `n` note · `x y` position · `h` hidden.
- Epic attrs: `t` title · `c` color. Arrow attrs: `l` label · `fs` from side · `ts` to side.
- Fenced ` ``` ` block right after a `:screen` line = its custom HTML body.
- Values with spaces/commas/quotes are wrapped in `"…"`. `#` starts a comment.

## CSS utility classes

Use these inside a screen's `content` (or a Flow-ML fenced block) for consistent low-fi UI:

**Structure** — `.fb-bar` `.fb-card` `.fb-row` (`.spread` `.wrap`) `.fb-sep` `.fb-section-label`
**Forms** — `.fb-input` `.fb-btn` (`.outline` `.danger` `.secondary` `.small`)
**Data** — `.fb-table` `.fb-stat-card` (`.value` `.label`) `.fb-list` `.fb-list-item` `.fb-badge` (`.green/.blue/.orange/.red/.purple`) `.fb-chip`
**Media & UI** — `.fb-img` `.fb-grid-images` `.fb-icon` (`.round` `.lg`) `.fb-avatar` (`.sm`) `.fb-richtext` `.fb-tabs`/`.fb-tab` (`.active`) `.fb-progress`/`.fb-progress-fill`
**Text** — `.fb-text` (`.title` `.subtitle` `.small` `.muted`)
**Helpers** — `.fb-flex-1` `.fb-gap-4`/`.fb-gap-8` `.fb-mt-4`/`.fb-mt-8`

Prefer a `preset` skeleton for quick boards; reach for `custom` + `content` only when the
exact layout matters.

## Design patterns (custom content)

### Form screen (`preset: 'custom', format: 'phone'`)

```html
<div style="padding:12px">
  <div class="fb-text title" style="margin-bottom:8px">Sign in</div>
  <div class="fb-text small muted" style="margin-bottom:2px">Email</div>
  <div class="fb-input">you@example.com</div>
  <div class="fb-text small muted" style="margin:6px 0 2px">Password</div>
  <div class="fb-input">••••••••</div>
  <div class="fb-sep"></div>
  <div class="fb-btn" style="width:100%">Continue</div>
</div>
```

### Desktop screen with sidebar (`format: 'desktop'`)

```html
<div style="display:flex; min-height:200px">
  <div style="width:60px; background:#264653; border-radius:4px; margin-right:6px; flex-shrink:0"></div>
  <div style="flex:1; min-width:0">
    <div class="fb-bar" style="margin-bottom:6px"></div>
    <div class="fb-row spread"><div class="fb-stat-card"><div class="value">128</div><div class="label">Open</div></div></div>
  </div>
</div>
```

## Workflow

### Create a new flowboard
1. **Ask** what screens are needed (or derive from specs/screenshots).
2. **Define epics** first — group by feature domain.
3. **Add screens** — choose a `preset` + `format`; only write `content` for `custom`.
4. **Add arrows** for the navigation paths.
5. **Write one HTML file** (boilerplate above) to the project's docs / `.context`.
6. **Verify it (required)** — run the one-line syntax check from [Quoting](#quoting) on the file;
   fix until it prints `script OK`.
7. **Tell the user** to open it in a browser. They can then drag, wire, and edit it live —
   the board persists in `localStorage`.

### Update an existing flowboard
The board is editable in the UI (drag, anchor-drag to create arrows, right-click a screen to
change preset/format/epic/hide/delete) and auto-saves. To carry changes back into the file:

- The panel's **copy** button copies the current **Flow-ML** — paste it and translate to the
  `project` config (or keep it as a reference).
- If the user pastes a `FlowBoard.init({...})`, **replace the whole `<script>`** and keep the
  HTML boilerplate (DOCTYPE, head CDN links, `#app` container). Preserve any `state` object
  (`positions`, `zoom`, `panX`, `panY`, `hiddenScreens`) and arrow `fromSide`/`toSide`.

## Quoting

The generated `<script>` is real JavaScript — a single bad quote blanks the whole page
(`Uncaught SyntaxError` aborts the script, so `FlowBoard.init` never runs).

- **Wrap every human-text value in backticks** (`` `…` ``): `title`, `notes`, `name`, `label`,
  `content`. Apostrophes (`c'est`, `l'écran`, `d'un`) and quotes then need **no escaping**.
- Never put apostrophe-bearing text in a `'single-quoted'` string. ``title: 'C'est parti'``
  breaks; ``title: `C'est parti` `` is correct.
- Inside a backtick string, only a literal backtick or `${` needs escaping (`` \` ``) — rare in UI copy.
- **After writing, syntax-check the file** — a bad quote blanks the page. Run this one-liner
  (no extra files needed); it prints `script OK`, or throws a `SyntaxError` to fix:

  ```bash
  node -e 'const fs=require("fs"),vm=require("vm");for(const m of fs.readFileSync(process.argv[1],"utf8").matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1]);console.log("script OK")' FILE.html
  ```

## Rules

- Match the wireframe text to the app's language.
- Keep wireframes low-fi — `fb-img` placeholders, no real images.
- Screen ids unique + kebab-case; every screen's `epic` must exist in `epics`.
- Container must be `#app` with `width:100vw;height:100vh`.
- Prefer `preset` skeletons; use inline styles for custom layout, `fb-*` classes for components.
- Quote human text with backticks (see [Quoting](#quoting)) — this is the #1 cause of a blank page.
