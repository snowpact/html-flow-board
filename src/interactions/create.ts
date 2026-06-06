import { PresetId, Screen } from '../core/types';
import { drawArrows } from '../arrows';
import { CANVAS_H, CANVAS_W } from '../core/constants';
import { state } from '../core/state';
import { savePositions } from '../core/storage';
import { showContextMenu } from '../render/context-menu';
import { PRESETS } from '../render/presets';
import { renderScreen } from '../render/screen';

var createCounter = 0;

function screenExists(id: string): boolean {
  var screens = (state.project && state.project.screens) || [];
  for (var i = 0; i < screens.length; i++) if (screens[i].id === id) return true;
  return false;
}

function uniqueId(): string {
  var id;
  do {
    createCounter++;
    id = 'screen-' + createCounter;
  } while (state.screenEls[id] || screenExists(id));
  return id;
}

// Create a screen of `preset` at the given viewport point, render it, persist
// positions. NOTE: the screen LIST itself is not saved to localStorage — created
// screens are ephemeral until Copy Init (real text persistence arrives in S1).
export function createScreen(preset: PresetId, clientX: number, clientY: number): string {
  if (!state.project) return '';
  var wrapperRect = state.wrapperEl.getBoundingClientRect();
  var x = Math.max(0, Math.min(CANVAS_W - 50, (clientX - wrapperRect.left - state.panX) / state.zoom));
  var y = Math.max(0, Math.min(CANVAS_H - 50, (clientY - wrapperRect.top - state.panY) / state.zoom));

  if (!state.project.screens) state.project.screens = [];
  var id = uniqueId(); // bumps createCounter; title shares the same number as the id
  var screen: Screen = { id: id, title: 'Écran ' + createCounter, preset: preset, format: 'desktop' };

  state.project.screens.push(screen);
  state.positions[id] = { x: x, y: y };

  var el = renderScreen(screen);
  state.canvasEl.appendChild(el);
  drawArrows();
  savePositions();
  return id;
}

// Right-click on empty board background → "Créer ▸" submenu of presets.
export function initCreateMenu(): void {
  state.wrapperEl.addEventListener('contextmenu', function (e: MouseEvent) {
    if (state.creatingArrow) return;
    var target = e.target as HTMLElement;
    if (target.closest('.fb-screen, .fb-arrow-handle, .fb-anchor-dot, .fb-ctx-menu, .fb-screen-popup, .fb-arrow-popup, .fb-mode-switch')) {
      return; // those handle their own context behavior
    }
    e.preventDefault();
    var cx = e.clientX;
    var cy = e.clientY;
    var presetItems = PRESETS.map(function (p) {
      return { label: p.label, onClick: function () { createScreen(p.id, cx, cy); } };
    });
    showContextMenu(cx, cy, [{ label: 'Créer', submenu: presetItems }]);
  });
}
