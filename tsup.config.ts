import { defineConfig } from 'tsup';

// Emits BOTH outputs to the repo ROOT so the existing jsDelivr URLs keep
// working (@main/flowboard.js, @vX.Y.Z/flowboard.js). clean:false is CRITICAL —
// outDir is the repo root and we must never wipe it.
const base = {
  entry: { flowboard: 'src/index.ts' },
  format: ['iife'] as const,
  platform: 'browser' as const,
  target: 'es2019',
  outDir: '.',
  clean: false,
  dts: false,
  splitting: false,
  sourcemap: false,
};

export default defineConfig([
  { ...base, minify: false, outExtension: () => ({ js: '.js' }) },      // flowboard.js (readable)
  { ...base, minify: true, outExtension: () => ({ js: '.min.js' }) },   // flowboard.min.js
]);
