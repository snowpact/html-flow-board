// @ts-nocheck
import { state } from '../core/state';
import { updateSelectionStyles } from './drag';

export function setMode(mode) {
  if (mode !== 'select') mode = 'drag';
  state.mode = mode;

  // Leaving select mode clears any selection
  if (mode === 'drag') {
    state.selected = {};
    updateSelectionStyles();
  }

  if (state.wrapperEl) {
    state.wrapperEl.classList.toggle('fb-mode-select', mode === 'select');
    state.wrapperEl.classList.toggle('fb-mode-drag', mode === 'drag');
  }
  var sw = state.container && state.container.querySelector('.fb-mode-switch');
  if (sw) {
    var btns = sw.querySelectorAll('.fb-mode-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].dataset.mode === mode);
    }
  }
}

export function initModeKeys() {
  state.wrapperEl.addEventListener('mouseenter', function () { state.pointerInBoard = true; });
  state.wrapperEl.addEventListener('mouseleave', function () { state.pointerInBoard = false; });

  document.addEventListener('keydown', function (e) {
    if (!state.pointerInBoard) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'v' || e.key === 'V') {
      setMode('select');
    } else if (e.key === 'h' || e.key === 'H') {
      setMode('drag');
    } else if (e.key === 'Escape' && state.mode === 'select') {
      state.selected = {};
      updateSelectionStyles();
    }
  });
}

// -- Arrow handle drag --
