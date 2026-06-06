import { state } from '../core/state';
import { highlight } from '../flowml/highlight';

// Left Flow-ML editor: header + a line-number gutter next to a code area. The
// code area layers a syntax-highlighted <pre> behind a transparent <textarea>
// (scroll-synced), so editing stays plain-textarea simple but reads in color.
// Zero editor dependencies.
export function renderPanel(): HTMLElement {
  var panel = document.createElement('div');
  panel.className = 'fb-panel';

  var header = document.createElement('div');
  header.className = 'fb-panel-header';
  var title = document.createElement('span');
  title.className = 'fb-panel-title';
  title.textContent = 'Flow-ML';
  header.appendChild(title);

  var actions = document.createElement('div');
  actions.className = 'fb-panel-actions';
  var helpBtn = document.createElement('button');
  helpBtn.className = 'fb-panel-help-btn';
  helpBtn.title = 'Aide — syntaxe Flow-ML';
  helpBtn.textContent = '?';
  helpBtn.addEventListener('click', togglePanelHelp);
  actions.appendChild(helpBtn);
  var collapse = document.createElement('button');
  collapse.className = 'fb-panel-collapse';
  collapse.title = 'Réduire le panneau';
  collapse.textContent = '‹';
  collapse.addEventListener('click', togglePanel);
  actions.appendChild(collapse);
  header.appendChild(actions);
  panel.appendChild(header);

  var editor = document.createElement('div');
  editor.className = 'fb-panel-editor';

  var gutter = document.createElement('div');
  gutter.className = 'fb-panel-gutter';
  gutter.setAttribute('aria-hidden', 'true');

  // Input stack: highlighted <pre> under a transparent <textarea>.
  var inputWrap = document.createElement('div');
  inputWrap.className = 'fb-panel-input';

  var pre = document.createElement('pre');
  pre.className = 'fb-panel-highlight';
  pre.setAttribute('aria-hidden', 'true');
  var code = document.createElement('code');
  pre.appendChild(code);

  var textarea = document.createElement('textarea');
  textarea.className = 'fb-panel-text';
  textarea.spellcheck = false;
  textarea.setAttribute('autocomplete', 'off');
  textarea.setAttribute('autocapitalize', 'off');
  textarea.setAttribute('wrap', 'off');

  inputWrap.appendChild(pre);
  inputWrap.appendChild(textarea);

  editor.appendChild(gutter);
  editor.appendChild(inputWrap);
  panel.appendChild(editor);

  panel.appendChild(renderPanelHelp());

  var reopen = document.createElement('button');
  reopen.className = 'fb-panel-reopen';
  reopen.title = 'Ouvrir Flow-ML';
  reopen.textContent = '›';
  reopen.addEventListener('click', togglePanel);
  panel.appendChild(reopen);

  state.panelEl = panel;
  state.panelTextarea = textarea;
  state.panelGutter = gutter;
  state.panelHighlight = code;
  state.panelPre = pre;
  state.panelLineCount = 0;

  textarea.addEventListener('input', refreshEditor);
  textarea.addEventListener('scroll', syncScroll);
  refreshEditor();

  return panel;
}

// Re-highlight + refresh the gutter from the textarea content.
function refreshEditor(): void {
  updateHighlight();
  updateGutter();
}

function updateHighlight(): void {
  var ta = state.panelTextarea;
  var code = state.panelHighlight;
  if (!ta || !code) return;
  code.innerHTML = highlight(ta.value);
}

// Rebuild line numbers only when the line count changes (cheap on every keystroke).
function updateGutter(): void {
  var ta = state.panelTextarea;
  var g = state.panelGutter;
  if (!ta || !g) return;
  var n = ta.value.split('\n').length || 1;
  if (n === state.panelLineCount) return;
  state.panelLineCount = n;
  var lines = '';
  for (var i = 1; i <= n; i++) lines += (i > 1 ? '\n' : '') + i;
  g.textContent = lines;
}

// Keep the gutter + highlight layer aligned with the textarea's scroll.
function syncScroll(): void {
  var ta = state.panelTextarea;
  if (!ta) return;
  if (state.panelGutter) state.panelGutter.scrollTop = ta.scrollTop;
  if (state.panelPre) {
    state.panelPre.scrollTop = ta.scrollTop;
    state.panelPre.scrollLeft = ta.scrollLeft;
  }
}

export function togglePanel(): void {
  if (state.panelEl) state.panelEl.classList.toggle('fb-panel-collapsed');
}

export function togglePanelHelp(): void {
  if (state.panelEl) state.panelEl.classList.toggle('fb-help-open');
}

// "How it works" cheat-sheet, color-coded with the SAME highlighter as the editor
// so the legend reads exactly like what users type.
function renderPanelHelp(): HTMLElement {
  var help = document.createElement('div');
  help.className = 'fb-panel-help';

  var h = document.createElement('div');
  h.className = 'fb-help-title';
  h.textContent = 'Comment ça marche';
  help.appendChild(h);

  var intro = document.createElement('p');
  intro.className = 'fb-help-intro';
  intro.textContent = 'Le texte est la source de vérité : éditez à gauche et le diagramme suit — '
    + 'et tout ce que vous faites sur le diagramme réécrit le texte (sync bidirectionnelle).';
  help.appendChild(intro);

  var rows: [string, string][] = [
    ['!name = Mon app', 'nom du projet'],
    ['@auth, t=Authentification, c=#6366f1', 'epic — un groupe (couleur c=)'],
    ['login, t=Login, p=form, f=phone, e=auth', 'écran (titre, preset, format, epic)'],
    ['login, x=120, y=80, h', 'position (x,y) · h = masqué'],
    ['login -> home', 'flèche'],
    ['login ..> home, l=ok', 'flèche pointillée + label'],
    ['# un commentaire', 'commentaire (ignoré)'],
  ];
  var dl = document.createElement('dl');
  dl.className = 'fb-help-grid';
  rows.forEach(function (r) {
    var dt = document.createElement('dt');
    var code = document.createElement('code');
    code.className = 'fb-help-ex';
    code.innerHTML = highlight(r[0]);
    dt.appendChild(code);
    var dd = document.createElement('dd');
    dd.textContent = r[1];
    dl.appendChild(dt);
    dl.appendChild(dd);
  });
  help.appendChild(dl);

  var fenceTitle = document.createElement('div');
  fenceTitle.className = 'fb-help-subtitle';
  fenceTitle.textContent = 'HTML personnalisé (preset par défaut)';
  help.appendChild(fenceTitle);
  var fence = document.createElement('code');
  fence.className = 'fb-help-ex fb-help-block';
  fence.innerHTML = highlight('home, t=Accueil\n```\n<h1>Bonjour</h1>\n```');
  help.appendChild(fence);

  var keysTitle = document.createElement('div');
  keysTitle.className = 'fb-help-subtitle';
  keysTitle.textContent = 'Attributs';
  help.appendChild(keysTitle);
  var keys = document.createElement('div');
  keys.className = 'fb-help-keys';
  var defs: [string, string][] = [
    ['t', 'titre'], ['p', 'preset'], ['f', 'format'], ['e', 'epic'],
    ['n', 'note'], ['x y', 'position'], ['h', 'masqué'],
    ['l', 'label flèche'], ['fs ts', 'côtés flèche'], ['c', 'couleur'],
  ];
  defs.forEach(function (d) {
    var span = document.createElement('span');
    var b = document.createElement('b');
    b.textContent = d[0];
    span.appendChild(b);
    span.appendChild(document.createTextNode(' ' + d[1]));
    keys.appendChild(span);
  });
  help.appendChild(keys);

  var presetsTitle = document.createElement('div');
  presetsTitle.className = 'fb-help-subtitle';
  presetsTitle.textContent = 'Presets (p=)';
  help.appendChild(presetsTitle);
  var presets = document.createElement('div');
  presets.className = 'fb-help-keys';
  presets.textContent = 'custom · blank · form · list · table · dashboard · cardgrid · '
    + 'detail · auth · feed · settings · kanban · modal · gallery · nav';
  help.appendChild(presets);

  return help;
}

export function setPanelText(text: string): void {
  if (state.panelTextarea && state.panelTextarea.value !== text) {
    state.panelTextarea.value = text;
    refreshEditor();
  }
}
