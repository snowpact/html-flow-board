(() => {
  // src/core/constants.ts
  var CANVAS_W = 2e4;
  var CANVAS_H = 16e3;
  var ZOOM_MIN = 0.1;
  var ZOOM_MAX = 2;
  var ZOOM_STEP = 0.1;
  var SIZES = { sm: 240, md: 320, lg: 400, xl: 520 };
  var FORMATS = {
    desktop: { width: 460, height: 280 },
    // landscape
    phone: { width: 260, height: 480 },
    // tall portrait
    square: { width: 360, height: 360 }
    // 1:1
  };
  var GAP_X = 260;
  var GAP_Y = 90;
  var ARROW_OFFSET = 60;
  var ARROW_BLEND = 0.15;
  var SELECT_DRAG_THRESHOLD = 3;
  var DOT_SPACING = 22;
  var DOT_RADIUS = 1.3;
  var DOT_COLOR = "#c9ced6";
  var ICON_CURSOR = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg>';
  var ICON_HAND = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 0 1 4 0v6a8 8 0 0 1-8 8h-2a8 8 0 0 1-7.4-5L2.5 13a2 2 0 0 1 3.5-2l1 1.5"/></svg>';

  // src/core/geometry.ts
  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
  function rectsIntersect(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }
  function toggleSelection(set, id) {
    if (set[id]) {
      delete set[id];
    } else {
      set[id] = true;
    }
    return set;
  }
  function getPrimarySide(side) {
    return side ? side.split("-")[0] : "right";
  }

  // src/core/state.ts
  var state = {
    zoom: 1,
    panX: 0,
    panY: 0,
    mode: "drag",
    // 'drag' (pan) | 'select' (cursor)
    selected: {},
    // { screenId: true }
    selectBox: null,
    // active rubber-band drag
    screenDrag: null,
    // active screen move (1..N screens)
    pointerInBoard: false,
    // gates keyboard shortcuts to when hovering the board
    _dotZoom: null,
    // last zoom the dotted grid was counter-scaled for
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
    handleEls: [],
    draggingHandle: null,
    hiddenScreens: {},
    layoutIndex: 0,
    screenPopup: null,
    panDrag: null,
    storageKeyBase: null
    // pinned localStorage prefix (survives !name edits)
  };
  function getEpic(epicId) {
    if (!state.project || !state.project.epics) return null;
    for (var i = 0; i < state.project.epics.length; i++) {
      if (state.project.epics[i].id === epicId) return state.project.epics[i];
    }
    return null;
  }
  function screenEpics(s) {
    if (s.epics && s.epics.length) return s.epics;
    return s.epic ? [s.epic] : [];
  }
  function inEpic(s, epicId) {
    if (s.epic === epicId) return true;
    return !!(s.epics && s.epics.indexOf(epicId) !== -1);
  }
  function setEpicList(s, list) {
    var seen = {};
    var clean = list.filter(function(e) {
      if (!e || seen[e]) return false;
      seen[e] = true;
      return true;
    });
    if (!clean.length) {
      delete s.epic;
      delete s.epics;
      return;
    }
    s.epic = clean[0];
    if (clean.length > 1) s.epics = clean;
    else delete s.epics;
  }
  function recomputeHiddenEpics() {
    state.hiddenEpics = {};
    var screens = state.project && state.project.screens || [];
    (state.project && state.project.epics || []).forEach(function(epic) {
      var es = screens.filter(function(s) {
        return inEpic(s, epic.id);
      });
      if (es.length && es.every(function(s) {
        return state.hiddenScreens[s.id];
      })) {
        state.hiddenEpics[epic.id] = true;
      }
    });
  }
  function screenWidth(s) {
    if (s.format && FORMATS[s.format]) return FORMATS[s.format].width;
    if (s.width) return s.width;
    if (s.size && SIZES[s.size]) return SIZES[s.size];
    return 320;
  }
  function screenHeight(s) {
    return s.height || null;
  }

  // src/core/storage.ts
  function storageKey() {
    if (state.storageKeyBase) return state.storageKeyBase;
    return "fb-" + (state.project ? state.project.name : "default");
  }
  function savePositions() {
    if (state.commit) state.commit();
  }
  function saveDoc(text) {
    try {
      localStorage.setItem(storageKey() + "-flowml", text);
    } catch (e) {
    }
  }
  function loadDoc() {
    try {
      return localStorage.getItem(storageKey() + "-flowml");
    } catch (e) {
      return null;
    }
  }
  function loadPositions() {
    try {
      var raw = localStorage.getItem(storageKey() + "-pos");
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function saveZoom() {
    try {
      localStorage.setItem(storageKey() + "-zoom", JSON.stringify({
        zoom: state.zoom,
        panX: state.panX,
        panY: state.panY
      }));
    } catch (e) {
    }
  }
  function loadZoom() {
    try {
      var raw = localStorage.getItem(storageKey() + "-zoom");
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function saveHiddenScreens() {
    if (state.commit) state.commit();
  }
  function loadHiddenScreens() {
    try {
      var raw = localStorage.getItem(storageKey() + "-hidden");
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function saveArrowMutations() {
    if (state.commit) state.commit();
  }
  function loadArrowMutations() {
    try {
      var raw = localStorage.getItem(storageKey() + "-arrowmods");
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  // src/render/anchors.ts
  var hoverHideTimeout = null;
  function scheduleHideAnchors() {
    if (state.creatingArrow) return;
    hoverHideTimeout = setTimeout(function() {
      hideAnchorDots();
      hoverHideTimeout = null;
    }, 150);
  }
  function cancelHideAnchors() {
    if (hoverHideTimeout) {
      clearTimeout(hoverHideTimeout);
      hoverHideTimeout = null;
    }
  }
  function showAnchorDots(screenId) {
    hideAnchorDots();
    if (state.hiddenScreens[screenId]) return;
    var anchors = getAllAnchorPoints(screenId);
    anchors.forEach(function(anchor) {
      var dot2 = document.createElement("div");
      dot2.className = "fb-anchor-dot";
      dot2.style.left = anchor.x - 6 + "px";
      dot2.style.top = anchor.y - 6 + "px";
      dot2.dataset.screenId = screenId;
      dot2.dataset.anchorName = anchor.name;
      dot2.addEventListener("mouseenter", function() {
        cancelHideAnchors();
        dot2.classList.add("fb-anchor-dot-hover");
      });
      dot2.addEventListener("mouseleave", function() {
        dot2.classList.remove("fb-anchor-dot-hover");
        scheduleHideAnchors();
      });
      dot2.addEventListener("mousedown", function(e) {
        e.stopPropagation();
        e.preventDefault();
        startArrowCreation(screenId, anchor.name);
      });
      state.canvasEl.appendChild(dot2);
      state.anchorDotsEls.push(dot2);
    });
  }
  function hideAnchorDots() {
    state.anchorDotsEls.forEach(function(el2) {
      if (el2.parentNode) el2.parentNode.removeChild(el2);
    });
    state.anchorDotsEls = [];
  }
  function showAllAnchorDots() {
    hideAnchorDots();
    var screens = state.project.screens || [];
    screens.forEach(function(s) {
      if (state.hiddenScreens[s.id]) return;
      var anchors = getAllAnchorPoints(s.id);
      anchors.forEach(function(anchor) {
        var dot2 = document.createElement("div");
        dot2.className = "fb-anchor-dot";
        dot2.style.left = anchor.x - 6 + "px";
        dot2.style.top = anchor.y - 6 + "px";
        dot2.dataset.screenId = s.id;
        dot2.dataset.anchorName = anchor.name;
        dot2.addEventListener("mouseenter", function() {
          dot2.classList.add("fb-anchor-dot-hover");
        });
        dot2.addEventListener("mouseleave", function() {
          dot2.classList.remove("fb-anchor-dot-hover");
        });
        dot2.addEventListener("mousedown", function(e) {
          e.stopPropagation();
          e.preventDefault();
          if (state.creatingArrow && s.id !== state.creatingArrow.fromScreenId) {
            completeArrowCreation(s.id, anchor.name);
          }
        });
        state.canvasEl.appendChild(dot2);
        state.anchorDotsEls.push(dot2);
      });
    });
    if (state.creatingArrow) {
      state.anchorDotsEls.forEach(function(dot2) {
        if (dot2.dataset.screenId === state.creatingArrow.fromScreenId && dot2.dataset.anchorName === state.creatingArrow.fromSide) {
          dot2.classList.add("fb-anchor-dot-source");
        }
      });
    }
  }
  function startArrowCreation(fromScreenId, fromSide) {
    state.creatingArrow = {
      fromScreenId,
      fromSide,
      tempLine: null
    };
    showAllAnchorDots();
    var ns = "http://www.w3.org/2000/svg";
    var defs = state.svgEl.querySelector("defs");
    if (defs && !state.svgEl.querySelector("#fb-arrowhead-temp")) {
      var marker = document.createElementNS(ns, "marker");
      marker.setAttribute("id", "fb-arrowhead-temp");
      marker.setAttribute("markerUnits", "userSpaceOnUse");
      marker.setAttribute("markerWidth", "14");
      marker.setAttribute("markerHeight", "14");
      marker.setAttribute("refX", "14");
      marker.setAttribute("refY", "7");
      marker.setAttribute("orient", "auto");
      var polygon = document.createElementNS(ns, "polygon");
      polygon.setAttribute("points", "0 0, 14 7, 0 14");
      polygon.setAttribute("fill", "#2A9D8F");
      marker.appendChild(polygon);
      defs.appendChild(marker);
    }
    var tempPath = document.createElementNS(ns, "path");
    tempPath.setAttribute("class", "fb-arrow-temp");
    tempPath.setAttribute("fill", "none");
    tempPath.setAttribute("stroke", "#2A9D8F");
    tempPath.setAttribute("stroke-width", "2");
    tempPath.setAttribute("stroke-dasharray", "8 4");
    tempPath.setAttribute("marker-end", "url(#fb-arrowhead-temp)");
    state.svgEl.appendChild(tempPath);
    state.creatingArrow.tempLine = tempPath;
    state.wrapperEl.classList.add("fb-creating-arrow");
    document.addEventListener("mousemove", handleArrowCreationMove);
    document.addEventListener("keydown", handleArrowCreationKeydown);
    state.wrapperEl.addEventListener("mousedown", handleArrowCreationCancel);
  }
  function handleArrowCreationMove(e) {
    if (!state.creatingArrow || !state.creatingArrow.tempLine) return;
    var wrapperRect = state.wrapperEl.getBoundingClientRect();
    var canvasX = (e.clientX - wrapperRect.left - state.panX) / state.zoom;
    var canvasY = (e.clientY - wrapperRect.top - state.panY) / state.zoom;
    var start = getAnchor(state.creatingArrow.fromScreenId, state.creatingArrow.fromSide);
    var dx = canvasX - start.x;
    var dy = canvasY - start.y;
    var toSide;
    if (Math.abs(dx) >= Math.abs(dy)) {
      toSide = dx > 0 ? "left" : "right";
    } else {
      toSide = dy > 0 ? "top" : "bottom";
    }
    var cps = computeControlPoints(start, { x: canvasX, y: canvasY }, state.creatingArrow.fromSide, toSide);
    var d = "M" + start.x + "," + start.y + " C" + cps.cp1.x + "," + cps.cp1.y + " " + cps.cp2.x + "," + cps.cp2.y + " " + canvasX + "," + canvasY;
    state.creatingArrow.tempLine.setAttribute("d", d);
  }
  function handleArrowCreationKeydown(e) {
    if (e.key === "Escape") {
      cancelArrowCreation();
    }
  }
  function handleArrowCreationCancel(e) {
    var target = e.target;
    if (target.classList.contains("fb-anchor-dot")) return;
    if (target.closest(".fb-screen")) return;
    cancelArrowCreation();
  }
  function cancelArrowCreation() {
    if (!state.creatingArrow) return;
    if (state.creatingArrow.tempLine && state.creatingArrow.tempLine.parentNode) {
      state.creatingArrow.tempLine.parentNode.removeChild(state.creatingArrow.tempLine);
    }
    var tempMarker = state.svgEl.querySelector("#fb-arrowhead-temp");
    if (tempMarker && tempMarker.parentNode) {
      tempMarker.parentNode.removeChild(tempMarker);
    }
    state.creatingArrow = null;
    state.wrapperEl.classList.remove("fb-creating-arrow");
    hideAnchorDots();
    document.removeEventListener("mousemove", handleArrowCreationMove);
    document.removeEventListener("keydown", handleArrowCreationKeydown);
    state.wrapperEl.removeEventListener("mousedown", handleArrowCreationCancel);
  }
  function completeArrowCreation(toScreenId, toSide) {
    if (!state.creatingArrow) return;
    var fromScreenId = state.creatingArrow.fromScreenId;
    var fromSide = state.creatingArrow.fromSide;
    if (fromScreenId === toScreenId) {
      cancelArrowCreation();
      return;
    }
    var newArrow = { from: fromScreenId, to: toScreenId, fromSide, toSide };
    state.project.arrows.push(newArrow);
    saveArrowMutations();
    cancelArrowCreation();
    drawArrows();
  }

  // src/render/icons.ts
  function icon(inner, size) {
    var s = size || 16;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + "</svg>";
  }
  var ICON_EYE = icon('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>');
  var ICON_EYE_OFF = icon('<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>');
  var ICON_LAYOUT = icon('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>');
  var ICON_TAG = icon('<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>');
  var ICON_TRASH = icon('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>');
  var ICON_PLUS = icon('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>');
  var ICON_SWAP = icon('<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>');
  var ICON_LINE_SOLID = icon('<line x1="3" y1="12" x2="21" y2="12"/>');
  var ICON_LINE_DASHED = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="3 3"><line x1="3" y1="12" x2="21" y2="12"/></svg>';
  var ICON_DESKTOP = icon('<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>');
  var ICON_PHONE = icon('<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>');
  var ICON_SQUARE = icon('<rect x="4" y="4" width="16" height="16" rx="2"/>');
  var ICON_MINUS = icon('<line x1="5" y1="12" x2="19" y2="12"/>');
  var ICON_FIT = icon('<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>');
  var ICON_DOWNLOAD = icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>');
  var ICON_RESET = icon('<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>');
  var ICON_CHEVRON = icon('<polyline points="6 9 12 15 18 9"/>', 14);
  var ICON_GRID = icon('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>');
  var ICON_SLIDERS = icon('<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>', 14);
  var ICON_X = icon('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', 14);
  var ICON_LAYERS = icon('<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>');
  var ICON_SPACING = icon('<polyline points="9 7 4 12 9 17"/><polyline points="15 7 20 12 15 17"/>', 15);

  // src/render/presets.ts
  var bar = '<i class="fb-skel-bar"></i>';
  var box = '<i class="fb-skel-box"></i>';
  var circle = '<i class="fb-skel-circle"></i>';
  var pill = '<i class="fb-skel-pill"></i>';
  var rep = (n, s) => s.repeat(n);
  var PRESETS = [
    { id: "custom", label: "Custom (HTML)", skeleton: () => "" },
    { id: "blank", label: "Blank", skeleton: () => box },
    {
      id: "form",
      label: "Form",
      skeleton: () => rep(3, `<div class="fb-skel-field">${bar}${box}</div>`) + `<div class="fb-skel-foot">${box}</div>`
    },
    {
      id: "list",
      label: "List",
      skeleton: () => rep(5, `<div class="fb-skel-listrow">${circle}${bar}</div>`)
    },
    {
      id: "table",
      label: "Table",
      skeleton: () => `<div class="fb-skel-thead">${bar}</div><div class="fb-skel-grid">${rep(16, box)}</div>`
    },
    {
      id: "dashboard",
      label: "Dashboard",
      skeleton: () => `<div class="fb-skel-tiles">${rep(4, box)}</div><div class="fb-skel-chart">${box}</div>`
    },
    {
      id: "cardgrid",
      label: "Card grid",
      skeleton: () => rep(6, box)
    },
    {
      id: "detail",
      label: "Detail",
      skeleton: () => `<div class="fb-skel-head">${circle}<div class="fb-skel-lines">${bar}${bar}</div></div><div class="fb-skel-blocks">${box}${box}</div>`
    },
    {
      id: "auth",
      label: "Auth / Login",
      skeleton: () => `${circle}${bar}${bar}${box}`
    },
    {
      id: "feed",
      label: "Feed",
      skeleton: () => rep(3, `<div class="fb-skel-post">${circle}<div class="fb-skel-lines">${bar}${bar}</div>${box}</div>`)
    },
    {
      id: "settings",
      label: "Settings",
      skeleton: () => rep(4, `<div class="fb-skel-setrow">${bar}${pill}</div>`)
    },
    {
      id: "kanban",
      label: "Kanban",
      skeleton: () => rep(3, `<div class="fb-skel-kcol">${rep(2, box)}</div>`)
    },
    {
      id: "modal",
      label: "Modal",
      skeleton: () => `<div class="fb-skel-dialog">${bar}${box}<div class="fb-skel-dialog-actions">${pill}${pill}</div></div>`
    },
    {
      id: "gallery",
      label: "Gallery",
      skeleton: () => rep(6, box)
    },
    {
      id: "nav",
      label: "Nav / Landing",
      skeleton: () => `<div class="fb-skel-navbar">${bar}</div><div class="fb-skel-hero">${box}</div><div class="fb-skel-secs">${bar}${bar}</div>`
    }
  ];
  function getPreset(id) {
    for (var i = 0; i < PRESETS.length; i++) {
      if (PRESETS[i].id === id) return PRESETS[i];
    }
    return void 0;
  }
  function isCustomPreset(id) {
    return !id || id === "custom";
  }
  function skeletonHtml(id) {
    var p = getPreset(id);
    return p ? p.skeleton() : "";
  }

  // src/render/screen.ts
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
    var el2 = state.screenEls[screenId];
    if (!el2) return;
    if (state.hiddenScreens[screenId]) {
      el2.classList.add("fb-screen-dimmed");
      if (state.selected[screenId]) {
        delete state.selected[screenId];
        el2.classList.remove("fb-selected");
      }
    } else {
      el2.classList.remove("fb-screen-dimmed");
    }
  }
  function renderScreen(screenData) {
    var epic = getEpic(screenData.epic);
    var color = epic ? epic.color : "#666";
    var el2 = document.createElement("div");
    el2.className = "fb-screen";
    el2.dataset.screenId = screenData.id;
    el2.addEventListener("mouseenter", function() {
      setHighlightedScreen(screenData.id);
    });
    el2.addEventListener("mouseleave", function() {
      if (state.highlightScreen === screenData.id) setHighlightedScreen(null);
    });
    if (screenData.format && FORMATS[screenData.format]) {
      var ff = FORMATS[screenData.format];
      el2.style.minWidth = ff.width + "px";
      el2.style.minHeight = ff.height + "px";
    } else {
      el2.style.width = screenWidth(screenData) + "px";
      var h = screenHeight(screenData);
      if (h) el2.style.height = h + "px";
    }
    var pos = state.positions[screenData.id] || { x: 100, y: 100 };
    el2.style.left = pos.x + "px";
    el2.style.top = pos.y + "px";
    var hdr = document.createElement("div");
    hdr.className = "fb-screen-header";
    hdr.style.background = color;
    hdr.innerHTML = "<span>" + escapeHtml(screenData.title) + "</span>";
    hdr.appendChild(renderEpicDots(screenData));
    var toggleBtn = document.createElement("button");
    toggleBtn.className = "fb-screen-toggle";
    toggleBtn.title = "Hide this screen";
    toggleBtn.innerHTML = ICON_EYE;
    toggleBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      toggleScreen(screenData.id);
    });
    hdr.appendChild(toggleBtn);
    el2.appendChild(hdr);
    var body = document.createElement("div");
    applyScreenBody(body, screenData);
    el2.appendChild(body);
    if (screenData.notes) {
      var footer = document.createElement("div");
      footer.className = "fb-screen-footer" + (state.showNotes ? "" : " fb-hidden");
      footer.textContent = screenData.notes;
      el2.appendChild(footer);
    }
    if (state.hiddenScreens[screenData.id]) {
      el2.classList.add("fb-screen-dimmed");
    }
    el2.addEventListener("contextmenu", function(e) {
      e.preventDefault();
      e.stopPropagation();
      showScreenPopup(e, screenData.id);
    });
    el2.addEventListener("mouseenter", function() {
      if (!state.creatingArrow && !state.screenDrag && !state.selectBox) {
        cancelHideAnchors();
        showAnchorDots(screenData.id);
      }
    });
    el2.addEventListener("mouseleave", function() {
      if (!state.creatingArrow) {
        scheduleHideAnchors();
      }
    });
    state.screenEls[screenData.id] = el2;
    return el2;
  }
  function applyScreenBody(body, screenData) {
    body.className = "fb-screen-body";
    body.innerHTML = "";
    var preset = screenData.preset || "custom";
    if (isCustomPreset(preset)) {
      body.innerHTML = screenData.content || "";
    } else {
      body.classList.add("fb-skeleton", "fb-skel-" + preset);
      body.innerHTML = skeletonHtml(preset);
    }
  }
  function setScreenFormat(screenId, format) {
    var screens = state.project && state.project.screens || [];
    var screen = null;
    for (var i = 0; i < screens.length; i++) {
      if (screens[i].id === screenId) {
        screen = screens[i];
        break;
      }
    }
    if (!screen) return;
    screen.format = format;
    var el2 = state.screenEls[screenId];
    if (el2) {
      el2.style.width = "";
      el2.style.height = "";
      el2.style.minWidth = "";
      el2.style.minHeight = "";
      if (FORMATS[format]) {
        var ff = FORMATS[format];
        el2.style.minWidth = ff.width + "px";
        el2.style.minHeight = ff.height + "px";
      } else {
        el2.style.width = screenWidth(screen) + "px";
        var h = screenHeight(screen);
        if (h) el2.style.height = h + "px";
      }
    }
    drawArrows();
    if (state.commit) state.commit();
  }
  function deleteScreen(screenId) {
    var screens = state.project && state.project.screens || [];
    var idx = -1;
    for (var i = 0; i < screens.length; i++) {
      if (screens[i].id === screenId) {
        idx = i;
        break;
      }
    }
    if (idx === -1) return;
    screens.splice(idx, 1);
    var arrows = state.project && state.project.arrows || [];
    state.project.arrows = arrows.filter(function(a) {
      return a.from !== screenId && a.to !== screenId;
    });
    var el2 = state.screenEls[screenId];
    if (el2 && el2.parentNode) el2.parentNode.removeChild(el2);
    delete state.screenEls[screenId];
    delete state.hiddenScreens[screenId];
    delete state.selected[screenId];
    if (state.positions) delete state.positions[screenId];
    drawArrows();
    if (state.commit) state.commit();
  }
  function renderEpicDots(screen) {
    var wrap = document.createElement("span");
    wrap.className = "fb-epic-dots";
    screenEpics(screen).slice(1).forEach(function(id) {
      var e = getEpic(id);
      if (!e) return;
      var d = document.createElement("span");
      d.className = "fb-epic-dot";
      d.style.background = e.color;
      d.title = e.label || e.id;
      wrap.appendChild(d);
    });
    return wrap;
  }
  function refreshScreenEpics(screen) {
    var el2 = state.screenEls[screen.id];
    if (!el2) return;
    var hdr = el2.querySelector(".fb-screen-header");
    if (!hdr) return;
    var epic = getEpic(screen.epic);
    hdr.style.background = epic ? epic.color : "#666";
    var old = hdr.querySelector(".fb-epic-dots");
    var dots = renderEpicDots(screen);
    if (old && old.parentNode) old.parentNode.replaceChild(dots, old);
    else hdr.insertBefore(dots, hdr.querySelector(".fb-screen-toggle"));
  }
  function findScreen(screenId) {
    var screens = state.project && state.project.screens || [];
    for (var i = 0; i < screens.length; i++) if (screens[i].id === screenId) return screens[i];
    return null;
  }
  function setScreenEpic(screenId, epicId) {
    var screen = findScreen(screenId);
    if (!screen) return;
    setEpicList(screen, epicId ? [epicId] : []);
    refreshScreenEpics(screen);
    if (state.commit) state.commit();
  }
  function toggleScreenEpic(screenId, epicId) {
    var screen = findScreen(screenId);
    if (!screen) return;
    var list = screenEpics(screen).slice();
    var at = list.indexOf(epicId);
    if (at === -1) list.push(epicId);
    else list.splice(at, 1);
    setEpicList(screen, list);
    refreshScreenEpics(screen);
    if (state.commit) state.commit();
  }
  function setScreenPreset(screenId, preset) {
    var screens = state.project && state.project.screens || [];
    var screen = null;
    for (var i = 0; i < screens.length; i++) {
      if (screens[i].id === screenId) {
        screen = screens[i];
        break;
      }
    }
    if (!screen) return;
    screen.preset = preset;
    var el2 = state.screenEls[screenId];
    if (!el2) return;
    var body = el2.querySelector(".fb-screen-body");
    if (body) applyScreenBody(body, screen);
    drawArrows();
    if (state.commit) state.commit();
  }

  // src/render/context-menu.ts
  var openRoot = null;
  var dismiss = null;
  function closeContextMenu() {
    if (openRoot && openRoot.parentNode) openRoot.parentNode.removeChild(openRoot);
    openRoot = null;
    if (dismiss) {
      document.removeEventListener("mousedown", dismiss, true);
      document.removeEventListener("keydown", dismiss, true);
      dismiss = null;
    }
  }
  function buildMenu(items) {
    var menu = document.createElement("div");
    menu.className = "fb-ctx-menu";
    items.forEach(function(item) {
      var row = document.createElement("div");
      row.className = "fb-ctx-item" + (item.active ? " fb-ctx-active" : "") + (item.danger ? " fb-ctx-danger" : "") + (item.submenu ? " fb-ctx-has-sub" : "");
      if (item.testid) row.setAttribute("data-testid", item.testid);
      if (item.icon) {
        var ic = document.createElement("span");
        ic.className = "fb-ctx-icon";
        ic.innerHTML = item.icon;
        row.appendChild(ic);
      }
      var label = document.createElement("span");
      label.className = "fb-ctx-label";
      label.textContent = item.label;
      row.appendChild(label);
      if (item.submenu && item.submenu.length) {
        var caret = document.createElement("span");
        caret.className = "fb-ctx-caret";
        caret.textContent = "\u25B8";
        row.appendChild(caret);
        row.addEventListener("mouseenter", function() {
          var existing = menu.querySelectorAll(".fb-ctx-sub");
          for (var i = 0; i < existing.length; i++) {
            var e = existing[i];
            if (e.parentNode) e.parentNode.removeChild(e);
          }
          var sub = buildMenu(item.submenu);
          sub.classList.add("fb-ctx-sub");
          row.appendChild(sub);
          if (sub.getBoundingClientRect().right > window.innerWidth) {
            sub.classList.add("fb-ctx-sub-left");
          }
        });
        row.addEventListener("mouseleave", function() {
          var s = row.querySelector(".fb-ctx-sub");
          if (s && s.parentNode) s.parentNode.removeChild(s);
        });
      } else {
        row.addEventListener("click", function(e) {
          e.stopPropagation();
          closeContextMenu();
          if (item.onClick) item.onClick();
        });
      }
      menu.appendChild(row);
    });
    return menu;
  }
  function showContextMenu(x, y, items) {
    closeContextMenu();
    var menu = buildMenu(items);
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    document.body.appendChild(menu);
    openRoot = menu;
    var r = menu.getBoundingClientRect();
    if (r.width && r.right > window.innerWidth) menu.style.left = Math.max(0, x - r.width) + "px";
    if (r.height && r.bottom > window.innerHeight) menu.style.top = Math.max(0, y - r.height) + "px";
    dismiss = function(e) {
      if (e.type === "keydown") {
        if (e.key === "Escape") closeContextMenu();
        return;
      }
      if (openRoot && !openRoot.contains(e.target)) closeContextMenu();
    };
    var fn = dismiss;
    setTimeout(function() {
      if (dismiss !== fn) return;
      document.addEventListener("mousedown", fn, true);
      document.addEventListener("keydown", fn, true);
    }, 0);
    return menu;
  }

  // src/render/preset-picker.ts
  var pickerEl = null;
  var dismiss2 = null;
  function closePresetPicker() {
    if (pickerEl && pickerEl.parentNode) pickerEl.parentNode.removeChild(pickerEl);
    pickerEl = null;
    if (dismiss2) {
      document.removeEventListener("mousedown", dismiss2, true);
      document.removeEventListener("keydown", dismiss2, true);
      dismiss2 = null;
    }
  }
  function showPresetPicker(x, y, onPick, current) {
    closePresetPicker();
    var picker = document.createElement("div");
    picker.className = "fb-preset-picker";
    var grid = document.createElement("div");
    grid.className = "fb-preset-grid";
    PRESETS.forEach(function(p) {
      var tile = document.createElement("button");
      tile.className = "fb-preset-tile" + (p.id === current ? " active" : "") + (p.id === "custom" ? " fb-preset-custom" : "");
      tile.title = p.label;
      var thumb = document.createElement("div");
      thumb.className = "fb-preset-thumb";
      if (p.id !== "custom") {
        var mini = document.createElement("div");
        mini.className = "fb-screen-body fb-skeleton fb-skel-" + p.id + " fb-preset-mini";
        mini.innerHTML = skeletonHtml(p.id);
        thumb.appendChild(mini);
      }
      tile.appendChild(thumb);
      tile.addEventListener("click", function(e) {
        e.stopPropagation();
        closePresetPicker();
        onPick(p.id);
      });
      grid.appendChild(tile);
    });
    picker.appendChild(grid);
    picker.style.left = x + "px";
    picker.style.top = y + "px";
    document.body.appendChild(picker);
    pickerEl = picker;
    var r = picker.getBoundingClientRect();
    if (r.width && r.right > window.innerWidth) picker.style.left = Math.max(0, x - r.width) + "px";
    if (r.height && r.bottom > window.innerHeight) picker.style.top = Math.max(0, y - r.height) + "px";
    dismiss2 = function(e) {
      if (e.type === "keydown") {
        if (e.key === "Escape") closePresetPicker();
        return;
      }
      if (pickerEl && !pickerEl.contains(e.target)) closePresetPicker();
    };
    var fn = dismiss2;
    setTimeout(function() {
      if (dismiss2 !== fn) return;
      document.addEventListener("mousedown", fn, true);
      document.addEventListener("keydown", fn, true);
    }, 0);
    return picker;
  }

  // src/render/popups.ts
  function handlePopupOutsideClick(e) {
    if (state.arrowPopup && state.arrowPopup.el && !state.arrowPopup.el.contains(e.target)) {
      closeArrowPopup();
    }
  }
  function closeArrowPopup() {
    if (state.arrowPopup && state.arrowPopup.el) {
      if (state.arrowPopup.el.parentNode) {
        state.arrowPopup.el.parentNode.removeChild(state.arrowPopup.el);
      }
      state.arrowPopup = null;
    }
    document.removeEventListener("mousedown", handlePopupOutsideClick);
  }
  function showArrowPopup(e, arrowIndex) {
    closeArrowPopup();
    var arrow = state.project.arrows[arrowIndex];
    if (!arrow) return;
    var popup = document.createElement("div");
    popup.className = "fb-arrow-popup";
    var labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.className = "fb-arrow-popup-input";
    labelInput.placeholder = "Label...";
    labelInput.value = arrow.label || "";
    labelInput.addEventListener("mousedown", function(ev) {
      ev.stopPropagation();
    });
    labelInput.addEventListener("keydown", function(ev) {
      ev.stopPropagation();
      if (ev.key === "Enter") {
        arrow.label = labelInput.value.trim() || void 0;
        saveArrowMutations();
        drawArrows();
        closeArrowPopup();
      }
      if (ev.key === "Escape") {
        closeArrowPopup();
      }
    });
    labelInput.addEventListener("blur", function() {
      var newLabel = labelInput.value.trim() || void 0;
      if (newLabel !== (arrow.label || void 0)) {
        arrow.label = newLabel;
        saveArrowMutations();
        drawArrows();
      }
    });
    popup.appendChild(labelInput);
    var detailInput = document.createElement("input");
    detailInput.type = "text";
    detailInput.className = "fb-arrow-popup-input fb-arrow-popup-detail";
    detailInput.placeholder = "Detail (e.g. POST /v1/update \xB7 UPDATE_CLOTURE)";
    detailInput.value = arrow.detail || "";
    detailInput.setAttribute("data-testid", "arrow-detail");
    var noteInput = document.createElement("input");
    noteInput.type = "text";
    noteInput.className = "fb-arrow-popup-input fb-arrow-popup-detail";
    noteInput.placeholder = "Note";
    noteInput.value = arrow.note || "";
    noteInput.setAttribute("data-testid", "arrow-note");
    [detailInput, noteInput].forEach(function(inp) {
      inp.addEventListener("mousedown", function(ev) {
        ev.stopPropagation();
      });
      inp.addEventListener("keydown", function(ev) {
        ev.stopPropagation();
        if (ev.key === "Enter") {
          inp.blur();
          closeArrowPopup();
        }
        if (ev.key === "Escape") closeArrowPopup();
      });
      inp.addEventListener("blur", function() {
        var detail = detailInput.value.trim() || void 0;
        var note = noteInput.value.trim() || void 0;
        if (detail !== (arrow.detail || void 0) || note !== (arrow.note || void 0)) {
          if (detail) arrow.detail = detail;
          else delete arrow.detail;
          if (note) arrow.note = note;
          else delete arrow.note;
          saveArrowMutations();
          drawArrows();
        }
      });
    });
    var colorInput = document.createElement("input");
    colorInput.type = "text";
    colorInput.className = "fb-arrow-popup-input fb-arrow-popup-detail";
    colorInput.placeholder = "Color: indigo, amber, green, red, grey, teal, pink or #hex";
    colorInput.value = arrow.color || "";
    colorInput.setAttribute("data-testid", "arrow-color");
    colorInput.addEventListener("mousedown", function(ev) {
      ev.stopPropagation();
    });
    colorInput.addEventListener("keydown", function(ev) {
      ev.stopPropagation();
      if (ev.key === "Enter") {
        colorInput.blur();
        closeArrowPopup();
      }
      if (ev.key === "Escape") closeArrowPopup();
    });
    colorInput.addEventListener("blur", function() {
      var c = colorInput.value.trim() || void 0;
      if (c !== (arrow.color || void 0)) {
        if (c) arrow.color = c;
        else delete arrow.color;
        saveArrowMutations();
        drawArrows();
      }
    });
    var detailWrap = document.createElement("div");
    detailWrap.className = "fb-arrow-popup-detailwrap";
    detailWrap.appendChild(detailInput);
    detailWrap.appendChild(noteInput);
    detailWrap.appendChild(colorInput);
    popup.appendChild(detailWrap);
    var popupSep = document.createElement("div");
    popupSep.className = "fb-arrow-popup-sep";
    popup.appendChild(popupSep);
    var swapBtn = document.createElement("button");
    swapBtn.className = "fb-arrow-popup-btn";
    swapBtn.setAttribute("data-testid", "arrow-swap");
    swapBtn.title = "Reverse direction";
    swapBtn.innerHTML = ICON_SWAP;
    swapBtn.addEventListener("click", function(ev) {
      ev.stopPropagation();
      swapArrowDirection(arrowIndex);
      closeArrowPopup();
    });
    popup.appendChild(swapBtn);
    var styleBtn = document.createElement("button");
    styleBtn.className = "fb-arrow-popup-btn";
    styleBtn.setAttribute("data-testid", "arrow-style");
    styleBtn.title = arrow.dashed ? "Make solid" : "Make dashed";
    styleBtn.innerHTML = arrow.dashed ? ICON_LINE_SOLID : ICON_LINE_DASHED;
    styleBtn.addEventListener("click", function(ev) {
      ev.stopPropagation();
      toggleArrowStyle(arrowIndex);
      closeArrowPopup();
    });
    popup.appendChild(styleBtn);
    var kindBtn = document.createElement("button");
    kindBtn.className = "fb-arrow-popup-btn fb-arrow-popup-kind";
    kindBtn.setAttribute("data-testid", "arrow-kind");
    var curKind = arrow.kind || "default";
    kindBtn.textContent = curKind === "main" ? "Main" : curKind === "nav" ? "Nav" : "Std";
    kindBtn.title = "Arrow weight: Main (journey) / Nav (menu, secondary) / Std";
    kindBtn.addEventListener("click", function(ev) {
      ev.stopPropagation();
      cycleArrowKind(arrowIndex);
      closeArrowPopup();
    });
    popup.appendChild(kindBtn);
    var deleteBtn = document.createElement("button");
    deleteBtn.className = "fb-arrow-popup-btn fb-arrow-popup-delete";
    deleteBtn.setAttribute("data-testid", "arrow-delete");
    deleteBtn.title = "Delete arrow";
    deleteBtn.innerHTML = ICON_TRASH;
    deleteBtn.addEventListener("click", function(ev) {
      ev.stopPropagation();
      deleteArrow(arrowIndex);
      closeArrowPopup();
    });
    popup.appendChild(deleteBtn);
    var wrapperRect = state.wrapperEl.getBoundingClientRect();
    var popupX = e.clientX - wrapperRect.left + 8;
    var popupY = e.clientY - wrapperRect.top - 16;
    popup.style.left = popupX + "px";
    popup.style.top = popupY + "px";
    state.wrapperEl.appendChild(popup);
    var popupRect = popup.getBoundingClientRect();
    if (popupRect.right > wrapperRect.right) {
      popup.style.left = popupX - popupRect.width - 16 + "px";
    }
    if (popupRect.bottom > wrapperRect.bottom) {
      popup.style.top = popupY - popupRect.height + "px";
    }
    state.arrowPopup = { el: popup, arrowIndex };
    labelInput.focus();
    labelInput.select();
    setTimeout(function() {
      document.addEventListener("mousedown", handlePopupOutsideClick);
    }, 0);
  }
  function cycleArrowKind(arrowIndex) {
    var arrow = state.project.arrows[arrowIndex];
    if (!arrow) return;
    if (!arrow.kind) arrow.kind = "main";
    else if (arrow.kind === "main") arrow.kind = "nav";
    else delete arrow.kind;
    saveArrowMutations();
    drawArrows();
  }
  function swapArrowDirection(arrowIndex) {
    var arrow = state.project.arrows[arrowIndex];
    if (!arrow) return;
    var tmp = arrow.from;
    arrow.from = arrow.to;
    arrow.to = tmp;
    if (arrow.fromSide || arrow.toSide) {
      var tmpSide = arrow.fromSide;
      arrow.fromSide = arrow.toSide;
      arrow.toSide = tmpSide;
    }
    saveArrowMutations();
    drawArrows();
  }
  function toggleArrowStyle(arrowIndex) {
    var arrow = state.project.arrows[arrowIndex];
    if (!arrow) return;
    arrow.dashed = !arrow.dashed;
    saveArrowMutations();
    drawArrows();
  }
  function deleteArrow(arrowIndex) {
    var arrow = state.project.arrows[arrowIndex];
    if (!arrow) return;
    state.project.arrows.splice(arrowIndex, 1);
    saveArrowMutations();
    drawArrows();
  }
  function handleScreenPopupOutsideClick(e) {
    if (state.screenPopup && state.screenPopup.el && !state.screenPopup.el.contains(e.target)) {
      closeScreenPopup();
    }
  }
  function closeScreenPopup() {
    if (state.screenPopup && state.screenPopup.el) {
      if (state.screenPopup.el.parentNode) {
        state.screenPopup.el.parentNode.removeChild(state.screenPopup.el);
      }
      state.screenPopup = null;
    }
    document.removeEventListener("mousedown", handleScreenPopupOutsideClick);
  }
  function showScreenPopup(e, screenId) {
    closeArrowPopup();
    closeScreenPopup();
    var screenData = null;
    var screens = state.project.screens || [];
    for (var i = 0; i < screens.length; i++) {
      if (screens[i].id === screenId) {
        screenData = screens[i];
        break;
      }
    }
    if (!screenData) return;
    var el2 = state.screenEls[screenId];
    if (!el2) return;
    var popup = document.createElement("div");
    popup.className = "fb-screen-popup";
    function mkBtn(svg, text, testid, danger) {
      var b = document.createElement("button");
      b.className = "fb-screen-popup-btn" + (danger ? " fb-screen-popup-delete" : "");
      b.setAttribute("data-testid", testid);
      var ic = document.createElement("span");
      ic.className = "fb-popup-btn-icon";
      ic.innerHTML = svg;
      var lb = document.createElement("span");
      lb.textContent = text;
      b.appendChild(ic);
      b.appendChild(lb);
      return b;
    }
    var titleLabel = document.createElement("div");
    titleLabel.className = "fb-screen-popup-label";
    titleLabel.textContent = "Title";
    popup.appendChild(titleLabel);
    var titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.className = "fb-screen-popup-input";
    titleInput.value = screenData.title || "";
    titleInput.addEventListener("mousedown", function(ev) {
      ev.stopPropagation();
    });
    titleInput.addEventListener("keydown", function(ev) {
      ev.stopPropagation();
      if (ev.key === "Enter") {
        var val = titleInput.value.trim();
        if (val && val !== screenData.title) {
          screenData.title = val;
          var hdrSpan = el2.querySelector(".fb-screen-header span");
          if (hdrSpan) hdrSpan.textContent = val;
          saveArrowMutations();
        }
        closeScreenPopup();
      }
      if (ev.key === "Escape") {
        closeScreenPopup();
      }
    });
    titleInput.addEventListener("blur", function() {
      var val = titleInput.value.trim();
      if (val && val !== screenData.title) {
        screenData.title = val;
        var hdrSpan = el2.querySelector(".fb-screen-header span");
        if (hdrSpan) hdrSpan.textContent = val;
        saveArrowMutations();
      }
    });
    popup.appendChild(titleInput);
    var sep2 = document.createElement("div");
    sep2.className = "fb-screen-popup-sep";
    popup.appendChild(sep2);
    var fmtLabel = document.createElement("div");
    fmtLabel.className = "fb-screen-popup-label";
    fmtLabel.textContent = "Format";
    popup.appendChild(fmtLabel);
    var fmtRow = document.createElement("div");
    fmtRow.className = "fb-screen-popup-formats";
    var currentFmt = screenData.format || "";
    var fmtDefs = [
      { id: "desktop", label: "Desktop", icon: ICON_DESKTOP },
      { id: "phone", label: "Phone", icon: ICON_PHONE },
      { id: "square", label: "Square", icon: ICON_SQUARE }
    ];
    fmtDefs.forEach(function(def) {
      var btn = document.createElement("button");
      btn.className = "fb-screen-popup-format" + (def.id === currentFmt ? " active" : "");
      btn.setAttribute("data-testid", "fmt-" + def.id);
      var fic = document.createElement("span");
      fic.className = "fb-fmt-icon";
      fic.innerHTML = def.icon;
      var flb = document.createElement("span");
      flb.className = "fb-fmt-label";
      flb.textContent = def.label;
      btn.appendChild(fic);
      btn.appendChild(flb);
      btn.addEventListener("click", function(ev) {
        ev.stopPropagation();
        setScreenFormat(screenId, def.id);
        closeScreenPopup();
      });
      fmtRow.appendChild(btn);
    });
    popup.appendChild(fmtRow);
    var sep3 = document.createElement("div");
    sep3.className = "fb-screen-popup-sep";
    popup.appendChild(sep3);
    var hidden = !!state.hiddenScreens[screenId];
    var hideBtn = mkBtn(hidden ? ICON_EYE : ICON_EYE_OFF, hidden ? "Show" : "Hide", "screen-hide");
    hideBtn.addEventListener("click", function(ev) {
      ev.stopPropagation();
      toggleScreen(screenId);
      closeScreenPopup();
    });
    popup.appendChild(hideBtn);
    var layoutBtn = mkBtn(ICON_LAYOUT, "Change layout", "screen-layout");
    layoutBtn.addEventListener("click", function(ev) {
      ev.stopPropagation();
      var cx = ev.clientX;
      var cy = ev.clientY;
      var current = screenData.preset || "custom";
      closeScreenPopup();
      showPresetPicker(cx, cy, function(preset) {
        setScreenPreset(screenId, preset);
      }, current);
    });
    popup.appendChild(layoutBtn);
    var epicBtn = mkBtn(ICON_TAG, "Epics", "screen-epic");
    epicBtn.addEventListener("click", function(ev) {
      ev.stopPropagation();
      var cx = ev.clientX;
      var cy = ev.clientY;
      var hasAny = !!screenData.epic;
      closeScreenPopup();
      var items = (state.project.epics || []).map(function(epic) {
        return {
          label: epic.label || epic.id,
          icon: '<svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="' + epic.color + '"/></svg>',
          active: inEpic(screenData, epic.id),
          testid: "epic-" + epic.id,
          onClick: function() {
            toggleScreenEpic(screenId, epic.id);
          }
        };
      });
      items.push({ label: "None", active: !hasAny, testid: "epic-none", onClick: function() {
        setScreenEpic(screenId, null);
      } });
      showContextMenu(cx, cy, items);
    });
    popup.appendChild(epicBtn);
    var deleteScreenBtn = mkBtn(ICON_TRASH, "Delete", "screen-delete", true);
    deleteScreenBtn.addEventListener("click", function(ev) {
      ev.stopPropagation();
      closeScreenPopup();
      if (confirm("Delete this screen and its arrows?")) deleteScreen(screenId);
    });
    popup.appendChild(deleteScreenBtn);
    var wrapperRect = state.wrapperEl.getBoundingClientRect();
    var popupX = e.clientX - wrapperRect.left + 4;
    var popupY = e.clientY - wrapperRect.top + 4;
    popup.style.left = popupX + "px";
    popup.style.top = popupY + "px";
    state.wrapperEl.appendChild(popup);
    var popupRect = popup.getBoundingClientRect();
    if (popupRect.right > wrapperRect.right) {
      popup.style.left = popupX - popupRect.width - 8 + "px";
    }
    if (popupRect.bottom > wrapperRect.bottom) {
      popup.style.top = popupY - popupRect.height + "px";
    }
    state.screenPopup = { el: popup, screenId };
    setTimeout(function() {
      document.addEventListener("mousedown", handleScreenPopupOutsideClick);
    }, 0);
  }

  // src/arrows.ts
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
      return dx > 0 ? { from: "right", to: "left" } : { from: "left", to: "right" };
    } else {
      return dy > 0 ? { from: "bottom", to: "top" } : { from: "top", to: "bottom" };
    }
  }
  function getAnchor(screenId, side) {
    var el2 = state.screenEls[screenId];
    if (!el2) return { x: 0, y: 0 };
    var pos = state.positions[screenId];
    var w = el2.offsetWidth;
    var h = el2.offsetHeight;
    var parts = side ? side.split("-") : [];
    var primary, fraction;
    if (parts.length === 1) {
      primary = parts[0];
      fraction = 0.5;
    } else if (parts[0] === "left" || parts[0] === "right") {
      primary = parts[0];
      var lrMap = { top: 1 / 6, upper: 2 / 6, middle: 0.5, lower: 4 / 6, bottom: 5 / 6 };
      fraction = lrMap[parts[1]] !== void 0 ? lrMap[parts[1]] : 0.5;
    } else {
      primary = parts[0];
      var tbMap = { left: 0.25, right: 0.75 };
      fraction = tbMap[parts[1]] !== void 0 ? tbMap[parts[1]] : 0.5;
    }
    switch (primary) {
      case "left":
        return { x: pos.x, y: pos.y + h * fraction };
      case "right":
        return { x: pos.x + w, y: pos.y + h * fraction };
      case "top":
        return { x: pos.x + w * fraction, y: pos.y };
      case "bottom":
        return { x: pos.x + w * fraction, y: pos.y + h };
      default:
        return { x: pos.x + w / 2, y: pos.y + h / 2 };
    }
  }
  function computeControlPoints(start, end, fromSide, toSide) {
    var fromPrimary = getPrimarySide(fromSide);
    var toPrimary = getPrimarySide(toSide);
    var dx = end.x - start.x;
    var dy = end.y - start.y;
    var cp1 = { x: start.x, y: start.y };
    var cp2 = { x: end.x, y: end.y };
    switch (fromPrimary) {
      case "right":
        cp1.x += ARROW_OFFSET;
        cp1.y += dy * ARROW_BLEND;
        break;
      case "left":
        cp1.x -= ARROW_OFFSET;
        cp1.y += dy * ARROW_BLEND;
        break;
      case "bottom":
        cp1.y += ARROW_OFFSET;
        cp1.x += dx * ARROW_BLEND;
        break;
      case "top":
        cp1.y -= ARROW_OFFSET;
        cp1.x += dx * ARROW_BLEND;
        break;
    }
    switch (toPrimary) {
      case "right":
        cp2.x += ARROW_OFFSET;
        cp2.y -= dy * ARROW_BLEND;
        break;
      case "left":
        cp2.x -= ARROW_OFFSET;
        cp2.y -= dy * ARROW_BLEND;
        break;
      case "bottom":
        cp2.y += ARROW_OFFSET;
        cp2.x -= dx * ARROW_BLEND;
        break;
      case "top":
        cp2.y -= ARROW_OFFSET;
        cp2.x -= dx * ARROW_BLEND;
        break;
    }
    return { cp1, cp2 };
  }
  function resolveArrowSides(arrow, idx, spreadMap) {
    if (state.focus) {
      var fe = state.screenEls[arrow.from], te = state.screenEls[arrow.to];
      if (fe && te) return getBestSides(fe, te);
    }
    if (arrow.fromSide && arrow.toSide) {
      return { from: arrow.fromSide, to: arrow.toSide };
    }
    if (spreadMap && spreadMap[idx] !== void 0) {
      return spreadMap[idx];
    }
    var fromEl = state.screenEls[arrow.from];
    var toEl = state.screenEls[arrow.to];
    if (fromEl && toEl) {
      return getBestSides(fromEl, toEl);
    }
    return { from: "right", to: "left" };
  }
  function getAllAnchorPoints(screenId) {
    var names = [
      "left-top",
      "left-upper",
      "left-middle",
      "left-lower",
      "left-bottom",
      "right-top",
      "right-upper",
      "right-middle",
      "right-lower",
      "right-bottom",
      "top-left",
      "top",
      "top-right",
      "bottom-left",
      "bottom",
      "bottom-right"
    ];
    var points = [];
    for (var i = 0; i < names.length; i++) {
      var pt = getAnchor(screenId, names[i]);
      points.push({ name: names[i], x: pt.x, y: pt.y });
    }
    return points;
  }
  function buildSpreadMap() {
    var arrows = state.project ? state.project.arrows || [] : [];
    var pairGroups = {};
    arrows.forEach(function(arrow, idx) {
      if (state.hiddenScreens[arrow.from] || state.hiddenScreens[arrow.to]) return;
      var ids = [arrow.from, arrow.to].sort();
      var pairKey = ids[0] + "|" + ids[1];
      if (!pairGroups[pairKey]) pairGroups[pairKey] = [];
      pairGroups[pairKey].push(idx);
    });
    var spreadMap = {};
    Object.keys(pairGroups).forEach(function(pairKey) {
      var group = pairGroups[pairKey];
      if (group.length <= 1) return;
      group.forEach(function(arrowIdx, posInGroup) {
        var arrow = arrows[arrowIdx];
        if (arrow.fromSide && arrow.toSide) return;
        var fromEl = state.screenEls[arrow.from];
        var toEl = state.screenEls[arrow.to];
        if (!fromEl || !toEl) return;
        var baseSides = getBestSides(fromEl, toEl);
        var isHorizontal = baseSides.from === "right" || baseSides.from === "left";
        var suffixes;
        if (group.length === 2) {
          suffixes = isHorizontal ? ["-upper", "-lower"] : ["-left", "-right"];
        } else if (group.length === 3) {
          suffixes = isHorizontal ? ["-upper", "-middle", "-lower"] : ["-left", "", "-right"];
        } else if (group.length === 4) {
          suffixes = isHorizontal ? ["-top", "-upper", "-lower", "-bottom"] : ["-left", "", "-right"];
        } else {
          suffixes = isHorizontal ? ["-top", "-upper", "-middle", "-lower", "-bottom"] : ["-left", "", "-right"];
        }
        var suffix = suffixes[Math.min(posInGroup, suffixes.length - 1)];
        spreadMap[arrowIdx] = {
          from: baseSides.from + suffix,
          to: baseSides.to + suffix
        };
      });
    });
    return spreadMap;
  }
  function freezeArrowSides() {
    var arrows = state.project ? state.project.arrows || [] : [];
    var spreadMap = buildSpreadMap();
    arrows.forEach(function(arrow, idx) {
      if (arrow.fromSide && arrow.toSide) return;
      var sides = resolveArrowSides(arrow, idx, spreadMap);
      arrow.fromSide = sides.from;
      arrow.toSide = sides.to;
    });
  }
  var KIND_STYLE = {
    main: { color: "#374151", width: "3", marker: "fb-arrowhead-main" },
    nav: { color: "#b8bfca", width: "1.4", marker: "fb-arrowhead-nav" },
    default: { color: "#888", width: "2", marker: "fb-arrowhead" }
  };
  var KIND_RANK = { nav: 0, default: 1, main: 2 };
  function isArrowShown(arrow) {
    if (state.focus && (!state.focus.visible[arrow.from] || !state.focus.visible[arrow.to])) return false;
    if (arrow.kind === "nav" && state.showNav === false) return false;
    return true;
  }
  var LABEL_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  var measureCtx;
  var widthCache = {};
  function measureLabel(text, fontSize, bold) {
    var key = fontSize + (bold ? "b" : "") + "|" + text;
    var hit = widthCache[key];
    if (hit !== void 0) return hit;
    if (measureCtx === void 0) {
      try {
        measureCtx = document.createElement("canvas").getContext("2d");
      } catch (e) {
        measureCtx = null;
      }
    }
    var w;
    if (measureCtx) {
      measureCtx.font = (bold ? "600 " : "") + fontSize + "px " + LABEL_FONT_FAMILY;
      w = measureCtx.measureText(text).width;
    } else {
      w = text.length * fontSize * 0.56;
    }
    widthCache[key] = w;
    return w;
  }
  function makeMarker(ns, id, size, color) {
    var marker = document.createElementNS(ns, "marker");
    marker.setAttribute("id", id);
    marker.setAttribute("markerUnits", "userSpaceOnUse");
    marker.setAttribute("markerWidth", String(size));
    marker.setAttribute("markerHeight", String(size));
    marker.setAttribute("refX", String(size));
    marker.setAttribute("refY", String(size / 2));
    marker.setAttribute("orient", "auto");
    var polygon = document.createElementNS(ns, "polygon");
    polygon.setAttribute("points", "0 0, " + size + " " + size / 2 + ", 0 " + size);
    polygon.setAttribute("fill", color);
    marker.appendChild(polygon);
    return marker;
  }
  var LABEL_MAX_W = 170;
  var LABEL_MAX_LINES = 3;
  var LABEL_TS = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82];
  function bezierPoint(p0, p1, p2, p3, t) {
    var u = 1 - t;
    var a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
  }
  function wrapLabel(text, fontSize, bold) {
    var words = String(text).split(/\s+/).filter(function(w) {
      return w !== "";
    });
    var lines = [];
    var cur = "";
    for (var i = 0; i < words.length; i++) {
      var next = cur ? cur + " " + words[i] : words[i];
      if (cur && measureLabel(next, fontSize, bold) > LABEL_MAX_W) {
        lines.push(cur);
        cur = words[i];
        if (lines.length === LABEL_MAX_LINES) {
          cur = "";
          break;
        }
      } else {
        cur = next;
      }
    }
    if (cur) lines.push(cur);
    if (lines.length > LABEL_MAX_LINES || i < words.length && lines.length === LABEL_MAX_LINES) {
      lines = lines.slice(0, LABEL_MAX_LINES);
      lines[LABEL_MAX_LINES - 1] = lines[LABEL_MAX_LINES - 1].replace(/\s*\S*$/, "") + "\u2026";
    }
    return lines.length ? lines : [String(text)];
  }
  function overlapArea(a, b) {
    var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    var h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  }
  function screenBoxes() {
    var out = [];
    (state.project.screens || []).forEach(function(s) {
      if (state.focus && !state.focus.visible[s.id]) return;
      var el2 = state.screenEls[s.id];
      var p = state.positions[s.id];
      if (!el2 || !p) return;
      out.push({ x: p.x - 6, y: p.y - 6, w: el2.offsetWidth + 12, h: el2.offsetHeight + 12 });
    });
    return out;
  }
  var KIND_PRIORITY = { main: 0, default: 1, nav: 2 };
  var CODE_FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  var codeWidthCache = {};
  function measureCode(text, fontSize) {
    var key = fontSize + "|" + text;
    if (codeWidthCache[key] !== void 0) return codeWidthCache[key];
    var w;
    if (measureCtx === void 0) {
      try {
        measureCtx = document.createElement("canvas").getContext("2d");
      } catch (e) {
        measureCtx = null;
      }
    }
    if (measureCtx) {
      measureCtx.font = fontSize + "px " + CODE_FONT;
      w = measureCtx.measureText(text).width;
    } else w = text.length * fontSize * 0.6;
    codeWidthCache[key] = w;
    return w;
  }
  function wrapCode(text, fontSize) {
    var parts = String(text).split(/\s·\s/);
    var out = [];
    parts.forEach(function(p) {
      if (measureCode(p, fontSize) <= LABEL_MAX_W + 40) {
        out.push(p);
        return;
      }
      var words = p.split(/\s+/), cur = "";
      words.forEach(function(wd) {
        var next = cur ? cur + " " + wd : wd;
        if (cur && measureCode(next, fontSize) > LABEL_MAX_W + 40) {
          out.push(cur);
          cur = wd;
        } else cur = next;
      });
      if (cur) out.push(cur);
    });
    return out.slice(0, 4);
  }
  function drawDetailCard(ns, g, job, at, bw, bh, lines, lineH, fontSize, bold, apiLines, codeSize, noteLines, noteSize, tint) {
    var x0 = at.x - bw / 2, y0 = at.y - bh / 2;
    var accent = tint ? tint.stroke : job.kind === "main" ? "#374151" : "#9ca3af";
    var fill = tint ? tint.fill : "#ffffff";
    var bg = document.createElementNS(ns, "rect");
    bg.setAttribute("x", String(x0));
    bg.setAttribute("y", String(y0));
    bg.setAttribute("width", String(bw));
    bg.setAttribute("height", String(bh));
    bg.setAttribute("rx", "6");
    bg.setAttribute("ry", "6");
    bg.setAttribute("class", "fb-arrow-label-bg");
    bg.setAttribute("fill", fill);
    bg.setAttribute("stroke", accent);
    bg.setAttribute("stroke-width", "1");
    g.appendChild(bg);
    var y = y0 + 8;
    var title = document.createElementNS(ns, "text");
    title.setAttribute("class", "fb-arrow-label");
    title.setAttribute("fill", "#1f2937");
    title.setAttribute("font-size", String(fontSize));
    title.setAttribute("font-weight", bold ? "700" : "600");
    title.setAttribute("font-family", LABEL_FONT_FAMILY);
    title.setAttribute("text-anchor", "start");
    title.style.textAnchor = "start";
    title.setAttribute("x", String(x0 + 10));
    lines.forEach(function(l, i) {
      var ts = document.createElementNS(ns, "tspan");
      ts.setAttribute("x", String(x0 + 10));
      ts.setAttribute("y", String(y + i * lineH + lineH * 0.78));
      ts.textContent = l;
      title.appendChild(ts);
    });
    g.appendChild(title);
    y += lines.length * lineH + 4;
    apiLines.forEach(function(l) {
      var cw = measureCode(l, codeSize) + 8, ch = codeSize + 5;
      var chip = document.createElementNS(ns, "rect");
      chip.setAttribute("x", String(x0 + 10));
      chip.setAttribute("y", String(y));
      chip.setAttribute("width", String(cw));
      chip.setAttribute("height", String(ch - 1));
      chip.setAttribute("rx", "3");
      chip.setAttribute("fill", tint ? "#ffffff" : "#f1f2f5");
      g.appendChild(chip);
      var t = document.createElementNS(ns, "text");
      t.setAttribute("class", "fb-arrow-detail");
      t.setAttribute("x", String(x0 + 14));
      t.setAttribute("y", String(y + ch * 0.72));
      t.setAttribute("font-size", String(codeSize));
      t.setAttribute("font-family", CODE_FONT);
      t.setAttribute("fill", "#111827");
      t.textContent = l;
      g.appendChild(t);
      y += ch;
    });
    if (noteLines.length) {
      y += 3;
      var n = document.createElementNS(ns, "text");
      n.setAttribute("class", "fb-arrow-note");
      n.setAttribute("font-size", String(noteSize));
      n.setAttribute("font-family", LABEL_FONT_FAMILY);
      n.setAttribute("fill", "#6b7280");
      noteLines.forEach(function(l, i) {
        var ts = document.createElementNS(ns, "tspan");
        ts.setAttribute("x", String(x0 + 10));
        ts.setAttribute("y", String(y + i * (noteSize + 3) + noteSize * 0.8));
        ts.textContent = l;
        n.appendChild(ts);
      });
      g.appendChild(n);
    }
  }
  var TINTS = {
    indigo: { fill: "#eef0ff", stroke: "#6366f1" },
    amber: { fill: "#fff4d6", stroke: "#d97706" },
    green: { fill: "#e6f4ea", stroke: "#1a7f37" },
    red: { fill: "#fdecea", stroke: "#dc2626" },
    grey: { fill: "#f3f4f6", stroke: "#6b7280" },
    teal: { fill: "#e0f7f4", stroke: "#0f766e" },
    pink: { fill: "#fce7f3", stroke: "#db2777" }
  };
  function arrowTint(color) {
    if (!color) return null;
    if (TINTS[color]) return TINTS[color];
    var hex = /^#([0-9a-f]{6})$/i.test(color) ? color + "1f" : color;
    return { fill: hex, stroke: color };
  }
  function labelMetrics(arrow) {
    if (!arrow.label && !arrow.detail) return null;
    var kind = arrow.kind || "default";
    var bold = kind === "main";
    var fontSize = kind === "nav" ? 10 : 11;
    var lineH = Math.round(fontSize * 1.3);
    var lines = arrow.label ? wrapLabel(arrow.label, fontSize, bold) : [];
    var w = 0;
    lines.forEach(function(l) {
      w = Math.max(w, measureLabel(l, fontSize, bold));
    });
    var bw = w + 10, bh = Math.max(1, lines.length) * lineH + 6;
    var isCard = !!arrow.detail;
    var codeSize = 10, noteSize = 10;
    var codeLines = [], noteLines = [];
    if (isCard) {
      codeLines = wrapCode(arrow.detail, codeSize);
      if (arrow.note) noteLines = wrapLabel(arrow.note, noteSize, false);
      codeLines.forEach(function(l) {
        w = Math.max(w, measureCode(l, codeSize) + 8);
      });
      noteLines.forEach(function(l) {
        w = Math.max(w, measureLabel(l, noteSize, false));
      });
      bw = w + 20;
      bh = 8 + lines.length * lineH + 4 + codeLines.length * (codeSize + 5) + (noteLines.length ? 3 + noteLines.length * (noteSize + 3) : 0) + 8;
    }
    return { w: bw, h: bh, isCard, lines, lineH, fontSize, bold, codeLines, codeSize, noteLines, noteSize };
  }
  function placeLabels(ns, jobs) {
    if (!jobs.length) return;
    var screens = screenBoxes();
    var placed = [];
    jobs.sort(function(a, b) {
      return KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind];
    });
    jobs.forEach(function(job) {
      var kind = job.kind;
      var m = labelMetrics(job.arrow);
      if (!m) return;
      var bold = m.bold, fontSize = m.fontSize, lineH = m.lineH, lines = m.lines;
      var bw = m.w, bh = m.h, isCard = m.isCard;
      var apiLines = m.codeLines, codeSize = m.codeSize, noteLines = m.noteLines, noteSize = m.noteSize;
      var tint = arrowTint(job.arrow.color);
      var best = null, bestScore = Infinity;
      for (var k = 0; k < LABEL_TS.length; k++) {
        var pt = bezierPoint(job.start, job.cp1, job.cp2, job.end, LABEL_TS[k]);
        var box2 = { x: pt.x - bw / 2, y: pt.y - bh / 2, w: bw, h: bh };
        var score = 0;
        for (var si = 0; si < screens.length; si++) score += overlapArea(box2, screens[si]) * 3;
        for (var li = 0; li < placed.length; li++) score += overlapArea(box2, placed[li]);
        if (score < bestScore) {
          bestScore = score;
          best = pt;
        }
        if (score === 0) break;
      }
      if (kind !== "nav") placed.push({ x: best.x - bw / 2, y: best.y - bh / 2, w: bw, h: bh });
      var labelGroup = document.createElementNS(ns, "g");
      labelGroup.setAttribute("class", "fb-arrow-label-group" + (isCard ? " fb-arrow-card" : "") + (job.dimmed ? " fb-arrow-dimmed" : ""));
      if (isCard) {
        drawDetailCard(ns, labelGroup, job, best, bw, bh, lines, lineH, fontSize, bold, apiLines, codeSize, noteLines, noteSize, tint);
        job.g.appendChild(labelGroup);
        return;
      }
      var bgRect = document.createElementNS(ns, "rect");
      bgRect.setAttribute("x", String(best.x - bw / 2));
      bgRect.setAttribute("y", String(best.y - bh / 2));
      bgRect.setAttribute("width", String(bw));
      bgRect.setAttribute("height", String(bh));
      bgRect.setAttribute("class", "fb-arrow-label-bg");
      bgRect.setAttribute("fill", tint ? tint.fill : kind === "main" ? "#ffffff" : "#f0f2f5");
      if (tint) {
        bgRect.setAttribute("stroke", tint.stroke);
        bgRect.setAttribute("stroke-width", "1");
      } else if (kind === "main") {
        bgRect.setAttribute("stroke", "#374151");
        bgRect.setAttribute("stroke-width", "1");
      }
      bgRect.setAttribute("rx", "4");
      bgRect.setAttribute("ry", "4");
      var text = document.createElementNS(ns, "text");
      text.setAttribute("class", "fb-arrow-label");
      text.setAttribute("fill", kind === "main" ? "#1f2937" : "#555");
      text.setAttribute("font-size", String(fontSize));
      if (bold) text.setAttribute("font-weight", "600");
      text.setAttribute("font-family", LABEL_FONT_FAMILY);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "central");
      text.setAttribute("x", String(best.x));
      var y0 = best.y - (lines.length - 1) * lineH / 2;
      if (lines.length === 1) {
        text.setAttribute("y", String(best.y));
        text.textContent = lines[0];
      } else {
        text.setAttribute("y", String(y0));
        lines.forEach(function(l, idx) {
          var ts = document.createElementNS(ns, "tspan");
          ts.setAttribute("x", String(best.x));
          ts.setAttribute("y", String(y0 + idx * lineH));
          ts.textContent = l;
          text.appendChild(ts);
        });
      }
      labelGroup.appendChild(bgRect);
      labelGroup.appendChild(text);
      job.g.appendChild(labelGroup);
    });
  }
  function drawArrows(skipHandles) {
    if (!state.svgEl || !state.project) return;
    var arrows = state.project.arrows || [];
    var ns = "http://www.w3.org/2000/svg";
    var spreadMap = buildSpreadMap();
    state.svgEl.innerHTML = "";
    var defs = document.createElementNS(ns, "defs");
    defs.appendChild(makeMarker(ns, "fb-arrowhead", 14, KIND_STYLE.default.color));
    defs.appendChild(makeMarker(ns, "fb-arrowhead-main", 16, KIND_STYLE.main.color));
    defs.appendChild(makeMarker(ns, "fb-arrowhead-nav", 10, KIND_STYLE.nav.color));
    state.svgEl.appendChild(defs);
    var byScreen = {};
    state.arrowGroupsByScreen = byScreen;
    hlGroups = [];
    var labelJobs = [];
    var order = arrows.map(function(_a, i) {
      return i;
    });
    order.sort(function(a, b) {
      return KIND_RANK[arrows[a].kind || "default"] - KIND_RANK[arrows[b].kind || "default"] || a - b;
    });
    order.forEach(function(idx) {
      var arrow = arrows[idx];
      var fromEl = state.screenEls[arrow.from];
      var toEl = state.screenEls[arrow.to];
      if (!fromEl || !toEl) return;
      if (!isArrowShown(arrow)) return;
      var kind = arrow.kind || "default";
      var style = KIND_STYLE[kind];
      var sides = resolveArrowSides(arrow, idx, spreadMap);
      var start = getAnchor(arrow.from, sides.from);
      var end = getAnchor(arrow.to, sides.to);
      var cps = computeControlPoints(start, end, sides.from, sides.to);
      var cp1 = cps.cp1;
      var cp2 = cps.cp2;
      var d = "M" + start.x + "," + start.y + " C" + cp1.x + "," + cp1.y + " " + cp2.x + "," + cp2.y + " " + end.x + "," + end.y;
      var isDimmed = state.hiddenScreens[arrow.from] || state.hiddenScreens[arrow.to];
      var g = document.createElementNS(ns, "g");
      g.setAttribute("class", "fb-arrow-group fb-arrow-" + kind + (isDimmed ? " fb-arrow-dimmed" : ""));
      g.setAttribute("data-from", arrow.from);
      g.setAttribute("data-to", arrow.to);
      (byScreen[arrow.from] = byScreen[arrow.from] || []).push(g);
      if (arrow.to !== arrow.from) (byScreen[arrow.to] = byScreen[arrow.to] || []).push(g);
      var path = document.createElementNS(ns, "path");
      path.setAttribute("d", d);
      path.setAttribute("class", "fb-arrow-path" + (arrow.dashed ? " fb-dashed" : ""));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", style.color);
      path.setAttribute("stroke-width", style.width);
      if (arrow.dashed) {
        path.setAttribute("stroke-dasharray", "6 4");
      }
      path.setAttribute("marker-end", "url(#" + style.marker + ")");
      g.appendChild(path);
      var hitPath = document.createElementNS(ns, "path");
      hitPath.setAttribute("d", d);
      hitPath.setAttribute("class", "fb-arrow-hit");
      hitPath.setAttribute("fill", "none");
      hitPath.setAttribute("stroke", "transparent");
      hitPath.setAttribute("stroke-width", "16");
      hitPath.setAttribute("pointer-events", "stroke");
      hitPath.style.cursor = "pointer";
      (function(arrowIdx) {
        hitPath.addEventListener("click", function(e) {
          e.stopPropagation();
          showArrowPopup(e, arrowIdx);
        });
      })(idx);
      g.appendChild(hitPath);
      state.svgEl.appendChild(g);
      if (arrow.label || arrow.detail) {
        labelJobs.push({ g, arrow, kind, start, cp1, cp2, end, dimmed: !!isDimmed });
      }
    });
    placeLabels(ns, labelJobs);
    applyArrowHighlight();
    if (!skipHandles) {
      updateHandles();
    }
  }
  var drawPending = false;
  var pendingSkip = false;
  function scheduleDrawArrows(skipHandles) {
    pendingSkip = !!skipHandles;
    if (drawPending) return;
    drawPending = true;
    var raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : function(f) {
      return setTimeout(f, 16);
    };
    raf(function() {
      if (!drawPending) return;
      drawPending = false;
      drawArrows(pendingSkip);
    });
  }
  function flushDrawArrows() {
    if (!drawPending) return;
    drawPending = false;
    drawArrows(pendingSkip);
  }
  function setHighlightedScreen(screenId) {
    state.highlightScreen = screenId;
    applyArrowHighlight();
  }
  var hlGroups = [];
  function applyArrowHighlight() {
    if (!state.svgEl) return;
    var id = state.highlightScreen;
    for (var i = 0; i < hlGroups.length; i++) hlGroups[i].classList.remove("fb-arrow-hl");
    hlGroups = id && state.arrowGroupsByScreen && state.arrowGroupsByScreen[id] || [];
    for (var j = 0; j < hlGroups.length; j++) hlGroups[j].classList.add("fb-arrow-hl");
    state.svgEl.classList.toggle("fb-hl-active", !!id && hlGroups.length > 0);
  }
  function updateHandles() {
    state.handleEls.forEach(function(el2) {
      if (el2.parentNode) el2.parentNode.removeChild(el2);
    });
    state.handleEls = [];
    if (!state.project) return;
    var arrows = state.project.arrows || [];
    var spreadMap = buildSpreadMap();
    arrows.forEach(function(arrow, idx) {
      var fromEl = state.screenEls[arrow.from];
      var toEl = state.screenEls[arrow.to];
      if (!fromEl || !toEl) return;
      if (state.hiddenScreens[arrow.from] || state.hiddenScreens[arrow.to]) return;
      if (!isArrowShown(arrow)) return;
      var sides = resolveArrowSides(arrow, idx, spreadMap);
      var start = getAnchor(arrow.from, sides.from);
      var end = getAnchor(arrow.to, sides.to);
      [
        { pt: start, end: "from", screenId: arrow.from },
        { pt: end, end: "to", screenId: arrow.to }
      ].forEach(function(cfg) {
        var h = document.createElement("div");
        h.className = "fb-arrow-handle";
        h.style.left = cfg.pt.x - 8 + "px";
        h.style.top = cfg.pt.y - 8 + "px";
        h.dataset.arrowIndex = String(idx);
        h.dataset.arrowEnd = cfg.end;
        h.dataset.screenId = cfg.screenId;
        state.canvasEl.appendChild(h);
        state.handleEls.push(h);
      });
    });
  }

  // src/flowml/parse.ts
  var FLAGS = { h: true };
  function unquote(v) {
    v = v.trim();
    if (v.length >= 2 && v.charAt(0) === '"' && v.charAt(v.length - 1) === '"') {
      return v.slice(1, -1).replace(/\\(.)/g, function(_m, c) {
        return c === "n" ? "\n" : c;
      });
    }
    return v;
  }
  function splitAttrs(s) {
    var parts = [];
    var cur = "";
    var inQ = false;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === '"' && s.charAt(i - 1) !== "\\") inQ = !inQ;
      if (ch === "," && !inQ) {
        parts.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    parts.push(cur);
    return parts.map(function(p) {
      return p.trim();
    }).filter(function(p) {
      return p !== "";
    });
  }
  function parseAttrs(attrParts) {
    var attrs = {};
    attrParts.forEach(function(p) {
      var eq = p.indexOf("=");
      if (eq === -1) {
        if (FLAGS[p]) attrs[p] = true;
      } else attrs[p.slice(0, eq).trim()] = unquote(p.slice(eq + 1));
    });
    return attrs;
  }
  var ENDPOINT = '"(?:\\\\.|[^"])*"|[^\\s,"]+';
  var ARROW_RE = new RegExp("^(" + ENDPOINT + ")\\s*(-->|->)\\s*(" + ENDPOINT + ")(?:\\s*,\\s*(.*))?$");
  function parse(text) {
    var project = { name: "", epics: [], screens: [], arrows: [] };
    var positions = {};
    var errors = [];
    function addScreen(body) {
      var sparts = splitAttrs(body);
      var idRaw = sparts.shift();
      if (!idRaw) return null;
      var id = unquote(idRaw);
      var sa = parseAttrs(sparts);
      var screen = { id };
      if (sa.t) screen.title = sa.t;
      if (sa.p) screen.preset = sa.p;
      if (sa.f) screen.format = sa.f;
      if (sa.e) {
        var known = project.epics.some(function(ep) {
          return ep.id === sa.e;
        });
        setEpicList(screen, known ? [sa.e] : String(sa.e).split(/\s+/));
      }
      if (sa.n) screen.notes = sa.n;
      if (sa.sz) screen.size = sa.sz;
      if (sa.w !== void 0) {
        var w = parseFloat(sa.w);
        if (!isNaN(w)) screen.width = w;
      }
      if (sa.hg !== void 0) {
        var hh = parseFloat(sa.hg);
        if (!isNaN(hh)) screen.height = hh;
      }
      if (sa.h) screen.hidden = true;
      if (sa.x !== void 0 || sa.y !== void 0) {
        positions[id] = { x: parseFloat(sa.x) || 0, y: parseFloat(sa.y) || 0 };
      }
      project.screens.push(screen);
      return screen;
    }
    var lines = text.replace(/\r\n?/g, "\n").split("\n");
    var lastScreen = null;
    var i = 0;
    while (i < lines.length) {
      var line = lines[i].trim();
      var lineNo = i + 1;
      var c0 = line.charAt(0);
      if (line === "" || c0 === "#") {
        i++;
        continue;
      }
      if (/^`{3,}$/.test(line)) {
        var fence = line;
        var html = [];
        i++;
        while (i < lines.length && lines[i].trim() !== fence) {
          html.push(lines[i]);
          i++;
        }
        i++;
        if (lastScreen) lastScreen.content = html.join("\n");
        else errors.push({ line: lineNo, msg: "HTML block without a preceding screen" });
        continue;
      }
      if (c0 === "!") {
        var dm = line.slice(1).match(/^\s*([a-zA-Z]+)\s*=\s*(.*)$/);
        if (dm && dm[1] === "name") project.name = unquote(dm[2]);
        else errors.push({ line: lineNo, msg: "unknown directive" });
        i++;
        continue;
      }
      if (c0 === ":") {
        var ps = addScreen(line.slice(1));
        if (ps) lastScreen = ps;
        else errors.push({ line: lineNo, msg: "invalid screen" });
        i++;
        continue;
      }
      if (c0 === "@") {
        var eparts = splitAttrs(line.slice(1));
        var epic = { id: unquote(eparts.shift() || ""), label: "", color: "" };
        var ea = parseAttrs(eparts);
        if (ea.t) epic.label = ea.t;
        if (ea.c) epic.color = ea.c;
        project.epics.push(epic);
        lastScreen = null;
        i++;
        continue;
      }
      var am = line.match(ARROW_RE);
      if (am) {
        var arrow = { from: unquote(am[1]), to: unquote(am[3]) };
        if (am[2] === "-->") arrow.dashed = true;
        var aattrs = am[4] ? parseAttrs(splitAttrs(am[4])) : {};
        if (aattrs.l) arrow.label = aattrs.l;
        if (aattrs.fs) arrow.fromSide = aattrs.fs;
        if (aattrs.ts) arrow.toSide = aattrs.ts;
        if (aattrs.k === "main" || aattrs.k === "nav") arrow.kind = aattrs.k;
        if (aattrs.d) arrow.detail = aattrs.d;
        if (aattrs.n) arrow.note = aattrs.n;
        if (aattrs.c) arrow.color = aattrs.c;
        project.arrows.push(arrow);
        lastScreen = null;
        i++;
        continue;
      }
      errors.push({ line: lineNo, msg: "unrecognized line" });
      lastScreen = null;
      i++;
    }
    return { project, positions, errors };
  }

  // src/interactions/arrow-drag.ts
  function initArrowDrag() {
    state.canvasEl.addEventListener("mousedown", function(e) {
      if (state.creatingArrow) return;
      var handle = e.target.closest(".fb-arrow-handle");
      if (!handle) return;
      closeArrowPopup();
      closeScreenPopup();
      e.stopPropagation();
      e.preventDefault();
      var arrowIdx = parseInt(handle.dataset.arrowIndex, 10);
      var arrow = state.project.arrows[arrowIdx];
      var end = handle.dataset.arrowEnd;
      var screenId = handle.dataset.screenId;
      if (!arrow.fromSide || !arrow.toSide) {
        var spread = buildSpreadMap();
        if (spread[arrowIdx]) {
          arrow.fromSide = spread[arrowIdx].from;
          arrow.toSide = spread[arrowIdx].to;
        } else {
          var fe = state.screenEls[arrow.from];
          var te = state.screenEls[arrow.to];
          if (fe && te) {
            var auto = getBestSides(fe, te);
            arrow.fromSide = auto.from;
            arrow.toSide = auto.to;
          } else {
            arrow.fromSide = "right";
            arrow.toSide = "left";
          }
        }
      }
      state.draggingHandle = { arrowIdx, end, el: handle, screenId };
      state.wrapperEl.classList.add("fb-dragging-handle");
    });
    document.addEventListener("mousemove", function(e) {
      if (!state.draggingHandle) return;
      var wrapperRect = state.wrapperEl.getBoundingClientRect();
      var canvasX = (e.clientX - wrapperRect.left - state.panX) / state.zoom;
      var canvasY = (e.clientY - wrapperRect.top - state.panY) / state.zoom;
      var screenId = state.draggingHandle.screenId;
      var anchors = getAllAnchorPoints(screenId);
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
      state.draggingHandle.el.style.left = bestAnchor.x - 8 + "px";
      state.draggingHandle.el.style.top = bestAnchor.y - 8 + "px";
      var arrow = state.project.arrows[state.draggingHandle.arrowIdx];
      var prop = state.draggingHandle.end === "from" ? "fromSide" : "toSide";
      arrow[prop] = bestAnchor.name;
      drawArrows(true);
    });
    document.addEventListener("mouseup", function() {
      if (!state.draggingHandle) return;
      saveArrowMutations();
      updateHandles();
      state.draggingHandle = null;
      state.wrapperEl.classList.remove("fb-dragging-handle");
    });
  }

  // src/interactions/create.ts
  var createCounter = 0;
  function screenExists(id) {
    var screens = state.project && state.project.screens || [];
    for (var i = 0; i < screens.length; i++) if (screens[i].id === id) return true;
    return false;
  }
  function uniqueId() {
    var id;
    do {
      createCounter++;
      id = "screen-" + createCounter;
    } while (state.screenEls[id] || screenExists(id));
    return id;
  }
  function createScreen(preset, clientX, clientY) {
    if (!state.project) return "";
    var wrapperRect = state.wrapperEl.getBoundingClientRect();
    var x = Math.max(0, Math.min(CANVAS_W - 50, (clientX - wrapperRect.left - state.panX) / state.zoom));
    var y = Math.max(0, Math.min(CANVAS_H - 50, (clientY - wrapperRect.top - state.panY) / state.zoom));
    if (!state.project.screens) state.project.screens = [];
    var id = uniqueId();
    var screen = { id, title: "Screen " + createCounter, preset, format: "desktop" };
    state.project.screens.push(screen);
    state.positions[id] = { x, y };
    var el2 = renderScreen(screen);
    state.canvasEl.appendChild(el2);
    drawArrows();
    savePositions();
    return id;
  }
  function initCreateMenu() {
    state.wrapperEl.addEventListener("contextmenu", function(e) {
      if (state.creatingArrow) return;
      var target = e.target;
      if (target.closest(".fb-screen, .fb-arrow-handle, .fb-anchor-dot, .fb-ctx-menu, .fb-screen-popup, .fb-arrow-popup, .fb-mode-switch")) {
        return;
      }
      e.preventDefault();
      var cx = e.clientX;
      var cy = e.clientY;
      showContextMenu(cx, cy, [{
        label: "Create screen",
        icon: ICON_PLUS,
        testid: "create-screen",
        onClick: function() {
          showPresetPicker(cx, cy, function(preset) {
            createScreen(preset, cx, cy);
          });
        }
      }]);
    });
  }

  // src/interactions/drag.ts
  function updateSelectionStyles() {
    for (var id in state.screenEls) {
      var el2 = state.screenEls[id];
      if (!el2) continue;
      if (state.selected[id]) {
        el2.classList.add("fb-selected");
      } else {
        el2.classList.remove("fb-selected");
      }
    }
  }
  function startScreenDrag(e) {
    hideAnchorDots();
    var wrapperRect = state.wrapperEl.getBoundingClientRect();
    var startCanvas = {
      x: (e.clientX - wrapperRect.left - state.panX) / state.zoom,
      y: (e.clientY - wrapperRect.top - state.panY) / state.zoom
    };
    var ids;
    if (state.mode === "select" && Object.keys(state.selected).length) {
      ids = Object.keys(state.selected);
    } else {
      var target = e.target.closest(".fb-screen");
      ids = target ? [target.dataset.screenId] : [];
    }
    var items = [];
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      if (state.hiddenScreens[id]) continue;
      var el2 = state.screenEls[id];
      if (!el2) continue;
      var pos = state.positions[id] || { x: 0, y: 0 };
      el2.classList.add("fb-dragging");
      items.push({ id, el: el2, startX: pos.x, startY: pos.y });
      if (pos.x < minX) minX = pos.x;
      if (pos.y < minY) minY = pos.y;
      if (pos.x > maxX) maxX = pos.x;
      if (pos.y > maxY) maxY = pos.y;
    }
    if (!items.length) return;
    state.screenDrag = {
      startCanvas,
      items,
      bounds: { minX, minY, maxX, maxY }
    };
    state.wrapperEl.classList.add("fb-dragging-screen");
  }
  function initDrag() {
    state.canvasEl.addEventListener("mousedown", function(e) {
      closeArrowPopup();
      closeScreenPopup();
      if (state.creatingArrow) return;
      if (e.button !== 0) return;
      var screenEl = e.target.closest(".fb-screen");
      if (!screenEl) return;
      var id = screenEl.dataset.screenId;
      if (state.hiddenScreens[id]) return;
      e.stopPropagation();
      e.preventDefault();
      if (state.mode === "select") {
        if (e.metaKey || e.ctrlKey || e.shiftKey) {
          toggleSelection(state.selected, id);
          updateSelectionStyles();
          return;
        }
        if (!state.selected[id]) {
          state.selected = {};
          state.selected[id] = true;
          updateSelectionStyles();
        }
      }
      startScreenDrag(e);
    });
    document.addEventListener("mousemove", function(e) {
      if (!state.screenDrag) return;
      var wrapperRect = state.wrapperEl.getBoundingClientRect();
      var cmx = (e.clientX - wrapperRect.left - state.panX) / state.zoom;
      var cmy = (e.clientY - wrapperRect.top - state.panY) / state.zoom;
      var dx = cmx - state.screenDrag.startCanvas.x;
      var dy = cmy - state.screenDrag.startCanvas.y;
      var b = state.screenDrag.bounds;
      dx = Math.max(-b.minX, Math.min(CANVAS_W - 50 - b.maxX, dx));
      dy = Math.max(-b.minY, Math.min(CANVAS_H - 50 - b.maxY, dy));
      var items = state.screenDrag.items;
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var newX = it.startX + dx;
        var newY = it.startY + dy;
        it.el.style.left = newX + "px";
        it.el.style.top = newY + "px";
        state.positions[it.id] = { x: newX, y: newY };
      }
      scheduleDrawArrows(!!state.draggingHandle);
    });
    document.addEventListener("mouseup", function(e) {
      if (!state.screenDrag) return;
      var items = state.screenDrag.items;
      for (var i = 0; i < items.length; i++) {
        items[i].el.classList.remove("fb-dragging");
      }
      var singleId = items.length === 1 ? items[0].id : null;
      state.screenDrag = null;
      state.wrapperEl.classList.remove("fb-dragging-screen");
      flushDrawArrows();
      savePositions();
      if (singleId) {
        var elUnder = document.elementFromPoint(e.clientX, e.clientY);
        var screenUnder = elUnder && elUnder.closest(".fb-screen");
        if (screenUnder && screenUnder.dataset.screenId === singleId) {
          showAnchorDots(singleId);
        }
      }
    });
  }

  // src/layout.ts
  function bfsDepth(screens, arrows) {
    var children = {};
    var hasParent = {};
    screens.forEach(function(s) {
      children[s.id] = [];
    });
    arrows.forEach(function(a) {
      if (children[a.from]) children[a.from].push(a.to);
      hasParent[a.to] = true;
    });
    var roots = screens.filter(function(s) {
      return !hasParent[s.id];
    }).map(function(s) {
      return s.id;
    });
    if (roots.length === 0 && screens.length > 0) roots = [screens[0].id];
    var col = {};
    var visited = {};
    var queue = [];
    roots.forEach(function(r) {
      queue.push(r);
      col[r] = 0;
      visited[r] = true;
    });
    while (queue.length > 0) {
      var cur = queue.shift();
      (children[cur] || []).forEach(function(child) {
        if (!visited[child]) {
          visited[child] = true;
          col[child] = (col[cur] || 0) + 1;
          queue.push(child);
        }
      });
    }
    screens.forEach(function(s) {
      if (col[s.id] === void 0) col[s.id] = 0;
    });
    return col;
  }
  function centerPositions(positions, screens, totalW, totalH) {
    var cx = Math.max(0, Math.round((CANVAS_W - totalW) / 2));
    var cy = Math.max(0, Math.round((CANVAS_H - totalH) / 2));
    screens.forEach(function(s) {
      if (positions[s.id]) {
        positions[s.id].x += cx;
        positions[s.id].y += cy;
      }
    });
  }
  function layoutArrows(arrows) {
    var core = arrows.filter(function(a) {
      return a.kind !== "nav";
    });
    return core.length ? core : arrows;
  }
  function orderColumns(columns, colKeys, arrows, col) {
    var nb = {};
    arrows.forEach(function(a) {
      if (a.from === a.to) return;
      (nb[a.from] = nb[a.from] || []).push(a.to);
      (nb[a.to] = nb[a.to] || []).push(a.from);
    });
    var rank = {};
    function reindex(c) {
      var list = columns[c];
      list.forEach(function(s, i) {
        rank[s.id] = (i + 0.5) / list.length;
      });
    }
    colKeys.forEach(reindex);
    function sweep(keys, dir) {
      keys.forEach(function(c) {
        var list = columns[c];
        var bary = {};
        list.forEach(function(s) {
          var ns = (nb[s.id] || []).filter(function(n) {
            return col[n] === c + dir;
          });
          if (!ns.length) {
            bary[s.id] = rank[s.id];
            return;
          }
          var sum = 0;
          ns.forEach(function(n) {
            sum += rank[n];
          });
          bary[s.id] = sum / ns.length;
        });
        var idx = {};
        list.forEach(function(s, i) {
          idx[s.id] = i;
        });
        list.sort(function(a, b) {
          return bary[a.id] - bary[b.id] || idx[a.id] - idx[b.id];
        });
        reindex(c);
      });
    }
    var down = colKeys.slice(1);
    var up = colKeys.slice(0, -1).reverse();
    for (var it = 0; it < 4; it++) {
      sweep(down, -1);
      sweep(up, 1);
    }
  }
  var MAX_PER_COLUMN = 6;
  var MAX_PER_ROW = 8;
  var EPIC_ROW_GAP = GAP_Y * 2 + 40;
  var LABEL_MARGIN = 36;
  function arrowRoom(a) {
    var m = labelMetrics(a);
    if (!m) return { w: 0, h: 0 };
    return { w: m.w + LABEL_MARGIN * 2, h: m.h + LABEL_MARGIN * 2 };
  }
  function spacingFactor() {
    var f = state.spacing;
    return typeof f === "number" && f > 0 ? f : 1;
  }
  function heightOf(s, heights) {
    return heights && heights[s.id] ? heights[s.id] : 200;
  }
  function placeGrid(cells, arrows, heights, baseGapX, baseGapY) {
    var gx = (baseGapX === void 0 ? GAP_X : baseGapX) * spacingFactor();
    var gy = (baseGapY === void 0 ? GAP_Y : baseGapY) * spacingFactor();
    var nRows = cells.length;
    var nCols = 0;
    cells.forEach(function(r2) {
      if (r2.length > nCols) nCols = r2.length;
    });
    var colW = [], rowH = [];
    var colOf = {}, rowOf = {};
    for (var c = 0; c < nCols; c++) colW[c] = 0;
    for (var r = 0; r < nRows; r++) {
      rowH[r] = 0;
      for (var c2 = 0; c2 < cells[r].length; c2++) {
        var s = cells[r][c2];
        if (!s) continue;
        colOf[s.id] = c2;
        rowOf[s.id] = r;
        colW[c2] = Math.max(colW[c2], screenWidth(s));
        rowH[r] = Math.max(rowH[r], heightOf(s, heights));
      }
    }
    var gapX = [], gapY = [];
    for (var i = 0; i < nCols; i++) gapX[i] = gx;
    for (var j = 0; j < nRows; j++) gapY[j] = gy;
    arrows.forEach(function(a) {
      if (colOf[a.from] === void 0 || colOf[a.to] === void 0) return;
      var room = arrowRoom(a);
      if (!room.w) return;
      var c1 = colOf[a.from], c22 = colOf[a.to];
      if (Math.abs(c1 - c22) === 1) {
        var ci = Math.min(c1, c22);
        gapX[ci] = Math.max(gapX[ci], room.w);
      }
      var r1 = rowOf[a.from], r2 = rowOf[a.to];
      if (c1 === c22 && Math.abs(r1 - r2) === 1) {
        var ri = Math.min(r1, r2);
        gapY[ri] = Math.max(gapY[ri], room.h);
      } else if (Math.abs(r1 - r2) === 1) {
        var ri2 = Math.min(r1, r2);
        gapY[ri2] = Math.max(gapY[ri2], Math.min(room.h, gy * 2));
      }
    });
    var colX = [], rowY = [];
    var x = 0;
    for (var c3 = 0; c3 < nCols; c3++) {
      colX[c3] = x;
      x += colW[c3] + gapX[c3];
    }
    var y = 0;
    for (var r3 = 0; r3 < nRows; r3++) {
      rowY[r3] = y;
      y += rowH[r3] + gapY[r3];
    }
    var positions = {};
    var all = [];
    cells.forEach(function(row, r4) {
      row.forEach(function(s2, c4) {
        if (!s2) return;
        positions[s2.id] = { x: colX[c4], y: rowY[r4] };
        all.push(s2);
      });
    });
    var totalW = nCols ? colX[nCols - 1] + colW[nCols - 1] : 0;
    var totalH = nRows ? rowY[nRows - 1] + rowH[nRows - 1] : 0;
    centerPositions(positions, all, totalW, totalH);
    return positions;
  }
  function columnsToCells(columns) {
    var nRows = 0;
    columns.forEach(function(c2) {
      if (c2.length > nRows) nRows = c2.length;
    });
    var cells = [];
    for (var r = 0; r < nRows; r++) {
      cells[r] = [];
      for (var c = 0; c < columns.length; c++) cells[r][c] = columns[c][r] || null;
    }
    return cells;
  }
  function autoLayout(screens, arrows, heights) {
    var core = layoutArrows(arrows);
    var col = bfsDepth(screens, core);
    var columns = {};
    screens.forEach(function(s) {
      var c = col[s.id];
      if (!columns[c]) columns[c] = [];
      columns[c].push(s);
    });
    var colKeys = Object.keys(columns).map(Number).sort(function(a, b) {
      return a - b;
    });
    orderColumns(columns, colKeys, core, col);
    var split = [];
    colKeys.forEach(function(c) {
      var list = columns[c];
      var parts = Math.ceil(list.length / MAX_PER_COLUMN);
      var per = Math.ceil(list.length / parts);
      for (var i = 0; i < list.length; i += per) split.push(list.slice(i, i + per));
    });
    return placeGrid(columnsToCells(split), arrows, heights);
  }
  function layoutByEpics(screens, arrows, heights) {
    var epicGroups = {};
    var epicOrder = [];
    screens.forEach(function(s) {
      var eid = s.epic || "_none";
      if (!epicGroups[eid]) {
        epicGroups[eid] = [];
        epicOrder.push(eid);
      }
      epicGroups[eid].push(s);
    });
    var col = bfsDepth(screens, layoutArrows(arrows));
    var rows = [];
    epicOrder.forEach(function(eid) {
      var group = epicGroups[eid].slice();
      var idx = {};
      group.forEach(function(s, i2) {
        idx[s.id] = i2;
      });
      group.sort(function(a, b) {
        return (col[a.id] || 0) - (col[b.id] || 0) || idx[a.id] - idx[b.id];
      });
      for (var i = 0; i < group.length; i += MAX_PER_ROW) rows.push(group.slice(i, i + MAX_PER_ROW));
    });
    return placeGrid(rows, arrows, heights, GAP_X, EPIC_ROW_GAP);
  }
  function layoutGrid(screens, arrows, heights) {
    var n = screens.length;
    var perRow = Math.max(1, Math.min(MAX_PER_ROW, Math.ceil(Math.sqrt(n))));
    var ordered = screens.slice();
    var idx = {};
    screens.forEach(function(s, i2) {
      idx[s.id] = i2;
    });
    var epicRank = {};
    (state.project && state.project.epics || []).forEach(function(e, i2) {
      epicRank[e.id] = i2;
    });
    ordered.sort(function(a, b) {
      var ea = a.epic ? epicRank[a.epic] !== void 0 ? epicRank[a.epic] : 9999 : 1e4;
      var eb = b.epic ? epicRank[b.epic] !== void 0 ? epicRank[b.epic] : 9999 : 1e4;
      return ea - eb || idx[a.id] - idx[b.id];
    });
    var rows = [];
    for (var i = 0; i < ordered.length; i += perRow) rows.push(ordered.slice(i, i + perRow));
    return placeGrid(rows, arrows, heights);
  }
  function spreadPositions(positions, k, origin) {
    var ids = Object.keys(positions);
    if (!ids.length) return positions;
    var ox, oy;
    if (origin) {
      ox = origin.x;
      oy = origin.y;
    } else {
      ox = Infinity;
      oy = Infinity;
      ids.forEach(function(id) {
        ox = Math.min(ox, positions[id].x);
        oy = Math.min(oy, positions[id].y);
      });
    }
    var out = {};
    ids.forEach(function(id) {
      out[id] = {
        x: Math.round(ox + (positions[id].x - ox) * k),
        y: Math.round(oy + (positions[id].y - oy) * k)
      };
    });
    return out;
  }
  var LAYOUT_STRATEGIES = [
    { name: "Flow", fn: autoLayout },
    { name: "Epics", fn: layoutByEpics },
    { name: "Grid", fn: layoutGrid }
  ];

  // src/interactions/transform.ts
  function setZoom(z) {
    var newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * 100) / 100));
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
    var label = document.getElementById("fb-zoom-label");
    if (label) label.textContent = Math.round(state.zoom * 100) + "%";
    saveZoom();
  }
  function applyTransform() {
    if (state.sizerEl) {
      state.sizerEl.style.transform = "translate(" + state.panX + "px," + state.panY + "px) scale(" + state.zoom + ")";
    }
    if (state.canvasEl && state._dotZoom !== state.zoom) {
      state._dotZoom = state.zoom;
      var sp = DOT_SPACING / state.zoom;
      var r = DOT_RADIUS / state.zoom;
      state.canvasEl.style.backgroundSize = sp + "px " + sp + "px";
      state.canvasEl.style.backgroundImage = "radial-gradient(circle, " + DOT_COLOR + " " + r + "px, transparent " + r + "px)";
    }
  }
  function isContentInView() {
    if (!state.wrapperEl || !state.project) return true;
    var rect = state.wrapperEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return true;
    var vx0 = -state.panX / state.zoom, vy0 = -state.panY / state.zoom;
    var vx1 = vx0 + rect.width / state.zoom, vy1 = vy0 + rect.height / state.zoom;
    var screens = state.project.screens || [];
    for (var i = 0; i < screens.length; i++) {
      var s = screens[i];
      if (state.hiddenScreens[s.id]) continue;
      if (state.focus && !state.focus.visible[s.id]) continue;
      var el2 = state.screenEls[s.id];
      var pos = state.positions[s.id];
      if (!el2 || !pos) continue;
      var x1 = pos.x + el2.offsetWidth, y1 = pos.y + el2.offsetHeight;
      if (x1 > vx0 && pos.x < vx1 && y1 > vy0 && pos.y < vy1) return true;
    }
    return screens.length === 0;
  }
  function fitToContent() {
    if (!state.wrapperEl || !state.project) return;
    var screens = state.project.screens || [];
    var minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
    var hasVisible = false;
    screens.forEach(function(s) {
      if (state.hiddenScreens[s.id]) return;
      if (state.focus && !state.focus.visible[s.id]) return;
      var el2 = state.screenEls[s.id];
      var pos = state.positions[s.id];
      if (!el2 || !pos) return;
      hasVisible = true;
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + el2.offsetWidth);
      maxY = Math.max(maxY, pos.y + el2.offsetHeight);
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
    var zoom = Math.min(zoomX, zoomY, 1);
    zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(zoom * 100) / 100));
    var panX = (viewW - contentW * zoom) / 2 - minX * zoom;
    var panY = (viewH - contentH * zoom) / 2 - minY * zoom;
    state.zoom = zoom;
    state.panX = panX;
    state.panY = panY;
    applyTransform();
    var label = document.getElementById("fb-zoom-label");
    if (label) label.textContent = Math.round(state.zoom * 100) + "%";
    saveZoom();
  }

  // src/export.ts
  var html2canvasLoaded = null;
  function loadHtml2Canvas() {
    if (html2canvasLoaded) return html2canvasLoaded;
    html2canvasLoaded = new Promise(function(resolve, reject) {
      if (window.html2canvas) {
        resolve(window.html2canvas);
        return;
      }
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
      s.onload = function() {
        resolve(window.html2canvas);
      };
      s.onerror = function() {
        html2canvasLoaded = null;
        reject(new Error("Failed to load html2canvas"));
      };
      document.head.appendChild(s);
    });
    return html2canvasLoaded;
  }
  function isScreenShown(id) {
    if (state.hiddenScreens[id]) return false;
    if (state.focus && !state.focus.visible[id]) return false;
    return true;
  }
  function collectExportBounds() {
    var minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
    var arrows = state.project.arrows || [];
    var spreadMap = buildSpreadMap();
    state.project.screens.forEach(function(s) {
      if (!isScreenShown(s.id)) return;
      var el2 = state.screenEls[s.id];
      var pos = state.positions[s.id];
      if (!el2 || !pos) return;
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + el2.offsetWidth);
      maxY = Math.max(maxY, pos.y + el2.offsetHeight);
    });
    arrows.forEach(function(arrow, idx) {
      if (!isScreenShown(arrow.from) || !isScreenShown(arrow.to) || !isArrowShown(arrow)) return;
      var fromEl = state.screenEls[arrow.from];
      var toEl = state.screenEls[arrow.to];
      if (!fromEl || !toEl) return;
      var sides = resolveArrowSides(arrow, idx, spreadMap);
      var start = getAnchor(arrow.from, sides.from);
      var end = getAnchor(arrow.to, sides.to);
      var cps = computeControlPoints(start, end, sides.from, sides.to);
      var cp1 = cps.cp1;
      var cp2 = cps.cp2;
      [start, end, cp1, cp2].forEach(function(p) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      });
    });
    if (state.svgEl) {
      var boxes = state.svgEl.querySelectorAll(".fb-arrow-label-bg");
      for (var i = 0; i < boxes.length; i++) {
        var bx = parseFloat(boxes[i].getAttribute("x")), by = parseFloat(boxes[i].getAttribute("y"));
        var bw = parseFloat(boxes[i].getAttribute("width")), bh = parseFloat(boxes[i].getAttribute("height"));
        if (isNaN(bx) || isNaN(by)) continue;
        minX = Math.min(minX, bx);
        minY = Math.min(minY, by);
        maxX = Math.max(maxX, bx + bw);
        maxY = Math.max(maxY, by + bh);
      }
    }
    return { minX, minY, maxX, maxY };
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
    var tmp = document.createElement("div");
    tmp.className = "fb-container";
    tmp.style.cssText = "position:fixed;left:-99999px;top:0;width:" + vw + "px;height:" + vh + "px;overflow:visible;background:transparent;";
    state.project.screens.forEach(function(s) {
      if (!isScreenShown(s.id)) return;
      var el2 = state.screenEls[s.id];
      var pos = state.positions[s.id];
      if (!el2 || !pos) return;
      var clone = el2.cloneNode(true);
      clone.classList.remove("fb-selected", "fb-dragging", "fb-focus-out");
      clone.style.left = pos.x - vx + "px";
      clone.style.top = pos.y - vy + "px";
      tmp.appendChild(clone);
    });
    var svgClone = state.svgEl.cloneNode(true);
    svgClone.classList.remove("fb-hl-active");
    var hl = svgClone.querySelectorAll(".fb-arrow-hl");
    for (var hi = 0; hi < hl.length; hi++) hl[hi].classList.remove("fb-arrow-hl");
    var dimmedEls = svgClone.querySelectorAll(".fb-arrow-dimmed");
    for (var di = 0; di < dimmedEls.length; di++) {
      dimmedEls[di].parentNode.removeChild(dimmedEls[di]);
    }
    svgClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svgClone.setAttribute("viewBox", vx + " " + vy + " " + vw + " " + vh);
    svgClone.setAttribute("width", String(vw));
    svgClone.setAttribute("height", String(vh));
    var svgStr = new XMLSerializer().serializeToString(svgClone);
    var blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var dpr = typeof window !== "undefined" && window.devicePixelRatio || 1;
    var scale = Math.max(2, Math.min(3, dpr));
    var budget = exportPixelBudget();
    if (vw * vh * scale * scale > budget) scale = Math.max(1, Math.sqrt(budget / (vw * vh)));
    var MAX_SIDE = 16e3;
    if (vw * scale > MAX_SIDE) scale = MAX_SIDE / vw;
    if (vh * scale > MAX_SIDE) scale = MAX_SIDE / vh;
    var outW = Math.round(vw * scale), outH = Math.round(vh * scale);
    document.body.appendChild(tmp);
    var screensDone = loadHtml2Canvas().then(function(html2canvas) {
      return html2canvas(tmp, { width: vw, height: vh, scale, backgroundColor: null, useCORS: true, logging: false });
    });
    var arrowsDone = new Promise(function(resolve, reject) {
      var img = new Image();
      img.onload = function() {
        resolve(img);
      };
      img.onerror = function() {
        reject(new Error("Arrow rasterization failed"));
      };
      img.src = url;
    });
    Promise.all([screensDone, arrowsDone]).then(function(res) {
      var screensCanvas = res[0];
      var arrowsImg = res[1];
      URL.revokeObjectURL(url);
      if (tmp.parentNode) document.body.removeChild(tmp);
      var out = document.createElement("canvas");
      out.width = outW;
      out.height = outH;
      var ctx = out.getContext("2d");
      ctx.fillStyle = "#f0f2f5";
      ctx.fillRect(0, 0, outW, outH);
      ctx.drawImage(screensCanvas, 0, 0, outW, outH);
      ctx.drawImage(arrowsImg, 0, 0, outW, outH);
      var suffix = state.focus ? " - " + state.focus.id : "";
      var link = document.createElement("a");
      link.download = (state.project.name || "flowboard") + suffix + ".png";
      link.href = out.toDataURL("image/png");
      link.click();
    }).catch(function(err) {
      URL.revokeObjectURL(url);
      if (tmp.parentNode) document.body.removeChild(tmp);
      console.error("Export failed:", err);
    });
  }
  function exportPixelBudget() {
    var ua = typeof navigator !== "undefined" && navigator.userAgent || "";
    var isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua);
    return isSafari ? 16e6 : 12e7;
  }

  // src/render/toolbar.ts
  function updateLayoutButton() {
    var btn = document.getElementById("fb-layout-btn");
    if (btn) {
      var name = btn.querySelector(".fb-layout-name");
      if (name) name.textContent = LAYOUT_STRATEGIES[state.layoutIndex].name;
    }
  }
  function syncToolbar() {
    if (!state.container) return;
    var title = state.container.querySelector(".fb-project-title");
    if (title) title.textContent = state.project.name || "FlowBoard";
    var oldView = state.container.querySelector(".fb-view");
    if (oldView && oldView.parentNode) oldView.parentNode.replaceChild(renderViewPicker(), oldView);
  }
  var EPIC_PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#14b8a6"];
  function uniqueEpicId() {
    var epics = state.project && state.project.epics || [];
    var n = 1;
    var id;
    do {
      id = "epic-" + n++;
    } while (epics.some(function(e) {
      return e.id === id;
    }));
    return id;
  }
  function addEpic() {
    if (!state.project.epics) state.project.epics = [];
    var epic = {
      id: uniqueEpicId(),
      label: "Epic " + (state.project.epics.length + 1),
      color: EPIC_PALETTE[state.project.epics.length % EPIC_PALETTE.length]
    };
    state.project.epics.push(epic);
    syncToolbar();
    if (state.commit) state.commit();
    return epic;
  }
  function setEpicLabel(id, label) {
    var epic = getEpic(id);
    if (!epic) return;
    epic.label = label;
    syncToolbar();
    if (state.commit) state.commit();
  }
  function setEpicColor(id, color) {
    var epic = getEpic(id);
    if (!epic) return;
    epic.color = color;
    (state.project.screens || []).forEach(function(s) {
      if (inEpic(s, id)) refreshScreenEpics(s);
    });
    syncToolbar();
    if (state.commit) state.commit();
  }
  function deleteEpic(id) {
    if (!state.project || !state.project.epics) return false;
    var epic = getEpic(id);
    if (!epic) return false;
    if (!confirm('Delete epic "' + (epic.label || id) + '"? Its screens stay but lose this group.')) return false;
    state.project.epics = state.project.epics.filter(function(e) {
      return e.id !== id;
    });
    delete state.hiddenEpics[id];
    (state.project.screens || []).forEach(function(s) {
      if (inEpic(s, id)) {
        setEpicList(s, screenEpics(s).filter(function(e) {
          return e !== id;
        }));
        refreshScreenEpics(s);
      }
    });
    if (state.focus && state.focus.id === id) exitFocus();
    syncToolbar();
    drawArrows();
    if (state.commit) state.commit();
    return true;
  }
  var epicsModalEl = null;
  var epicsDismiss = null;
  function closeEpicsModal() {
    if (epicsModalEl && epicsModalEl.parentNode) epicsModalEl.parentNode.removeChild(epicsModalEl);
    epicsModalEl = null;
    if (epicsDismiss) {
      document.removeEventListener("keydown", epicsDismiss, true);
      epicsDismiss = null;
    }
  }
  function epicRow(epic) {
    var row = document.createElement("div");
    row.className = "fb-epic-row";
    row.setAttribute("data-testid", "epic-row-" + epic.id);
    var color = document.createElement("input");
    color.type = "color";
    color.className = "fb-epic-color";
    color.value = epic.color || "#666666";
    color.title = "Color";
    color.addEventListener("input", function() {
      setEpicColor(epic.id, color.value);
    });
    row.appendChild(color);
    var name = document.createElement("input");
    name.type = "text";
    name.className = "fb-epic-name";
    name.value = epic.label || "";
    name.addEventListener("input", function() {
      epic.label = name.value;
    });
    name.addEventListener("change", function() {
      setEpicLabel(epic.id, name.value.trim() || epic.id);
    });
    row.appendChild(name);
    var del = document.createElement("button");
    del.className = "fb-epic-del";
    del.title = "Delete epic";
    del.setAttribute("data-testid", "epic-del-" + epic.id);
    del.innerHTML = ICON_TRASH;
    del.addEventListener("click", function() {
      if (deleteEpic(epic.id) && row.parentNode) row.parentNode.removeChild(row);
    });
    row.appendChild(del);
    return row;
  }
  function showEpicsModal() {
    closeEpicsModal();
    var backdrop = document.createElement("div");
    backdrop.className = "fb-modal-backdrop";
    backdrop.setAttribute("data-testid", "epics-modal");
    var modal = document.createElement("div");
    modal.className = "fb-epics-modal";
    var header = document.createElement("div");
    header.className = "fb-epics-modal-header";
    var h = document.createElement("span");
    h.textContent = "Epics";
    header.appendChild(h);
    var close = document.createElement("button");
    close.className = "fb-epics-modal-close";
    close.textContent = "\xD7";
    close.title = "Close";
    close.addEventListener("click", closeEpicsModal);
    header.appendChild(close);
    modal.appendChild(header);
    var list = document.createElement("div");
    list.className = "fb-epics-list";
    (state.project.epics || []).forEach(function(epic) {
      list.appendChild(epicRow(epic));
    });
    modal.appendChild(list);
    var add = document.createElement("button");
    add.className = "fb-epics-add";
    add.setAttribute("data-testid", "epic-add");
    add.innerHTML = ICON_PLUS + "<span>Add epic</span>";
    add.addEventListener("click", function() {
      var row = epicRow(addEpic());
      list.appendChild(row);
      var input = row.querySelector(".fb-epic-name");
      if (input) {
        input.focus();
        input.select();
      }
    });
    modal.appendChild(add);
    backdrop.appendChild(modal);
    backdrop.addEventListener("mousedown", function(e) {
      if (e.target === backdrop) closeEpicsModal();
    });
    document.body.appendChild(backdrop);
    epicsModalEl = backdrop;
    epicsDismiss = function(e) {
      if (e.key === "Escape") closeEpicsModal();
    };
    document.addEventListener("keydown", epicsDismiss, true);
  }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    e.className = cls;
    if (html) e.innerHTML = html;
    return e;
  }
  function makeSwitch(text, checked, title, testid, onChange) {
    var label = el("label", "fb-switch");
    label.title = title;
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = checked;
    if (testid) cb.setAttribute("data-testid", testid);
    cb.addEventListener("change", function() {
      onChange(cb.checked);
    });
    label.appendChild(cb);
    label.appendChild(el("span", "fb-switch-track"));
    label.appendChild(document.createTextNode(text));
    return label;
  }
  function iconBtn(cls, icon2, title, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.title = title;
    b.innerHTML = icon2;
    b.addEventListener("click", onClick);
    return b;
  }
  function renderToolbar() {
    var header = el("div", "fb-header");
    var left = el("div", "fb-toolbar-group");
    var title = el("span", "fb-project-title");
    title.textContent = state.project.name || "FlowBoard";
    left.appendChild(title);
    left.appendChild(renderViewPicker());
    header.appendChild(left);
    var right = el("div", "fb-toolbar-group");
    var switches = el("div", "fb-switches");
    switches.appendChild(makeSwitch("Notes", state.showNotes, "Show screen notes", "toggle-notes", function(on) {
      state.showNotes = on;
      toggleNotesVisibility();
    }));
    switches.appendChild(makeSwitch("Nav", state.showNav !== false, "Show navigation arrows (menus, back links)", "toggle-nav", function(on) {
      state.showNav = on;
      drawArrows();
    }));
    right.appendChild(switches);
    var zoom = el("div", "fb-seg");
    zoom.appendChild(iconBtn("fb-toolbar-btn", ICON_MINUS, "Zoom out", function() {
      setZoom(state.zoom - ZOOM_STEP);
    }));
    var zoomLabel = el("span", "fb-zoom-label");
    zoomLabel.id = "fb-zoom-label";
    zoomLabel.textContent = Math.round(state.zoom * 100) + "%";
    zoom.appendChild(zoomLabel);
    zoom.appendChild(iconBtn("fb-toolbar-btn", ICON_PLUS, "Zoom in", function() {
      setZoom(state.zoom + ZOOM_STEP);
    }));
    zoom.appendChild(iconBtn("fb-toolbar-btn", ICON_FIT, "Fit to screen", function() {
      fitToContent();
    }));
    right.appendChild(zoom);
    var layoutBtn = iconBtn("fb-action-btn", ICON_GRID + '<span class="fb-layout-name">' + LAYOUT_STRATEGIES[state.layoutIndex].name + "</span>", "Auto-layout: switch strategy", cycleLayout);
    layoutBtn.id = "fb-layout-btn";
    right.appendChild(layoutBtn);
    var spacing = el("div", "fb-seg");
    spacing.title = "Spacing between screens";
    var spIcon = el("span", "fb-seg-icon", ICON_SPACING);
    spacing.appendChild(spIcon);
    var spMinus = iconBtn("fb-toolbar-btn", ICON_MINUS, "Tighter", function() {
      adjustSpacing(1 / 1.2);
    });
    spMinus.setAttribute("data-testid", "spacing-minus");
    spacing.appendChild(spMinus);
    var spPlus = iconBtn("fb-toolbar-btn", ICON_PLUS, "Looser", function() {
      adjustSpacing(1.2);
    });
    spPlus.setAttribute("data-testid", "spacing-plus");
    spacing.appendChild(spPlus);
    right.appendChild(spacing);
    right.appendChild(iconBtn("fb-action-btn", ICON_DOWNLOAD + "<span>PNG</span>", "Export as PNG", doExport));
    var resetBtn = iconBtn("fb-action-btn fb-ghost", ICON_RESET + "<span>Reset</span>", "Reset to the default layout", doReset);
    resetBtn.setAttribute("data-testid", "toolbar-reset");
    right.appendChild(resetBtn);
    header.appendChild(right);
    return header;
  }
  function toggleNotesVisibility() {
    var footers = state.container.querySelectorAll(".fb-screen-footer");
    for (var i = 0; i < footers.length; i++) {
      if (state.showNotes) {
        footers[i].classList.remove("fb-hidden");
      } else {
        footers[i].classList.add("fb-hidden");
      }
    }
  }

  // src/render/view-picker.ts
  var FILTER_MIN_ITEMS = 8;
  function currentValue() {
    return state.focus ? state.focus.id : "";
  }
  function listItems() {
    var screens = state.project && state.project.screens || [];
    var items = [{ value: "", label: "All screens", color: "", count: screens.length, kind: "all" }];
    (state.project && state.project.epics || []).forEach(function(e) {
      var n = 0;
      screens.forEach(function(s) {
        if (inEpic(s, e.id)) n++;
      });
      items.push({ value: e.id, label: e.label || e.id, color: e.color || "#666", count: n, kind: "epic" });
    });
    return items;
  }
  var pickerEl2 = null;
  var outsideHandler = null;
  function isOpen() {
    return !!pickerEl2 && pickerEl2.classList.contains("fb-open");
  }
  function closeViewMenu() {
    if (!pickerEl2) return;
    pickerEl2.classList.remove("fb-open");
    var btn = pickerEl2.querySelector(".fb-view-btn");
    if (btn) btn.setAttribute("aria-expanded", "false");
    if (outsideHandler) {
      document.removeEventListener("mousedown", outsideHandler, true);
      outsideHandler = null;
    }
  }
  function visibleOptions() {
    var all = pickerEl2.querySelectorAll(".fb-view-item");
    var out = [];
    for (var i = 0; i < all.length; i++) if (!all[i].hidden) out.push(all[i]);
    return out;
  }
  function setActive(el2) {
    var prev = pickerEl2.querySelector(".fb-view-item.fb-active");
    if (prev) prev.classList.remove("fb-active");
    if (el2) {
      el2.classList.add("fb-active");
      el2.scrollIntoView && el2.scrollIntoView({ block: "nearest" });
    }
  }
  function openViewMenu() {
    if (!pickerEl2 || isOpen()) return;
    pickerEl2.classList.add("fb-open");
    pickerEl2.querySelector(".fb-view-btn").setAttribute("aria-expanded", "true");
    var search = pickerEl2.querySelector(".fb-view-search");
    if (search) {
      search.value = "";
      applyFilter("");
      search.focus();
    }
    setActive(pickerEl2.querySelector('.fb-view-item[data-view="' + currentValue() + '"]'));
    outsideHandler = function(e) {
      if (pickerEl2 && !pickerEl2.contains(e.target)) closeViewMenu();
    };
    document.addEventListener("mousedown", outsideHandler, true);
  }
  function applyFilter(q2) {
    var needle = q2.trim().toLowerCase();
    var items = pickerEl2.querySelectorAll(".fb-view-item");
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      it.hidden = !!needle && (it.getAttribute("data-label") || "").indexOf(needle) === -1;
    }
    var sections = pickerEl2.querySelectorAll(".fb-view-section");
    for (var j = 0; j < sections.length; j++) {
      var sec = sections[j];
      var kind = sec.getAttribute("data-kind");
      var any = pickerEl2.querySelector('.fb-view-item[data-kind="' + kind + '"]:not([hidden])');
      sec.hidden = !any;
    }
    var first = visibleOptions()[0] || null;
    setActive(first);
  }
  function choose(value) {
    closeViewMenu();
    if (value !== currentValue()) setFocus(value);
  }
  function onKey(e) {
    if (!isOpen()) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openViewMenu();
      }
      return;
    }
    var opts = visibleOptions();
    var cur = pickerEl2.querySelector(".fb-view-item.fb-active");
    var idx = opts.indexOf(cur);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(opts[Math.min(opts.length - 1, idx + 1)] || null);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(opts[Math.max(0, idx - 1)] || null);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (cur) choose(cur.getAttribute("data-view"));
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeViewMenu();
      pickerEl2.querySelector(".fb-view-btn").focus();
    }
    e.stopPropagation();
  }
  function dot(color) {
    return color ? '<span class="fb-view-dot" style="background:' + color + '"></span>' : '<span class="fb-view-dot fb-view-dot-all">' + ICON_LAYERS + "</span>";
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function syncViewPicker() {
    if (!pickerEl2) return;
    var val = currentValue();
    var item = null;
    listItems().forEach(function(it) {
      if (it.value === val) item = it;
    });
    var face = pickerEl2.querySelector(".fb-view-face");
    var kindLabel = "Epic";
    face.innerHTML = dot(item ? item.color : "") + '<span class="fb-view-kind">' + kindLabel + '</span><span class="fb-view-label">' + esc(item ? item.label : "All screens") + "</span>";
    pickerEl2.classList.toggle("fb-view-focused", !!state.focus);
    var items = pickerEl2.querySelectorAll(".fb-view-item");
    for (var i = 0; i < items.length; i++) {
      var sel = items[i].getAttribute("data-view") === val;
      items[i].classList.toggle("fb-selected-item", sel);
      items[i].setAttribute("aria-selected", sel ? "true" : "false");
    }
  }
  function renderViewPicker() {
    closeViewMenu();
    var wrap = document.createElement("div");
    wrap.className = "fb-view";
    wrap.setAttribute("data-testid", "view-picker");
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fb-view-btn";
    btn.setAttribute("data-testid", "view-btn");
    btn.setAttribute("aria-haspopup", "listbox");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = '<span class="fb-view-face"></span><span class="fb-view-chevron">' + ICON_CHEVRON + "</span>";
    btn.addEventListener("click", function() {
      isOpen() ? closeViewMenu() : openViewMenu();
    });
    btn.addEventListener("keydown", onKey);
    wrap.appendChild(btn);
    var clear = document.createElement("button");
    clear.type = "button";
    clear.className = "fb-view-clear";
    clear.title = "Back to all screens";
    clear.setAttribute("data-testid", "view-clear");
    clear.innerHTML = ICON_X;
    clear.addEventListener("click", function() {
      choose("");
    });
    wrap.appendChild(clear);
    var menu = document.createElement("div");
    menu.className = "fb-view-menu";
    menu.setAttribute("role", "listbox");
    var items = listItems();
    if (items.length > FILTER_MIN_ITEMS) {
      var search = document.createElement("input");
      search.type = "text";
      search.className = "fb-view-search";
      search.placeholder = "Filter epics\u2026";
      search.addEventListener("input", function() {
        applyFilter(search.value);
      });
      search.addEventListener("keydown", onKey);
      search.addEventListener("mousedown", function(e) {
        e.stopPropagation();
      });
      menu.appendChild(search);
    }
    var html = "";
    var lastKind = "";
    var titles = { epic: "Epics" };
    items.forEach(function(it) {
      if (it.kind !== "all" && it.kind !== lastKind) {
        html += '<div class="fb-view-section" data-kind="' + it.kind + '">' + titles[it.kind] + "</div>";
        lastKind = it.kind;
      }
      html += '<div class="fb-view-item" role="option" data-view="' + esc(it.value) + '" data-kind="' + it.kind + '" data-label="' + esc(it.label.toLowerCase()) + '">' + dot(it.color) + '<span class="fb-view-item-label">' + esc(it.label) + '</span><span class="fb-view-count">' + it.count + "</span></div>";
    });
    var list = document.createElement("div");
    list.className = "fb-view-list";
    list.innerHTML = html;
    list.addEventListener("click", function(e) {
      var it = e.target.closest(".fb-view-item");
      if (it) choose(it.getAttribute("data-view"));
    });
    list.addEventListener("mousemove", function(e) {
      var it = e.target.closest(".fb-view-item");
      if (it && !it.classList.contains("fb-active")) setActive(it);
    });
    menu.appendChild(list);
    var foot = document.createElement("button");
    foot.type = "button";
    foot.className = "fb-view-foot";
    foot.setAttribute("data-testid", "epics-btn");
    foot.innerHTML = ICON_SLIDERS + "<span>Manage epics</span>";
    foot.addEventListener("click", function() {
      closeViewMenu();
      showEpicsModal();
    });
    menu.appendChild(foot);
    wrap.appendChild(menu);
    pickerEl2 = wrap;
    syncViewPicker();
    return wrap;
  }

  // src/focus.ts
  function persistedPositions() {
    return state.focus ? state.focus.savedPositions : state.positions;
  }
  function applyPositionsToDom() {
    (state.project.screens || []).forEach(function(s) {
      var el2 = state.screenEls[s.id];
      var pos = state.positions[s.id];
      if (el2 && pos) {
        el2.style.left = pos.x + "px";
        el2.style.top = pos.y + "px";
      }
    });
  }
  function clearFocusDecorations() {
    (state.project.screens || []).forEach(function(s) {
      var el2 = state.screenEls[s.id];
      if (!el2) return;
      el2.classList.remove("fb-focus-out");
      var badge = el2.querySelector(".fb-step-badge");
      if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
    });
  }
  function exitFocus(restore) {
    if (!state.focus) return;
    if (restore !== false) state.positions = state.focus.savedPositions;
    state.focus = null;
    if (state.screenEls) {
      clearFocusDecorations();
      applyPositionsToDom();
    }
    syncViewPicker();
  }
  function setFocus(epicId) {
    var wasFocused = !!state.focus;
    exitFocus();
    if (!epicId) {
      drawArrows();
      if (wasFocused) fitToContent();
      return;
    }
    var screens = state.project.screens || [];
    var members = screens.filter(function(s) {
      return inEpic(s, epicId);
    });
    if (!members.length) {
      drawArrows();
      return;
    }
    var epic = getEpic(epicId);
    var color = epic && epic.color || "#374151";
    var visible = {};
    members.forEach(function(s) {
      visible[s.id] = true;
    });
    var heights = {};
    members.forEach(function(s) {
      var el2 = state.screenEls[s.id];
      if (el2) heights[s.id] = el2.offsetHeight;
    });
    var inner = (state.project.arrows || []).filter(function(a) {
      return visible[a.from] && visible[a.to];
    });
    var layout = autoLayout(members, inner, heights);
    state.focus = { type: "epic", id: epicId, savedPositions: state.positions, visible };
    var positions = {};
    screens.forEach(function(s) {
      positions[s.id] = layout[s.id] || state.focus.savedPositions[s.id];
    });
    state.positions = positions;
    screens.forEach(function(s) {
      var el2 = state.screenEls[s.id];
      if (el2) el2.classList.toggle("fb-focus-out", !visible[s.id]);
    });
    var ordered = members.slice().sort(function(a, b) {
      var pa = layout[a.id], pb = layout[b.id];
      return pa.x - pb.x || pa.y - pb.y;
    });
    ordered.forEach(function(s, i) {
      var el2 = state.screenEls[s.id];
      if (!el2) return;
      var badge = document.createElement("span");
      badge.className = "fb-step-badge";
      badge.textContent = String(i + 1);
      badge.style.background = color;
      var header = el2.querySelector(".fb-screen-header");
      if (header) header.insertBefore(badge, header.firstChild);
    });
    applyPositionsToDom();
    syncViewPicker();
    drawArrows();
    fitToContent();
  }

  // src/flowml/serialize.ts
  function escVal(s) {
    return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  }
  function q(v) {
    var s = String(v);
    return /[\s,"\\]/.test(s) ? '"' + escVal(s) + '"' : s;
  }
  function qname(v) {
    var s = String(v);
    return /[\n"\\]/.test(s) || /^\s|\s$/.test(s) ? '"' + escVal(s) + '"' : s;
  }
  function qtok(v) {
    var s = String(v);
    return /[\s,"\\`]/.test(s) || /^[@!#`]/.test(s) ? '"' + escVal(s) + '"' : s;
  }
  function fenceFor(content) {
    var longest = 0;
    var runs = content.match(/`+/g);
    if (runs) runs.forEach(function(r) {
      if (r.length > longest) longest = r.length;
    });
    var n = Math.max(3, longest + 1);
    var f = "";
    for (var i = 0; i < n; i++) f += "`";
    return f;
  }
  function serialize(project, positions) {
    var out = [];
    if (project.name) out.push("!name = " + qname(project.name));
    (project.epics || []).forEach(function(e) {
      var parts = ["@" + qtok(e.id)];
      if (e.label) parts.push("t=" + q(e.label));
      if (e.color) parts.push("c=" + q(e.color));
      out.push(parts.join(", "));
    });
    if (out.length) out.push("");
    (project.screens || []).forEach(function(s) {
      var parts = [":" + qtok(s.id)];
      if (s.title) parts.push("t=" + q(s.title));
      if (s.preset && s.preset !== "custom") parts.push("p=" + s.preset);
      if (s.format) parts.push("f=" + s.format);
      var eps = screenEpics(s);
      if (eps.length) parts.push("e=" + q(eps.join(" ")));
      if (s.notes) parts.push("n=" + q(s.notes));
      if (s.size) parts.push("sz=" + s.size);
      if (s.width) parts.push("w=" + Math.round(s.width));
      if (s.height) parts.push("hg=" + Math.round(s.height));
      var pos = positions[s.id];
      if (pos) {
        parts.push("x=" + Math.round(pos.x));
        parts.push("y=" + Math.round(pos.y));
      }
      if (s.hidden) parts.push("h");
      out.push(parts.join(", "));
      if (s.content) {
        var fence = fenceFor(s.content);
        out.push(fence);
        out.push(s.content);
        out.push(fence);
      }
    });
    if (project.arrows && project.arrows.length) {
      out.push("");
      project.arrows.forEach(function(a) {
        var line = qtok(a.from) + (a.dashed ? " --> " : " -> ") + qtok(a.to);
        var attrs = [];
        if (a.label) attrs.push("l=" + q(a.label));
        if (a.fromSide) attrs.push("fs=" + q(a.fromSide));
        if (a.toSide) attrs.push("ts=" + q(a.toSide));
        if (a.kind) attrs.push("k=" + a.kind);
        if (a.detail) attrs.push("d=" + q(a.detail));
        if (a.note) attrs.push("n=" + q(a.note));
        if (a.color) attrs.push("c=" + q(a.color));
        if (attrs.length) line += ", " + attrs.join(", ");
        out.push(line);
      });
    }
    return out.join("\n") + "\n";
  }

  // src/flowml/highlight.ts
  function esc2(s) {
    if (s.indexOf("&") === -1 && s.indexOf("<") === -1 && s.indexOf(">") === -1) return s;
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function tok(cls, s) {
    return '<span class="fb-tok-' + cls + '">' + esc2(s) + "</span>";
  }
  var RE_STR = /"(?:\\.|[^"])*"/y;
  var RE_KEYEQ = /([A-Za-z][A-Za-z0-9]*)(\s*=\s*)/y;
  var RE_COLOR = /#[0-9A-Fa-f]{3,8}\b/y;
  var RE_NUM = /-?\d+(?:\.\d+)?/y;
  var RE_WS = /\s+/y;
  var RE_BARE = /[^\s,]+/y;
  var RE_LEAD = /^\s*/;
  var RE_FENCE = /^`{3,}$/;
  var RE_DIRECTIVE = /^(![A-Za-z]+)(\s*=\s*)(.*)$/;
  var RE_ARROW = /^("(?:\\.|[^"])*"|[^\s,"]+)(\s*(?:-->|->)\s*)("(?:\\.|[^"])*"|[^\s,"]+)(.*)$/;
  var RE_EPIC = /^(@(?:"(?:\\.|[^"])*"|[^\s,"]+))(.*)$/;
  var RE_SCREEN = /^("(?:\\.|[^"])*"|[^\s,"]+)(.*)$/;
  function hlAttrs(s) {
    var out = "";
    var i = 0;
    var n = s.length;
    var m;
    while (i < n) {
      var ch = s.charAt(i);
      if (ch === ",") {
        out += '<span class="fb-tok-punct">,</span>';
        i++;
        continue;
      }
      if (ch === " " || ch === "	") {
        RE_WS.lastIndex = i;
        m = RE_WS.exec(s);
        out += m[0];
        i = RE_WS.lastIndex;
        continue;
      }
      if (ch === '"') {
        RE_STR.lastIndex = i;
        if (m = RE_STR.exec(s)) {
          out += tok("string", m[0]);
          i = RE_STR.lastIndex;
          continue;
        }
      }
      if (ch === "#") {
        RE_COLOR.lastIndex = i;
        if (m = RE_COLOR.exec(s)) {
          out += tok("color", m[0]);
          i = RE_COLOR.lastIndex;
          continue;
        }
      }
      if (ch >= "A" && ch <= "Z" || ch >= "a" && ch <= "z") {
        RE_KEYEQ.lastIndex = i;
        if (m = RE_KEYEQ.exec(s)) {
          out += tok("key", m[1]) + tok("punct", m[2]);
          i = RE_KEYEQ.lastIndex;
          continue;
        }
      }
      if (ch === "-" || ch >= "0" && ch <= "9") {
        RE_NUM.lastIndex = i;
        if (m = RE_NUM.exec(s)) {
          out += tok("num", m[0]);
          i = RE_NUM.lastIndex;
          continue;
        }
      }
      RE_BARE.lastIndex = i;
      m = RE_BARE.exec(s);
      if (m) {
        out += m[0] === "h" ? tok("flag", m[0]) : tok("value", m[0]);
        i = RE_BARE.lastIndex;
        continue;
      }
      out += esc2(ch);
      i++;
    }
    return out;
  }
  function highlight(text) {
    var lines = text.replace(/\r\n?/g, "\n").split("\n");
    var out = [];
    var fence = null;
    for (var li = 0; li < lines.length; li++) {
      var line = lines[li];
      if (fence !== null) {
        if (line.trim() === fence) {
          out.push(tok("fence", line));
          fence = null;
        } else out.push(tok("html", line));
        continue;
      }
      if (line.trim() === "") {
        out.push(esc2(line));
        continue;
      }
      var lead = RE_LEAD.exec(line)[0];
      var body = line.slice(lead.length);
      var head = esc2(lead);
      var m;
      if (body.charAt(0) === "#") {
        out.push(head + tok("comment", body));
        continue;
      }
      if (RE_FENCE.test(body)) {
        out.push(head + tok("fence", body));
        fence = body;
        continue;
      }
      if (body.charAt(0) === "!") {
        m = RE_DIRECTIVE.exec(body);
        if (m) out.push(head + tok("directive", m[1]) + tok("punct", m[2]) + tok("value", m[3]));
        else out.push(head + tok("directive", body));
        continue;
      }
      if (body.charAt(0) === ":") {
        m = RE_SCREEN.exec(body.slice(1));
        if (m) out.push(head + tok("screen", ":" + m[1]) + hlAttrs(m[2]));
        else out.push(head + tok("screen", body));
        continue;
      }
      if (body.charAt(0) === "@") {
        m = RE_EPIC.exec(body);
        if (m) out.push(head + tok("epic", m[1]) + hlAttrs(m[2]));
        else out.push(head + tok("epic", body));
        continue;
      }
      if (m = RE_ARROW.exec(body)) {
        out.push(head + tok("ref", m[1]) + tok("arrow", m[2]) + tok("ref", m[3]) + hlAttrs(m[4]));
        continue;
      }
      out.push(head + esc2(body));
    }
    return out.join("\n");
  }

  // src/render/panel.ts
  var LINE_H = 21.25;
  var PAD_T = 12;
  var COPY_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  var CHECK_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  function renderPanel() {
    var panel = document.createElement("div");
    panel.className = "fb-panel";
    var header = document.createElement("div");
    header.className = "fb-panel-header";
    var title = document.createElement("span");
    title.className = "fb-panel-title";
    title.textContent = "Flow-ML";
    header.appendChild(title);
    var actions = document.createElement("div");
    actions.className = "fb-panel-actions";
    var copyBtn = document.createElement("button");
    copyBtn.className = "fb-panel-copy-btn";
    copyBtn.title = "Copy Flow-ML";
    copyBtn.innerHTML = COPY_ICON;
    copyBtn.addEventListener("click", function() {
      copyPanel(copyBtn);
    });
    actions.appendChild(copyBtn);
    var helpBtn = document.createElement("button");
    helpBtn.className = "fb-panel-help-btn";
    helpBtn.title = "Help \u2014 Flow-ML syntax";
    helpBtn.textContent = "?";
    helpBtn.addEventListener("click", togglePanelHelp);
    actions.appendChild(helpBtn);
    var collapse = document.createElement("button");
    collapse.className = "fb-panel-collapse";
    collapse.title = "Collapse panel";
    collapse.textContent = "\u2039";
    collapse.addEventListener("click", togglePanel);
    actions.appendChild(collapse);
    header.appendChild(actions);
    panel.appendChild(header);
    var editor = document.createElement("div");
    editor.className = "fb-panel-editor";
    var gutter = document.createElement("div");
    gutter.className = "fb-panel-gutter";
    gutter.setAttribute("aria-hidden", "true");
    var inputWrap = document.createElement("div");
    inputWrap.className = "fb-panel-input";
    var activeLine = document.createElement("div");
    activeLine.className = "fb-panel-activeline";
    activeLine.setAttribute("aria-hidden", "true");
    inputWrap.appendChild(activeLine);
    var pre = document.createElement("pre");
    pre.className = "fb-panel-highlight";
    pre.setAttribute("aria-hidden", "true");
    var code = document.createElement("code");
    pre.appendChild(code);
    var textarea = document.createElement("textarea");
    textarea.className = "fb-panel-text";
    textarea.spellcheck = false;
    textarea.setAttribute("autocomplete", "off");
    textarea.setAttribute("autocapitalize", "off");
    textarea.setAttribute("wrap", "off");
    inputWrap.appendChild(pre);
    inputWrap.appendChild(textarea);
    editor.appendChild(gutter);
    editor.appendChild(inputWrap);
    panel.appendChild(editor);
    panel.appendChild(renderPanelHelp());
    var reopen = document.createElement("button");
    reopen.className = "fb-panel-reopen";
    reopen.title = "Open Flow-ML";
    reopen.textContent = "\u203A";
    reopen.addEventListener("click", togglePanel);
    panel.appendChild(reopen);
    state.panelEl = panel;
    state.panelTextarea = textarea;
    state.panelGutter = gutter;
    state.panelHighlight = code;
    state.panelPre = pre;
    state.panelActiveLine = activeLine;
    state.panelLineCount = 0;
    textarea.addEventListener("input", refreshEditor);
    textarea.addEventListener("scroll", syncScroll);
    textarea.addEventListener("keyup", updateActiveLine);
    textarea.addEventListener("click", updateActiveLine);
    textarea.addEventListener("focus", updateActiveLine);
    refreshEditor();
    return panel;
  }
  function copyPanel(btn) {
    var ta = state.panelTextarea;
    if (!ta) return;
    var flash = function() {
      btn.classList.add("fb-copied");
      btn.innerHTML = CHECK_ICON;
      setTimeout(function() {
        btn.classList.remove("fb-copied");
        btn.innerHTML = COPY_ICON;
      }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ta.value).then(flash, flash);
    } else {
      try {
        ta.select();
        document.execCommand("copy");
      } catch (e) {
      }
      flash();
    }
  }
  function updateActiveLine() {
    var ta = state.panelTextarea;
    var band = state.panelActiveLine;
    if (!ta || !band) return;
    var idx = ta.value.slice(0, ta.selectionStart).split("\n").length - 1;
    band.style.top = PAD_T + idx * LINE_H - ta.scrollTop + "px";
  }
  function refreshEditor() {
    updateHighlight();
    updateGutter();
    syncScroll();
    updateActiveLine();
  }
  function updateHighlight() {
    var ta = state.panelTextarea;
    var code = state.panelHighlight;
    if (!ta || !code) return;
    code.innerHTML = highlight(ta.value);
  }
  function updateGutter() {
    var ta = state.panelTextarea;
    var g = state.panelGutter;
    if (!ta || !g) return;
    var n = ta.value.split("\n").length || 1;
    if (n === state.panelLineCount) return;
    state.panelLineCount = n;
    var lines = "";
    for (var i = 1; i <= n; i++) lines += (i > 1 ? "\n" : "") + i;
    g.textContent = lines;
  }
  function syncScroll() {
    var ta = state.panelTextarea;
    if (!ta) return;
    if (state.panelGutter) state.panelGutter.scrollTop = ta.scrollTop;
    if (state.panelPre) {
      state.panelPre.scrollTop = ta.scrollTop;
      state.panelPre.scrollLeft = ta.scrollLeft;
    }
    updateActiveLine();
  }
  function togglePanel() {
    if (state.panelEl) state.panelEl.classList.toggle("fb-panel-collapsed");
  }
  function togglePanelHelp() {
    if (state.panelEl) state.panelEl.classList.toggle("fb-help-open");
  }
  function renderPanelHelp() {
    var help = document.createElement("div");
    help.className = "fb-panel-help";
    var h = document.createElement("div");
    h.className = "fb-help-title";
    h.textContent = "Comment \xE7a marche";
    help.appendChild(h);
    var intro = document.createElement("p");
    intro.className = "fb-help-intro";
    intro.textContent = "The text is the source of truth: edit on the left and the diagram follows \u2014 and everything you do on the diagram rewrites the text (two-way sync).";
    help.appendChild(intro);
    var rows = [
      ["!name = My app", "project name"],
      ["@auth, t=Authentication, c=#6366f1", "epic \u2014 a group (color c=)"],
      [":login, t=Login, p=form, f=phone, e=auth", 'screen \u2014 ":" prefix (title, preset, format, epic)'],
      [":login, x=120, y=80, h", "position (x,y) \xB7 h = hidden"],
      ["login -> home", "arrow"],
      ["login --> home, l=ok", "dashed arrow + label"],
      ["# a comment", "comment (ignored)"]
    ];
    var grid = document.createElement("div");
    grid.className = "fb-help-grid";
    rows.forEach(function(r) {
      var row = document.createElement("div");
      row.className = "fb-help-row";
      var desc = document.createElement("div");
      desc.className = "fb-help-desc";
      desc.textContent = r[1];
      var code = document.createElement("code");
      code.className = "fb-help-ex";
      code.innerHTML = highlight(r[0]);
      row.appendChild(desc);
      row.appendChild(code);
      grid.appendChild(row);
    });
    help.appendChild(grid);
    var fenceTitle = document.createElement("div");
    fenceTitle.className = "fb-help-subtitle";
    fenceTitle.textContent = "Custom HTML (default preset)";
    help.appendChild(fenceTitle);
    var fence = document.createElement("code");
    fence.className = "fb-help-ex fb-help-block";
    fence.innerHTML = highlight(":home, t=Home\n```\n<h1>Hello</h1>\n```");
    help.appendChild(fence);
    function keyGroup(title, defs) {
      var t = document.createElement("div");
      t.className = "fb-help-subtitle";
      t.textContent = title;
      help.appendChild(t);
      var keys = document.createElement("div");
      keys.className = "fb-help-keys";
      defs.forEach(function(d) {
        var span = document.createElement("span");
        var b = document.createElement("b");
        b.textContent = d[0];
        span.appendChild(b);
        span.appendChild(document.createTextNode(" " + d[1]));
        keys.appendChild(span);
      });
      help.appendChild(keys);
    }
    keyGroup("Screen attributes", [
      ["t", "title"],
      ["p", "preset"],
      ["f", "format"],
      ["e", "epic"],
      ["n", "note"],
      ["x y", "position"],
      ["h", "hidden"]
    ]);
    keyGroup("Epic attributes", [["t", "title"], ["c", "color"]]);
    keyGroup("Arrow attributes", [["l", "label"], ["fs", "from side"], ["ts", "to side"]]);
    var presetsTitle = document.createElement("div");
    presetsTitle.className = "fb-help-subtitle";
    presetsTitle.textContent = "Presets (p=)";
    help.appendChild(presetsTitle);
    var presets = document.createElement("div");
    presets.className = "fb-help-keys";
    presets.textContent = "custom \xB7 blank \xB7 form \xB7 list \xB7 table \xB7 dashboard \xB7 cardgrid \xB7 detail \xB7 auth \xB7 feed \xB7 settings \xB7 kanban \xB7 modal \xB7 gallery \xB7 nav";
    help.appendChild(presets);
    return help;
  }
  function setPanelText(text) {
    if (state.panelTextarea && state.panelTextarea.value !== text) {
      state.panelTextarea.value = text;
      refreshEditor();
    }
  }

  // src/interactions/sync.ts
  function rebuildBoard(project, positions) {
    exitFocus(false);
    state.project = project;
    state.hiddenScreens = {};
    (project.screens || []).forEach(function(s) {
      if (s.hidden) state.hiddenScreens[s.id] = true;
    });
    recomputeHiddenEpics();
    var ids = {};
    (project.screens || []).forEach(function(s) {
      ids[s.id] = true;
    });
    for (var sel in state.selected) {
      if (!ids[sel]) delete state.selected[sel];
    }
    var auto = autoLayout(project.screens || [], project.arrows || []);
    state.defaultPositions = auto;
    state.positions = {};
    (project.screens || []).forEach(function(s) {
      state.positions[s.id] = positions[s.id] || auto[s.id] || { x: 100, y: 100 };
    });
    var olds = state.canvasEl.querySelectorAll(".fb-screen");
    for (var i = 0; i < olds.length; i++) {
      if (olds[i].parentNode) olds[i].parentNode.removeChild(olds[i]);
    }
    while (state.svgEl.firstChild) state.svgEl.removeChild(state.svgEl.firstChild);
    state.screenEls = {};
    var frag = document.createDocumentFragment();
    (project.screens || []).forEach(function(s) {
      frag.appendChild(renderScreen(s));
    });
    state.canvasEl.appendChild(frag);
    drawArrows();
    syncToolbar();
  }
  function commit() {
    if (state.syncing) return;
    (state.project.screens || []).forEach(function(s) {
      s.hidden = !!state.hiddenScreens[s.id];
    });
    var text = serialize(state.project, persistedPositions());
    setPanelText(text);
    saveDoc(text);
  }
  var debounceTimer = null;
  function initSync() {
    state.commit = commit;
    var ta = state.panelTextarea;
    if (!ta) return;
    ta.addEventListener("input", function() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function() {
        var res = parse(ta.value);
        if (!res.project.screens || !res.project.screens.length) {
          saveDoc(ta.value);
          return;
        }
        state.syncing = true;
        rebuildBoard(res.project, res.positions);
        state.syncing = false;
        saveDoc(ta.value);
      }, 300);
    });
    commit();
  }

  // src/interactions/mode.ts
  function setMode(mode) {
    if (mode !== "select") mode = "drag";
    state.mode = mode;
    if (mode === "drag") {
      state.selected = {};
      updateSelectionStyles();
    }
    if (state.wrapperEl) {
      state.wrapperEl.classList.toggle("fb-mode-select", mode === "select");
      state.wrapperEl.classList.toggle("fb-mode-drag", mode === "drag");
    }
    var sw = state.container && state.container.querySelector(".fb-mode-switch");
    if (sw) {
      var btns = sw.querySelectorAll(".fb-mode-btn");
      for (var i = 0; i < btns.length; i++) {
        var btn = btns[i];
        btn.classList.toggle("active", btn.dataset.mode === mode);
      }
    }
  }
  function initModeKeys() {
    state.wrapperEl.addEventListener("mouseenter", function() {
      state.pointerInBoard = true;
    });
    state.wrapperEl.addEventListener("mouseleave", function() {
      state.pointerInBoard = false;
    });
    document.addEventListener("keydown", function(e) {
      if (!state.pointerInBoard) return;
      var t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "v" || e.key === "V") {
        setMode("select");
      } else if (e.key === "h" || e.key === "H") {
        setMode("drag");
      } else if (e.key === "Escape" && state.mode === "select") {
        state.selected = {};
        updateSelectionStyles();
      }
    });
  }

  // src/interactions/pan.ts
  function initPan() {
    var wrapper = state.wrapperEl;
    wrapper.addEventListener("wheel", function(e) {
      closeArrowPopup();
      closeScreenPopup();
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        var wrapperRect = wrapper.getBoundingClientRect();
        var mx = e.clientX - wrapperRect.left;
        var my = e.clientY - wrapperRect.top;
        var cx = (mx - state.panX) / state.zoom;
        var cy = (my - state.panY) / state.zoom;
        var delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        var newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round((state.zoom + delta) * 100) / 100));
        state.panX = mx - cx * newZoom;
        state.panY = my - cy * newZoom;
        state.zoom = newZoom;
        applyTransform();
        var label = document.getElementById("fb-zoom-label");
        if (label) label.textContent = Math.round(state.zoom * 100) + "%";
        saveZoom();
      } else {
        e.preventDefault();
        state.panX -= e.deltaX;
        state.panY -= e.deltaY;
        applyTransform();
        saveZoom();
      }
    }, { passive: false });
    wrapper.addEventListener("mousedown", function(e) {
      if (state.mode !== "drag") return;
      if (state.creatingArrow) return;
      if (e.target.closest(".fb-screen, .fb-arrow-handle, .fb-screen-popup, .fb-arrow-popup, .fb-preset-picker, .fb-ctx-menu, .fb-mode-switch, .fb-toolbar, .fb-legend")) return;
      if (e.button !== 0) return;
      closeArrowPopup();
      closeScreenPopup();
      state.panDrag = {
        startX: e.clientX,
        startY: e.clientY,
        startPanX: state.panX,
        startPanY: state.panY
      };
      wrapper.classList.add("fb-panning");
      e.preventDefault();
    });
    document.addEventListener("mousemove", function(e) {
      if (!state.panDrag) return;
      state.panX = state.panDrag.startPanX + (e.clientX - state.panDrag.startX);
      state.panY = state.panDrag.startPanY + (e.clientY - state.panDrag.startY);
      applyTransform();
    });
    document.addEventListener("mouseup", function() {
      if (!state.panDrag) return;
      state.panDrag = null;
      wrapper.classList.remove("fb-panning");
      saveZoom();
    });
  }

  // src/interactions/selection.ts
  function initSelection() {
    var wrapper = state.wrapperEl;
    wrapper.addEventListener("mousedown", function(e) {
      if (state.mode !== "select") return;
      if (state.creatingArrow) return;
      if (e.button !== 0) return;
      if (e.target.closest(".fb-screen, .fb-arrow-handle, .fb-screen-popup, .fb-arrow-popup, .fb-preset-picker, .fb-ctx-menu, .fb-mode-switch, .fb-toolbar, .fb-legend")) return;
      closeArrowPopup();
      closeScreenPopup();
      var additive = e.metaKey || e.ctrlKey || e.shiftKey;
      var base = {};
      if (additive) {
        for (var k in state.selected) base[k] = true;
      }
      state.selectBox = { startX: e.clientX, startY: e.clientY, base, additive, moved: false, el: null };
      e.preventDefault();
    });
    document.addEventListener("mousemove", function(e) {
      if (!state.selectBox) return;
      var sb = state.selectBox;
      if (!sb.moved && Math.abs(e.clientX - sb.startX) < SELECT_DRAG_THRESHOLD && Math.abs(e.clientY - sb.startY) < SELECT_DRAG_THRESHOLD) {
        return;
      }
      sb.moved = true;
      if (!sb.el) {
        sb.el = document.createElement("div");
        sb.el.className = "fb-select-rect";
        state.wrapperEl.appendChild(sb.el);
      }
      var wrapperRect = state.wrapperEl.getBoundingClientRect();
      var left = Math.min(e.clientX, sb.startX);
      var top = Math.min(e.clientY, sb.startY);
      var right = Math.max(e.clientX, sb.startX);
      var bottom = Math.max(e.clientY, sb.startY);
      sb.el.style.left = left - wrapperRect.left + "px";
      sb.el.style.top = top - wrapperRect.top + "px";
      sb.el.style.width = right - left + "px";
      sb.el.style.height = bottom - top + "px";
      var box2 = { left, top, right, bottom };
      var next = {};
      for (var bk in sb.base) next[bk] = true;
      var screens = state.project.screens || [];
      for (var i = 0; i < screens.length; i++) {
        var id = screens[i].id;
        if (state.hiddenScreens[id]) continue;
        var el2 = state.screenEls[id];
        if (!el2) continue;
        if (rectsIntersect(box2, el2.getBoundingClientRect())) next[id] = true;
      }
      state.selected = next;
      updateSelectionStyles();
    });
    document.addEventListener("mouseup", function() {
      if (!state.selectBox) return;
      var sb = state.selectBox;
      if (sb.el && sb.el.parentNode) sb.el.parentNode.removeChild(sb.el);
      if (!sb.moved && !sb.additive) {
        state.selected = {};
        updateSelectionStyles();
      }
      state.selectBox = null;
    });
  }

  // src/render/mode-switch.ts
  function renderModeSwitch() {
    var sw = document.createElement("div");
    sw.className = "fb-mode-switch";
    var selectBtn = document.createElement("button");
    selectBtn.className = "fb-mode-btn";
    selectBtn.dataset.mode = "select";
    selectBtn.title = "Cursor \u2014 select (V)";
    selectBtn.innerHTML = ICON_CURSOR;
    selectBtn.addEventListener("click", function() {
      setMode("select");
    });
    sw.appendChild(selectBtn);
    var dragBtn = document.createElement("button");
    dragBtn.className = "fb-mode-btn";
    dragBtn.dataset.mode = "drag";
    dragBtn.title = "Move \u2014 pan (H)";
    dragBtn.innerHTML = ICON_HAND;
    dragBtn.addEventListener("click", function() {
      setMode("drag");
    });
    sw.appendChild(dragBtn);
    return sw;
  }

  // src/board.ts
  function cycleLayout() {
    exitFocus();
    for (var n = 0; n < LAYOUT_STRATEGIES.length; n++) {
      state.layoutIndex = (state.layoutIndex + 1) % LAYOUT_STRATEGIES.length;
      var strat = LAYOUT_STRATEGIES[state.layoutIndex];
      if (!strat.available || strat.available()) break;
    }
    var heights = {};
    var screens = state.project.screens || [];
    var arrows = state.project.arrows || [];
    screens.forEach(function(s) {
      var el2 = state.screenEls[s.id];
      if (el2) heights[s.id] = el2.offsetHeight;
    });
    var layoutFn = LAYOUT_STRATEGIES[state.layoutIndex].fn;
    state.positions = layoutFn(screens, arrows, heights);
    screens.forEach(function(s) {
      var el2 = state.screenEls[s.id];
      var pos = state.positions[s.id];
      if (el2 && pos) {
        el2.style.left = pos.x + "px";
        el2.style.top = pos.y + "px";
      }
    });
    arrows.forEach(function(a) {
      delete a.fromSide;
      delete a.toSide;
    });
    drawArrows();
    freezeArrowSides();
    updateLayoutButton();
    savePositions();
    drawArrows();
    fitToContent();
  }
  function adjustSpacing(k) {
    if (!state.project) return;
    state.spacing = Math.max(0.4, Math.min(3, (state.spacing || 1) * k));
    var screens = state.project.screens || [];
    var arrows = state.project.arrows || [];
    if (state.focus) {
      var members = screens.filter(function(s) {
        return state.focus.visible[s.id];
      });
      var heights = {};
      members.forEach(function(s) {
        var el2 = state.screenEls[s.id];
        if (el2) heights[s.id] = el2.offsetHeight;
      });
      var inner = arrows.filter(function(a) {
        return state.focus.visible[a.from] && state.focus.visible[a.to];
      });
      var layout = autoLayout(members, inner, heights);
      members.forEach(function(s) {
        state.positions[s.id] = layout[s.id];
      });
    } else {
      var origin;
      if (state.wrapperEl) {
        var r = state.wrapperEl.getBoundingClientRect();
        if (r.width && r.height) {
          origin = { x: (r.width / 2 - state.panX) / state.zoom, y: (r.height / 2 - state.panY) / state.zoom };
        }
      }
      state.positions = spreadPositions(state.positions, k, origin);
      var minX = Infinity, minY = Infinity;
      screens.forEach(function(s) {
        var p = state.positions[s.id];
        if (p) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
        }
      });
      var shiftX = minX < 40 ? 40 - minX : 0, shiftY = minY < 40 ? 40 - minY : 0;
      if (shiftX || shiftY) {
        screens.forEach(function(s) {
          var p = state.positions[s.id];
          if (p) {
            p.x += shiftX;
            p.y += shiftY;
          }
        });
        state.panX -= shiftX * state.zoom;
        state.panY -= shiftY * state.zoom;
        applyTransform();
      }
    }
    screens.forEach(function(s) {
      var el2 = state.screenEls[s.id];
      var pos = state.positions[s.id];
      if (el2 && pos) {
        el2.style.left = pos.x + "px";
        el2.style.top = pos.y + "px";
      }
    });
    arrows.forEach(function(a) {
      delete a.fromSide;
      delete a.toSide;
    });
    drawArrows();
    freezeArrowSides();
    if (!state.focus) savePositions();
    drawArrows();
    if (state.focus) fitToContent();
  }
  function doReset() {
    if (!confirm("Reset to the default layout?")) return;
    exitFocus();
    var key = storageKey();
    try {
      localStorage.removeItem(key + "-pos");
      localStorage.removeItem(key + "-zoom");
      localStorage.removeItem(key + "-arrows");
      localStorage.removeItem(key + "-hidden");
      localStorage.removeItem(key + "-arrowmods");
    } catch (e) {
    }
    state.hiddenScreens = {};
    state.hiddenEpics = {};
    state.selected = {};
    state.layoutIndex = 0;
    var screens = state.project.screens || [];
    var arrows = state.project.arrows || [];
    var heights = {};
    screens.forEach(function(s) {
      var el2 = state.screenEls[s.id];
      if (el2) heights[s.id] = el2.offsetHeight;
    });
    state.positions = autoLayout(screens, arrows, heights);
    state.defaultPositions = JSON.parse(JSON.stringify(state.positions));
    screens.forEach(function(s) {
      var el2 = state.screenEls[s.id];
      var pos = state.positions[s.id];
      if (el2 && pos) {
        el2.style.left = pos.x + "px";
        el2.style.top = pos.y + "px";
        el2.classList.remove("fb-screen-dimmed", "fb-selected");
      }
    });
    var checkboxes = state.container.querySelectorAll(".fb-legend-checkbox");
    for (var i = 0; i < checkboxes.length; i++) {
      checkboxes[i].checked = true;
      var item = checkboxes[i].closest(".fb-legend-item");
      if (item) item.classList.remove("fb-dimmed");
    }
    updateLayoutButton();
    drawArrows();
    freezeArrowSides();
    fitToContent();
    if (state.commit) state.commit();
  }
  function init(config) {
    if (!config || !config.project) {
      console.error("FlowBoard.init: config.project is required");
      return;
    }
    state.project = config.project;
    state.storageKeyBase = "fb-" + (config.project.name || "default");
    var savedDoc = loadDoc();
    if (savedDoc && !config.state) {
      var parsedDoc = parse(savedDoc);
      if (parsedDoc.project.screens.length || parsedDoc.errors.length === 0) {
        var docHidden = {};
        parsedDoc.project.screens.forEach(function(s) {
          if (s.hidden) docHidden[s.id] = true;
        });
        config = {
          container: config.container,
          project: parsedDoc.project,
          state: { positions: parsedDoc.positions, hiddenScreens: docHidden, arrows: parsedDoc.project.arrows }
        };
        state.project = config.project;
      }
    }
    state.showNotes = true;
    state.showNav = true;
    state.spacing = 1;
    state.focus = null;
    state.highlightScreen = null;
    state.hiddenScreens = {};
    state.hiddenEpics = {};
    state.arrowPopup = null;
    state.creatingArrow = null;
    state.anchorDotsEls = [];
    state.layoutIndex = 0;
    var configState = config.state || null;
    if (configState && configState.arrows) {
      state.project.arrows = JSON.parse(JSON.stringify(configState.arrows));
    } else {
      var savedArrowMods = loadArrowMutations();
      if (savedArrowMods) state.project.arrows = savedArrowMods;
    }
    if (configState && configState.hiddenScreens) {
      state.hiddenScreens = JSON.parse(JSON.stringify(configState.hiddenScreens));
    } else {
      var savedHidden = loadHiddenScreens();
      if (savedHidden) {
        state.hiddenScreens = savedHidden;
      }
    }
    recomputeHiddenEpics();
    var containerEl;
    if (typeof config.container === "string") {
      containerEl = document.querySelector(config.container);
    } else if (config.container instanceof HTMLElement) {
      containerEl = config.container;
    }
    if (!containerEl) {
      console.error("FlowBoard.init: container not found");
      return;
    }
    if (containerEl.parentElement === document.body) containerEl.classList.add("fb-fullpage");
    var root = document.createElement("div");
    root.className = "fb-container";
    containerEl.innerHTML = "";
    containerEl.appendChild(root);
    state.container = root;
    root.appendChild(renderToolbar());
    var wrapper = document.createElement("div");
    wrapper.className = "fb-canvas-wrapper";
    var sizer = document.createElement("div");
    sizer.className = "fb-canvas-sizer";
    var canvas = document.createElement("div");
    canvas.className = "fb-canvas";
    canvas.style.width = CANVAS_W + "px";
    canvas.style.height = CANVAS_H + "px";
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "fb-arrows-layer");
    svg.setAttribute("width", String(CANVAS_W));
    svg.setAttribute("height", String(CANVAS_H));
    canvas.appendChild(svg);
    sizer.appendChild(canvas);
    wrapper.appendChild(sizer);
    wrapper.appendChild(renderModeSwitch());
    var body = document.createElement("div");
    body.className = "fb-body";
    body.appendChild(renderPanel());
    body.appendChild(wrapper);
    root.appendChild(body);
    state.wrapperEl = wrapper;
    state.sizerEl = sizer;
    state.canvasEl = canvas;
    state.svgEl = svg;
    state.screenEls = {};
    var screens = state.project.screens || [];
    var arrows = state.project.arrows || [];
    state.defaultPositions = autoLayout(screens, arrows);
    state.positions = JSON.parse(JSON.stringify(state.defaultPositions));
    var hasSavedPositions = false;
    if (configState && configState.positions) {
      hasSavedPositions = true;
      screens.forEach(function(s) {
        if (configState.positions[s.id]) state.positions[s.id] = configState.positions[s.id];
      });
    } else {
      var savedPos = loadPositions();
      if (savedPos) {
        hasSavedPositions = true;
        screens.forEach(function(s) {
          if (savedPos[s.id]) state.positions[s.id] = savedPos[s.id];
        });
      }
    }
    var hasSavedZoom = false;
    if (configState && configState.zoom !== void 0) {
      hasSavedZoom = true;
      state.zoom = configState.zoom;
      state.panX = configState.panX || 0;
      state.panY = configState.panY || 0;
    } else {
      var savedZoom = loadZoom();
      if (savedZoom) {
        hasSavedZoom = true;
        state.zoom = savedZoom.zoom || 1;
        state.panX = savedZoom.panX || 0;
        state.panY = savedZoom.panY || 0;
      }
    }
    if (hasSavedZoom) {
      var zl = document.getElementById("fb-zoom-label");
      if (zl) zl.textContent = Math.round(state.zoom * 100) + "%";
    }
    screens.forEach(function(s) {
      var el2 = renderScreen(s);
      canvas.appendChild(el2);
    });
    applyTransform();
    initPan();
    initDrag();
    initArrowDrag();
    initSelection();
    initModeKeys();
    initCreateMenu();
    setMode("drag");
    initSync();
    requestAnimationFrame(function() {
      var heights = {};
      screens.forEach(function(s) {
        var el2 = state.screenEls[s.id];
        if (el2) heights[s.id] = el2.offsetHeight;
      });
      state.defaultPositions = autoLayout(screens, arrows, heights);
      if (!hasSavedPositions) {
        state.positions = JSON.parse(JSON.stringify(state.defaultPositions));
        screens.forEach(function(s) {
          var el2 = state.screenEls[s.id];
          var pos = state.positions[s.id];
          if (el2 && pos) {
            el2.style.left = pos.x + "px";
            el2.style.top = pos.y + "px";
          }
        });
      }
      if (!hasSavedZoom || !isContentInView()) {
        fitToContent();
      }
      drawArrows();
      freezeArrowSides();
      if (state.commit) state.commit();
      if (!savedDoc) {
        try {
          var mk = storageKey();
          localStorage.removeItem(mk + "-pos");
          localStorage.removeItem(mk + "-hidden");
          localStorage.removeItem(mk + "-arrowmods");
        } catch (e) {
        }
      }
    });
  }

  // src/index.ts
  window.FlowBoard = { init };
})();
