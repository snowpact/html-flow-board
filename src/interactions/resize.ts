import { drawArrows } from '../arrows';
import { baseHeight, baseWidth, state } from '../core/state';
import { saveSizes } from '../core/storage';
import { Screen } from '../core/types';

// Resize is clamped to 0.7×–1.3× of the base (unresized) size, both dimensions.
var MIN_FACTOR = 0.7;
var MAX_FACTOR = 1.3;

function findScreen(id: string): Screen | null {
  var screens = (state.project && state.project.screens) || [];
  for (var i = 0; i < screens.length; i++) if (screens[i].id === id) return screens[i];
  return null;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function initResize(): void {
  state.canvasEl.addEventListener('mousedown', function (e: MouseEvent) {
    var handle = (e.target as HTMLElement).closest('.fb-resize-handle');
    if (!handle) return;
    var screenEl = (handle as HTMLElement).closest('.fb-screen') as HTMLElement;
    if (!screenEl) return;
    var id = screenEl.dataset.screenId;
    var screen = findScreen(id);
    if (!screen) return;

    e.stopPropagation();
    e.preventDefault();

    // Base (unresized) dimensions → the clamp bounds. Format gives an explicit
    // base height; otherwise measure the natural content height.
    var baseW = baseWidth(screen);
    var baseH = baseHeight(screen);
    if (baseH == null) {
      var prevH = screenEl.style.height;
      screenEl.style.height = '';
      baseH = screenEl.offsetHeight;
      screenEl.style.height = prevH;
    }

    var minW = baseW * MIN_FACTOR, maxW = baseW * MAX_FACTOR;
    var minH = baseH * MIN_FACTOR, maxH = baseH * MAX_FACTOR;

    var startX = e.clientX, startY = e.clientY;
    var startW = screenEl.offsetWidth, startH = screenEl.offsetHeight;
    screenEl.classList.add('fb-resizing');

    function onMove(ev: MouseEvent): void {
      var w = clamp(startW + (ev.clientX - startX) / state.zoom, minW, maxW);
      var h = clamp(startH + (ev.clientY - startY) / state.zoom, minH, maxH);
      screenEl.style.width = w + 'px';
      screenEl.style.height = h + 'px';
      state.sizes[id] = { width: w, height: h };
      drawArrows();
    }
    function onUp(): void {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      screenEl.classList.remove('fb-resizing');
      saveSizes();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}
