# html-flow-board

Standalone JS+CSS library to create interactive storyboards with screens connected by SVG arrows. Zero dependencies, importable via CDN.

## Installation

### CDN (recommended)

**jsDelivr (from npm):**
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/html-flow-board@latest/flowboard.min.css">
<script src="https://cdn.jsdelivr.net/npm/html-flow-board@latest/flowboard.min.js"></script>
```

**unpkg:**
```html
<link rel="stylesheet" href="https://unpkg.com/html-flow-board@latest/flowboard.min.css">
<script src="https://unpkg.com/html-flow-board@latest/flowboard.min.js"></script>
```

**jsDelivr (from GitHub):**
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/snowpact/html-flow-board@main/flowboard.min.css">
<script src="https://cdn.jsdelivr.net/gh/snowpact/html-flow-board@main/flowboard.min.js"></script>
```

### npm

```bash
npm install html-flow-board
```

### Self-hosted

Download `flowboard.js` and `flowboard.css` and include them in your project.

## Quick Start

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
      { id: "auth", label: "Authentication", color: "#d97706" }
    ],
    screens: [
      {
        id: "login", title: "Login", epic: "auth",
        size: "sm",
        notes: "US-1.1",
        content: `
          <div class="fb-input">Email</div>
          <div class="fb-btn">Sign In</div>
        `
      },
      {
        id: "home", title: "Home", epic: "auth",
        content: `<div class="fb-text title">Welcome</div>`
      }
    ],
    arrows: [
      { from: "login", to: "home", label: "Login OK" }
    ]
  }
});
</script>
```

## API

### `FlowBoard.init(config)`

| Parameter | Type | Description |
|---|---|---|
| `config.container` | `string \| HTMLElement` | CSS selector or DOM element |
| `config.project` | `object` | Storyboard configuration |

### Project

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Project name (used as localStorage key) |
| `epics` | `Epic[]` | Logical screen groupings |
| `screens` | `Screen[]` | List of screens |
| `arrows` | `Arrow[]` | Connections between screens |

### Epic

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique identifier |
| `label` | `string` | Name displayed in the legend |
| `color` | `string` | CSS color (screen header + legend) |

### Screen

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique identifier |
| `title` | `string` | Title displayed in the header |
| `epic` | `string` | Epic ID (determines the color) |
| `size` | `"sm" \| "md" \| "lg"` | Width: 240px / 320px / 400px (default: `"md"`) |
| `notes` | `string` | Annotation displayed in footer (togglable) |
| `content` | `string` | HTML injected into the card body |

### Arrow

| Field | Type | Description |
|---|---|---|
| `from` | `string` | Source screen ID |
| `to` | `string` | Destination screen ID |
| `label` | `string` | Text on the arrow |
| `dashed` | `boolean` | Dashed arrow (default: `false`) |

## Features

- **Pannable canvas** — scroll wheel to navigate
- **Draggable screens** — free repositioning, persisted in localStorage
- **SVG Bezier arrows** — redrawn in real time on drag
- **Auto-layout** — automatic left-to-right placement based on the navigation graph
- **Draggable arrow anchors** — drag arrow endpoints to any of 16 anchor points (5 per side on left/right, 3 per side on top/bottom), persisted in localStorage
- **Auto-spread** — when multiple arrows connect the same pair of screens, they are automatically distributed across sub-positions to avoid visual overlap
- **Auto-sides** — automatic best-side calculation for arrows (default when no manual override)
- **Zoom** — buttons + Ctrl+scroll wheel, persisted in localStorage
- **Toggle notes** — show/hide annotations
- **Export PNG** — native browser rendering, zero dependencies
- **Reset** — restore original positions

## Arrow Anchor Points

Each screen has 16 anchor points where arrows can connect. By default, FlowBoard auto-detects the best side. Drag an arrow endpoint handle to manually set its anchor position. Overrides are persisted in localStorage.

**Left and right sides** — 5 positions each, evenly distributed at 1/6, 2/6, 3/6, 4/6, 5/6 of the screen height: `left-top`, `left-upper`, `left-middle`, `left-lower`, `left-bottom` (same for `right-*`). The shorthand `left` / `right` maps to the center (3/6).

**Top and bottom sides** — 3 positions each, at 1/4, 1/2, 3/4 of the screen width: `top-left`, `top`, `top-right` (same for `bottom-*`).

When multiple arrows connect the same pair of screens (in either direction), they are automatically spread across different sub-positions to avoid overlapping.

## Wireframe classes `fb-*`

These classes are used inside screen `content` to build wireframes:

### Structure
| Class | Description |
|---|---|
| `.fb-bar` | Navigation bar |
| `.fb-card` | Nested card |
| `.fb-row` | Horizontal row (flex) |
| `.fb-row.spread` | Row with `space-between` |
| `.fb-row.wrap` | Row with wrapping |
| `.fb-sep` | Horizontal separator |
| `.fb-section-label` | Section label (uppercase) |

### Forms
| Class | Description |
|---|---|
| `.fb-input` | Input field (wireframe) |
| `.fb-btn` | Button (green by default) |
| `.fb-btn.outline` | Outline button |
| `.fb-btn.danger` | Red button |
| `.fb-btn.secondary` | Gray button |
| `.fb-btn.small` | Compact button |

### Data
| Class | Description |
|---|---|
| `.fb-table` | Table with `th` and `td` |
| `.fb-stat-card` | Stat card (value + label) |
| `.fb-list` | Vertical list |
| `.fb-list-item` | List item |
| `.fb-badge` | Badge/tag |
| `.fb-badge.green/blue/orange/red/purple` | Color variants |
| `.fb-chip` | Chip/tag |

### Media & UI
| Class | Description |
|---|---|
| `.fb-img` | Image placeholder |
| `.fb-grid-images` | 2-column image grid |
| `.fb-icon` | Icon placeholder (square) |
| `.fb-icon.round` | Round icon |
| `.fb-icon.lg` | Large icon (32px) |
| `.fb-avatar` | Round avatar (28px) |
| `.fb-avatar.sm` | Small avatar (20px) |
| `.fb-richtext` | Rich text block |
| `.fb-tabs` / `.fb-tab` | Tabs |
| `.fb-tab.active` | Active tab |
| `.fb-progress` / `.fb-progress-fill` | Progress bar |

### Text
| Class | Description |
|---|---|
| `.fb-text` | Standard text |
| `.fb-text.title` | Title (15px, bold) |
| `.fb-text.subtitle` | Subtitle (13px, semi-bold) |
| `.fb-text.small` | Small text (10px) |
| `.fb-text.muted` | Gray text |

### Helpers
| Class | Description |
|---|---|
| `.fb-flex-1` | `flex: 1` |
| `.fb-gap-4` / `.fb-gap-8` | Gap 4px / 8px |
| `.fb-mt-4` / `.fb-mt-8` | Margin-top 4px / 8px |

## Files

| File | Description |
|---|---|
| `flowboard.js` | JS logic (IIFE, zero dependencies) |
| `flowboard.css` | Library styles |
| `flowboard.min.js` | Minified JS |
| `flowboard.min.css` | Minified CSS |
| `index.html` | GitHub Pages demo page |

## License

MIT
