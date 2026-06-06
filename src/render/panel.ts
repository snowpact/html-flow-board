import { state } from '../core/state';

// Left Flow-ML editor: header + a gutter of line numbers next to a monospace
// textarea (kept aligned/scrolled in sync). No editor dependency (zero-dep lib).
export function renderPanel(): HTMLElement {
  var panel = document.createElement('div');
  panel.className = 'fb-panel';

  var header = document.createElement('div');
  header.className = 'fb-panel-header';
  var title = document.createElement('span');
  title.className = 'fb-panel-title';
  title.textContent = 'Flow-ML';
  header.appendChild(title);
  var collapse = document.createElement('button');
  collapse.className = 'fb-panel-collapse';
  collapse.title = 'Réduire le panneau';
  collapse.textContent = '‹';
  collapse.addEventListener('click', togglePanel);
  header.appendChild(collapse);
  panel.appendChild(header);

  var editor = document.createElement('div');
  editor.className = 'fb-panel-editor';

  var gutter = document.createElement('div');
  gutter.className = 'fb-panel-gutter';
  gutter.setAttribute('aria-hidden', 'true');

  var textarea = document.createElement('textarea');
  textarea.className = 'fb-panel-text';
  textarea.spellcheck = false;
  textarea.setAttribute('autocomplete', 'off');
  textarea.setAttribute('autocapitalize', 'off');
  textarea.setAttribute('wrap', 'off');

  editor.appendChild(gutter);
  editor.appendChild(textarea);
  panel.appendChild(editor);

  var reopen = document.createElement('button');
  reopen.className = 'fb-panel-reopen';
  reopen.title = 'Ouvrir Flow-ML';
  reopen.textContent = '›';
  reopen.addEventListener('click', togglePanel);
  panel.appendChild(reopen);

  state.panelEl = panel;
  state.panelTextarea = textarea;
  state.panelGutter = gutter;

  textarea.addEventListener('input', updateGutter);
  textarea.addEventListener('scroll', function () { gutter.scrollTop = textarea.scrollTop; });
  updateGutter();

  return panel;
}

// Rebuild the line-number gutter from the textarea content.
function updateGutter(): void {
  var ta = state.panelTextarea;
  var g = state.panelGutter;
  if (!ta || !g) return;
  var n = ta.value.split('\n').length || 1;
  var lines = '';
  for (var i = 1; i <= n; i++) lines += (i > 1 ? '\n' : '') + i;
  g.textContent = lines;
}

export function togglePanel(): void {
  if (state.panelEl) state.panelEl.classList.toggle('fb-panel-collapsed');
}

export function setPanelText(text: string): void {
  if (state.panelTextarea && state.panelTextarea.value !== text) {
    state.panelTextarea.value = text;
    updateGutter();
  }
}
