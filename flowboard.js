(function () {
  'use strict';

  // -- Constants --
  var CANVAS_W = 6000;
  var CANVAS_H = 4000;
  var ZOOM_MIN = 0.2;
  var ZOOM_MAX = 2;
  var ZOOM_STEP = 0.1;
  var SIZES = { sm: 240, md: 320, lg: 400 };
  var GAP_X = 100;
  var GAP_Y = 40;
  var ARROW_OFFSET = 60;

  // -- State --
  var state = {
    zoom: 1,
    panX: 0,
    panY: 0,
    isPanning: false,
    panStart: null,
    dragTarget: null,
    dragOffset: null,
    project: null,
    container: null,
    canvasEl: null,
    sizerEl: null,
    wrapperEl: null,
    svgEl: null,
    screenEls: {},
    defaultPositions: {},
    positions: {},
    showNotes: true,
    html2canvasUrl: 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'
  };

  // -- Storage helpers --
  function storageKey() {
    return 'fb-' + (state.project ? state.project.name : 'default');
  }

  function savePositions() {
    try {
      localStorage.setItem(storageKey() + '-pos', JSON.stringify(state.positions));
    } catch (e) { /* quota */ }
  }

  function loadPositions() {
    try {
      var raw = localStorage.getItem(storageKey() + '-pos');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function saveZoom() {
    try {
      localStorage.setItem(storageKey() + '-zoom', JSON.stringify({
        zoom: state.zoom, panX: state.panX, panY: state.panY
      }));
    } catch (e) { /* quota */ }
  }

  function loadZoom() {
    try {
      var raw = localStorage.getItem(storageKey() + '-zoom');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // -- Auto layout --
  function autoLayout(screens, arrows) {
    // Build adjacency: screen -> children
    var children = {};
    var hasParent = {};
    screens.forEach(function (s) { children[s.id] = []; });
    arrows.forEach(function (a) {
      if (children[a.from]) children[a.from].push(a.to);
      hasParent[a.to] = true;
    });

    // Find roots (no incoming arrow)
    var roots = screens.filter(function (s) { return !hasParent[s.id]; }).map(function (s) { return s.id; });
    if (roots.length === 0 && screens.length > 0) roots = [screens[0].id];

    // BFS to assign columns
    var col = {};
    var visited = {};
    var queue = [];
    roots.forEach(function (r) { queue.push(r); col[r] = 0; visited[r] = true; });

    while (queue.length > 0) {
      var cur = queue.shift();
      (children[cur] || []).forEach(function (child) {
        if (!visited[child]) {
          visited[child] = true;
          col[child] = (col[cur] || 0) + 1;
          queue.push(child);
        }
      });
    }

    // Assign unvisited screens to column 0
    screens.forEach(function (s) {
      if (col[s.id] === undefined) col[s.id] = 0;
    });

    // Group by column
    var columns = {};
    screens.forEach(function (s) {
      var c = col[s.id];
      if (!columns[c]) columns[c] = [];
      columns[c].push(s);
    });

    // Compute positions
    var positions = {};
    var colKeys = Object.keys(columns).map(Number).sort(function (a, b) { return a - b; });
    var offsetX = 80;

    colKeys.forEach(function (c) {
      var colScreens = columns[c];
      // Find max width for this column
      var maxW = 0;
      colScreens.forEach(function (s) {
        var w = SIZES[s.size || 'md'] || SIZES.md;
        if (w > maxW) maxW = w;
      });

      var offsetY = 80;
      colScreens.forEach(function (s) {
        positions[s.id] = { x: offsetX, y: offsetY };
        // Estimate height: header(36) + body(~100) + footer(~30) = ~166 min
        offsetY += 200 + GAP_Y;
      });

      offsetX += maxW + GAP_X;
    });

    return positions;
  }

  // -- Get epic by id --
  function getEpic(epicId) {
    if (!state.project || !state.project.epics) return null;
    for (var i = 0; i < state.project.epics.length; i++) {
      if (state.project.epics[i].id === epicId) return state.project.epics[i];
    }
    return null;
  }

  // -- Render toolbar --
  function renderToolbar() {
    var header = document.createElement('div');
    header.className = 'fb-header';

    // Left: title + legend
    var left = document.createElement('div');
    left.className = 'fb-toolbar-group';

    var title = document.createElement('span');
    title.className = 'fb-project-title';
    title.textContent = state.project.name || 'FlowBoard';
    left.appendChild(title);

    // Separator
    var sep1 = document.createElement('div');
    sep1.className = 'fb-header-separator';
    left.appendChild(sep1);

    // Legend
    var legend = document.createElement('div');
    legend.className = 'fb-legend';
    (state.project.epics || []).forEach(function (epic) {
      var item = document.createElement('span');
      item.className = 'fb-legend-item';
      var dot = document.createElement('span');
      dot.className = 'fb-legend-dot';
      dot.style.background = epic.color;
      item.appendChild(dot);
      item.appendChild(document.createTextNode(epic.label));
      legend.appendChild(item);
    });
    left.appendChild(legend);

    header.appendChild(left);

    // Right: controls
    var right = document.createElement('div');
    right.className = 'fb-toolbar-group';

    // Toggle notes
    var toggleLabel = document.createElement('label');
    toggleLabel.className = 'fb-toggle-label';
    var checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.showNotes;
    checkbox.addEventListener('change', function () {
      state.showNotes = checkbox.checked;
      toggleNotesVisibility();
    });
    toggleLabel.appendChild(checkbox);
    toggleLabel.appendChild(document.createTextNode('Notes'));
    right.appendChild(toggleLabel);

    // Separator
    var sep2 = document.createElement('div');
    sep2.className = 'fb-header-separator';
    right.appendChild(sep2);

    // Zoom out
    var zoomOut = document.createElement('button');
    zoomOut.className = 'fb-toolbar-btn';
    zoomOut.textContent = '−';
    zoomOut.title = 'Zoom out';
    zoomOut.addEventListener('click', function () { setZoom(state.zoom - ZOOM_STEP); });
    right.appendChild(zoomOut);

    // Zoom label
    var zoomLabel = document.createElement('span');
    zoomLabel.className = 'fb-zoom-label';
    zoomLabel.id = 'fb-zoom-label';
    zoomLabel.textContent = Math.round(state.zoom * 100) + '%';
    right.appendChild(zoomLabel);

    // Zoom in
    var zoomIn = document.createElement('button');
    zoomIn.className = 'fb-toolbar-btn';
    zoomIn.textContent = '+';
    zoomIn.title = 'Zoom in';
    zoomIn.addEventListener('click', function () { setZoom(state.zoom + ZOOM_STEP); });
    right.appendChild(zoomIn);

    // Separator
    var sep3 = document.createElement('div');
    sep3.className = 'fb-header-separator';
    right.appendChild(sep3);

    // Reset positions
    var resetBtn = document.createElement('button');
    resetBtn.className = 'fb-action-btn';
    resetBtn.textContent = 'Reset';
    resetBtn.title = 'Reset positions';
    resetBtn.addEventListener('click', resetPositions);
    right.appendChild(resetBtn);

    // Export PNG
    var exportBtn = document.createElement('button');
    exportBtn.className = 'fb-action-btn';
    exportBtn.textContent = 'Export PNG';
    exportBtn.title = 'Export as PNG';
    exportBtn.addEventListener('click', exportPNG);
    right.appendChild(exportBtn);

    header.appendChild(right);
    return header;
  }

  // -- Toggle notes visibility --
  function toggleNotesVisibility() {
    var notes = state.container.querySelectorAll('.fb-screen-notes');
    for (var i = 0; i < notes.length; i++) {
      if (state.showNotes) {
        notes[i].classList.remove('fb-hidden');
      } else {
        notes[i].classList.add('fb-hidden');
      }
    }
  }

  // -- Render a single screen --
  function renderScreen(screenData) {
    var epic = getEpic(screenData.epic);
    var color = epic ? epic.color : '#666';
    var size = screenData.size || 'md';

    var el = document.createElement('div');
    el.className = 'fb-screen fb-size-' + size;
    el.dataset.screenId = screenData.id;

    // Position
    var pos = state.positions[screenData.id] || { x: 100, y: 100 };
    el.style.left = pos.x + 'px';
    el.style.top = pos.y + 'px';

    // Header
    var hdr = document.createElement('div');
    hdr.className = 'fb-screen-header';
    hdr.style.background = color;
    hdr.innerHTML = '<span>' + escapeHtml(screenData.title) + '</span>';
    el.appendChild(hdr);

    // Body
    var body = document.createElement('div');
    body.className = 'fb-screen-body';
    body.innerHTML = screenData.content || '';
    el.appendChild(body);

    // Footer (label + notes)
    if (screenData.label || screenData.notes) {
      var footer = document.createElement('div');
      footer.className = 'fb-screen-footer';

      if (screenData.label) {
        var lbl = document.createElement('div');
        lbl.className = 'fb-screen-label';
        lbl.textContent = screenData.label;
        footer.appendChild(lbl);
      }

      if (screenData.notes) {
        var note = document.createElement('div');
        note.className = 'fb-screen-notes' + (state.showNotes ? '' : ' fb-hidden');
        note.textContent = screenData.notes;
        footer.appendChild(note);
      }

      el.appendChild(footer);
    }

    state.screenEls[screenData.id] = el;
    return el;
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // -- Zoom --
  function setZoom(z) {
    state.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * 100) / 100));
    applyTransform();
    var label = document.getElementById('fb-zoom-label');
    if (label) label.textContent = Math.round(state.zoom * 100) + '%';
    saveZoom();
  }

  function applyTransform() {
    if (state.sizerEl) {
      state.sizerEl.style.transform = 'translate(' + state.panX + 'px,' + state.panY + 'px) scale(' + state.zoom + ')';
    }
  }

  // -- Pan --
  function initPan() {
    var wrapper = state.wrapperEl;

    wrapper.addEventListener('mousedown', function (e) {
      // Only start pan if clicking on the canvas background (not a screen)
      if (e.target === wrapper || e.target === state.canvasEl || e.target === state.sizerEl ||
          e.target.classList.contains('fb-canvas') || e.target.classList.contains('fb-canvas-sizer')) {
        state.isPanning = true;
        state.panStart = { x: e.clientX - state.panX, y: e.clientY - state.panY };
        wrapper.classList.add('fb-panning');
        e.preventDefault();
      }
    });

    document.addEventListener('mousemove', function (e) {
      if (state.isPanning && state.panStart) {
        state.panX = e.clientX - state.panStart.x;
        state.panY = e.clientY - state.panStart.y;
        applyTransform();
      }
    });

    document.addEventListener('mouseup', function () {
      if (state.isPanning) {
        state.isPanning = false;
        state.panStart = null;
        wrapper.classList.remove('fb-panning');
        saveZoom();
      }
    });

    // Ctrl+wheel zoom
    wrapper.addEventListener('wheel', function (e) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        var delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        setZoom(state.zoom + delta);
      }
    }, { passive: false });
  }

  // -- Drag screens --
  function initDrag() {
    state.canvasEl.addEventListener('mousedown', function (e) {
      var screenEl = e.target.closest('.fb-screen');
      if (!screenEl) return;

      e.stopPropagation();
      e.preventDefault();

      state.dragTarget = screenEl;
      var rect = screenEl.getBoundingClientRect();
      state.dragOffset = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      screenEl.classList.add('fb-dragging');
      state.wrapperEl.classList.add('fb-dragging-screen');
    });

    document.addEventListener('mousemove', function (e) {
      if (!state.dragTarget) return;

      // Convert mouse position to canvas coordinates
      var wrapperRect = state.wrapperEl.getBoundingClientRect();
      var newX = (e.clientX - wrapperRect.left - state.panX) / state.zoom - state.dragOffset.x / state.zoom;
      var newY = (e.clientY - wrapperRect.top - state.panY) / state.zoom - state.dragOffset.y / state.zoom;

      // Clamp to canvas
      newX = Math.max(0, Math.min(CANVAS_W - 100, newX));
      newY = Math.max(0, Math.min(CANVAS_H - 50, newY));

      state.dragTarget.style.left = newX + 'px';
      state.dragTarget.style.top = newY + 'px';

      // Update stored position
      var id = state.dragTarget.dataset.screenId;
      state.positions[id] = { x: newX, y: newY };

      drawArrows();
    });

    document.addEventListener('mouseup', function () {
      if (state.dragTarget) {
        state.dragTarget.classList.remove('fb-dragging');
        state.dragTarget = null;
        state.dragOffset = null;
        state.wrapperEl.classList.remove('fb-dragging-screen');
        savePositions();
      }
    });
  }

  // -- Arrows --
  function getBestSides(fromEl, toEl) {
    var fr = fromEl.getBoundingClientRect();
    var tr = toEl.getBoundingClientRect();

    // Use center points relative to canvas (use style left/top for accuracy)
    var fromId = fromEl.dataset.screenId;
    var toId = toEl.dataset.screenId;
    var fp = state.positions[fromId];
    var tp = state.positions[toId];
    var fw = fromEl.offsetWidth;
    var fh = fromEl.offsetHeight;
    var tw = toEl.offsetWidth;
    var th = toEl.offsetHeight;

    var fcx = fp.x + fw / 2;
    var fcy = fp.y + fh / 2;
    var tcx = tp.x + tw / 2;
    var tcy = tp.y + th / 2;

    var dx = tcx - fcx;
    var dy = tcy - fcy;

    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx > 0 ? { from: 'right', to: 'left' } : { from: 'left', to: 'right' };
    } else {
      return dy > 0 ? { from: 'bottom', to: 'top' } : { from: 'top', to: 'bottom' };
    }
  }

  function getAnchor(screenId, side) {
    var el = state.screenEls[screenId];
    if (!el) return { x: 0, y: 0 };

    var pos = state.positions[screenId];
    var w = el.offsetWidth;
    var h = el.offsetHeight;

    switch (side) {
      case 'top':    return { x: pos.x + w / 2, y: pos.y };
      case 'bottom': return { x: pos.x + w / 2, y: pos.y + h };
      case 'left':   return { x: pos.x,          y: pos.y + h / 2 };
      case 'right':  return { x: pos.x + w,      y: pos.y + h / 2 };
      default:       return { x: pos.x + w / 2, y: pos.y + h / 2 };
    }
  }

  function drawArrows() {
    if (!state.svgEl || !state.project) return;

    var arrows = state.project.arrows || [];
    var ns = 'http://www.w3.org/2000/svg';
    state.svgEl.innerHTML = '';

    // Arrow marker
    var defs = document.createElementNS(ns, 'defs');
    var marker = document.createElementNS(ns, 'marker');
    marker.setAttribute('id', 'fb-arrowhead');
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('refX', '10');
    marker.setAttribute('refY', '3.5');
    marker.setAttribute('orient', 'auto');
    var polygon = document.createElementNS(ns, 'polygon');
    polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
    polygon.setAttribute('class', 'fb-arrow-head');
    marker.appendChild(polygon);
    defs.appendChild(marker);
    state.svgEl.appendChild(defs);

    arrows.forEach(function (arrow) {
      var fromEl = state.screenEls[arrow.from];
      var toEl = state.screenEls[arrow.to];
      if (!fromEl || !toEl) return;

      // Determine sides
      var sides;
      if (arrow.fromSide && arrow.toSide) {
        sides = { from: arrow.fromSide, to: arrow.toSide };
      } else {
        sides = getBestSides(fromEl, toEl);
      }

      var start = getAnchor(arrow.from, sides.from);
      var end = getAnchor(arrow.to, sides.to);

      // Bezier control points
      var cp1 = { x: start.x, y: start.y };
      var cp2 = { x: end.x, y: end.y };

      switch (sides.from) {
        case 'right':  cp1.x += ARROW_OFFSET; break;
        case 'left':   cp1.x -= ARROW_OFFSET; break;
        case 'bottom': cp1.y += ARROW_OFFSET; break;
        case 'top':    cp1.y -= ARROW_OFFSET; break;
      }
      switch (sides.to) {
        case 'right':  cp2.x += ARROW_OFFSET; break;
        case 'left':   cp2.x -= ARROW_OFFSET; break;
        case 'bottom': cp2.y += ARROW_OFFSET; break;
        case 'top':    cp2.y -= ARROW_OFFSET; break;
      }

      var d = 'M' + start.x + ',' + start.y +
              ' C' + cp1.x + ',' + cp1.y +
              ' ' + cp2.x + ',' + cp2.y +
              ' ' + end.x + ',' + end.y;

      var path = document.createElementNS(ns, 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', 'fb-arrow-path' + (arrow.dashed ? ' fb-dashed' : ''));
      path.setAttribute('marker-end', 'url(#fb-arrowhead)');
      state.svgEl.appendChild(path);

      // Label
      if (arrow.label) {
        var midX = (start.x + end.x + cp1.x + cp2.x) / 4;
        var midY = (start.y + end.y + cp1.y + cp2.y) / 4;

        // Background rect for label (appended after text for size measurement)
        var text = document.createElementNS(ns, 'text');
        text.setAttribute('x', midX);
        text.setAttribute('y', midY);
        text.setAttribute('class', 'fb-arrow-label');
        text.textContent = arrow.label;

        // Temporarily add text to measure
        state.svgEl.appendChild(text);
        var bbox;
        try { bbox = text.getBBox(); } catch (e) { bbox = { x: midX - 20, y: midY - 8, width: 40, height: 16 }; }

        var bgRect = document.createElementNS(ns, 'rect');
        bgRect.setAttribute('x', bbox.x - 4);
        bgRect.setAttribute('y', bbox.y - 2);
        bgRect.setAttribute('width', bbox.width + 8);
        bgRect.setAttribute('height', bbox.height + 4);
        bgRect.setAttribute('class', 'fb-arrow-label-bg');

        // Insert bg before text
        state.svgEl.insertBefore(bgRect, text);
      }
    });
  }

  // -- Export PNG --
  function exportPNG() {
    var btn = state.container ? state.container.querySelector('.fb-action-btn[title="Export as PNG"]') : null;

    if (window.html2canvas) {
      doExport();
      return;
    }

    // Show loading state
    var originalText;
    if (btn) {
      originalText = btn.textContent;
      btn.textContent = 'Loading\u2026';
      btn.disabled = true;
    }

    function restore() {
      if (btn) {
        btn.textContent = originalText;
        btn.disabled = false;
      }
    }

    // Lazy load html2canvas
    var s = document.createElement('script');
    s.src = state.html2canvasUrl;
    s.onload = function () { restore(); doExport(); };
    s.onerror = function () { restore(); alert('Failed to load html2canvas. Please check your internet connection.'); };
    document.head.appendChild(s);
  }

  function doExport() {
    var canvas = state.canvasEl;
    if (!canvas || !window.html2canvas) return;

    // Find bounding box of all screens to crop export
    var minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
    state.project.screens.forEach(function (s) {
      var el = state.screenEls[s.id];
      var pos = state.positions[s.id];
      if (!el || !pos) return;
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + el.offsetWidth);
      maxY = Math.max(maxY, pos.y + el.offsetHeight);
    });

    var padding = 40;
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);

    window.html2canvas(canvas, {
      x: minX,
      y: minY,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
      backgroundColor: '#f0f2f5',
      scale: 2
    }).then(function (c) {
      var link = document.createElement('a');
      link.download = (state.project.name || 'flowboard') + '.png';
      link.href = c.toDataURL();
      link.click();
    });
  }

  // -- Reset positions --
  function resetPositions() {
    state.positions = JSON.parse(JSON.stringify(state.defaultPositions));

    // Apply positions to DOM
    state.project.screens.forEach(function (s) {
      var el = state.screenEls[s.id];
      var pos = state.positions[s.id];
      if (el && pos) {
        el.style.left = pos.x + 'px';
        el.style.top = pos.y + 'px';
      }
    });

    // Reset zoom and pan
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    applyTransform();

    var label = document.getElementById('fb-zoom-label');
    if (label) label.textContent = '100%';

    savePositions();
    saveZoom();
    drawArrows();
  }

  // -- Init --
  function init(config) {
    if (!config || !config.project) {
      console.error('FlowBoard.init: config.project is required');
      return;
    }

    state.project = config.project;
    state.showNotes = true;
    if (config.html2canvasUrl) state.html2canvasUrl = config.html2canvasUrl;

    // Resolve container
    var containerEl;
    if (typeof config.container === 'string') {
      containerEl = document.querySelector(config.container);
    } else if (config.container instanceof HTMLElement) {
      containerEl = config.container;
    }
    if (!containerEl) {
      console.error('FlowBoard.init: container not found');
      return;
    }

    // Build root
    var root = document.createElement('div');
    root.className = 'fb-container';
    containerEl.innerHTML = '';
    containerEl.appendChild(root);
    state.container = root;

    // Toolbar
    root.appendChild(renderToolbar());

    // Canvas wrapper
    var wrapper = document.createElement('div');
    wrapper.className = 'fb-canvas-wrapper';

    var sizer = document.createElement('div');
    sizer.className = 'fb-canvas-sizer';

    var canvas = document.createElement('div');
    canvas.className = 'fb-canvas';
    canvas.style.width = CANVAS_W + 'px';
    canvas.style.height = CANVAS_H + 'px';

    // SVG arrows layer
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'fb-arrows-layer');
    svg.setAttribute('width', CANVAS_W);
    svg.setAttribute('height', CANVAS_H);

    canvas.appendChild(svg);
    sizer.appendChild(canvas);
    wrapper.appendChild(sizer);
    root.appendChild(wrapper);

    state.wrapperEl = wrapper;
    state.sizerEl = sizer;
    state.canvasEl = canvas;
    state.svgEl = svg;
    state.screenEls = {};

    // Auto-layout
    var screens = state.project.screens || [];
    var arrows = state.project.arrows || [];
    state.defaultPositions = autoLayout(screens, arrows);
    state.positions = JSON.parse(JSON.stringify(state.defaultPositions));

    // Load saved positions (override auto-layout)
    var savedPos = loadPositions();
    if (savedPos) {
      screens.forEach(function (s) {
        if (savedPos[s.id]) state.positions[s.id] = savedPos[s.id];
      });
    }

    // Load saved zoom/pan
    var savedZoom = loadZoom();
    if (savedZoom) {
      state.zoom = savedZoom.zoom || 1;
      state.panX = savedZoom.panX || 0;
      state.panY = savedZoom.panY || 0;
    }

    // Render screens
    screens.forEach(function (s) {
      var el = renderScreen(s);
      canvas.appendChild(el);
    });

    // Apply transform
    applyTransform();

    // Init interactions
    initPan();
    initDrag();

    // Draw arrows (after a tick so DOM layout is computed)
    requestAnimationFrame(function () {
      drawArrows();
    });
  }

  // -- Expose API --
  window.FlowBoard = { init: init };
})();
