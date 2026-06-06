import { state } from './state';

export function storageKey() {
  return 'fb-' + (state.project ? state.project.name : 'default');
}

export function savePositions() {
  try {
    localStorage.setItem(storageKey() + '-pos', JSON.stringify(state.positions));
  } catch (e) { /* quota */ }
  if (state.commit) state.commit(); // diagram changed → re-serialize to Flow-ML
}

export function loadPositions() {
  try {
    var raw = localStorage.getItem(storageKey() + '-pos');
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

export function saveZoom() {
  try {
    localStorage.setItem(storageKey() + '-zoom', JSON.stringify({
      zoom: state.zoom, panX: state.panX, panY: state.panY
    }));
  } catch (e) { /* quota */ }
}

export function loadZoom() {
  try {
    var raw = localStorage.getItem(storageKey() + '-zoom');
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

export function saveHiddenScreens() {
  try {
    localStorage.setItem(storageKey() + '-hidden', JSON.stringify(state.hiddenScreens));
  } catch (e) { /* quota */ }
  if (state.commit) state.commit();
}

export function loadHiddenScreens() {
  try {
    var raw = localStorage.getItem(storageKey() + '-hidden');
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

export function saveArrowMutations() {
  try {
    localStorage.setItem(storageKey() + '-arrowmods', JSON.stringify(state.project.arrows));
  } catch (e) { /* quota */ }
  if (state.commit) state.commit();
}

export function loadArrowMutations() {
  try {
    var raw = localStorage.getItem(storageKey() + '-arrowmods');
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// -- Layout helpers --
