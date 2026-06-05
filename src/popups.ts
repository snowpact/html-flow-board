// @ts-nocheck
import { drawArrows } from './arrows';
import { toggleScreen } from './render';
import { state } from './state';
import { saveArrowMutations } from './storage';

export function handlePopupOutsideClick(e) {
  if (state.arrowPopup && state.arrowPopup.el && !state.arrowPopup.el.contains(e.target)) {
    closeArrowPopup();
  }
}

export function closeArrowPopup() {
  if (state.arrowPopup && state.arrowPopup.el) {
    if (state.arrowPopup.el.parentNode) {
      state.arrowPopup.el.parentNode.removeChild(state.arrowPopup.el);
    }
    state.arrowPopup = null;
  }
  document.removeEventListener('mousedown', handlePopupOutsideClick);
}

export function showArrowPopup(e, arrowIndex) {
  closeArrowPopup();

  var arrow = state.project.arrows[arrowIndex];
  if (!arrow) return;

  var popup = document.createElement('div');
  popup.className = 'fb-arrow-popup';

  // Label input
  var labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.className = 'fb-arrow-popup-input';
  labelInput.placeholder = 'Label...';
  labelInput.value = arrow.label || '';
  labelInput.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
  labelInput.addEventListener('keydown', function (ev) {
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
  swapBtn.addEventListener('click', function (ev) {
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
  styleBtn.addEventListener('click', function (ev) {
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
  deleteBtn.addEventListener('click', function (ev) {
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

export function swapArrowDirection(arrowIndex) {
  var arrow = state.project.arrows[arrowIndex];
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

export function toggleArrowStyle(arrowIndex) {
  var arrow = state.project.arrows[arrowIndex];
  if (!arrow) return;
  arrow.dashed = !arrow.dashed;
  saveArrowMutations();
  drawArrows();
}

export function deleteArrow(arrowIndex) {
  var arrow = state.project.arrows[arrowIndex];
  if (!arrow) return;

  state.project.arrows.splice(arrowIndex, 1);
  saveArrowMutations();
  drawArrows();
}

// -- Screen contextual popup (right-click) --

export function handleScreenPopupOutsideClick(e) {
  if (state.screenPopup && state.screenPopup.el && !state.screenPopup.el.contains(e.target)) {
    closeScreenPopup();
  }
}

export function closeScreenPopup() {
  if (state.screenPopup && state.screenPopup.el) {
    if (state.screenPopup.el.parentNode) {
      state.screenPopup.el.parentNode.removeChild(state.screenPopup.el);
    }
    state.screenPopup = null;
  }
  document.removeEventListener('mousedown', handleScreenPopupOutsideClick);
}

export function showScreenPopup(e, screenId) {
  closeArrowPopup();
  closeScreenPopup();

  var screenData = null;
  var screens = state.project.screens || [];
  for (var i = 0; i < screens.length; i++) {
    if (screens[i].id === screenId) { screenData = screens[i]; break; }
  }
  if (!screenData) return;

  var el = state.screenEls[screenId];
  if (!el) return;

  var popup = document.createElement('div');
  popup.className = 'fb-screen-popup';

  // -- Resize section --
  var sizeLabel = document.createElement('div');
  sizeLabel.className = 'fb-screen-popup-label';
  sizeLabel.textContent = 'Taille';
  popup.appendChild(sizeLabel);

  var sizesRow = document.createElement('div');
  sizesRow.className = 'fb-screen-popup-sizes';
  var currentSize = screenData.size || 'md';

  ['sm', 'md', 'lg', 'xl'].forEach(function (sz) {
    var btn = document.createElement('button');
    btn.className = 'fb-screen-popup-size' + (sz === currentSize ? ' active' : '');
    btn.textContent = sz.toUpperCase();
    btn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      screenData.size = sz;
      // Update DOM classes
      el.className = el.className.replace(/fb-size-\w+/, 'fb-size-' + sz);
      saveArrowMutations();
      drawArrows();
      closeScreenPopup();
    });
    sizesRow.appendChild(btn);
  });
  popup.appendChild(sizesRow);

  // -- Separator --
  var sep1 = document.createElement('div');
  sep1.className = 'fb-screen-popup-sep';
  popup.appendChild(sep1);

  // -- Title input --
  var titleLabel = document.createElement('div');
  titleLabel.className = 'fb-screen-popup-label';
  titleLabel.textContent = 'Titre';
  popup.appendChild(titleLabel);

  var titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'fb-screen-popup-input';
  titleInput.value = screenData.title || '';
  titleInput.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
  titleInput.addEventListener('keydown', function (ev) {
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

  // -- Hide button --
  var hideBtn = document.createElement('button');
  hideBtn.className = 'fb-screen-popup-btn';
  hideBtn.textContent = state.hiddenScreens[screenId] ? 'Afficher' : 'Masquer';
  hideBtn.addEventListener('click', function (ev) {
    ev.stopPropagation();
    toggleScreen(screenId);
    closeScreenPopup();
  });
  popup.appendChild(hideBtn);

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

