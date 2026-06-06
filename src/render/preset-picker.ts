import { PresetId } from '../core/types';
import { PRESETS, skeletonHtml } from './presets';

// A 2-column scrollable grid of preset PREVIEWS (scaled skeletons, no text).
// Used by "Créer" (right-click empty board) and "Modifier le layout".

var pickerEl: HTMLElement | null = null;
var dismiss: ((e: Event) => void) | null = null;

export function closePresetPicker(): void {
  if (pickerEl && pickerEl.parentNode) pickerEl.parentNode.removeChild(pickerEl);
  pickerEl = null;
  if (dismiss) {
    document.removeEventListener('mousedown', dismiss, true);
    document.removeEventListener('keydown', dismiss, true);
    dismiss = null;
  }
}

export function showPresetPicker(
  x: number,
  y: number,
  onPick: (id: PresetId) => void,
  current?: PresetId,
): HTMLElement {
  closePresetPicker();

  var picker = document.createElement('div');
  picker.className = 'fb-preset-picker';

  var grid = document.createElement('div');
  grid.className = 'fb-preset-grid';

  PRESETS.forEach(function (p) {
    var tile = document.createElement('button');
    tile.className = 'fb-preset-tile'
      + (p.id === current ? ' active' : '')
      + (p.id === 'custom' ? ' fb-preset-custom' : '');
    tile.title = p.label; // accessible name; not shown as text

    var thumb = document.createElement('div');
    thumb.className = 'fb-preset-thumb';
    if (p.id !== 'custom') {
      var mini = document.createElement('div');
      mini.className = 'fb-screen-body fb-skeleton fb-skel-' + p.id + ' fb-preset-mini';
      mini.innerHTML = skeletonHtml(p.id);
      thumb.appendChild(mini);
    }
    tile.appendChild(thumb);

    tile.addEventListener('click', function (e: MouseEvent) {
      e.stopPropagation();
      closePresetPicker();
      onPick(p.id);
    });
    grid.appendChild(tile);
  });

  picker.appendChild(grid);
  picker.style.left = x + 'px';
  picker.style.top = y + 'px';
  document.body.appendChild(picker);
  pickerEl = picker;

  var r = picker.getBoundingClientRect();
  if (r.width && r.right > window.innerWidth) picker.style.left = Math.max(0, x - r.width) + 'px';
  if (r.height && r.bottom > window.innerHeight) picker.style.top = Math.max(0, y - r.height) + 'px';

  dismiss = function (e: Event) {
    if (e.type === 'keydown') {
      if ((e as KeyboardEvent).key === 'Escape') closePresetPicker();
      return;
    }
    if (pickerEl && !pickerEl.contains(e.target as Node)) closePresetPicker();
  };
  var fn = dismiss;
  setTimeout(function () {
    if (dismiss !== fn) return;
    document.addEventListener('mousedown', fn, true);
    document.addEventListener('keydown', fn, true);
  }, 0);

  return picker;
}
