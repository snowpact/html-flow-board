// @ts-nocheck
import { buildSpreadMap, computeControlPoints, getAllAnchorPoints, getAnchor, getBestSides, resolveArrowSides } from './arrows';
import { init } from './board';
import { getPrimarySide, rectsIntersect, toggleSelection } from './geometry';
import { autoLayout, bfsDepth, centerPositions, layoutByEpics, layoutGrid } from './layout';
import { state } from './state';

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

