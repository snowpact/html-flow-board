import { buildSpreadMap, computeControlPoints, getAllAnchorPoints, getAnchor, getBestSides, resolveArrowSides } from './arrows';
import { init } from './board';
import { getPrimarySide, rectsIntersect, toggleSelection } from './geometry';
import { autoLayout, bfsDepth, centerPositions, layoutByEpics, layoutGrid } from './layout';
import { state } from './state';

// The runtime contract served on the CDN. Typed (no @ts-nocheck) so the
// typecheck gate actually verifies init + the 15 _internal symbols resolve.
declare global {
  interface Window {
    FlowBoard: { init: typeof init; _internal: Record<string, unknown> };
  }
}

window.FlowBoard = {
  init: init,
  _internal: {
    state: state,
    autoLayout: autoLayout,
    bfsDepth: bfsDepth,
    centerPositions: centerPositions,
    layoutByEpics: layoutByEpics,
    layoutGrid: layoutGrid,
    getAnchor: getAnchor,
    getPrimarySide: getPrimarySide,
    computeControlPoints: computeControlPoints,
    getAllAnchorPoints: getAllAnchorPoints,
    getBestSides: getBestSides,
    buildSpreadMap: buildSpreadMap,
    resolveArrowSides: resolveArrowSides,
    rectsIntersect: rectsIntersect,
    toggleSelection: toggleSelection
  }
};
