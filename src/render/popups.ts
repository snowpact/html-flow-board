import { drawArrows } from '../arrows';
import { state } from '../core/state';
import { saveArrowMutations } from '../core/storage';
import { deleteScreen, setScreenEpic, setScreenFormat, setScreenPreset, toggleScreen } from './screen';
import { showContextMenu, CtxItem } from './context-menu';
import { showPresetPicker } from './preset-picker';
import {
  ICON_DESKTOP, ICON_EYE, ICON_EYE_OFF, ICON_LAYOUT, ICON_LINE_DASHED,
  ICON_LINE_SOLID, ICON_PHONE, ICON_SQUARE, ICON_SWAP, ICON_TAG, ICON_TRASH,
} from './icons';
import { Arrow, Epic, Format, PresetId, Screen } from '../core/types';

export function handlePopupOutsideClick(e: MouseEvent): void {
  if (state.arrowPopup && state.arrowPopup.el && !state.arrowPopup.el.contains(e.target as Node)) {
    closeArrowPopup();
  }
}

export function closeArrowPopup(): void {
  if (state.arrowPopup && state.arrowPopup.el) {
    if (state.arrowPopup.el.parentNode) {
      state.arrowPopup.el.parentNode.removeChild(state.arrowPopup.el);
    }
    state.arrowPopup = null;
  }
  document.removeEventListener('mousedown', handlePopupOutsideClick);
}

export function showArrowPopup(e: MouseEvent, arrowIndex: number): void {
  closeArrowPopup();

  var arrow: Arrow = state.project.arrows[arrowIndex];
  if (!arrow) return;

  var popup = document.createElement('div');
  popup.className = 'fb-arrow-popup';

  // Label input
  var labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.className = 'fb-arrow-popup-input';
  labelInput.placeholder = 'Label...';
  labelInput.value = arrow.label || '';
  labelInput.addEventListener('mousedown', function (ev: MouseEvent) { ev.stopPropagation(); });
  labelInput.addEventListener('keydown', function (ev: KeyboardEvent) {
    ev.stopPropagation();
    if (ev.key === 'Enter') {
      arrow.label = labelInput.value.trim() || undefined;
      saveArrowMutations();
      drawArrows();
      closeArrowPopup();
    }
    if (ev.key === 'Escape') {
      closeArrowPopup();
    }
  });
  labelInput.addEventListener('blur', function () {
    var newLabel = labelInput.value.trim() || undefined;
    if (newLabel !== (arrow.label || undefined)) {
      arrow.label = newLabel;
      saveArrowMutations();
      drawArrows();
    }
  });
  popup.appendChild(labelInput);

  // Separator
  var popupSep = document.createElement('div');
  popupSep.className = 'fb-arrow-popup-sep';
  popup.appendChild(popupSep);

  // Swap direction
  var swapBtn = document.createElement('button');
  swapBtn.className = 'fb-arrow-popup-btn';
  swapBtn.setAttribute('data-testid', 'arrow-swap');
  swapBtn.title = 'Reverse direction';
  swapBtn.innerHTML = ICON_SWAP;
  swapBtn.addEventListener('click', function (ev: MouseEvent) {
    ev.stopPropagation();
    swapArrowDirection(arrowIndex);
    closeArrowPopup();
  });
  popup.appendChild(swapBtn);

  // Toggle dashed/solid
  var styleBtn = document.createElement('button');
  styleBtn.className = 'fb-arrow-popup-btn';
  styleBtn.setAttribute('data-testid', 'arrow-style');
  styleBtn.title = arrow.dashed ? 'Make solid' : 'Make dashed';
  styleBtn.innerHTML = arrow.dashed ? ICON_LINE_SOLID : ICON_LINE_DASHED;
  styleBtn.addEventListener('click', function (ev: MouseEvent) {
    ev.stopPropagation();
    toggleArrowStyle(arrowIndex);
    closeArrowPopup();
  });
  popup.appendChild(styleBtn);

  // Delete
  var deleteBtn = document.createElement('button');
  deleteBtn.className = 'fb-arrow-popup-btn fb-arrow-popup-delete';
  deleteBtn.setAttribute('data-testid', 'arrow-delete');
  deleteBtn.title = 'Delete arrow';
  deleteBtn.innerHTML = ICON_TRASH;
  deleteBtn.addEventListener('click', function (ev: MouseEvent) {
    ev.stopPropagation();
    deleteArrow(arrowIndex);
    closeArrowPopup();
  });
  popup.appendChild(deleteBtn);

  // Position near click in wrapper coordinates
  var wrapperRect = state.wrapperEl.getBoundingClientRect();
  var popupX = e.clientX - wrapperRect.left + 8;
  var popupY = e.clientY - wrapperRect.top - 16;

  popup.style.left = popupX + 'px';
  popup.style.top = popupY + 'px';
  state.wrapperEl.appendChild(popup);

  // Clamp to wrapper edges after measuring
  var popupRect = popup.getBoundingClientRect();
  if (popupRect.right > wrapperRect.right) {
    popup.style.left = (popupX - popupRect.width - 16) + 'px';
  }
  if (popupRect.bottom > wrapperRect.bottom) {
    popup.style.top = (popupY - popupRect.height) + 'px';
  }

  state.arrowPopup = { el: popup, arrowIndex: arrowIndex };

  // Focus label input and select text
  labelInput.focus();
  labelInput.select();

  setTimeout(function () {
    document.addEventListener('mousedown', handlePopupOutsideClick);
  }, 0);
}

export function swapArrowDirection(arrowIndex: number): void {
  var arrow: Arrow = state.project.arrows[arrowIndex];
  if (!arrow) return;

  // Swap from/to
  var tmp = arrow.from;
  arrow.from = arrow.to;
  arrow.to = tmp;

  // Swap fromSide/toSide if they exist
  if (arrow.fromSide || arrow.toSide) {
    var tmpSide = arrow.fromSide;
    arrow.fromSide = arrow.toSide;
    arrow.toSide = tmpSide;
  }

  saveArrowMutations();
  drawArrows();
}

export function toggleArrowStyle(arrowIndex: number): void {
  var arrow: Arrow = state.project.arrows[arrowIndex];
  if (!arrow) return;
  arrow.dashed = !arrow.dashed;
  saveArrowMutations();
  drawArrows();
}

export function deleteArrow(arrowIndex: number): void {
  var arrow: Arrow = state.project.arrows[arrowIndex];
  if (!arrow) return;

  state.project.arrows.splice(arrowIndex, 1);
  saveArrowMutations();
  drawArrows();
}

// -- Screen contextual popup (right-click) --

export function handleScreenPopupOutsideClick(e: MouseEvent): void {
  if (state.screenPopup && state.screenPopup.el && !state.screenPopup.el.contains(e.target as Node)) {
    closeScreenPopup();
  }
}

export function closeScreenPopup(): void {
  if (state.screenPopup && state.screenPopup.el) {
    if (state.screenPopup.el.parentNode) {
      state.screenPopup.el.parentNode.removeChild(state.screenPopup.el);
    }
    state.screenPopup = null;
  }
  document.removeEventListener('mousedown', handleScreenPopupOutsideClick);
}

export function showScreenPopup(e: MouseEvent, screenId: string): void {
  closeArrowPopup();
  closeScreenPopup();

  var screenData: Screen = null;
  var screens: Screen[] = state.project.screens || [];
  for (var i = 0; i < screens.length; i++) {
    if (screens[i].id === screenId) { screenData = screens[i]; break; }
  }
  if (!screenData) return;

  var el: HTMLElement = state.screenEls[screenId];
  if (!el) return;

  var popup = document.createElement('div');
  popup.className = 'fb-screen-popup';

  // Icon + label action button (shared look across the popup).
  function mkBtn(svg: string, text: string, testid: string, danger?: boolean): HTMLButtonElement {
    var b = document.createElement('button');
    b.className = 'fb-screen-popup-btn' + (danger ? ' fb-screen-popup-delete' : '');
    b.setAttribute('data-testid', testid);
    var ic = document.createElement('span');
    ic.className = 'fb-popup-btn-icon';
    ic.innerHTML = svg;
    var lb = document.createElement('span');
    lb.textContent = text;
    b.appendChild(ic);
    b.appendChild(lb);
    return b;
  }

  // -- Title input --
  var titleLabel = document.createElement('div');
  titleLabel.className = 'fb-screen-popup-label';
  titleLabel.textContent = 'Title';
  popup.appendChild(titleLabel);

  var titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'fb-screen-popup-input';
  titleInput.value = screenData.title || '';
  titleInput.addEventListener('mousedown', function (ev: MouseEvent) { ev.stopPropagation(); });
  titleInput.addEventListener('keydown', function (ev: KeyboardEvent) {
    ev.stopPropagation();
    if (ev.key === 'Enter') {
      var val = titleInput.value.trim();
      if (val && val !== screenData.title) {
        screenData.title = val;
        var hdrSpan = el.querySelector('.fb-screen-header span');
        if (hdrSpan) hdrSpan.textContent = val;
        saveArrowMutations();
      }
      closeScreenPopup();
    }
    if (ev.key === 'Escape') {
      closeScreenPopup();
    }
  });
  titleInput.addEventListener('blur', function () {
    var val = titleInput.value.trim();
    if (val && val !== screenData.title) {
      screenData.title = val;
      var hdrSpan = el.querySelector('.fb-screen-header span');
      if (hdrSpan) hdrSpan.textContent = val;
      saveArrowMutations();
    }
  });
  popup.appendChild(titleInput);

  // -- Separator --
  var sep2 = document.createElement('div');
  sep2.className = 'fb-screen-popup-sep';
  popup.appendChild(sep2);

  // -- Format (device proportions) --
  var fmtLabel = document.createElement('div');
  fmtLabel.className = 'fb-screen-popup-label';
  fmtLabel.textContent = 'Format';
  popup.appendChild(fmtLabel);

  var fmtRow = document.createElement('div');
  fmtRow.className = 'fb-screen-popup-formats';
  var currentFmt = screenData.format || '';
  var fmtDefs: { id: Format; label: string; icon: string }[] = [
    { id: 'desktop', label: 'Desktop', icon: ICON_DESKTOP },
    { id: 'phone', label: 'Phone', icon: ICON_PHONE },
    { id: 'square', label: 'Square', icon: ICON_SQUARE },
  ];
  fmtDefs.forEach(function (def) {
    var btn = document.createElement('button');
    btn.className = 'fb-screen-popup-format' + (def.id === currentFmt ? ' active' : '');
    btn.setAttribute('data-testid', 'fmt-' + def.id);
    var fic = document.createElement('span');
    fic.className = 'fb-fmt-icon';
    fic.innerHTML = def.icon;
    var flb = document.createElement('span');
    flb.className = 'fb-fmt-label';
    flb.textContent = def.label;
    btn.appendChild(fic);
    btn.appendChild(flb);
    btn.addEventListener('click', function (ev: MouseEvent) {
      ev.stopPropagation();
      setScreenFormat(screenId, def.id);
      closeScreenPopup();
    });
    fmtRow.appendChild(btn);
  });
  popup.appendChild(fmtRow);

  var sep3 = document.createElement('div');
  sep3.className = 'fb-screen-popup-sep';
  popup.appendChild(sep3);

  // -- Hide / Show --
  var hidden = !!state.hiddenScreens[screenId];
  var hideBtn = mkBtn(hidden ? ICON_EYE : ICON_EYE_OFF, hidden ? 'Show' : 'Hide', 'screen-hide');
  hideBtn.addEventListener('click', function (ev: MouseEvent) {
    ev.stopPropagation();
    toggleScreen(screenId);
    closeScreenPopup();
  });
  popup.appendChild(hideBtn);

  // -- Change layout (preset) --
  var layoutBtn = mkBtn(ICON_LAYOUT, 'Change layout', 'screen-layout');
  layoutBtn.addEventListener('click', function (ev: MouseEvent) {
    ev.stopPropagation();
    var cx = ev.clientX;
    var cy = ev.clientY;
    var current: PresetId = screenData.preset || 'custom';
    closeScreenPopup();
    showPresetPicker(cx, cy, function (preset) { setScreenPreset(screenId, preset); }, current);
  });
  popup.appendChild(layoutBtn);

  // -- Change epic (assign an existing epic, or clear) --
  var epicBtn = mkBtn(ICON_TAG, 'Change epic', 'screen-epic');
  epicBtn.addEventListener('click', function (ev: MouseEvent) {
    ev.stopPropagation();
    var cx = ev.clientX;
    var cy = ev.clientY;
    var cur = screenData.epic;
    closeScreenPopup();
    var items: CtxItem[] = (state.project.epics || []).map(function (epic: Epic): CtxItem {
      return {
        label: epic.label || epic.id,
        icon: '<svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="' + epic.color + '"/></svg>',
        active: cur === epic.id,
        testid: 'epic-' + epic.id,
        onClick: function () { setScreenEpic(screenId, epic.id); },
      };
    });
    items.push({ label: 'None', active: !cur, testid: 'epic-none', onClick: function () { setScreenEpic(screenId, null); } });
    showContextMenu(cx, cy, items);
  });
  popup.appendChild(epicBtn);

  // -- Delete --
  var deleteScreenBtn = mkBtn(ICON_TRASH, 'Delete', 'screen-delete', true);
  deleteScreenBtn.addEventListener('click', function (ev: MouseEvent) {
    ev.stopPropagation();
    closeScreenPopup();
    if (confirm('Delete this screen and its arrows?')) deleteScreen(screenId);
  });
  popup.appendChild(deleteScreenBtn);

  // Position near right-click in wrapper coordinates
  var wrapperRect = state.wrapperEl.getBoundingClientRect();
  var popupX = e.clientX - wrapperRect.left + 4;
  var popupY = e.clientY - wrapperRect.top + 4;

  popup.style.left = popupX + 'px';
  popup.style.top = popupY + 'px';
  state.wrapperEl.appendChild(popup);

  // Clamp to wrapper edges after measuring
  var popupRect = popup.getBoundingClientRect();
  if (popupRect.right > wrapperRect.right) {
    popup.style.left = (popupX - popupRect.width - 8) + 'px';
  }
  if (popupRect.bottom > wrapperRect.bottom) {
    popup.style.top = (popupY - popupRect.height) + 'px';
  }

  state.screenPopup = { el: popup, screenId: screenId };

  setTimeout(function () {
    document.addEventListener('mousedown', handleScreenPopupOutsideClick);
  }, 0);
}

// -- Anchor dots + Arrow creation --

