// Dev watcher: rebuild the bundle whenever src/ changes.
// tsup's own --watch ignores the whole repo when outDir is '.', so we drive
// the build from a plain fs.watch on src/ (which also keeps the process alive).
const { spawnSync } = require('child_process');
const { watch } = require('fs');
const path = require('path');

const tsup = path.join(__dirname, '..', 'node_modules', '.bin', 'tsup');
const srcDir = path.join(__dirname, '..', 'src');

function build() {
  spawnSync(tsup, [], { stdio: 'inherit' });
}

build();
console.log('[dev] watching src/ for changes (Ctrl-C to stop)…');

let timer = null;
watch(srcDir, { recursive: true }, function () {
  clearTimeout(timer);
  timer = setTimeout(build, 60); // debounce rapid saves
});
