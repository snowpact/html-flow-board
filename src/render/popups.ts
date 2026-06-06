import { drawArrows } from '../arrows';
import { state } from '../core/state';
import { saveArrowMutations } from '../core/storage';
import { deleteScreen, setScreenFormat, setScreenPreset, toggleScreen } from './screen';
import { showPresetPicker } from './preset-picker';
import { Arrow, Format, PresetId, Screen } from '../core/types';

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
  swapBtn.title = 'Inverser la direction';
  swapBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';
  swapBtn.addEventListener('click', function (ev: MouseEvent) {
    ev.stopPropagation();
    swapArrowDirection(arrowIndex);
    closeArrowPopup();
  });
  popup.appendChild(swapBtn);

  // Toggle dashed/solid
  var styleBtn = document.createElement('button');
  styleBtn.className = 'fb-arrow-popup-btn';
  styleBtn.title = arrow.dashed ? 'Trait plein' : 'Trait pointillé';
  if (arrow.dashed) {
    styleBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="3" y1="12" x2="21" y2="12"/></svg>';
  } else {
    styleBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="3 3"><line x1="3" y1="12" x2="21" y2="12"/></svg>';
  }
  styleBtn.addEventListener('click', function (ev: MouseEvent) {
    ev.stopPropagation();
    toggleArrowStyle(arrowIndex);
    closeArrowPopup();
  });
  popup.appendChild(styleBtn);

  // Delete
  var deleteBtn = document.createElement('button');
  deleteBtn.className = 'fb-arrow-popup-btn fb-arrow-popup-delete';
  deleteBtn.title = 'Supprimer la flèche';
  deleteBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
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

  // -- Title input --
  var titleLabel = document.createElement('div');
  titleLabel.className = 'fb-screen-popup-label';
  titleLabel.textContent = 'Titre';
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
  var currentFmt = ((screenData.format as string) === 'square') ? 'fluid' : (screenData.format || '');
  var fmtNames: Record<Format, string> = { desktop: 'Desktop', phone: 'Phone', fluid: 'Fluide' };
  (['desktop', 'phone', 'fluid'] as Format[]).forEach(function (fmt: Format) {
    var btn = document.createElement('button');
    btn.className = 'fb-screen-popup-format' + (fmt === currentFmt ? ' active' : '');
    btn.textContent = fmtNames[fmt];
    btn.addEventListener('click', function (ev: MouseEvent) {
      ev.stopPropagation();
      setScreenFormat(screenId, fmt);
      closeScreenPopup();
    });
    fmtRow.appendChild(btn);
  });
  popup.appendChild(fmtRow);

  var sep3 = document.createElement('div');
  sep3.className = 'fb-screen-popup-sep';
  popup.appendChild(sep3);

  // -- Hide button --
  var hideBtn = document.createElement('button');
  hideBtn.className = 'fb-screen-popup-btn';
  hideBtn.textContent = state.hiddenScreens[screenId] ? 'Afficher' : 'Masquer';
  hideBtn.addEventListener('click', function (ev: MouseEvent) {
    ev.stopPropagation();
    toggleScreen(screenId);
    closeScreenPopup();
  });
  popup.appendChild(hideBtn);

  // -- Modifier le layout (preset) --
  var layoutBtn = document.createElement('button');
  layoutBtn.className = 'fb-screen-popup-btn';
  layoutBtn.textContent = 'Modifier le layout';
  layoutBtn.addEventListener('click', function (ev: MouseEvent) {
    ev.stopPropagation();
    var cx = ev.clientX;
    var cy = ev.clientY;
    var current: PresetId = screenData.preset || 'custom';
    closeScreenPopup();
    showPresetPicker(cx, cy, function (preset) { setScreenPreset(screenId, preset); }, current);
  });
  popup.appendChild(layoutBtn);

  // -- Delete --
  var deleteScreenBtn = document.createElement('button');
  deleteScreenBtn.className = 'fb-screen-popup-btn fb-screen-popup-delete';
  deleteScreenBtn.textContent = 'Supprimer';
  deleteScreenBtn.addEventListener('click', function (ev: MouseEvent) {
    ev.stopPropagation();
    closeScreenPopup();
    if (confirm('Supprimer cet écran et ses flèches ?')) deleteScreen(screenId);
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

