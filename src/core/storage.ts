import { state } from './state';

export function storageKey() {
  // Pinned at init() so editing `!name` in the panel never orphans the saved doc.
  if (state.storageKeyBase) return state.storageKeyBase;
  return 'fb-' + (state.project ? state.project.name : 'default');
}

// Flow-ML is the source of truth: a "schema changed" hook → re-serialize + save.
export function savePositions() {
  if (state.commit) state.commit();
}

export function saveDoc(text: string) {
  try {
    localStorage.setItem(storageKey() + '-flowml', text);
  } catch (e) { /* quota */ }
}

export function loadDoc(): string | null {
  try {
    return localStorage.getItem(storageKey() + '-flowml');
  } catch (e) { return null; }
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
  if (state.commit) state.commit();
}

export function loadHiddenScreens() {
  try {
    var raw = localStorage.getItem(storageKey() + '-hidden');
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

export function saveArrowMutations() {
  if (state.commit) state.commit();
}

export function loadArrowMutations() {
  try {
    var raw = localStorage.getItem(storageKey() + '-arrowmods');
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// -- Layout helpers --
