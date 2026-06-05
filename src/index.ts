import { init } from './board';

// The runtime contract served on the CDN. Tests import the modules directly,
// so the only public surface is FlowBoard.init.
declare global {
  interface Window {
    FlowBoard: { init: typeof init };
  }
}

window.FlowBoard = { init: init };
