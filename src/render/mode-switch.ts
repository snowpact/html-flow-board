import { ICON_CURSOR, ICON_HAND } from '../core/constants';
import { setMode } from '../interactions/mode';

export function renderModeSwitch(): HTMLDivElement {
  var sw = document.createElement('div');
  sw.className = 'fb-mode-switch';

  var selectBtn = document.createElement('button');
  selectBtn.className = 'fb-mode-btn';
  selectBtn.dataset.mode = 'select';
  selectBtn.title = 'Cursor — select (V)';
  selectBtn.innerHTML = ICON_CURSOR;
  selectBtn.addEventListener('click', function () { setMode('select'); });
  sw.appendChild(selectBtn);

  var dragBtn = document.createElement('button');
  dragBtn.className = 'fb-mode-btn';
  dragBtn.dataset.mode = 'drag';
  dragBtn.title = 'Move — pan (H)';
  dragBtn.innerHTML = ICON_HAND;
  dragBtn.addEventListener('click', function () { setMode('drag'); });
  sw.appendChild(dragBtn);

  return sw;
}

// -- Keyboard: V = select, H = drag, Esc = clear selection --
// Scoped to when the pointer is over the board, so an embedded FlowBoard
// never steals plain keystrokes from the rest of the host page.
