// @ts-nocheck

export function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// -- Zoom --
export function rectsIntersect(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

// -- Add/remove a screen id from a selection map; returns the same map --
export function toggleSelection(set, id) {
  if (set[id]) {
    delete set[id];
  } else {
    set[id] = true;
  }
  return set;
}

// -- Pan (wheel + click-drag background) --
export function getPrimarySide(side) {
  return side ? side.split('-')[0] : 'right';
}

// Compute bezier control points with cross-axis blend so the tangent
// (and arrowhead orientation) follows the actual angle between screens.
