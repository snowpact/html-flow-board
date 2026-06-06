import { state } from '../core/state';

// Left Flow-ML panel: a header (title + collapse) and a monospace textarea.
// The sync controller (interactions/sync) wires the textarea both ways.
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

  var textarea = document.createElement('textarea');
  textarea.className = 'fb-panel-text';
  textarea.spellcheck = false;
  textarea.setAttribute('autocomplete', 'off');
  textarea.setAttribute('autocapitalize', 'off');
  panel.appendChild(textarea);

  // Reopen affordance (visible only when collapsed).
  var reopen = document.createElement('button');
  reopen.className = 'fb-panel-reopen';
  reopen.title = 'Ouvrir Flow-ML';
  reopen.textContent = '›';
  reopen.addEventListener('click', togglePanel);
  panel.appendChild(reopen);

  state.panelEl = panel;
  state.panelTextarea = textarea;
  return panel;
}

export function togglePanel(): void {
  if (state.panelEl) state.panelEl.classList.toggle('fb-panel-collapsed');
}

export function setPanelText(text: string): void {
  if (state.panelTextarea && state.panelTextarea.value !== text) {
    state.panelTextarea.value = text;
  }
}
