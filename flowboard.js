(function () {
  'use strict';

  // -- Constants --
  var CANVAS_W = 10000;
  var CANVAS_H = 8000;
  var ZOOM_MIN = 0.2;
  var ZOOM_MAX = 2;
  var ZOOM_STEP = 0.1;
  var SIZES = { sm: 240, md: 320, lg: 400 };
  var GAP_X = 100;
  var GAP_Y = 40;
  var ARROW_OFFSET = 60;
  var ARROW_BLEND = 0.15;

  // -- State --
  var state = {
    zoom: 1,
    panX: 0,
    panY: 0,
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
    hiddenEpics: {},
    arrowOverrides: {},
    handleEls: [],
    draggingHandle: null,
    hiddenScreens: {},
    layoutIndex: 0
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

  function saveArrowOverrides() {
    try {
      localStorage.setItem(storageKey() + '-arrows', JSON.stringify(state.arrowOverrides));
    } catch (e) { /* quota */ }
  }

  function loadArrowOverrides() {
    try {
      var raw = localStorage.getItem(storageKey() + '-arrows');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function saveHiddenScreens() {
    try {
      localStorage.setItem(storageKey() + '-hidden', JSON.stringify(state.hiddenScreens));
    } catch (e) { /* quota */ }
  }

  function loadHiddenScreens() {
    try {
      var raw = localStorage.getItem(storageKey() + '-hidden');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // -- Layout helpers --
  function bfsDepth(screens, arrows) {
    var children = {};
    var hasParent = {};
    screens.forEach(function (s) { children[s.id] = []; });
    arrows.forEach(function (a) {
      if (children[a.from]) children[a.from].push(a.to);
      hasParent[a.to] = true;
    });
    var roots = screens.filter(function (s) { return !hasParent[s.id]; }).map(function (s) { return s.id; });
    if (roots.length === 0 && screens.length > 0) roots = [screens[0].id];

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
    screens.forEach(function (s) { if (col[s.id] === undefined) col[s.id] = 0; });
    return col;
  }

  function centerPositions(positions, screens, totalW, totalH) {
    var cx = Math.max(0, Math.round((CANVAS_W - totalW) / 2));
    var cy = Math.max(0, Math.round((CANVAS_H - totalH) / 2));
    screens.forEach(function (s) {
      if (positions[s.id]) {
        positions[s.id].x += cx;
        positions[s.id].y += cy;
      }
    });
  }

  // -- Auto layout (Flow) --
  function autoLayout(screens, arrows, heights) {
    var col = bfsDepth(screens, arrows);

    // Group by column
    var columns = {};
    screens.forEach(function (s) {
      var c = col[s.id];
      if (!columns[c]) columns[c] = [];
      columns[c].push(s);
    });

    // Compute positions (first pass: relative to 0,0)
    var positions = {};
    var colKeys = Object.keys(columns).map(Number).sort(function (a, b) { return a - b; });
    var offsetX = 0;
    var totalH = 0;

    colKeys.forEach(function (c) {
      var colScreens = columns[c];
      var maxW = 0;
      colScreens.forEach(function (s) {
        var w = SIZES[s.size || 'md'] || SIZES.md;
        if (w > maxW) maxW = w;
      });

      var offsetY = 0;
      colScreens.forEach(function (s) {
        positions[s.id] = { x: offsetX, y: offsetY };
        var h = (heights && heights[s.id]) ? heights[s.id] : 200;
        offsetY += h + GAP_Y;
      });

      if (offsetY - GAP_Y > totalH) totalH = offsetY - GAP_Y;
      offsetX += maxW + GAP_X;
    });
    var totalW = offsetX - GAP_X;

    centerPositions(positions, screens, totalW, totalH);
    return positions;
  }

  // -- Layout by Epics --
  function layoutByEpics(screens, arrows, heights) {
    var epicGroups = {};
    var epicOrder = [];
    screens.forEach(function (s) {
      var eid = s.epic || '_none';
      if (!epicGroups[eid]) { epicGroups[eid] = []; epicOrder.push(eid); }
      epicGroups[eid].push(s);
    });

    var col = bfsDepth(screens, arrows);

    var positions = {};
    var offsetX = 0;
    var totalH = 0;

    epicOrder.forEach(function (eid) {
      var group = epicGroups[eid];
      group.sort(function (a, b) { return (col[a.id] || 0) - (col[b.id] || 0); });

      var maxW = 0;
      group.forEach(function (s) {
        var w = SIZES[s.size || 'md'] || SIZES.md;
        if (w > maxW) maxW = w;
      });

      var offsetY = 0;
      group.forEach(function (s) {
        positions[s.id] = { x: offsetX, y: offsetY };
        var h = (heights && heights[s.id]) ? heights[s.id] : 200;
        offsetY += h + GAP_Y;
      });
      if (offsetY - GAP_Y > totalH) totalH = offsetY - GAP_Y;
      offsetX += maxW + GAP_X;
    });

    centerPositions(positions, screens, offsetX - GAP_X, totalH);
    return positions;
  }

  // -- Layout Grid --
  function layoutGrid(screens, arrows, heights) {
    var cols = Math.max(1, Math.round(Math.sqrt(screens.length)));
    var positions = {};
    var offsetX = 0, offsetY = 0;
    var rowMaxH = 0;
    var totalW = 0, totalH = 0;

    screens.forEach(function (s, i) {
      var colIdx = i % cols;
      if (colIdx === 0 && i > 0) {
        offsetY += rowMaxH + GAP_Y;
        offsetX = 0;
        rowMaxH = 0;
      }
      positions[s.id] = { x: offsetX, y: offsetY };
      var w = SIZES[s.size || 'md'] || SIZES.md;
      var h = (heights && heights[s.id]) ? heights[s.id] : 200;
      if (h > rowMaxH) rowMaxH = h;
      offsetX += w + GAP_X;
      if (offsetX > totalW) totalW = offsetX;
    });
    totalH = offsetY + rowMaxH;

    centerPositions(positions, screens, totalW - GAP_X, totalH);
    return positions;
  }

  // -- Layout strategies --
  var LAYOUT_STRATEGIES = [
    { name: 'Flow', fn: autoLayout },
    { name: 'Epics', fn: layoutByEpics },
    { name: 'Grid', fn: layoutGrid }
  ];

  // -- Cycle layout --
  function cycleLayout() {
    state.layoutIndex = (state.layoutIndex + 1) % LAYOUT_STRATEGIES.length;

    var heights = {};
    var screens = state.project.screens || [];
    var arrows = state.project.arrows || [];
    screens.forEach(function (s) {
      var el = state.screenEls[s.id];
      if (el) heights[s.id] = el.offsetHeight;
    });

    var layoutFn = LAYOUT_STRATEGIES[state.layoutIndex].fn;
    state.positions = layoutFn(screens, arrows, heights);

    screens.forEach(function (s) {
      var el = state.screenEls[s.id];
      var pos = state.positions[s.id];
      if (el && pos) {
        el.style.left = pos.x + 'px';
        el.style.top = pos.y + 'px';
      }
    });

    updateLayoutButton();
    savePositions();
    drawArrows();
    fitToContent();
  }

  function updateLayoutButton() {
    var btn = document.getElementById('fb-layout-btn');
    if (btn) {
      var name = LAYOUT_STRATEGIES[state.layoutIndex].name;
      btn.textContent = 'Auto-Layout (' + name + ')';
    }
  }

  // -- Get epic by id --
  function getEpic(epicId) {
    if (!state.project || !state.project.epics) return null;
    for (var i = 0; i < state.project.epics.length; i++) {
      if (state.project.epics[i].id === epicId) return state.project.epics[i];
    }
    return null;
  }

  // -- Get screen data by id --
  function getScreen(screenId) {
    if (!state.project || !state.project.screens) return null;
    for (var i = 0; i < state.project.screens.length; i++) {
      if (state.project.screens[i].id === screenId) return state.project.screens[i];
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

    // Legend with checkboxes
    var legend = document.createElement('div');
    legend.className = 'fb-legend';
    (state.project.epics || []).forEach(function (epic) {
      var label = document.createElement('label');
      label.className = 'fb-legend-item';

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !state.hiddenEpics[epic.id];
      cb.className = 'fb-legend-checkbox';
      cb.dataset.epicId = epic.id;
      cb.addEventListener('change', function () {
        toggleEpic(epic.id);
      });
      label.appendChild(cb);

      var dot = document.createElement('span');
      dot.className = 'fb-legend-dot';
      dot.style.background = epic.color;
      label.appendChild(dot);
      label.appendChild(document.createTextNode(epic.label));
      legend.appendChild(label);
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

    // Auto-Layout (cycle)
    var layoutBtn = document.createElement('button');
    layoutBtn.className = 'fb-action-btn';
    layoutBtn.id = 'fb-layout-btn';
    layoutBtn.title = 'Changer la disposition';
    layoutBtn.addEventListener('click', cycleLayout);
    right.appendChild(layoutBtn);
    updateLayoutButton();

    // Export PNG
    var exportBtn = document.createElement('button');
    exportBtn.className = 'fb-action-btn';
    exportBtn.textContent = 'Export PNG';
    exportBtn.title = 'Export as PNG';
    exportBtn.addEventListener('click', doExport);
    right.appendChild(exportBtn);

    header.appendChild(right);
    return header;
  }

  // -- Toggle notes visibility --
  function toggleNotesVisibility() {
    var footers = state.container.querySelectorAll('.fb-screen-footer');
    for (var i = 0; i < footers.length; i++) {
      if (state.showNotes) {
        footers[i].classList.remove('fb-hidden');
      } else {
        footers[i].classList.add('fb-hidden');
      }
    }
  }

  // -- Toggle epic visibility (shortcut: hides/shows each screen individually) --
  function toggleEpic(epicId) {
    // If any screen of this epic is visible → hide all; otherwise show all
    var hasVisible = false;
    state.project.screens.forEach(function (s) {
      if (s.epic === epicId && !state.hiddenScreens[s.id]) hasVisible = true;
    });
    var isHiding = hasVisible;

    if (isHiding) {
      state.hiddenEpics[epicId] = true;
    } else {
      delete state.hiddenEpics[epicId];
    }

    // Update legend item dimming
    var checkboxes = state.container.querySelectorAll('.fb-legend-checkbox');
    for (var i = 0; i < checkboxes.length; i++) {
      var cb = checkboxes[i];
      var item = cb.closest('.fb-legend-item');
      if (cb.dataset.epicId === epicId) {
        cb.checked = !isHiding;
        if (isHiding) {
          item.classList.add('fb-dimmed');
        } else {
          item.classList.remove('fb-dimmed');
        }
      }
    }

    // Toggle each screen of this epic individually
    state.project.screens.forEach(function (s) {
      if (s.epic !== epicId) return;
      if (isHiding) {
        state.hiddenScreens[s.id] = true;
      } else {
        delete state.hiddenScreens[s.id];
      }
      applyScreenVisibility(s.id);
    });

    saveHiddenScreens();
    drawArrows();
  }

  // -- Toggle individual screen visibility --
  function toggleScreen(screenId) {
    if (state.hiddenScreens[screenId]) {
      delete state.hiddenScreens[screenId];
    } else {
      state.hiddenScreens[screenId] = true;
    }
    applyScreenVisibility(screenId);
    saveHiddenScreens();
    drawArrows();
  }

  function applyScreenVisibility(screenId) {
    var el = state.screenEls[screenId];
    if (!el) return;
    if (state.hiddenScreens[screenId]) {
      el.classList.add('fb-screen-dimmed');
    } else {
      el.classList.remove('fb-screen-dimmed');
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

    var toggleBtn = document.createElement('button');
    toggleBtn.className = 'fb-screen-toggle';
    toggleBtn.title = 'Masquer cet écran';
    toggleBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    toggleBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      toggleScreen(screenData.id);
    });
    hdr.appendChild(toggleBtn);

    el.appendChild(hdr);

    // Body
    var body = document.createElement('div');
    body.className = 'fb-screen-body';
    body.innerHTML = screenData.content || '';
    el.appendChild(body);

    // Footer (notes only)
    if (screenData.notes) {
      var footer = document.createElement('div');
      footer.className = 'fb-screen-footer' + (state.showNotes ? '' : ' fb-hidden');
      footer.textContent = screenData.notes;
      el.appendChild(footer);
    }

    // Apply dimmed state if screen is individually hidden
    if (state.hiddenScreens[screenData.id]) {
      el.classList.add('fb-screen-dimmed');
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
    var newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * 100) / 100));
    // Zoom toward center of viewport
    if (state.wrapperEl) {
      var wrapperRect = state.wrapperEl.getBoundingClientRect();
      var mx = wrapperRect.width / 2;
      var my = wrapperRect.height / 2;
      var cx = (mx - state.panX) / state.zoom;
      var cy = (my - state.panY) / state.zoom;
      state.panX = mx - cx * newZoom;
      state.panY = my - cy * newZoom;
    }
    state.zoom = newZoom;
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

  // -- Fit to content --
  function fitToContent() {
    if (!state.wrapperEl || !state.project) return;

    var screens = state.project.screens || [];
    var minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
    var hasVisible = false;

    screens.forEach(function (s) {
      if (state.hiddenScreens[s.id]) return;
      var el = state.screenEls[s.id];
      var pos = state.positions[s.id];
      if (!el || !pos) return;
      hasVisible = true;
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + el.offsetWidth);
      maxY = Math.max(maxY, pos.y + el.offsetHeight);
    });

    if (!hasVisible) return;

    var wrapperRect = state.wrapperEl.getBoundingClientRect();
    var viewW = wrapperRect.width;
    var viewH = wrapperRect.height;

    var contentW = maxX - minX;
    var contentH = maxY - minY;

    var padding = 60;
    var zoomX = (viewW - padding * 2) / contentW;
    var zoomY = (viewH - padding * 2) / contentH;
    var zoom = Math.min(zoomX, zoomY, 1.0);
    zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(zoom * 100) / 100));

    var panX = (viewW - contentW * zoom) / 2 - minX * zoom;
    var panY = (viewH - contentH * zoom) / 2 - minY * zoom;

    state.zoom = zoom;
    state.panX = panX;
    state.panY = panY;
    applyTransform();

    var label = document.getElementById('fb-zoom-label');
    if (label) label.textContent = Math.round(state.zoom * 100) + '%';

    saveZoom();
  }

  // -- Pan (wheel only, no grab) --
  function initPan() {
    var wrapper = state.wrapperEl;

    // Wheel: Ctrl/Meta = zoom toward cursor, otherwise = pan
    wrapper.addEventListener('wheel', function (e) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        var wrapperRect = wrapper.getBoundingClientRect();
        var mx = e.clientX - wrapperRect.left;
        var my = e.clientY - wrapperRect.top;
        // Canvas point under cursor
        var cx = (mx - state.panX) / state.zoom;
        var cy = (my - state.panY) / state.zoom;
        var delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        var newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round((state.zoom + delta) * 100) / 100));
        // Adjust pan so the same canvas point stays under cursor
        state.panX = mx - cx * newZoom;
        state.panY = my - cy * newZoom;
        state.zoom = newZoom;
        applyTransform();
        var label = document.getElementById('fb-zoom-label');
        if (label) label.textContent = Math.round(state.zoom * 100) + '%';
        saveZoom();
      } else {
        e.preventDefault();
        state.panX -= e.deltaX;
        state.panY -= e.deltaY;
        applyTransform();
        saveZoom();
      }
    }, { passive: false });
  }

  // -- Drag screens --
  function initDrag() {
    state.canvasEl.addEventListener('mousedown', function (e) {
      var screenEl = e.target.closest('.fb-screen');
      if (!screenEl) return;

      // Block drag on dimmed screens
      if (state.hiddenScreens[screenEl.dataset.screenId]) return;

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
      newX = Math.max(0, Math.min(CANVAS_W - 50, newX));
      newY = Math.max(0, Math.min(CANVAS_H - 50, newY));

      state.dragTarget.style.left = newX + 'px';
      state.dragTarget.style.top = newY + 'px';

      // Update stored position
      var id = state.dragTarget.dataset.screenId;
      state.positions[id] = { x: newX, y: newY };

      drawArrows(!!state.draggingHandle);
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

  // -- Arrow handle drag --
  function initArrowDrag() {
    // Mousedown: event delegation on canvas for .fb-arrow-handle
    state.canvasEl.addEventListener('mousedown', function (e) {
      var handle = e.target.closest('.fb-arrow-handle');
      if (!handle) return;

      e.stopPropagation();
      e.preventDefault();

      var key = handle.dataset.arrowKey;
      var end = handle.dataset.arrowEnd;
      var screenId = handle.dataset.screenId;

      // Init override from spread or auto-detected sides if needed
      if (!state.arrowOverrides[key]) {
        var spread = buildSpreadMap();
        if (spread[key]) {
          state.arrowOverrides[key] = { fromSide: spread[key].from, toSide: spread[key].to };
        } else {
          var parts = key.split('->');
          var fe = state.screenEls[parts[0]];
          var te = state.screenEls[parts[1]];
          if (fe && te) {
            var auto = getBestSides(fe, te);
            state.arrowOverrides[key] = { fromSide: auto.from, toSide: auto.to };
          } else {
            state.arrowOverrides[key] = { fromSide: 'right', toSide: 'left' };
          }
        }
      }

      state.draggingHandle = { key: key, end: end, el: handle, screenId: screenId };
      state.wrapperEl.classList.add('fb-dragging-handle');
    });

    // Mousemove: snap to nearest anchor point
    document.addEventListener('mousemove', function (e) {
      if (!state.draggingHandle) return;

      var wrapperRect = state.wrapperEl.getBoundingClientRect();
      var canvasX = (e.clientX - wrapperRect.left - state.panX) / state.zoom;
      var canvasY = (e.clientY - wrapperRect.top - state.panY) / state.zoom;

      var screenId = state.draggingHandle.screenId;
      var anchors = getAllAnchorPoints(screenId);

      // Find nearest anchor
      var bestDist = Infinity;
      var bestAnchor = anchors[0];
      for (var i = 0; i < anchors.length; i++) {
        var dx = anchors[i].x - canvasX;
        var dy = anchors[i].y - canvasY;
        var dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          bestAnchor = anchors[i];
        }
      }

      // Update handle position
      state.draggingHandle.el.style.left = (bestAnchor.x - 8) + 'px';
      state.draggingHandle.el.style.top = (bestAnchor.y - 8) + 'px';

      // Update override
      var prop = state.draggingHandle.end === 'from' ? 'fromSide' : 'toSide';
      state.arrowOverrides[state.draggingHandle.key][prop] = bestAnchor.name;

      // Redraw SVG only (skip handles — we're moving one manually)
      drawArrows(true);
    });

    // Mouseup: finish drag
    document.addEventListener('mouseup', function () {
      if (!state.draggingHandle) return;

      saveArrowOverrides();
      updateHandles();
      state.draggingHandle = null;
      state.wrapperEl.classList.remove('fb-dragging-handle');
    });
  }

  // -- Arrows --
  function getBestSides(fromEl, toEl) {
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

    // Parse side into primary direction + fraction
    var parts = side ? side.split('-') : [];
    var primary, fraction;

    if (parts.length === 1) {
      primary = parts[0];
      fraction = 0.5;
    } else if (parts[0] === 'left' || parts[0] === 'right') {
      // Left/right: 5 sub-positions along height
      primary = parts[0];
      var lrMap = { top: 1/6, upper: 2/6, middle: 0.5, lower: 4/6, bottom: 5/6 };
      fraction = lrMap[parts[1]] !== undefined ? lrMap[parts[1]] : 0.5;
    } else {
      // Top/bottom: 3 sub-positions along width
      primary = parts[0];
      var tbMap = { left: 0.25, right: 0.75 };
      fraction = tbMap[parts[1]] !== undefined ? tbMap[parts[1]] : 0.5;
    }

    switch (primary) {
      case 'left':   return { x: pos.x,     y: pos.y + h * fraction };
      case 'right':  return { x: pos.x + w, y: pos.y + h * fraction };
      case 'top':    return { x: pos.x + w * fraction, y: pos.y };
      case 'bottom': return { x: pos.x + w * fraction, y: pos.y + h };
      default:       return { x: pos.x + w / 2, y: pos.y + h / 2 };
    }
  }

  function getPrimarySide(side) {
    return side ? side.split('-')[0] : 'right';
  }

  // Compute bezier control points with cross-axis blend so the tangent
  // (and arrowhead orientation) follows the actual angle between screens.
  function computeControlPoints(start, end, fromSide, toSide) {
    var fromPrimary = getPrimarySide(fromSide);
    var toPrimary = getPrimarySide(toSide);
    var dx = end.x - start.x;
    var dy = end.y - start.y;

    var cp1 = { x: start.x, y: start.y };
    var cp2 = { x: end.x, y: end.y };

    switch (fromPrimary) {
      case 'right':  cp1.x += ARROW_OFFSET; cp1.y += dy * ARROW_BLEND; break;
      case 'left':   cp1.x -= ARROW_OFFSET; cp1.y += dy * ARROW_BLEND; break;
      case 'bottom': cp1.y += ARROW_OFFSET; cp1.x += dx * ARROW_BLEND; break;
      case 'top':    cp1.y -= ARROW_OFFSET; cp1.x += dx * ARROW_BLEND; break;
    }
    switch (toPrimary) {
      case 'right':  cp2.x += ARROW_OFFSET; cp2.y -= dy * ARROW_BLEND; break;
      case 'left':   cp2.x -= ARROW_OFFSET; cp2.y -= dy * ARROW_BLEND; break;
      case 'bottom': cp2.y += ARROW_OFFSET; cp2.x -= dx * ARROW_BLEND; break;
      case 'top':    cp2.y -= ARROW_OFFSET; cp2.x -= dx * ARROW_BLEND; break;
    }

    return { cp1: cp1, cp2: cp2 };
  }

  // Resolve the sides for a given arrow: manual override → auto-spread → auto-detect.
  function resolveArrowSides(arrow, spreadMap) {
    var overrideKey = arrow.from + '->' + arrow.to;
    var override = state.arrowOverrides[overrideKey];
    if (override) {
      return { from: override.fromSide, to: override.toSide };
    }
    if (spreadMap && spreadMap[overrideKey]) {
      return spreadMap[overrideKey];
    }
    var fromEl = state.screenEls[arrow.from];
    var toEl = state.screenEls[arrow.to];
    if (fromEl && toEl) {
      return getBestSides(fromEl, toEl);
    }
    return { from: 'right', to: 'left' };
  }

  function getAllAnchorPoints(screenId) {
    var names = [
      'left-top', 'left-upper', 'left-middle', 'left-lower', 'left-bottom',
      'right-top', 'right-upper', 'right-middle', 'right-lower', 'right-bottom',
      'top-left', 'top', 'top-right',
      'bottom-left', 'bottom', 'bottom-right'
    ];
    var points = [];
    for (var i = 0; i < names.length; i++) {
      var pt = getAnchor(screenId, names[i]);
      points.push({ name: names[i], x: pt.x, y: pt.y });
    }
    return points;
  }

  // Build auto-spread map: when multiple arrows connect the same pair of
  // screens (in either direction) and have no manual override, distribute
  // them across sub-positions so they don't overlap visually.
  function buildSpreadMap() {
    var arrows = state.project ? (state.project.arrows || []) : [];

    // First pass: group ALL visible arrows by screen pair (including overridden)
    var pairGroups = {};
    arrows.forEach(function (arrow, idx) {
      if (state.hiddenScreens[arrow.from] || state.hiddenScreens[arrow.to]) return;

      var ids = [arrow.from, arrow.to].sort();
      var pairKey = ids[0] + '|' + ids[1];
      if (!pairGroups[pairKey]) pairGroups[pairKey] = [];
      pairGroups[pairKey].push(idx);
    });

    // Second pass: assign spread positions to non-overridden arrows,
    // using total group size so slots stay stable when siblings get overrides
    var spreadMap = {};

    Object.keys(pairGroups).forEach(function (pairKey) {
      var group = pairGroups[pairKey];
      if (group.length <= 1) return;

      group.forEach(function (arrowIdx, posInGroup) {
        var arrow = arrows[arrowIdx];
        var overrideKey = arrow.from + '->' + arrow.to;
        if (state.arrowOverrides[overrideKey]) return;

        var fromEl = state.screenEls[arrow.from];
        var toEl = state.screenEls[arrow.to];
        if (!fromEl || !toEl) return;

        var baseSides = getBestSides(fromEl, toEl);
        var isHorizontal = (baseSides.from === 'right' || baseSides.from === 'left');

        var suffixes;
        if (group.length === 2) {
          suffixes = isHorizontal ? ['-upper', '-lower'] : ['-left', '-right'];
        } else if (group.length === 3) {
          suffixes = isHorizontal ? ['-upper', '-middle', '-lower'] : ['-left', '', '-right'];
        } else if (group.length === 4) {
          suffixes = isHorizontal
            ? ['-top', '-upper', '-lower', '-bottom']
            : ['-left', '', '-right'];
        } else {
          suffixes = isHorizontal
            ? ['-top', '-upper', '-middle', '-lower', '-bottom']
            : ['-left', '', '-right'];
        }

        var suffix = suffixes[Math.min(posInGroup, suffixes.length - 1)];
        spreadMap[overrideKey] = {
          from: baseSides.from + suffix,
          to: baseSides.to + suffix
        };
      });
    });

    return spreadMap;
  }

  function drawArrows(skipHandles) {
    if (!state.svgEl || !state.project) return;

    var arrows = state.project.arrows || [];
    var ns = 'http://www.w3.org/2000/svg';
    var spreadMap = buildSpreadMap();
    state.svgEl.innerHTML = '';

    // Arrow marker — equilateral shape, fixed size, auto-orient follows curve angle
    var defs = document.createElementNS(ns, 'defs');
    var marker = document.createElementNS(ns, 'marker');
    marker.setAttribute('id', 'fb-arrowhead');
    marker.setAttribute('markerUnits', 'userSpaceOnUse');
    marker.setAttribute('markerWidth', '14');
    marker.setAttribute('markerHeight', '14');
    marker.setAttribute('refX', '14');
    marker.setAttribute('refY', '7');
    marker.setAttribute('orient', 'auto');
    var polygon = document.createElementNS(ns, 'polygon');
    polygon.setAttribute('points', '0 0, 14 7, 0 14');
    polygon.setAttribute('fill', '#888');
    marker.appendChild(polygon);
    defs.appendChild(marker);
    state.svgEl.appendChild(defs);

    arrows.forEach(function (arrow) {
      var fromEl = state.screenEls[arrow.from];
      var toEl = state.screenEls[arrow.to];
      if (!fromEl || !toEl) return;

      var overrideKey = arrow.from + '->' + arrow.to;
      var sides = resolveArrowSides(arrow, spreadMap);

      var start = getAnchor(arrow.from, sides.from);
      var end = getAnchor(arrow.to, sides.to);

      var cps = computeControlPoints(start, end, sides.from, sides.to);
      var cp1 = cps.cp1;
      var cp2 = cps.cp2;

      var d = 'M' + start.x + ',' + start.y +
              ' C' + cp1.x + ',' + cp1.y +
              ' ' + cp2.x + ',' + cp2.y +
              ' ' + end.x + ',' + end.y;

      // Check if either endpoint screen is individually hidden
      var isDimmed = state.hiddenScreens[arrow.from] || state.hiddenScreens[arrow.to];

      // Group for arrow path
      var g = document.createElementNS(ns, 'g');
      g.setAttribute('class', 'fb-arrow-group' + (isDimmed ? ' fb-arrow-dimmed' : ''));

      // Main visible path
      var path = document.createElementNS(ns, 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', 'fb-arrow-path' + (arrow.dashed ? ' fb-dashed' : ''));
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#888');
      path.setAttribute('stroke-width', '2');
      if (arrow.dashed) {
        path.setAttribute('stroke-dasharray', '6 4');
      }
      path.setAttribute('marker-end', 'url(#fb-arrowhead)');
      g.appendChild(path);

      // Wider invisible hit area for hover
      var hitPath = document.createElementNS(ns, 'path');
      hitPath.setAttribute('d', d);
      hitPath.setAttribute('class', 'fb-arrow-hit');
      hitPath.setAttribute('fill', 'none');
      hitPath.setAttribute('stroke', 'transparent');
      hitPath.setAttribute('stroke-width', '16');
      hitPath.setAttribute('pointer-events', 'stroke');
      g.appendChild(hitPath);

      state.svgEl.appendChild(g);

      // Label
      if (arrow.label) {
        var midX = (start.x + end.x + cp1.x + cp2.x) / 4;
        var midY = (start.y + end.y + cp1.y + cp2.y) / 4;

        var labelGroup = document.createElementNS(ns, 'g');
        if (isDimmed) labelGroup.setAttribute('class', 'fb-arrow-dimmed');

        var text = document.createElementNS(ns, 'text');
        text.setAttribute('x', midX);
        text.setAttribute('y', midY);
        text.setAttribute('class', 'fb-arrow-label');
        text.setAttribute('fill', '#555');
        text.setAttribute('font-size', '11');
        text.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.textContent = arrow.label;

        // Temporarily add text to measure
        state.svgEl.appendChild(text);
        var bbox;
        try { bbox = text.getBBox(); } catch (e) { bbox = { x: midX - 20, y: midY - 8, width: 40, height: 16 }; }
        state.svgEl.removeChild(text);

        var bgRect = document.createElementNS(ns, 'rect');
        bgRect.setAttribute('x', bbox.x - 4);
        bgRect.setAttribute('y', bbox.y - 2);
        bgRect.setAttribute('width', bbox.width + 8);
        bgRect.setAttribute('height', bbox.height + 4);
        bgRect.setAttribute('class', 'fb-arrow-label-bg');
        bgRect.setAttribute('fill', '#f0f2f5');
        bgRect.setAttribute('rx', '3');
        bgRect.setAttribute('ry', '3');

        labelGroup.appendChild(bgRect);
        labelGroup.appendChild(text);
        state.svgEl.appendChild(labelGroup);
      }
    });

    if (!skipHandles) {
      updateHandles();
    }
  }

  function updateHandles() {
    // Remove old handle divs
    state.handleEls.forEach(function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
    state.handleEls = [];

    if (!state.project) return;

    var arrows = state.project.arrows || [];
    var spreadMap = buildSpreadMap();

    arrows.forEach(function (arrow) {
      var fromEl = state.screenEls[arrow.from];
      var toEl = state.screenEls[arrow.to];
      if (!fromEl || !toEl) return;

      // Skip handles for arrows connected to a dimmed screen
      if (state.hiddenScreens[arrow.from] || state.hiddenScreens[arrow.to]) return;

      var overrideKey = arrow.from + '->' + arrow.to;
      var sides = resolveArrowSides(arrow, spreadMap);

      var start = getAnchor(arrow.from, sides.from);
      var end = getAnchor(arrow.to, sides.to);

      [
        { pt: start, end: 'from', screenId: arrow.from },
        { pt: end,   end: 'to',   screenId: arrow.to }
      ].forEach(function (cfg) {
        var h = document.createElement('div');
        h.className = 'fb-arrow-handle';
        h.style.left = (cfg.pt.x - 8) + 'px';
        h.style.top = (cfg.pt.y - 8) + 'px';
        h.dataset.arrowKey = overrideKey;
        h.dataset.arrowEnd = cfg.end;
        h.dataset.screenId = cfg.screenId;

        state.canvasEl.appendChild(h);
        state.handleEls.push(h);
      });
    });
  }


  // -- Export PNG (html2canvas, lazy-loaded) --

  var html2canvasLoaded = null; // cached Promise

  function loadHtml2Canvas() {
    if (html2canvasLoaded) return html2canvasLoaded;
    html2canvasLoaded = new Promise(function (resolve, reject) {
      if (window.html2canvas) { resolve(window.html2canvas); return; }
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      s.onload = function () { resolve(window.html2canvas); };
      s.onerror = function () { html2canvasLoaded = null; reject(new Error('Failed to load html2canvas')); };
      document.head.appendChild(s);
    });
    return html2canvasLoaded;
  }

  function collectExportBounds() {
    var minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
    var arrows = state.project.arrows || [];
    var spreadMap = buildSpreadMap();

    state.project.screens.forEach(function (s) {
      if (state.hiddenScreens[s.id]) return;
      var el = state.screenEls[s.id];
      var pos = state.positions[s.id];
      if (!el || !pos) return;
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + el.offsetWidth);
      maxY = Math.max(maxY, pos.y + el.offsetHeight);
    });

    // Include arrow control points so arrows aren't clipped
    arrows.forEach(function (arrow) {
      if (state.hiddenScreens[arrow.from] || state.hiddenScreens[arrow.to]) return;

      var fromEl = state.screenEls[arrow.from];
      var toEl = state.screenEls[arrow.to];
      if (!fromEl || !toEl) return;

      var sides = resolveArrowSides(arrow, spreadMap);

      var start = getAnchor(arrow.from, sides.from);
      var end = getAnchor(arrow.to, sides.to);

      var cps = computeControlPoints(start, end, sides.from, sides.to);
      var cp1 = cps.cp1;
      var cp2 = cps.cp2;

      [start, end, cp1, cp2].forEach(function (p) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      });
    });

    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  function doExport() {
    if (!state.canvasEl || !state.project) return;

    var bounds = collectExportBounds();
    if (bounds.minX === Infinity) return;

    var padding = 40;
    var vx = Math.max(0, bounds.minX - padding);
    var vy = Math.max(0, bounds.minY - padding);
    var vw = bounds.maxX - bounds.minX + padding * 2;
    var vh = bounds.maxY - bounds.minY + padding * 2;

    // Build a small, clean temporary container (no transform, exact size)
    var tmp = document.createElement('div');
    tmp.className = 'fb-container';
    tmp.style.cssText = 'position:fixed;left:-99999px;top:0;width:' + vw + 'px;height:' + vh + 'px;overflow:visible;background:transparent;';

    // Clone visible screens, offset to crop origin
    state.project.screens.forEach(function (s) {
      if (state.hiddenScreens[s.id]) return;
      var el = state.screenEls[s.id];
      var pos = state.positions[s.id];
      if (!el || !pos) return;
      var clone = el.cloneNode(true);
      clone.style.left = (pos.x - vx) + 'px';
      clone.style.top = (pos.y - vy) + 'px';
      tmp.appendChild(clone);
    });

    // Rasterize SVG arrows (cropped via viewBox)
    var svgClone = state.svgEl.cloneNode(true);
    // Remove dimmed arrows from export
    var dimmedEls = svgClone.querySelectorAll('.fb-arrow-dimmed');
    for (var di = 0; di < dimmedEls.length; di++) {
      dimmedEls[di].parentNode.removeChild(dimmedEls[di]);
    }
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgClone.setAttribute('viewBox', vx + ' ' + vy + ' ' + vw + ' ' + vh);
    svgClone.setAttribute('width', vw);
    svgClone.setAttribute('height', vh);

    var svgStr = new XMLSerializer().serializeToString(svgClone);
    var blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var img = new Image();

    img.onload = function () {
      URL.revokeObjectURL(url);

      // Draw arrows onto a canvas element (2x resolution)
      var ac = document.createElement('canvas');
      ac.width = vw * 2;
      ac.height = vh * 2;
      ac.style.cssText = 'position:absolute;top:0;left:0;width:' + vw + 'px;height:' + vh + 'px;pointer-events:none;';
      ac.getContext('2d').drawImage(img, 0, 0, vw * 2, vh * 2);
      tmp.appendChild(ac);

      document.body.appendChild(tmp);

      // Capture the small temp container at 2x
      loadHtml2Canvas().then(function (html2canvas) {
        return html2canvas(tmp, {
          width: vw,
          height: vh,
          scale: 2,
          backgroundColor: '#f0f2f5',
          useCORS: true
        });
      }).then(function (resultCanvas) {
        document.body.removeChild(tmp);
        var link = document.createElement('a');
        link.download = (state.project.name || 'flowboard') + '.png';
        link.href = resultCanvas.toDataURL('image/png');
        link.click();
      }).catch(function (err) {
        if (tmp.parentNode) document.body.removeChild(tmp);
        console.error('Export failed:', err);
      });
    };

    img.onerror = function () {
      URL.revokeObjectURL(url);
      console.error('Arrow rasterization failed');
    };

    img.src = url;
  }

  // -- Init --
  function init(config) {
    if (!config || !config.project) {
      console.error('FlowBoard.init: config.project is required');
      return;
    }

    state.project = config.project;
    state.showNotes = true;
    state.hiddenScreens = {};
    state.hiddenEpics = {};
    state.arrowOverrides = {};
    state.layoutIndex = 0;

    // Load hidden screens early (before toolbar, so legend checkboxes are correct)
    var savedHidden = loadHiddenScreens();
    if (savedHidden) {
      state.hiddenScreens = savedHidden;
    }

    // Derive hiddenEpics from hiddenScreens: an epic is "hidden" if all its screens are hidden
    var allScreens = config.project.screens || [];
    (config.project.epics || []).forEach(function (epic) {
      var epicScreens = allScreens.filter(function (s) { return s.epic === epic.id; });
      if (epicScreens.length > 0 && epicScreens.every(function (s) { return state.hiddenScreens[s.id]; })) {
        state.hiddenEpics[epic.id] = true;
      }
    });

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

    // Auto-layout (first pass with estimated heights)
    var screens = state.project.screens || [];
    var arrows = state.project.arrows || [];
    state.defaultPositions = autoLayout(screens, arrows);
    state.positions = JSON.parse(JSON.stringify(state.defaultPositions));

    // Load saved positions (override auto-layout)
    var savedPos = loadPositions();
    var hasSavedPositions = false;
    if (savedPos) {
      hasSavedPositions = true;
      screens.forEach(function (s) {
        if (savedPos[s.id]) state.positions[s.id] = savedPos[s.id];
      });
    }

    // Load saved zoom/pan
    var savedZoom = loadZoom();
    var hasSavedZoom = false;
    if (savedZoom) {
      hasSavedZoom = true;
      state.zoom = savedZoom.zoom || 1;
      state.panX = savedZoom.panX || 0;
      state.panY = savedZoom.panY || 0;
    }

    // Update zoom label if saved zoom was loaded
    if (hasSavedZoom) {
      var zl = document.getElementById('fb-zoom-label');
      if (zl) zl.textContent = Math.round(state.zoom * 100) + '%';
    }

    // Load saved arrow overrides
    var savedArrows = loadArrowOverrides();
    if (savedArrows) {
      state.arrowOverrides = savedArrows;
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
    initArrowDrag();

    // After DOM layout: measure heights, recompute layout, draw arrows
    requestAnimationFrame(function () {
      // Measure actual screen heights
      var heights = {};
      screens.forEach(function (s) {
        var el = state.screenEls[s.id];
        if (el) heights[s.id] = el.offsetHeight;
      });

      // Recompute layout with measured heights
      state.defaultPositions = autoLayout(screens, arrows, heights);

      if (!hasSavedPositions) {
        state.positions = JSON.parse(JSON.stringify(state.defaultPositions));
        // Apply corrected positions to DOM
        screens.forEach(function (s) {
          var el = state.screenEls[s.id];
          var pos = state.positions[s.id];
          if (el && pos) {
            el.style.left = pos.x + 'px';
            el.style.top = pos.y + 'px';
          }
        });
      }

      if (!hasSavedZoom) {
        fitToContent();
      }

      drawArrows();
    });
  }

  // -- Expose API --
  window.FlowBoard = {
    init: init,
    _internal: {
      state: state,
      autoLayout: autoLayout,
      bfsDepth: bfsDepth,
      centerPositions: centerPositions,
      layoutByEpics: layoutByEpics,
      layoutGrid: layoutGrid,
      getAnchor: getAnchor,
      getPrimarySide: getPrimarySide,
      computeControlPoints: computeControlPoints,
      getAllAnchorPoints: getAllAnchorPoints,
      getBestSides: getBestSides,
      buildSpreadMap: buildSpreadMap,
      resolveArrowSides: resolveArrowSides
    }
  };
})();
