import { buildSpreadMap, computeControlPoints, getAnchor, resolveArrowSides } from './arrows';
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

export function collectExportBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
  var minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
  var arrows: Arrow[] = state.project.arrows || [];
  var spreadMap = buildSpreadMap();

  state.project.screens.forEach(function (s: Screen) {
    if (state.hiddenScreens[s.id]) return;
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
    if (state.hiddenScreens[arrow.from] || state.hiddenScreens[arrow.to]) return;

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
    if (state.hiddenScreens[s.id]) return;
    var el = state.screenEls[s.id];
    var pos = state.positions[s.id];
    if (!el || !pos) return;
    var clone = el.cloneNode(true) as HTMLElement;
    clone.classList.remove('fb-selected', 'fb-dragging');
    clone.style.left = (pos.x - vx) + 'px';
    clone.style.top = (pos.y - vy) + 'px';
    tmp.appendChild(clone);
  });

  // Rasterize SVG arrows (cropped via viewBox)
  var svgClone = state.svgEl.cloneNode(true) as SVGSVGElement;
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
  var img = new Image();

  img.onload = function () {
    URL.revokeObjectURL(url);

    // Draw arrows onto a canvas element (2x resolution)
    var ac = document.createElement('canvas');
    ac.width = vw * 2;
    ac.height = vh * 2;
    ac.style.cssText = 'position:absolute;top:0;left:0;width:' + vw + 'px;height:' + vh + 'px;pointer-events:none;';
    ac.getContext('2d').drawImage(img, 0, 0, vw * 2, vh * 2);
    tmp.appendChild(ac);

    document.body.appendChild(tmp);

    // Capture the small temp container at 2x
    loadHtml2Canvas().then(function (html2canvas: any) {
      return html2canvas(tmp, {
        width: vw,
        height: vh,
        scale: 2,
        backgroundColor: '#f0f2f5',
        useCORS: true
      });
    }).then(function (resultCanvas: HTMLCanvasElement) {
      document.body.removeChild(tmp);
      var link = document.createElement('a');
      link.download = (state.project.name || 'flowboard') + '.png';
      link.href = resultCanvas.toDataURL('image/png');
      link.click();
    }).catch(function (err: any) {
      if (tmp.parentNode) document.body.removeChild(tmp);
      console.error('Export failed:', err);
    });
  };

  img.onerror = function () {
    URL.revokeObjectURL(url);
    console.error('Arrow rasterization failed');
  };

  img.src = url;
}

// -- Reset all customizations --
export function doExportConfig(): void {
  // Build a clean copy of the project with current arrow mutations
  var projectCopy = {
    name: state.project.name,
    epics: JSON.parse(JSON.stringify(state.project.epics || [])),
    screens: (state.project.screens || []).map(function (s: Screen): Screen {
      var clean: Screen = {
        id: s.id,
        title: s.title,
        epic: s.epic
      };
      if (s.label) clean.label = s.label;
      if (s.notes) clean.notes = s.notes;
      if (s.content) clean.content = s.content;
      if (s.preset && s.preset !== 'custom') clean.preset = s.preset;
      if (s.format) clean.format = s.format;
      return clean;
    }),
    arrows: JSON.parse(JSON.stringify(state.project.arrows))
  };

  var stateCopy = {
    positions: JSON.parse(JSON.stringify(state.positions)),
    zoom: state.zoom,
    panX: state.panX,
    panY: state.panY,
    hiddenScreens: JSON.parse(JSON.stringify(state.hiddenScreens))
  };

  // Build JS output with template literals for content fields
  var screenStrs = projectCopy.screens.map(function (s: Screen): string {
    var lines: string[] = [];
    lines.push('      {');
    lines.push('        id: ' + JSON.stringify(s.id) + ',');
    lines.push('        title: ' + JSON.stringify(s.title) + ',');
    lines.push('        epic: ' + JSON.stringify(s.epic) + ',');
    if (s.preset && s.preset !== 'custom') lines.push('        preset: ' + JSON.stringify(s.preset) + ',');
    if (s.format) lines.push('        format: ' + JSON.stringify(s.format) + ',');
    if (s.label) lines.push('        label: ' + JSON.stringify(s.label) + ',');
    if (s.notes) lines.push('        notes: ' + JSON.stringify(s.notes) + ',');
    if (s.content) {
      lines.push('        content: `');
      lines.push(s.content.replace(/`/g, '\\`'));
      lines.push('        `');
    }
    lines.push('      }');
    return lines.join('\n');
  });

  var arrowStrs = projectCopy.arrows.map(function (a: Arrow): string {
    var parts: string[] = ['from: ' + JSON.stringify(a.from), 'to: ' + JSON.stringify(a.to)];
    if (a.label) parts.push('label: ' + JSON.stringify(a.label));
    if (a.dashed) parts.push('dashed: true');
    if (a.fromSide) parts.push('fromSide: ' + JSON.stringify(a.fromSide));
    if (a.toSide) parts.push('toSide: ' + JSON.stringify(a.toSide));
    return '      { ' + parts.join(', ') + ' }';
  });

  var js = 'FlowBoard.init({\n';
  js += '  container: \'#app\',\n';
  js += '  project: {\n';
  js += '    name: ' + JSON.stringify(projectCopy.name) + ',\n';
  js += '    epics: ' + JSON.stringify(projectCopy.epics, null, 6).replace(/\n/g, '\n    ') + ',\n';
  js += '    screens: [\n' + screenStrs.join(',\n') + '\n    ],\n';
  js += '    arrows: [\n' + arrowStrs.join(',\n') + '\n    ]\n';
  js += '  },\n';
  js += '  state: ' + JSON.stringify(stateCopy, null, 4).replace(/\n/g, '\n  ') + '\n';
  js += '});\n';

  var btn = state.container.querySelector('.fb-action-btn[title*="presse-papier"]') as HTMLElement;

  function showFeedback(success: boolean): void {
    if (!btn) return;
    var original = btn.textContent;
    btn.textContent = success ? 'Copied!' : 'Error!';
    setTimeout(function () { btn.textContent = original; }, 2000);
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(js).then(function () {
      showFeedback(true);
    }, function () {
      showFeedback(false);
    });
  } else {
    var ta = document.createElement('textarea');
    ta.value = js;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showFeedback(true);
    } catch (e) {
      showFeedback(false);
    }
    document.body.removeChild(ta);
  }
}

// -- Init --
