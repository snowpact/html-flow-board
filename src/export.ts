import { buildSpreadMap, computeControlPoints, getAnchor, isArrowShown, resolveArrowSides } from './arrows';
import { state } from './core/state';
import { Arrow, Position, Screen } from './core/types';

export var html2canvasLoaded: Promise<any> | null = null; // cached Promise

export function loadHtml2Canvas(): Promise<any> {
  if (html2canvasLoaded) return html2canvasLoaded;
  html2canvasLoaded = new Promise(function (resolve, reject) {
    if ((window as any).html2canvas) { resolve((window as any).html2canvas); return; }
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    s.onload = function () { resolve((window as any).html2canvas); };
    s.onerror = function () { html2canvasLoaded = null; reject(new Error('Failed to load html2canvas')); };
    document.head.appendChild(s);
  });
  return html2canvasLoaded;
}

// Is this screen part of what the board currently shows? (eye toggle + epic focus)
export function isScreenShown(id: string): boolean {
  if (state.hiddenScreens[id]) return false;
  if (state.focus && !state.focus.visible[id]) return false;
  return true;
}

// The export covers exactly what is on screen: the shown screens, the drawn
// arrows and their label cards. An epic focus therefore exports that epic alone.
export function collectExportBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
  var minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
  var arrows: Arrow[] = state.project.arrows || [];
  var spreadMap = buildSpreadMap();

  state.project.screens.forEach(function (s: Screen) {
    if (!isScreenShown(s.id)) return;
    var el = state.screenEls[s.id];
    var pos = state.positions[s.id];
    if (!el || !pos) return;
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + el.offsetWidth);
    maxY = Math.max(maxY, pos.y + el.offsetHeight);
  });

  // Include arrow control points so arrows aren't clipped
  arrows.forEach(function (arrow: Arrow, idx: number) {
    if (!isScreenShown(arrow.from) || !isScreenShown(arrow.to) || !isArrowShown(arrow)) return;

    var fromEl = state.screenEls[arrow.from];
    var toEl = state.screenEls[arrow.to];
    if (!fromEl || !toEl) return;

    var sides = resolveArrowSides(arrow, idx, spreadMap);

    var start = getAnchor(arrow.from, sides.from);
    var end = getAnchor(arrow.to, sides.to);

    var cps = computeControlPoints(start, end, sides.from, sides.to);
    var cp1 = cps.cp1;
    var cp2 = cps.cp2;

    [start, end, cp1, cp2].forEach(function (p: Position) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });
  });

  // Label boxes (cards) as drawn, so a wide card at the edge is never cropped.
  if (state.svgEl) {
    var boxes = state.svgEl.querySelectorAll('.fb-arrow-label-bg');
    for (var i = 0; i < boxes.length; i++) {
      var bx = parseFloat(boxes[i].getAttribute('x')), by = parseFloat(boxes[i].getAttribute('y'));
      var bw = parseFloat(boxes[i].getAttribute('width')), bh = parseFloat(boxes[i].getAttribute('height'));
      if (isNaN(bx) || isNaN(by)) continue;
      minX = Math.min(minX, bx); minY = Math.min(minY, by);
      maxX = Math.max(maxX, bx + bw); maxY = Math.max(maxY, by + bh);
    }
  }

  return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
}

export function doExport(): void {
  if (!state.canvasEl || !state.project) return;

  var bounds = collectExportBounds();
  if (bounds.minX === Infinity) return;

  var padding = 40;
  var vx = Math.max(0, bounds.minX - padding);
  var vy = Math.max(0, bounds.minY - padding);
  var vw = bounds.maxX - bounds.minX + padding * 2;
  var vh = bounds.maxY - bounds.minY + padding * 2;

  // Build a small, clean temporary container (no transform, exact size)
  var tmp = document.createElement('div');
  tmp.className = 'fb-container';
  tmp.style.cssText = 'position:fixed;left:-99999px;top:0;width:' + vw + 'px;height:' + vh + 'px;overflow:visible;background:transparent;';

  // Clone visible screens, offset to crop origin
  state.project.screens.forEach(function (s: Screen) {
    if (!isScreenShown(s.id)) return;
    var el = state.screenEls[s.id];
    var pos = state.positions[s.id];
    if (!el || !pos) return;
    var clone = el.cloneNode(true) as HTMLElement;
    clone.classList.remove('fb-selected', 'fb-dragging', 'fb-focus-out');
    clone.style.left = (pos.x - vx) + 'px';
    clone.style.top = (pos.y - vy) + 'px';
    tmp.appendChild(clone);
  });

  // Rasterize SVG arrows (cropped via viewBox)
  var svgClone = state.svgEl.cloneNode(true) as SVGSVGElement;
  svgClone.classList.remove('fb-hl-active'); // no hover emphasis in the export
  var hl = svgClone.querySelectorAll('.fb-arrow-hl');
  for (var hi = 0; hi < hl.length; hi++) hl[hi].classList.remove('fb-arrow-hl');
  // Remove dimmed arrows from export
  var dimmedEls = svgClone.querySelectorAll('.fb-arrow-dimmed');
  for (var di = 0; di < dimmedEls.length; di++) {
    dimmedEls[di].parentNode.removeChild(dimmedEls[di]);
  }
  svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svgClone.setAttribute('viewBox', vx + ' ' + vy + ' ' + vw + ' ' + vh);
  svgClone.setAttribute('width', String(vw));
  svgClone.setAttribute('height', String(vh));

  var svgStr = new XMLSerializer().serializeToString(svgClone);
  var blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  var url = URL.createObjectURL(blob);

  // Output scale: crisp on Retina (device pixel ratio, at least 2), capped by a
  // pixel budget so very large boards stay within the browsers' canvas limits
  // (Safari refuses canvases past ~16 M pixels; Chrome ~268 M).
  var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  var scale = Math.max(2, Math.min(3, dpr));
  var budget = exportPixelBudget();
  if (vw * vh * scale * scale > budget) scale = Math.max(1, Math.sqrt(budget / (vw * vh)));
  // Browsers also cap each canvas side (≈16 k px): a huge board exports smaller
  // rather than blurry or blank.
  var MAX_SIDE = 16000;
  if (vw * scale > MAX_SIDE) scale = MAX_SIDE / vw;
  if (vh * scale > MAX_SIDE) scale = MAX_SIDE / vh;
  var outW = Math.round(vw * scale), outH = Math.round(vh * scale);

  // 1. Screens: html2canvas renders the DOM clone once, at `scale`.
  document.body.appendChild(tmp);
  var screensDone = loadHtml2Canvas().then(function (html2canvas: any) {
    return html2canvas(tmp, { width: vw, height: vh, scale: scale, backgroundColor: null, useCORS: true, logging: false });
  });

  // 2. Arrows: the SVG is rasterized straight at `scale` (no intermediate 1× pass).
  var arrowsDone = new Promise<HTMLImageElement>(function (resolve, reject) {
    var img = new Image();
    img.onload = function () { resolve(img); };
    img.onerror = function () { reject(new Error('Arrow rasterization failed')); };
    img.src = url;
  });

  // 3. Composite: background, screens, arrows on top — a single pass each.
  Promise.all([screensDone, arrowsDone]).then(function (res) {
    var screensCanvas = res[0] as HTMLCanvasElement;
    var arrowsImg = res[1] as HTMLImageElement;
    URL.revokeObjectURL(url);
    if (tmp.parentNode) document.body.removeChild(tmp);

    var out = document.createElement('canvas');
    out.width = outW; out.height = outH;
    var ctx = out.getContext('2d');
    ctx.fillStyle = '#f0f2f5';
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(screensCanvas, 0, 0, outW, outH);
    ctx.drawImage(arrowsImg, 0, 0, outW, outH);

    var suffix = state.focus ? ' - ' + state.focus.id : '';
    var link = document.createElement('a');
    link.download = (state.project.name || 'flowboard') + suffix + '.png';
    link.href = out.toDataURL('image/png');
    link.click();
  }).catch(function (err: any) {
    URL.revokeObjectURL(url);
    if (tmp.parentNode) document.body.removeChild(tmp);
    console.error('Export failed:', err);
  });
}

// Max output pixels for the export canvas. Safari caps a canvas around 16 M
// pixels; other browsers go much higher. Detected by user agent, generously.
export function exportPixelBudget(): number {
  var ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  var isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua);
  return isSafari ? 16000000 : 120000000;
}

// -- Init --
