import { Rect, Side } from './types';

// Escape a string for safe insertion as HTML text.
export function escapeHtml(str: string): string {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Axis-aligned rectangle overlap (selection hit-test).
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

// Add/remove a screen id from a selection map; returns the same map.
export function toggleSelection(set: Record<string, boolean>, id: string): Record<string, boolean> {
  if (set[id]) {
    delete set[id];
  } else {
    set[id] = true;
  }
  return set;
}

// Primary side from a compound side name ('right-top' -> 'right').
export function getPrimarySide(side: Side | null | undefined): string {
  return side ? side.split('-')[0] : 'right';
}
