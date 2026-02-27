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
    dragHandle: null,
    handleEls: []
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

  // -- Auto layout --
  function autoLayout(screens, arrows, heights) {
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

    // Compute positions (first pass: relative to 0,0)
    var positions = {};
    var colKeys = Object.keys(columns).map(Number).sort(function (a, b) { return a - b; });
    var offsetX = 0;
    var totalW = 0;
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
    totalW = offsetX - GAP_X;

    // Center in canvas
    var cx = Math.max(0, Math.round((CANVAS_W - totalW) / 2));
    var cy = Math.max(0, Math.round((CANVAS_H - totalH) / 2));
    screens.forEach(function (s) {
      if (positions[s.id]) {
        positions[s.id].x += cx;
        positions[s.id].y += cy;
      }
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
    exportBtn.addEventListener('click', doExport);
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

  // -- Toggle epic visibility --
  function toggleEpic(epicId) {
    if (state.hiddenEpics[epicId]) {
      delete state.hiddenEpics[epicId];
    } else {
      state.hiddenEpics[epicId] = true;
    }

    // Update legend item dimming
    var checkboxes = state.container.querySelectorAll('.fb-legend-checkbox');
    for (var i = 0; i < checkboxes.length; i++) {
      var cb = checkboxes[i];
      var item = cb.closest('.fb-legend-item');
      if (cb.dataset.epicId === epicId) {
        cb.checked = !state.hiddenEpics[epicId];
        if (state.hiddenEpics[epicId]) {
          item.classList.add('fb-dimmed');
        } else {
          item.classList.remove('fb-dimmed');
        }
      }
    }

    // Show/hide screens
    state.project.screens.forEach(function (s) {
      var el = state.screenEls[s.id];
      if (!el) return;
      if (state.hiddenEpics[s.epic]) {
        el.classList.add('fb-hidden');
      } else {
        el.classList.remove('fb-hidden');
      }
    });

    drawArrows();
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

    // Apply hidden state if epic is hidden
    if (state.hiddenEpics[screenData.epic]) {
      el.classList.add('fb-hidden');
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
      if (state.hiddenEpics[s.epic]) return;
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

  function getSideMidpoints(screenId) {
    var el = state.screenEls[screenId];
    if (!el) return {};
    var pos = state.positions[screenId];
    var w = el.offsetWidth;
    var h = el.offsetHeight;
    return {
      top:    { x: pos.x + w / 2, y: pos.y },
      bottom: { x: pos.x + w / 2, y: pos.y + h },
      left:   { x: pos.x,          y: pos.y + h / 2 },
      right:  { x: pos.x + w,      y: pos.y + h / 2 }
    };
  }

  function drawArrows() {
    if (!state.svgEl || !state.project) return;

    var arrows = state.project.arrows || [];
    var ns = 'http://www.w3.org/2000/svg';
    state.svgEl.innerHTML = '';

    // Remove old HTML handle divs
    state.handleEls.forEach(function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
    state.handleEls = [];

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
    polygon.setAttribute('fill', '#888');
    marker.appendChild(polygon);
    defs.appendChild(marker);
    state.svgEl.appendChild(defs);

    arrows.forEach(function (arrow) {
      var fromEl = state.screenEls[arrow.from];
      var toEl = state.screenEls[arrow.to];
      if (!fromEl || !toEl) return;

      // Skip arrows if either endpoint's epic is hidden
      var fromScreen = getScreen(arrow.from);
      var toScreen = getScreen(arrow.to);
      if (fromScreen && state.hiddenEpics[fromScreen.epic]) return;
      if (toScreen && state.hiddenEpics[toScreen.epic]) return;

      // Determine sides: user override or auto-detect
      var overrideKey = arrow.from + '->' + arrow.to;
      var override = state.arrowOverrides[overrideKey];
      var sides;
      if (override) {
        sides = { from: override.fromSide, to: override.toSide };
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

      // Group for arrow path + handles
      var g = document.createElementNS(ns, 'g');
      g.setAttribute('class', 'fb-arrow-group');

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

      // Draggable handles as HTML divs (above screens in z-index)
      var hFrom = document.createElement('div');
      hFrom.className = 'fb-arrow-handle';
      hFrom.style.left = (start.x - 8) + 'px';
      hFrom.style.top = (start.y - 8) + 'px';
      hFrom.dataset.arrowKey = overrideKey;
      hFrom.dataset.end = 'from';
      state.canvasEl.appendChild(hFrom);
      state.handleEls.push(hFrom);

      var hTo = document.createElement('div');
      hTo.className = 'fb-arrow-handle';
      hTo.style.left = (end.x - 8) + 'px';
      hTo.style.top = (end.y - 8) + 'px';
      hTo.dataset.arrowKey = overrideKey;
      hTo.dataset.end = 'to';
      state.canvasEl.appendChild(hTo);
      state.handleEls.push(hTo);

      // Label
      if (arrow.label) {
        var midX = (start.x + end.x + cp1.x + cp2.x) / 4;
        var midY = (start.y + end.y + cp1.y + cp2.y) / 4;

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

        var bgRect = document.createElementNS(ns, 'rect');
        bgRect.setAttribute('x', bbox.x - 4);
        bgRect.setAttribute('y', bbox.y - 2);
        bgRect.setAttribute('width', bbox.width + 8);
        bgRect.setAttribute('height', bbox.height + 4);
        bgRect.setAttribute('class', 'fb-arrow-label-bg');
        bgRect.setAttribute('fill', '#f0f2f5');
        bgRect.setAttribute('rx', '3');
        bgRect.setAttribute('ry', '3');

        // Insert bg before text
        state.svgEl.insertBefore(bgRect, text);
      }
    });
  }

  // -- Arrow handle drag --
  function initArrowDrag() {
    state.canvasEl.addEventListener('mousedown', function (e) {
      var handle = e.target;
      if (!handle.classList || !handle.classList.contains('fb-arrow-handle')) return;

      e.stopPropagation();
      e.preventDefault();

      var arrowKey = handle.dataset.arrowKey;
      var end = handle.dataset.end; // 'from' or 'to'
      var parts = arrowKey.split('->');

      state.dragHandle = {
        arrowKey: arrowKey,
        end: end,
        screenId: end === 'from' ? parts[0] : parts[1]
      };
      state.wrapperEl.classList.add('fb-dragging-handle');
    });

    document.addEventListener('mousemove', function (e) {
      if (!state.dragHandle) return;

      // Convert mouse to canvas coords
      var wrapperRect = state.wrapperEl.getBoundingClientRect();
      var canvasX = (e.clientX - wrapperRect.left - state.panX) / state.zoom;
      var canvasY = (e.clientY - wrapperRect.top - state.panY) / state.zoom;

      // Find nearest side midpoint of the connected screen
      var midpoints = getSideMidpoints(state.dragHandle.screenId);
      var bestSide = null;
      var bestDist = Infinity;
      var sideNames = ['top', 'bottom', 'left', 'right'];
      for (var i = 0; i < sideNames.length; i++) {
        var s = sideNames[i];
        var mp = midpoints[s];
        var dist = Math.sqrt(Math.pow(canvasX - mp.x, 2) + Math.pow(canvasY - mp.y, 2));
        if (dist < bestDist) {
          bestDist = dist;
          bestSide = s;
        }
      }

      // Update override
      var key = state.dragHandle.arrowKey;
      if (!state.arrowOverrides[key]) {
        // Initialize from current sides
        var parts = key.split('->');
        var fromEl = state.screenEls[parts[0]];
        var toEl = state.screenEls[parts[1]];
        if (fromEl && toEl) {
          var currentSides = getBestSides(fromEl, toEl);
          state.arrowOverrides[key] = { fromSide: currentSides.from, toSide: currentSides.to };
        } else {
          state.arrowOverrides[key] = { fromSide: 'right', toSide: 'left' };
        }
      }

      if (state.dragHandle.end === 'from') {
        state.arrowOverrides[key].fromSide = bestSide;
      } else {
        state.arrowOverrides[key].toSide = bestSide;
      }

      drawArrows();
    });

    document.addEventListener('mouseup', function () {
      if (state.dragHandle) {
        state.dragHandle = null;
        state.wrapperEl.classList.remove('fb-dragging-handle');
        saveArrowOverrides();
      }
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

    state.project.screens.forEach(function (s) {
      if (state.hiddenEpics[s.epic]) return;
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
      var fromScreen = getScreen(arrow.from);
      var toScreen = getScreen(arrow.to);
      if (fromScreen && state.hiddenEpics[fromScreen.epic]) return;
      if (toScreen && state.hiddenEpics[toScreen.epic]) return;

      var fromEl = state.screenEls[arrow.from];
      var toEl = state.screenEls[arrow.to];
      if (!fromEl || !toEl) return;

      var overrideKey = arrow.from + '->' + arrow.to;
      var override = state.arrowOverrides[overrideKey];
      var sides = override ? { from: override.fromSide, to: override.toSide } : getBestSides(fromEl, toEl);

      var start = getAnchor(arrow.from, sides.from);
      var end = getAnchor(arrow.to, sides.to);

      var cp1 = { x: start.x, y: start.y };
      var cp2 = { x: end.x, y: end.y };
      switch (sides.from) {
        case 'right': cp1.x += ARROW_OFFSET; break;
        case 'left': cp1.x -= ARROW_OFFSET; break;
        case 'bottom': cp1.y += ARROW_OFFSET; break;
        case 'top': cp1.y -= ARROW_OFFSET; break;
      }
      switch (sides.to) {
        case 'right': cp2.x += ARROW_OFFSET; break;
        case 'left': cp2.x -= ARROW_OFFSET; break;
        case 'bottom': cp2.y += ARROW_OFFSET; break;
        case 'top': cp2.y -= ARROW_OFFSET; break;
      }

      [start, end, cp1, cp2].forEach(function (p) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      });
    });

    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  // Rasterize SVG arrows to a temporary <canvas> element, swap it in,
  // let html2canvas capture everything, then swap SVG back.
  function rasterizeSvgToCanvas(svgEl, callback) {
    var w = svgEl.getAttribute('width');
    var h = svgEl.getAttribute('height');
    var clone = svgEl.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    var str = new XMLSerializer().serializeToString(clone);
    var blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      var c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.style.cssText = svgEl.style.cssText;
      c.className = 'fb-arrows-layer';
      c.style.position = 'absolute';
      c.style.top = '0';
      c.style.left = '0';
      c.style.width = w + 'px';
      c.style.height = h + 'px';
      c.style.pointerEvents = 'none';
      c.style.zIndex = '1';
      c.getContext('2d').drawImage(img, 0, 0, Number(w), Number(h));
      callback(c);
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      callback(null);
    };
    img.src = url;
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
      if (state.hiddenEpics[s.epic]) return;
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

  // -- Reset positions --
  function resetPositions() {
    // Measure current screen heights
    var heights = {};
    state.project.screens.forEach(function (s) {
      var el = state.screenEls[s.id];
      if (el) heights[s.id] = el.offsetHeight;
    });

    var screens = state.project.screens || [];
    var arrows = state.project.arrows || [];
    state.defaultPositions = autoLayout(screens, arrows, heights);
    state.positions = JSON.parse(JSON.stringify(state.defaultPositions));

    // Apply positions to DOM
    screens.forEach(function (s) {
      var el = state.screenEls[s.id];
      var pos = state.positions[s.id];
      if (el && pos) {
        el.style.left = pos.x + 'px';
        el.style.top = pos.y + 'px';
      }
    });

    // Clear hidden epics
    state.hiddenEpics = {};
    var checkboxes = state.container.querySelectorAll('.fb-legend-checkbox');
    for (var i = 0; i < checkboxes.length; i++) {
      checkboxes[i].checked = true;
      var item = checkboxes[i].closest('.fb-legend-item');
      if (item) item.classList.remove('fb-dimmed');
    }

    // Show all screens
    screens.forEach(function (s) {
      var el = state.screenEls[s.id];
      if (el) el.classList.remove('fb-hidden');
    });

    // Clear arrow overrides
    state.arrowOverrides = {};
    try {
      localStorage.removeItem(storageKey() + '-arrows');
    } catch (e) { /* ignore */ }

    savePositions();
    drawArrows();
    fitToContent();
  }

  // -- Init --
  function init(config) {
    if (!config || !config.project) {
      console.error('FlowBoard.init: config.project is required');
      return;
    }

    state.project = config.project;
    state.showNotes = true;
    state.hiddenEpics = {};
    state.arrowOverrides = {};
    state.dragHandle = null;

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
  window.FlowBoard = { init: init };
})();
