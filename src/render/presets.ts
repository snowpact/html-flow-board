import { PresetId } from '../core/types';

// A screen's BODY is rendered either from raw `content` HTML (preset 'custom')
// or from one of these grey wireframe skeletons. Each skeleton() returns plain
// HTML built from a tiny shape vocabulary; layout lives in .fb-skel-<id> CSS.

const bar = '<i class="fb-skel-bar"></i>';
const box = '<i class="fb-skel-box"></i>';
const circle = '<i class="fb-skel-circle"></i>';
const pill = '<i class="fb-skel-pill"></i>';
const rep = (n: number, s: string): string => s.repeat(n);

export interface Preset {
  id: PresetId;
  label: string;
  skeleton: () => string;
}

export const PRESETS: Preset[] = [
  { id: 'custom', label: 'Custom (HTML)', skeleton: () => '' },
  { id: 'blank', label: 'Blank', skeleton: () => box },
  {
    id: 'form', label: 'Form',
    skeleton: () => rep(3, `<div class="fb-skel-field">${bar}${box}</div>`) + `<div class="fb-skel-foot">${box}</div>`,
  },
  {
    id: 'list', label: 'List',
    skeleton: () => rep(5, `<div class="fb-skel-listrow">${circle}${bar}</div>`),
  },
  {
    id: 'table', label: 'Table',
    skeleton: () => `<div class="fb-skel-thead">${bar}</div><div class="fb-skel-grid">${rep(16, box)}</div>`,
  },
  {
    id: 'dashboard', label: 'Dashboard',
    skeleton: () => `<div class="fb-skel-tiles">${rep(4, box)}</div><div class="fb-skel-chart">${box}</div>`,
  },
  {
    id: 'cardgrid', label: 'Card grid',
    skeleton: () => rep(6, box),
  },
  {
    id: 'detail', label: 'Detail',
    skeleton: () => `<div class="fb-skel-head">${circle}<div class="fb-skel-lines">${bar}${bar}</div></div><div class="fb-skel-blocks">${box}${box}</div>`,
  },
  {
    id: 'auth', label: 'Auth / Login',
    skeleton: () => `${circle}${bar}${bar}${box}`,
  },
  {
    id: 'feed', label: 'Feed',
    skeleton: () => rep(3, `<div class="fb-skel-post">${circle}<div class="fb-skel-lines">${bar}${bar}</div>${box}</div>`),
  },
  {
    id: 'settings', label: 'Settings',
    skeleton: () => rep(4, `<div class="fb-skel-setrow">${bar}${pill}</div>`),
  },
  {
    id: 'kanban', label: 'Kanban',
    skeleton: () => rep(3, `<div class="fb-skel-kcol">${rep(2, box)}</div>`),
  },
  {
    id: 'modal', label: 'Modal',
    skeleton: () => `<div class="fb-skel-dialog">${bar}${box}<div class="fb-skel-dialog-actions">${pill}${pill}</div></div>`,
  },
  {
    id: 'gallery', label: 'Gallery',
    skeleton: () => rep(6, box),
  },
  {
    id: 'nav', label: 'Nav / Landing',
    skeleton: () => `<div class="fb-skel-navbar">${bar}</div><div class="fb-skel-hero">${box}</div><div class="fb-skel-secs">${bar}${bar}</div>`,
  },
];

export function getPreset(id: PresetId): Preset | undefined {
  for (var i = 0; i < PRESETS.length; i++) {
    if (PRESETS[i].id === id) return PRESETS[i];
  }
  return undefined;
}

export function isCustomPreset(id: PresetId | undefined): boolean {
  return !id || id === 'custom';
}

export function skeletonHtml(id: PresetId): string {
  var p = getPreset(id);
  return p ? p.skeleton() : '';
}
