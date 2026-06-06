(() => {
  // src/core/constants.ts
  var CANVAS_W = 1e4;
  var CANVAS_H = 8e3;
  var ZOOM_MIN = 0.2;
  var ZOOM_MAX = 2;
  var ZOOM_STEP = 0.1;
  var SIZES = { sm: 240, md: 320, lg: 400, xl: 520 };
  var GAP_X = 100;
  var GAP_Y = 40;
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
    panDrag: null
  };
  function getEpic(epicId) {
    if (!state.project || !state.project.epics) return null;
    for (var i = 0; i < state.project.epics.length; i++) {
      if (state.project.epics[i].id === epicId) return state.project.epics[i];
    }
    return null;
  }

  // src/core/storage.ts
  function storageKey() {
    return "fb-" + (state.project ? state.project.name : "default");
  }
  function savePositions() {
    try {
      localStorage.setItem(storageKey() + "-pos", JSON.stringify(state.positions));
    } catch (e) {
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
    try {
      localStorage.setItem(storageKey() + "-hidden", JSON.stringify(state.hiddenScreens));
    } catch (e) {
    }
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
    try {
      localStorage.setItem(storageKey() + "-arrowmods", JSON.stringify(state.project.arrows));
    } catch (e) {
    }
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
      var dot = document.createElement("div");
      dot.className = "fb-anchor-dot";
      dot.style.left = anchor.x - 6 + "px";
      dot.style.top = anchor.y - 6 + "px";
      dot.dataset.screenId = screenId;
      dot.dataset.anchorName = anchor.name;
      dot.addEventListener("mouseenter", function() {
        cancelHideAnchors();
        dot.classList.add("fb-anchor-dot-hover");
      });
      dot.addEventListener("mouseleave", function() {
        dot.classList.remove("fb-anchor-dot-hover");
        scheduleHideAnchors();
      });
      dot.addEventListener("mousedown", function(e) {
        e.stopPropagation();
        e.preventDefault();
        startArrowCreation(screenId, anchor.name);
      });
      state.canvasEl.appendChild(dot);
      state.anchorDotsEls.push(dot);
    });
  }
  function hideAnchorDots() {
    state.anchorDotsEls.forEach(function(el) {
      if (el.parentNode) el.parentNode.removeChild(el);
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
        var dot = document.createElement("div");
        dot.className = "fb-anchor-dot";
        dot.style.left = anchor.x - 6 + "px";
        dot.style.top = anchor.y - 6 + "px";
        dot.dataset.screenId = s.id;
        dot.dataset.anchorName = anchor.name;
        dot.addEventListener("mouseenter", function() {
          dot.classList.add("fb-anchor-dot-hover");
        });
        dot.addEventListener("mouseleave", function() {
          dot.classList.remove("fb-anchor-dot-hover");
        });
        dot.addEventListener("mousedown", function(e) {
          e.stopPropagation();
          e.preventDefault();
          if (state.creatingArrow && s.id !== state.creatingArrow.fromScreenId) {
            completeArrowCreation(s.id, anchor.name);
          }
        });
        state.canvasEl.appendChild(dot);
        state.anchorDotsEls.push(dot);
      });
    });
    if (state.creatingArrow) {
      state.anchorDotsEls.forEach(function(dot) {
        if (dot.dataset.screenId === state.creatingArrow.fromScreenId && dot.dataset.anchorName === state.creatingArrow.fromSide) {
          dot.classList.add("fb-anchor-dot-source");
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
      skeleton: () => `<div class="fb-skel-cards">${rep(6, box)}</div>`
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
    var el = state.screenEls[screenId];
    if (!el) return;
    if (state.hiddenScreens[screenId]) {
      el.classList.add("fb-screen-dimmed");
      if (state.selected[screenId]) {
        delete state.selected[screenId];
        el.classList.remove("fb-selected");
      }
    } else {
      el.classList.remove("fb-screen-dimmed");
    }
  }
  function renderScreen(screenData) {
    var epic = getEpic(screenData.epic);
    var color = epic ? epic.color : "#666";
    var size = screenData.size || "md";
    var el = document.createElement("div");
    el.className = "fb-screen fb-size-" + size;
    el.dataset.screenId = screenData.id;
    var pos = state.positions[screenData.id] || { x: 100, y: 100 };
    el.style.left = pos.x + "px";
    el.style.top = pos.y + "px";
    var hdr = document.createElement("div");
    hdr.className = "fb-screen-header";
    hdr.style.background = color;
    hdr.innerHTML = "<span>" + escapeHtml(screenData.title) + "</span>";
    var toggleBtn = document.createElement("button");
    toggleBtn.className = "fb-screen-toggle";
    toggleBtn.title = "Masquer cet \xE9cran";
    toggleBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    toggleBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      toggleScreen(screenData.id);
    });
    hdr.appendChild(toggleBtn);
    el.appendChild(hdr);
    var body = document.createElement("div");
    body.className = "fb-screen-body";
    var preset = screenData.preset || "custom";
    if (isCustomPreset(preset)) {
      body.innerHTML = screenData.content || "";
    } else {
      body.classList.add("fb-skeleton", "fb-skel-" + preset);
      body.innerHTML = skeletonHtml(preset);
    }
    el.appendChild(body);
    if (screenData.notes) {
      var footer = document.createElement("div");
      footer.className = "fb-screen-footer" + (state.showNotes ? "" : " fb-hidden");
      footer.textContent = screenData.notes;
      el.appendChild(footer);
    }
    if (state.hiddenScreens[screenData.id]) {
      el.classList.add("fb-screen-dimmed");
    }
    el.addEventListener("contextmenu", function(e) {
      e.preventDefault();
      e.stopPropagation();
      showScreenPopup(e, screenData.id);
    });
    el.addEventListener("mouseenter", function() {
      if (!state.creatingArrow && !state.screenDrag && !state.selectBox) {
        cancelHideAnchors();
        showAnchorDots(screenData.id);
      }
    });
    el.addEventListener("mouseleave", function() {
      if (!state.creatingArrow) {
        scheduleHideAnchors();
      }
    });
    state.screenEls[screenData.id] = el;
    return el;
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
    var popupSep = document.createElement("div");
    popupSep.className = "fb-arrow-popup-sep";
    popup.appendChild(popupSep);
    var swapBtn = document.createElement("button");
    swapBtn.className = "fb-arrow-popup-btn";
    swapBtn.title = "Inverser la direction";
    swapBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';
    swapBtn.addEventListener("click", function(ev) {
      ev.stopPropagation();
      swapArrowDirection(arrowIndex);
      closeArrowPopup();
    });
    popup.appendChild(swapBtn);
    var styleBtn = document.createElement("button");
    styleBtn.className = "fb-arrow-popup-btn";
    styleBtn.title = arrow.dashed ? "Trait plein" : "Trait pointill\xE9";
    if (arrow.dashed) {
      styleBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="3" y1="12" x2="21" y2="12"/></svg>';
    } else {
      styleBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="3 3"><line x1="3" y1="12" x2="21" y2="12"/></svg>';
    }
    styleBtn.addEventListener("click", function(ev) {
      ev.stopPropagation();
      toggleArrowStyle(arrowIndex);
      closeArrowPopup();
    });
    popup.appendChild(styleBtn);
    var deleteBtn = document.createElement("button");
    deleteBtn.className = "fb-arrow-popup-btn fb-arrow-popup-delete";
    deleteBtn.title = "Supprimer la fl\xE8che";
    deleteBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
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
    var el = state.screenEls[screenId];
    if (!el) return;
    var popup = document.createElement("div");
    popup.className = "fb-screen-popup";
    var sizeLabel = document.createElement("div");
    sizeLabel.className = "fb-screen-popup-label";
    sizeLabel.textContent = "Taille";
    popup.appendChild(sizeLabel);
    var sizesRow = document.createElement("div");
    sizesRow.className = "fb-screen-popup-sizes";
    var currentSize = screenData.size || "md";
    ["sm", "md", "lg", "xl"].forEach(function(sz) {
      var btn = document.createElement("button");
      btn.className = "fb-screen-popup-size" + (sz === currentSize ? " active" : "");
      btn.textContent = sz.toUpperCase();
      btn.addEventListener("click", function(ev) {
        ev.stopPropagation();
        screenData.size = sz;
        el.className = el.className.replace(/fb-size-\w+/, "fb-size-" + sz);
        saveArrowMutations();
        drawArrows();
        closeScreenPopup();
      });
      sizesRow.appendChild(btn);
    });
    popup.appendChild(sizesRow);
    var sep1 = document.createElement("div");
    sep1.className = "fb-screen-popup-sep";
    popup.appendChild(sep1);
    var titleLabel = document.createElement("div");
    titleLabel.className = "fb-screen-popup-label";
    titleLabel.textContent = "Titre";
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
          var hdrSpan = el.querySelector(".fb-screen-header span");
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
        var hdrSpan = el.querySelector(".fb-screen-header span");
        if (hdrSpan) hdrSpan.textContent = val;
        saveArrowMutations();
      }
    });
    popup.appendChild(titleInput);
    var sep2 = document.createElement("div");
    sep2.className = "fb-screen-popup-sep";
    popup.appendChild(sep2);
    var hideBtn = document.createElement("button");
    hideBtn.className = "fb-screen-popup-btn";
    hideBtn.textContent = state.hiddenScreens[screenId] ? "Afficher" : "Masquer";
    hideBtn.addEventListener("click", function(ev) {
      ev.stopPropagation();
      toggleScreen(screenId);
      closeScreenPopup();
    });
    popup.appendChild(hideBtn);
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
    var el = state.screenEls[screenId];
    if (!el) return { x: 0, y: 0 };
    var pos = state.positions[screenId];
    var w = el.offsetWidth;
    var h = el.offsetHeight;
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
  function drawArrows(skipHandles) {
    if (!state.svgEl || !state.project) return;
    var arrows = state.project.arrows || [];
    var ns = "http://www.w3.org/2000/svg";
    var spreadMap = buildSpreadMap();
    state.svgEl.innerHTML = "";
    var defs = document.createElementNS(ns, "defs");
    var marker = document.createElementNS(ns, "marker");
    marker.setAttribute("id", "fb-arrowhead");
    marker.setAttribute("markerUnits", "userSpaceOnUse");
    marker.setAttribute("markerWidth", "14");
    marker.setAttribute("markerHeight", "14");
    marker.setAttribute("refX", "14");
    marker.setAttribute("refY", "7");
    marker.setAttribute("orient", "auto");
    var polygon = document.createElementNS(ns, "polygon");
    polygon.setAttribute("points", "0 0, 14 7, 0 14");
    polygon.setAttribute("fill", "#888");
    marker.appendChild(polygon);
    defs.appendChild(marker);
    state.svgEl.appendChild(defs);
    arrows.forEach(function(arrow, idx) {
      var fromEl = state.screenEls[arrow.from];
      var toEl = state.screenEls[arrow.to];
      if (!fromEl || !toEl) return;
      var sides = resolveArrowSides(arrow, idx, spreadMap);
      var start = getAnchor(arrow.from, sides.from);
      var end = getAnchor(arrow.to, sides.to);
      var cps = computeControlPoints(start, end, sides.from, sides.to);
      var cp1 = cps.cp1;
      var cp2 = cps.cp2;
      var d = "M" + start.x + "," + start.y + " C" + cp1.x + "," + cp1.y + " " + cp2.x + "," + cp2.y + " " + end.x + "," + end.y;
      var isDimmed = state.hiddenScreens[arrow.from] || state.hiddenScreens[arrow.to];
      var g = document.createElementNS(ns, "g");
      g.setAttribute("class", "fb-arrow-group" + (isDimmed ? " fb-arrow-dimmed" : ""));
      var path = document.createElementNS(ns, "path");
      path.setAttribute("d", d);
      path.setAttribute("class", "fb-arrow-path" + (arrow.dashed ? " fb-dashed" : ""));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "#888");
      path.setAttribute("stroke-width", "2");
      if (arrow.dashed) {
        path.setAttribute("stroke-dasharray", "6 4");
      }
      path.setAttribute("marker-end", "url(#fb-arrowhead)");
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
      if (arrow.label) {
        var midX = (start.x + end.x + cp1.x + cp2.x) / 4;
        var midY = (start.y + end.y + cp1.y + cp2.y) / 4;
        var labelGroup = document.createElementNS(ns, "g");
        if (isDimmed) labelGroup.setAttribute("class", "fb-arrow-dimmed");
        var text = document.createElementNS(ns, "text");
        text.setAttribute("x", String(midX));
        text.setAttribute("y", String(midY));
        text.setAttribute("class", "fb-arrow-label");
        text.setAttribute("fill", "#555");
        text.setAttribute("font-size", "11");
        text.setAttribute("font-family", '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "central");
        text.textContent = arrow.label;
        state.svgEl.appendChild(text);
        var bbox;
        try {
          bbox = text.getBBox();
        } catch (e) {
          bbox = { x: midX - 20, y: midY - 8, width: 40, height: 16 };
        }
        state.svgEl.removeChild(text);
        var bgRect = document.createElementNS(ns, "rect");
        bgRect.setAttribute("x", String(bbox.x - 4));
        bgRect.setAttribute("y", String(bbox.y - 2));
        bgRect.setAttribute("width", String(bbox.width + 8));
        bgRect.setAttribute("height", String(bbox.height + 4));
        bgRect.setAttribute("class", "fb-arrow-label-bg");
        bgRect.setAttribute("fill", "#f0f2f5");
        bgRect.setAttribute("rx", "3");
        bgRect.setAttribute("ry", "3");
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
    state.handleEls.forEach(function(el) {
      if (el.parentNode) el.parentNode.removeChild(el);
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

  // src/interactions/drag.ts
  function updateSelectionStyles() {
    for (var id in state.screenEls) {
      var el = state.screenEls[id];
      if (!el) continue;
      if (state.selected[id]) {
        el.classList.add("fb-selected");
      } else {
        el.classList.remove("fb-selected");
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
      var el = state.screenEls[id];
      if (!el) continue;
      var pos = state.positions[id] || { x: 0, y: 0 };
      el.classList.add("fb-dragging");
      items.push({ id, el, startX: pos.x, startY: pos.y });
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
      drawArrows(!!state.draggingHandle);
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
  function fitToContent() {
    if (!state.wrapperEl || !state.project) return;
    var screens = state.project.screens || [];
    var minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
    var hasVisible = false;
    screens.forEach(function(s) {
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
      if (e.target.closest(".fb-screen, .fb-arrow-handle, .fb-popup, .fb-mode-switch, .fb-toolbar, .fb-legend")) return;
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
      if (e.target.closest(".fb-screen, .fb-arrow-handle, .fb-popup, .fb-mode-switch, .fb-toolbar, .fb-legend")) return;
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
        var el = state.screenEls[id];
        if (!el) continue;
        if (rectsIntersect(box2, el.getBoundingClientRect())) next[id] = true;
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
  function autoLayout(screens, arrows, heights) {
    var col = bfsDepth(screens, arrows);
    var columns = {};
    screens.forEach(function(s) {
      var c = col[s.id];
      if (!columns[c]) columns[c] = [];
      columns[c].push(s);
    });
    var positions = {};
    var colKeys = Object.keys(columns).map(Number).sort(function(a, b) {
      return a - b;
    });
    var offsetX = 0;
    var totalH = 0;
    colKeys.forEach(function(c) {
      var colScreens = columns[c];
      var maxW = 0;
      colScreens.forEach(function(s) {
        var w = SIZES[s.size || "md"] || SIZES.md;
        if (w > maxW) maxW = w;
      });
      var offsetY = 0;
      colScreens.forEach(function(s) {
        positions[s.id] = { x: offsetX, y: offsetY };
        var h = heights && heights[s.id] ? heights[s.id] : 200;
        offsetY += h + GAP_Y;
      });
      if (offsetY - GAP_Y > totalH) totalH = offsetY - GAP_Y;
      offsetX += maxW + GAP_X;
    });
    var totalW = offsetX - GAP_X;
    centerPositions(positions, screens, totalW, totalH);
    return positions;
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
    var col = bfsDepth(screens, arrows);
    var positions = {};
    var offsetX = 0;
    var totalH = 0;
    epicOrder.forEach(function(eid) {
      var group = epicGroups[eid];
      group.sort(function(a, b) {
        return (col[a.id] || 0) - (col[b.id] || 0);
      });
      var maxW = 0;
      group.forEach(function(s) {
        var w = SIZES[s.size || "md"] || SIZES.md;
        if (w > maxW) maxW = w;
      });
      var offsetY = 0;
      group.forEach(function(s) {
        positions[s.id] = { x: offsetX, y: offsetY };
        var h = heights && heights[s.id] ? heights[s.id] : 200;
        offsetY += h + GAP_Y;
      });
      if (offsetY - GAP_Y > totalH) totalH = offsetY - GAP_Y;
      offsetX += maxW + GAP_X;
    });
    centerPositions(positions, screens, offsetX - GAP_X, totalH);
    return positions;
  }
  function layoutGrid(screens, arrows, heights) {
    var cols = Math.max(1, Math.round(Math.sqrt(screens.length)));
    var positions = {};
    var offsetX = 0, offsetY = 0;
    var rowMaxH = 0;
    var totalW = 0, totalH = 0;
    screens.forEach(function(s, i) {
      var colIdx = i % cols;
      if (colIdx === 0 && i > 0) {
        offsetY += rowMaxH + GAP_Y;
        offsetX = 0;
        rowMaxH = 0;
      }
      positions[s.id] = { x: offsetX, y: offsetY };
      var w = SIZES[s.size || "md"] || SIZES.md;
      var h = heights && heights[s.id] ? heights[s.id] : 200;
      if (h > rowMaxH) rowMaxH = h;
      offsetX += w + GAP_X;
      if (offsetX > totalW) totalW = offsetX;
    });
    totalH = offsetY + rowMaxH;
    centerPositions(positions, screens, totalW - GAP_X, totalH);
    return positions;
  }
  var LAYOUT_STRATEGIES = [
    { name: "Flow", fn: autoLayout },
    { name: "Epics", fn: layoutByEpics },
    { name: "Grid", fn: layoutGrid }
  ];

  // src/render/mode-switch.ts
  function renderModeSwitch() {
    var sw = document.createElement("div");
    sw.className = "fb-mode-switch";
    var selectBtn = document.createElement("button");
    selectBtn.className = "fb-mode-btn";
    selectBtn.dataset.mode = "select";
    selectBtn.title = "Curseur \u2014 s\xE9lection (V)";
    selectBtn.innerHTML = ICON_CURSOR;
    selectBtn.addEventListener("click", function() {
      setMode("select");
    });
    sw.appendChild(selectBtn);
    var dragBtn = document.createElement("button");
    dragBtn.className = "fb-mode-btn";
    dragBtn.dataset.mode = "drag";
    dragBtn.title = "D\xE9placement \u2014 pan (H)";
    dragBtn.innerHTML = ICON_HAND;
    dragBtn.addEventListener("click", function() {
      setMode("drag");
    });
    sw.appendChild(dragBtn);
    return sw;
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
  function collectExportBounds() {
    var minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
    var arrows = state.project.arrows || [];
    var spreadMap = buildSpreadMap();
    state.project.screens.forEach(function(s) {
      if (state.hiddenScreens[s.id]) return;
      var el = state.screenEls[s.id];
      var pos = state.positions[s.id];
      if (!el || !pos) return;
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + el.offsetWidth);
      maxY = Math.max(maxY, pos.y + el.offsetHeight);
    });
    arrows.forEach(function(arrow, idx) {
      if (state.hiddenScreens[arrow.from] || state.hiddenScreens[arrow.to]) return;
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
      if (state.hiddenScreens[s.id]) return;
      var el = state.screenEls[s.id];
      var pos = state.positions[s.id];
      if (!el || !pos) return;
      var clone = el.cloneNode(true);
      clone.classList.remove("fb-selected", "fb-dragging");
      clone.style.left = pos.x - vx + "px";
      clone.style.top = pos.y - vy + "px";
      tmp.appendChild(clone);
    });
    var svgClone = state.svgEl.cloneNode(true);
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
    var img = new Image();
    img.onload = function() {
      URL.revokeObjectURL(url);
      var ac = document.createElement("canvas");
      ac.width = vw * 2;
      ac.height = vh * 2;
      ac.style.cssText = "position:absolute;top:0;left:0;width:" + vw + "px;height:" + vh + "px;pointer-events:none;";
      ac.getContext("2d").drawImage(img, 0, 0, vw * 2, vh * 2);
      tmp.appendChild(ac);
      document.body.appendChild(tmp);
      loadHtml2Canvas().then(function(html2canvas) {
        return html2canvas(tmp, {
          width: vw,
          height: vh,
          scale: 2,
          backgroundColor: "#f0f2f5",
          useCORS: true
        });
      }).then(function(resultCanvas) {
        document.body.removeChild(tmp);
        var link = document.createElement("a");
        link.download = (state.project.name || "flowboard") + ".png";
        link.href = resultCanvas.toDataURL("image/png");
        link.click();
      }).catch(function(err) {
        if (tmp.parentNode) document.body.removeChild(tmp);
        console.error("Export failed:", err);
      });
    };
    img.onerror = function() {
      URL.revokeObjectURL(url);
      console.error("Arrow rasterization failed");
    };
    img.src = url;
  }
  function doExportConfig() {
    var projectCopy = {
      name: state.project.name,
      epics: JSON.parse(JSON.stringify(state.project.epics || [])),
      screens: (state.project.screens || []).map(function(s) {
        var clean = {
          id: s.id,
          title: s.title,
          epic: s.epic,
          size: s.size
        };
        if (s.label) clean.label = s.label;
        if (s.notes) clean.notes = s.notes;
        if (s.content) clean.content = s.content;
        return clean;
      }),
      arrows: JSON.parse(JSON.stringify(state.project.arrows))
    };
    var stateCopy = {
      positions: JSON.parse(JSON.stringify(state.positions)),
      zoom: state.zoom,
      panX: state.panX,
      panY: state.panY,
      hiddenScreens: JSON.parse(JSON.stringify(state.hiddenScreens))
    };
    var screenStrs = projectCopy.screens.map(function(s) {
      var lines = [];
      lines.push("      {");
      lines.push("        id: " + JSON.stringify(s.id) + ",");
      lines.push("        title: " + JSON.stringify(s.title) + ",");
      lines.push("        epic: " + JSON.stringify(s.epic) + ",");
      lines.push("        size: " + JSON.stringify(s.size) + ",");
      if (s.label) lines.push("        label: " + JSON.stringify(s.label) + ",");
      if (s.notes) lines.push("        notes: " + JSON.stringify(s.notes) + ",");
      if (s.content) {
        lines.push("        content: `");
        lines.push(s.content.replace(/`/g, "\\`"));
        lines.push("        `");
      }
      lines.push("      }");
      return lines.join("\n");
    });
    var arrowStrs = projectCopy.arrows.map(function(a) {
      var parts = ["from: " + JSON.stringify(a.from), "to: " + JSON.stringify(a.to)];
      if (a.label) parts.push("label: " + JSON.stringify(a.label));
      if (a.dashed) parts.push("dashed: true");
      if (a.fromSide) parts.push("fromSide: " + JSON.stringify(a.fromSide));
      if (a.toSide) parts.push("toSide: " + JSON.stringify(a.toSide));
      return "      { " + parts.join(", ") + " }";
    });
    var js = "FlowBoard.init({\n";
    js += "  container: '#app',\n";
    js += "  project: {\n";
    js += "    name: " + JSON.stringify(projectCopy.name) + ",\n";
    js += "    epics: " + JSON.stringify(projectCopy.epics, null, 6).replace(/\n/g, "\n    ") + ",\n";
    js += "    screens: [\n" + screenStrs.join(",\n") + "\n    ],\n";
    js += "    arrows: [\n" + arrowStrs.join(",\n") + "\n    ]\n";
    js += "  },\n";
    js += "  state: " + JSON.stringify(stateCopy, null, 4).replace(/\n/g, "\n  ") + "\n";
    js += "});\n";
    var btn = state.container.querySelector('.fb-action-btn[title*="presse-papier"]');
    function showFeedback(success) {
      if (!btn) return;
      var original = btn.textContent;
      btn.textContent = success ? "Copied!" : "Error!";
      setTimeout(function() {
        btn.textContent = original;
      }, 2e3);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(js).then(function() {
        showFeedback(true);
      }, function() {
        showFeedback(false);
      });
    } else {
      var ta = document.createElement("textarea");
      ta.value = js;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        showFeedback(true);
      } catch (e) {
        showFeedback(false);
      }
      document.body.removeChild(ta);
    }
  }

  // src/render/toolbar.ts
  function updateLayoutButton() {
    var btn = document.getElementById("fb-layout-btn");
    if (btn) {
      var name = LAYOUT_STRATEGIES[state.layoutIndex].name;
      btn.textContent = "Auto-Layout (" + name + ")";
    }
  }
  function renderToolbar() {
    var header = document.createElement("div");
    header.className = "fb-header";
    var left = document.createElement("div");
    left.className = "fb-toolbar-group";
    var title = document.createElement("span");
    title.className = "fb-project-title";
    title.textContent = state.project.name || "FlowBoard";
    left.appendChild(title);
    var sep1 = document.createElement("div");
    sep1.className = "fb-header-separator";
    left.appendChild(sep1);
    var legend = document.createElement("div");
    legend.className = "fb-legend";
    (state.project.epics || []).forEach(function(epic) {
      var label = document.createElement("label");
      label.className = "fb-legend-item";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !state.hiddenEpics[epic.id];
      cb.className = "fb-legend-checkbox";
      cb.style.accentColor = epic.color;
      cb.dataset.epicId = epic.id;
      cb.addEventListener("change", function() {
        toggleEpic(epic.id);
      });
      label.appendChild(cb);
      var dot = document.createElement("span");
      dot.className = "fb-legend-dot";
      dot.style.background = epic.color;
      label.appendChild(dot);
      label.appendChild(document.createTextNode(epic.label));
      legend.appendChild(label);
    });
    left.appendChild(legend);
    header.appendChild(left);
    var right = document.createElement("div");
    right.className = "fb-toolbar-group";
    var toggleLabel = document.createElement("label");
    toggleLabel.className = "fb-toggle-label";
    var checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.showNotes;
    checkbox.addEventListener("change", function() {
      state.showNotes = checkbox.checked;
      toggleNotesVisibility();
    });
    toggleLabel.appendChild(checkbox);
    toggleLabel.appendChild(document.createTextNode("Notes"));
    right.appendChild(toggleLabel);
    var sep2 = document.createElement("div");
    sep2.className = "fb-header-separator";
    right.appendChild(sep2);
    var zoomOut = document.createElement("button");
    zoomOut.className = "fb-toolbar-btn";
    zoomOut.textContent = "\u2212";
    zoomOut.title = "Zoom out";
    zoomOut.addEventListener("click", function() {
      setZoom(state.zoom - ZOOM_STEP);
    });
    right.appendChild(zoomOut);
    var zoomLabel = document.createElement("span");
    zoomLabel.className = "fb-zoom-label";
    zoomLabel.id = "fb-zoom-label";
    zoomLabel.textContent = Math.round(state.zoom * 100) + "%";
    right.appendChild(zoomLabel);
    var zoomIn = document.createElement("button");
    zoomIn.className = "fb-toolbar-btn";
    zoomIn.textContent = "+";
    zoomIn.title = "Zoom in";
    zoomIn.addEventListener("click", function() {
      setZoom(state.zoom + ZOOM_STEP);
    });
    right.appendChild(zoomIn);
    var sep3 = document.createElement("div");
    sep3.className = "fb-header-separator";
    right.appendChild(sep3);
    var layoutBtn = document.createElement("button");
    layoutBtn.className = "fb-action-btn";
    layoutBtn.id = "fb-layout-btn";
    layoutBtn.title = "Changer la disposition";
    layoutBtn.textContent = "Auto-Layout (" + LAYOUT_STRATEGIES[state.layoutIndex].name + ")";
    layoutBtn.addEventListener("click", cycleLayout);
    right.appendChild(layoutBtn);
    var exportBtn = document.createElement("button");
    exportBtn.className = "fb-action-btn";
    exportBtn.textContent = "Export PNG";
    exportBtn.title = "Export as PNG";
    exportBtn.addEventListener("click", doExport);
    right.appendChild(exportBtn);
    var exportConfigBtn = document.createElement("button");
    exportConfigBtn.className = "fb-action-btn";
    exportConfigBtn.textContent = "Copy Init";
    exportConfigBtn.title = "Copier le code FlowBoard.init() dans le presse-papier";
    exportConfigBtn.addEventListener("click", doExportConfig);
    right.appendChild(exportConfigBtn);
    var sep4 = document.createElement("div");
    sep4.className = "fb-header-separator";
    right.appendChild(sep4);
    var resetBtn = document.createElement("button");
    resetBtn.className = "fb-action-btn";
    resetBtn.textContent = "Reset";
    resetBtn.title = "Remettre la disposition par d\xE9faut";
    resetBtn.addEventListener("click", doReset);
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
  function toggleEpic(epicId) {
    var hasVisible = false;
    state.project.screens.forEach(function(s) {
      if (s.epic === epicId && !state.hiddenScreens[s.id]) hasVisible = true;
    });
    var isHiding = hasVisible;
    if (isHiding) {
      state.hiddenEpics[epicId] = true;
    } else {
      delete state.hiddenEpics[epicId];
    }
    var checkboxes = state.container.querySelectorAll(".fb-legend-checkbox");
    for (var i = 0; i < checkboxes.length; i++) {
      var cb = checkboxes[i];
      var item = cb.closest(".fb-legend-item");
      if (cb.dataset.epicId === epicId) {
        cb.checked = !isHiding;
        if (isHiding) {
          item.classList.add("fb-dimmed");
        } else {
          item.classList.remove("fb-dimmed");
        }
      }
    }
    state.project.screens.forEach(function(s) {
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

  // src/board.ts
  function cycleLayout() {
    state.layoutIndex = (state.layoutIndex + 1) % LAYOUT_STRATEGIES.length;
    var heights = {};
    var screens = state.project.screens || [];
    var arrows = state.project.arrows || [];
    screens.forEach(function(s) {
      var el = state.screenEls[s.id];
      if (el) heights[s.id] = el.offsetHeight;
    });
    var layoutFn = LAYOUT_STRATEGIES[state.layoutIndex].fn;
    state.positions = layoutFn(screens, arrows, heights);
    screens.forEach(function(s) {
      var el = state.screenEls[s.id];
      var pos = state.positions[s.id];
      if (el && pos) {
        el.style.left = pos.x + "px";
        el.style.top = pos.y + "px";
      }
    });
    updateLayoutButton();
    savePositions();
    drawArrows();
    fitToContent();
  }
  function doReset() {
    if (!confirm("Remettre la disposition par d\xE9faut ?")) return;
    var key = storageKey();
    try {
      localStorage.removeItem(key + "-pos");
      localStorage.removeItem(key + "-zoom");
      localStorage.removeItem(key + "-arrows");
      localStorage.removeItem(key + "-hidden");
      localStorage.removeItem(key + "-arrowmods");
    } catch (e) {
    }
    if (state._originalArrows) {
      state.project.arrows = JSON.parse(JSON.stringify(state._originalArrows));
    }
    state.hiddenScreens = {};
    state.hiddenEpics = {};
    state.selected = {};
    state.layoutIndex = 0;
    var screens = state.project.screens || [];
    var arrows = state.project.arrows || [];
    var heights = {};
    screens.forEach(function(s) {
      var el = state.screenEls[s.id];
      if (el) heights[s.id] = el.offsetHeight;
    });
    state.positions = autoLayout(screens, arrows, heights);
    state.defaultPositions = JSON.parse(JSON.stringify(state.positions));
    screens.forEach(function(s) {
      var el = state.screenEls[s.id];
      var pos = state.positions[s.id];
      if (el && pos) {
        el.style.left = pos.x + "px";
        el.style.top = pos.y + "px";
        el.classList.remove("fb-screen-dimmed", "fb-selected");
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
  }
  function init(config) {
    if (!config || !config.project) {
      console.error("FlowBoard.init: config.project is required");
      return;
    }
    state.project = config.project;
    state.showNotes = true;
    state.hiddenScreens = {};
    state.hiddenEpics = {};
    state.arrowPopup = null;
    state.creatingArrow = null;
    state.anchorDotsEls = [];
    state.layoutIndex = 0;
    state._originalArrows = JSON.parse(JSON.stringify(state.project.arrows || []));
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
    var allScreens = config.project.screens || [];
    (config.project.epics || []).forEach(function(epic) {
      var epicScreens = allScreens.filter(function(s) {
        return s.epic === epic.id;
      });
      if (epicScreens.length > 0 && epicScreens.every(function(s) {
        return state.hiddenScreens[s.id];
      })) {
        state.hiddenEpics[epic.id] = true;
      }
    });
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
    root.appendChild(wrapper);
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
      state.positions = JSON.parse(JSON.stringify(configState.positions));
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
      var el = renderScreen(s);
      canvas.appendChild(el);
    });
    applyTransform();
    initPan();
    initDrag();
    initArrowDrag();
    initSelection();
    initModeKeys();
    setMode("drag");
    requestAnimationFrame(function() {
      var heights = {};
      screens.forEach(function(s) {
        var el = state.screenEls[s.id];
        if (el) heights[s.id] = el.offsetHeight;
      });
      state.defaultPositions = autoLayout(screens, arrows, heights);
      if (!hasSavedPositions) {
        state.positions = JSON.parse(JSON.stringify(state.defaultPositions));
        screens.forEach(function(s) {
          var el = state.screenEls[s.id];
          var pos = state.positions[s.id];
          if (el && pos) {
            el.style.left = pos.x + "px";
            el.style.top = pos.y + "px";
          }
        });
      }
      if (!hasSavedZoom) {
        fitToContent();
      }
      drawArrows();
      freezeArrowSides();
    });
  }

  // src/index.ts
  window.FlowBoard = { init };
})();
