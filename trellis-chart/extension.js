'use strict';

// bar = default mark colour, neutral = "nothing special" colour when a Color measure is in play,
// accent = falls / highlights, up = rises (diverging mode only), second = the secondary-axis measure
const THEMES = {
  paper: { bg: '#FDFDFD', text: '#0E2442', panel: '#FDFDFD', ptext: '#3B4A63', border: '#D5D8DC', bar: '#5A9DBB', neutral: '#CBD2DB', accent: '#D78212', up: '#2C4E82', second: '#0E2442', grid: 'rgba(14,36,66,.08)' },
  navy:  { bg: '#FDFDFD', text: '#0E2442', panel: '#2C4E82', ptext: '#FDFDFD', border: '', bar: '#D78212', neutral: '#7F95B5', accent: '#D78212', up: '#A5D5E7', second: '#EFC262', grid: 'rgba(253,253,253,.18)' },
  light: { bg: '#FDFDFD', text: '#0E2442', panel: '#A5D5E7', ptext: '#0E2442', border: '', bar: '#2C4E82', neutral: '#E8F4F9', accent: '#D78212', up: '#2C4E82', second: '#0E2442', grid: 'rgba(14,36,66,.12)' },
  warm:  { bg: '#FDFDFD', text: '#0E2442', panel: '#F2DBB5', ptext: '#0E2442', border: '', bar: '#D78212', neutral: '#C4AE8C', accent: '#D78212', up: '#2C4E82', second: '#0E2442', grid: 'rgba(14,36,66,.10)' },
  dark:  { bg: '#0E2442', text: '#FDFDFD', panel: '#16305A', ptext: '#FDFDFD', border: '#2C4E82', bar: '#5A9DBB', neutral: '#4A6796', accent: '#EFC262', up: '#A5D5E7', second: '#FDFDFD', grid: 'rgba(253,253,253,.14)' },
  teal:  { bg: '#FFFFFF', text: '#2E9AA3', panel: '#45B5BD', ptext: '#FFFFFF', border: '', bar: '#EC7A8C', neutral: '#8FD3D8', accent: '#EC7A8C', up: '#FFFFFF', second: '#FFFFFF', grid: 'rgba(255,255,255,.22)' }
};
const SERIES_COLORS = ['#5A9DBB', '#EFC262', '#A5D5E7', '#9C805F', '#F2DBB5', '#D78212', '#2C4E82', '#ECECEB'];
const DEFAULTS = {
  cols: 0, minh: 0, sort: 'name', group: '1', ymode: 'free', sub: '0', yr: '1',
  chart: 'bar', fmt: 'tableau', cdec: 'auto',                                   // C1, primary axis
  chart2: 'line', fmt2: 'tableau', cdec2: 'auto', axis2: 'indep', zero2: '0', swap: '0', color2: '',   // C2, secondary axis
  cmode: 'neg', ddec: 'auto',                                                   // D as a measure
  hl: '', align: 'left', theme: 'paper', accent: '', scale: 1
};
const VERSION = '0.7';
const MAX_PANELS = 400;
const SEP = String.fromCharCode(31);

let worksheet = null;
let settings = { ...DEFAULTS };
let theme = THEMES.paper;
let accent = theme.accent;
let color2 = theme.second;
let model = null;
let colors = [];
let raf = 0;

const $viz = document.getElementById('viz');
const $empty = document.getElementById('empty');
const $tip = document.getElementById('tip');

async function boot() {
  $viz.addEventListener('mousemove', onHover);
  $viz.addEventListener('mouseleave', hideTip);
  $viz.addEventListener('scroll', hideTip);
  new ResizeObserver(scheduleDraw).observe(document.body);
  if (!window.tableau?.extensions) return demoMode();
  try {
    await tableau.extensions.initializeAsync({ configure });
  } catch (e) { return demoMode(); }
  worksheet = tableau.extensions.worksheetContent.worksheet;
  readSettings();
  worksheet.addEventListener(tableau.TableauEventType.SummaryDataChanged, refresh);
  tableau.extensions.settings.addEventListener(tableau.TableauEventType.SettingsChanged, () => {
    readSettings(); refresh();   // refresh, not just redraw: swapping the axes changes which column is primary
  });
  await refresh();
}

// ---------- data ----------

async function refresh() {
  try {
    const spec = await worksheet.getVisualSpecificationAsync();
    const marks = spec.marksSpecifications[spec.activeMarksSpecificationIndex];
    const enc = { panel: [], x: [], value: [], color: [] };
    let colorRole = '';
    for (const e of marks.encodings) {
      if (!enc[e.id]) continue;
      enc[e.id].push(e.field.name);
      if (e.id === 'color') colorRole = String(e.field.role || '').toLowerCase();
    }
    if (!enc.value.length) {
      return drawEmpty('請把一個<b>度量</b>拖到 <b>C 數值</b>，再把維度拖到 <b>A 分格</b>（1–2 個）、日期或維度拖到 <b>B 橫軸</b>' +
        '<br><span class="en">Drop a <b>measure</b> on <b>C Value</b>, then 1–2 dimensions on <b>A Panel</b> and a date or dimension on <b>B X axis</b></span>');
    }

    const reader = await worksheet.getSummaryDataReaderAsync();
    const table = await reader.getAllPagesAsync();
    await reader.releaseAsync();

    const cols = table.columns;
    const byName = n => cols.find(c => c.fieldName === n);
    const pCols = enc.panel.map(byName).filter(Boolean);
    const xCol = enc.x.length ? byName(enc.x[0]) : null;
    // one Color tile, Tableau-style: a measure shades the bars, a dimension splits them into stacked series
    const colorCol = enc.color.length ? byName(enc.color[0]) : null;
    const colorIsMeasure = !!colorCol && (colorRole ? colorRole === 'measure' : (colorCol.dataType === 'float' || colorCol.dataType === 'int'));
    const sCol = colorCol && !colorIsMeasure ? colorCol : null;
    const cCol = colorIsMeasure ? colorCol : null;
    const used = new Set([...pCols, xCol, sCol, cCol].filter(Boolean).map(c => c.index));
    // C holds one or two measures: the first is the primary axis, the second the secondary axis
    let vCols = enc.value.slice(0, 2).map(byName).filter(Boolean);
    if (!vCols.length) {
      const guess = cols.find(c => !used.has(c.index) && (c.dataType === 'float' || c.dataType === 'int'));
      if (guess) vCols = [guess];
    }
    if (!vCols.length) {
      return drawEmpty('找不到數值欄位，請確認 <b>C 數值</b> 放的是度量<br><span class="en">No numeric field found. Make sure <b>C Value</b> holds a measure</span>');
    }
    if (settings.swap === '1' && vCols.length === 2) vCols.reverse();
    const [vCol, v2Col] = vCols;

    const recs = [];
    for (const r of table.data) {
      const num = c => { const v = c ? r[c.index].nativeValue : null; return typeof v === 'number' && isFinite(v) ? v : null; };
      const v = num(vCol), v2 = num(v2Col);
      if (v === null && v2 === null) continue;
      let x = { key: '', label: '', sort: 0, year: null };
      if (xCol) {
        const c = r[xCol.index], nv = c.nativeValue;
        const isDate = nv instanceof Date;
        // the year comes from the raw text so a timezone shift can never move January into last year
        const m = isDate ? /^(\d{4})-/.exec(String(c.value)) : null;
        x = {
          key: String(c.value),
          label: c.formattedValue,
          sort: isDate ? nv.getTime() : (typeof nv === 'number' ? nv : null),
          year: isDate ? (m ? +m[1] : nv.getFullYear()) : null
        };
      }
      recs.push({
        p: pCols.map(c => r[c.index].formattedValue),
        x,
        s: sCol ? r[sCol.index].formattedValue : null,
        v, f: v === null ? null : r[vCol.index].formattedValue,
        v2, f2: v2 === null ? null : r[v2Col.index].formattedValue,
        c: num(cCol), cf: cCol ? r[cCol.index].formattedValue : null
      });
    }
    if (!recs.length) return drawEmpty('目前的篩選條件下沒有資料<br><span class="en">No data under the current filters</span>');
    model = buildModel(recs, {
      levels: pCols.length, valueName: vCol.fieldName, value2Name: v2Col ? v2Col.fieldName : '', colorName: cCol ? cCol.fieldName : ''
    });
    scheduleDraw();
  } catch (e) {
    console.error(e);
    drawEmpty('讀取資料時發生錯誤：' + esc(e.message || String(e)));
  }
}

function buildModel(recs, meta) {
  const xMap = new Map(), sMap = new Map(), pMap = new Map();
  for (const r of recs) {
    if (!xMap.has(r.x.key)) xMap.set(r.x.key, r.x);
    const sk = r.s ?? '';
    if (!sMap.has(sk)) sMap.set(sk, sMap.size);
  }
  const xs = [...xMap.values()];
  if (xs.every(x => typeof x.sort === 'number')) xs.sort((a, b) => a.sort - b.sort);
  const xIdx = new Map(xs.map((x, i) => [x.key, i]));
  const nS = sMap.size, nX = xs.length;
  const useColor = !!meta.colorName && nS === 1;
  const cRange = { lo: 0, hi: 0, loF: '', hiF: '', sample: '' };
  const valueSample = (recs.find(r => r.f) || {}).f || '';
  const value2Sample = (recs.find(r => r.f2) || {}).f2 || '';
  const grid = () => Array.from({ length: nS }, () => new Array(nX).fill(null));

  for (const r of recs) {
    const pk = r.p.join(SEP);
    let p = pMap.get(pk);
    if (!p) {
      p = {
        order: pMap.size,
        title: r.p.length ? r.p[r.p.length - 1] : meta.valueName,
        group: r.p.length > 1 ? r.p[0] : '',
        vals: grid(), vals2: grid(), seen: new Set(),
        fmt: new Array(nX).fill(null), fmt2: new Array(nX).fill(null),
        cval: new Array(nX).fill(null), cfmt: new Array(nX).fill(null)
      };
      pMap.set(pk, p);
    }
    const si = sMap.get(r.s ?? ''), xi = xIdx.get(r.x.key);
    const dup = p.seen.has(si + ':' + xi);
    p.seen.add(si + ':' + xi);
    if (r.v !== null) p.vals[si][xi] = (p.vals[si][xi] || 0) + r.v;
    if (r.v2 !== null) p.vals2[si][xi] = (p.vals2[si][xi] || 0) + r.v2;
    // Tableau's own formatted text is only trustworthy for a single, un-aggregated cell
    p.fmt[xi] = (nS === 1 && !dup) ? r.f : null;
    p.fmt2[xi] = (nS === 1 && !dup) ? r.f2 : null;
    if (useColor && r.c !== null && !dup) {
      p.cval[xi] = r.c; p.cfmt[xi] = r.cf;
      if (!cRange.sample && r.cf) cRange.sample = r.cf;
      if (r.c < cRange.lo) { cRange.lo = r.c; cRange.loF = r.cf; }
      if (r.c > cRange.hi) { cRange.hi = r.c; cRange.hiF = r.cf; }
    }
  }

  const panels = [...pMap.values()];
  let has2 = false;
  for (const p of panels) {
    delete p.seen;
    const sum = g => {
      const out = new Array(nX).fill(null);
      for (let i = 0; i < nX; i++) for (let s = 0; s < nS; s++) if (g[s][i] !== null) out[i] = (out[i] || 0) + g[s][i];
      return out;
    };
    p.tot = sum(p.vals);
    p.tot2 = sum(p.vals2);
    if (p.tot2.some(v => v !== null)) has2 = true;
    const present = p.tot.filter(v => v !== null);
    p.last = p.tot.reduce((acc, v, i) => (v !== null ? i : acc), -1);
    p.lastVal = p.last >= 0 ? p.tot[p.last] : null;
    p.avg = present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
  }

  // year markers: the first x of each calendar year, only when the axis is a real date spanning several years
  let yearMarks = [];
  if (xs.every(x => x.year !== null)) {
    xs.forEach((x, i) => { if (i === 0 || x.year !== xs[i - 1].year) yearMarks.push(i); });
    if (yearMarks.length < 2 || nX / yearMarks.length < 3) yearMarks = [];
  }
  return {
    xs, series: [...sMap.keys()], panels, levels: meta.levels, useColor, cRange, valueSample, value2Sample,
    has2: has2 && !!meta.value2Name, valueName: meta.valueName, value2Name: meta.value2Name, colorName: meta.colorName, yearMarks
  };
}

// ---------- settings ----------

function readSettings() {
  applySettings(tableau.extensions.settings.getAll());
}

function applySettings(all) {
  settings = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (all[k] !== undefined && all[k] !== null) settings[k] = all[k];
  settings.cols = Math.max(0, parseInt(settings.cols, 10) || 0);
  settings.minh = Math.max(0, parseInt(settings.minh, 10) || 0);
  settings.scale = Math.min(2, Math.max(0.6, parseFloat(settings.scale) || 1));
  if (!THEMES[settings.theme]) settings.theme = DEFAULTS.theme;
  theme = THEMES[settings.theme];
  const hex = v => /^#[0-9a-f]{6}$/i.test(v);
  const custom = hex(settings.accent);
  accent = custom ? settings.accent : theme.accent;
  color2 = hex(settings.color2) ? settings.color2 : theme.second;
  const st = document.documentElement.style;
  st.setProperty('--bg', theme.bg);
  st.setProperty('--text', theme.text);
  st.setProperty('--panel', theme.panel);
  st.setProperty('--ptext', theme.ptext);
  st.setProperty('--grid', theme.grid);
  st.setProperty('--border', theme.border || 'transparent');
  st.setProperty('--accent', accent);
  const first = custom ? accent : theme.bar;
  const same = c => [first, theme.panel].some(o => o.toLowerCase() === c.toLowerCase());
  colors = [first, ...SERIES_COLORS.filter(c => !same(c))];
}

function configure() {
  const url = new URL('config.html', location.href).href;
  tableau.extensions.ui.displayDialogAsync(url, '', { width: 460, height: 720 })
    .catch(() => {});   // user closed the dialog
}

// ---------- number formatting ----------

const decOf = v => (/^[0-6]$/.test(String(v)) ? +v : null);   // null = auto

// fixed decimals, but keep what Tableau's own format tells us: a trailing % (value is a ratio) or a currency prefix
function fmtFixed(v, sample, dec) {
  const s = sample || '';
  const isPct = /%\s*$/.test(s);
  const cur = isPct ? null : /^[-−(]?\s*([^\d\s\-−(.,]+)/.exec(s);
  const n = Math.abs(isPct ? v * 100 : v).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return (v < 0 ? '-' : '') + (cur ? cur[1] : '') + n + (isPct ? '%' : '');
}

// one formatter per axis. kind: tableau | pct100 (0.85 -> 85%) | pctsign (85 -> 85%) | percent (legacy: guess) | compact
function makeFmt(kind, dec, sample, looksLikeRatio, unitAxis) {
  const pct = p => p.toLocaleString('en-US', {
    minimumFractionDigits: dec ?? 0,
    maximumFractionDigits: dec ?? (Math.abs(p) >= 10 || p === 0 ? 0 : 1)
  }) + '%';
  return (v, tableauFmt) => {
    if (v === null || v === undefined) return '–';
    if (kind === 'pct100') return pct(v * 100);
    if (kind === 'pctsign') return pct(v);
    if (kind === 'tableau') {
      if (dec !== null) return fmtFixed(v, tableauFmt || sample, dec);
      if (tableauFmt) return tableauFmt;
    }
    if (kind === 'percent' || (kind === 'tableau' && unitAxis)) return pct(looksLikeRatio ? v * 100 : v);
    return new Intl.NumberFormat('en', { notation: 'compact', minimumFractionDigits: dec ?? 0, maximumFractionDigits: dec ?? 1 }).format(v);
  };
}

function fmtColor(v, tableauFmt) {
  if (v === null) return '–';
  const dec = decOf(settings.ddec);
  if (dec === null) return tableauFmt || String(v);
  return fmtFixed(v, tableauFmt || model.cRange.sample, dec);
}

// ---------- colour by measure ----------

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = sh => Math.round(((pa >> sh) & 255) + (((pb >> sh) & 255) - ((pa >> sh) & 255)) * t);
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}

// negative -> accent, zero -> neutral, positive -> neutral (neg mode) or "up" colour (diverging mode)
function colorFor(cv) {
  if (cv === null) return theme.neutral;
  const { lo, hi } = model.cRange;
  if (cv < 0 && lo < 0) return mix(theme.neutral, accent, Math.min(1, 0.15 + 0.85 * cv / lo));
  if (cv > 0 && hi > 0 && settings.cmode === 'div') return mix(theme.neutral, theme.up, Math.min(1, 0.15 + 0.85 * cv / hi));
  return theme.neutral;
}

// ---------- drawing ----------

function scheduleDraw() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(draw);
}

function drawEmpty(html) {
  model = null;
  $viz.innerHTML = '';
  hideTip();
  $empty.innerHTML = html;
  $empty.hidden = false;
}

// in 100% share mode the headline number is the first series' share, not the raw total
function isShare() { return settings.ymode === 'pct' && model.series.length > 1; }
function shareOfFirst(p, i) { return i >= 0 && p.tot[i] ? (p.vals[0][i] || 0) / p.tot[i] : null; }

function orderedPanels() {
  let list = model.panels.slice();
  const nul = v => (v === null ? -Infinity : v);
  const last = p => nul(isShare() ? shareOfFirst(p, p.last) : p.lastVal);
  const avg = p => {
    if (!isShare()) return nul(p.avg);
    const v = p.tot.map((t, i) => shareOfFirst(p, i)).filter(x => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : -Infinity;
  };
  const cmp = {
    'last-desc': (a, b) => last(b) - last(a),
    'last-asc': (a, b) => last(a) - last(b),
    'avg-desc': (a, b) => avg(b) - avg(a),
    'name': (a, b) => a.title.localeCompare(b.title, undefined, { numeric: true })
  }[settings.sort];
  if (cmp) list.sort((a, b) => cmp(a, b) || a.order - b.order);
  if (model.levels > 1 && settings.group === '1') {
    const gOrder = new Map();
    for (const p of model.panels) if (!gOrder.has(p.group)) gOrder.set(p.group, gOrder.size);
    list = list.map((p, i) => [p, i]).sort((a, b) => gOrder.get(a[0].group) - gOrder.get(b[0].group) || a[1] - b[1]).map(d => d[0]);
  }
  return list;
}

const isStacked = t => t === 'bar' || t === 'area';

// [lo, hi] of what will be drawn; stacked marks add up per x, the others stand alone. null when there is nothing
function rangeOf(vs, stacked, nX) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < nX; i++) {
    let pos = 0, neg = 0, any = false;
    for (const row of vs) {
      const v = row[i];
      if (v === null) continue;
      any = true;
      if (stacked) { if (v >= 0) pos += v; else neg += v; } else { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    }
    if (any && stacked) { hi = Math.max(hi, pos); lo = Math.min(lo, neg < 0 ? neg : pos); }
  }
  return hi >= lo ? [lo, hi] : null;
}
const unionRange = list => {
  const r = list.filter(Boolean);
  return r.length ? [Math.min(...r.map(e => e[0])), Math.max(...r.map(e => e[1]))] : null;
};

function draw() {
  if (!model) return;
  $empty.hidden = true;
  hideTip();
  const W0 = document.body.clientWidth, H0 = document.body.clientHeight;
  if (W0 < 20 || H0 < 20) return;

  const all = orderedPanels();
  const panels = all.slice(0, MAX_PANELS);
  const n = panels.length, nX = model.xs.length, nS = model.series.length;
  const t1 = nX === 1 && settings.chart !== 'gantt' ? 'bar' : settings.chart;
  const t2 = nX === 1 && !['bar', 'gantt'].includes(settings.chart2) ? 'gantt' : settings.chart2;
  // with stacked series (D = dimension) a second measure can't be summed safely, so only per-member lines / ticks are drawn
  const draw2 = model.has2 && (nS === 1 || t2 === 'line' || t2 === 'gantt');
  const skipped2 = model.has2 && !draw2;
  const band = nX === 1 || [t1, draw2 ? t2 : ''].some(t => t === 'bar' || t === 'gantt');
  const share = isShare();
  const useColor = model.useColor && t1 === 'bar';
  const bordered = !!theme.border;
  const left0 = settings.align === 'left';

  // grid: the user picks the columns, rows follow from the panel count
  const cols = Math.min(n, settings.cols > 0 ? settings.cols : Math.max(1, Math.round(Math.sqrt(n * (W0 / H0) / 1.6))));
  const rows = Math.ceil(n / cols);

  const sc = settings.scale;
  const inset = bordered ? 1 : 0;
  let W = W0 - inset * 2;
  const needLegend = nS > 1 || useColor || model.has2;
  const gapOf = w => (bordered ? 0 : Math.max(2, Math.min(14, Math.round(Math.min(w / cols, H0 / rows) * 0.07))));
  const sizes = w => {
    const gap = gapOf(w), pw = (w - gap * (cols - 1)) / cols;
    const fsT = Math.max(8, Math.min(14, pw / 13)) * sc;
    const fsA = Math.max(8, Math.min(11, pw / 16)) * sc;
    const showAxis = nX > 1 || model.xs[0].label !== '';
    const axisH = showAxis ? Math.round(fsA * 1.7) : 0;
    const legendH = needLegend ? Math.round(fsT * 1.9) : 0;
    const ph = (H0 - inset * 2 - legendH - axisH - gap * (rows - 1)) / rows;
    return { gap, pw, fsT, fsS: fsT * 0.84, fsA, showAxis, axisH, legendH, ph };
  };
  let L = sizes(W);
  // optional minimum row height: only then may the pane scroll vertically
  const scroll = settings.minh > 0 && L.ph < settings.minh;
  if (scroll) { W -= 12; L = sizes(W); L.ph = settings.minh; }
  $viz.style.overflowY = scroll ? 'auto' : 'hidden';
  const { gap, pw, fsT, fsS, fsA, showAxis, axisH, legendH, ph } = L;

  // header lines shrink away when the panel gets short, so nothing ever overflows
  let showGroup = model.levels > 1, showSub = settings.sub === '1', showHd = true;
  const hdH = () => (!showHd ? 0 : fsT * 1.25 + 4 + (showGroup ? fsS * 0.9 * 1.22 : 0) + (showSub && !left0 ? fsS * 1.22 : 0));
  if (hdH() > ph * 0.5) showGroup = false;
  if (hdH() > ph * 0.5 && !left0) showSub = false;
  if (hdH() > ph * 0.55) showHd = false;
  const pad = band ? Math.min(5, pw * 0.03) : 0;
  const plotH = ph - hdH();
  const marks = settings.yr === '1' && plotH >= 34 && model.yearMarks.length && (pw - pad * 2) / model.yearMarks.length >= 30 * sc
    ? model.yearMarks : [];

  // ----- value domains -----
  const view = p => (share
    ? p.vals.map(row => row.map((v, i) => (p.tot[i] ? (v || 0) / p.tot[i] : null)))
    : p.vals);
  const head = marks.length ? 1.22 : 1.04;   // leave air above the marks for the year labels
  const fixedAxis = share || settings.ymode === 'unit';
  const sync = draw2 && settings.axis2 === 'sync' && !fixedAxis;
  const zero2 = isStacked(t2) || settings.zero2 === '1';

  const ext1 = panels.map(p => rangeOf(view(p), isStacked(t1), nX));
  const ext2 = draw2 ? panels.map(p => rangeOf(p.vals2, nS === 1 && isStacked(t2), nX)) : [];
  const g1 = unionRange(ext1) || [0, 1], g2 = unionRange(ext2);
  const ratio1 = g1[0] >= 0 && g1[1] <= 1.0001;
  const ratio2 = !!g2 && g2[0] >= 0 && g2[1] <= 1.0001;
  const free = settings.ymode === 'free';
  const fromZero = r => [Math.min(0, r[0]), Math.max(0, r[1])];
  const finish = ([lo, hi]) => (hi > lo ? [lo, hi > 0 ? hi * head : hi] : [lo, lo + 1]);

  const plain1 = i => {
    if (share) return [0, 1];
    if (settings.ymode === 'unit' && g1[0] >= 0 && g1[1] <= 100.0001) return [0, ratio1 ? 1 : 100];
    const r = sync ? unionRange(free ? [ext1[i], ext2[i]] : [g1, g2]) : (free ? ext1[i] : g1);
    return fromZero(r || [0, 1]);
  };
  // "zero" mode: each axis keeps its own scale, but both put 0 at the same height, so a negative
  // secondary measure visibly runs below the baseline the bars stand on
  const alignZero = settings.axis2 === 'zero' && draw2;
  const aligned = i => {
    const r1 = plain1(i), r2 = fromZero((free ? ext2[i] : g2) || [0, 0]);
    const negShare = r => (r[1] > r[0] ? -r[0] / (r[1] - r[0]) : 0);
    // the primary axis decides first; a negative secondary may claim at most 40% of the height
    const z = Math.min(0.9, Math.max(negShare(r1), Math.min(negShare(r2), 0.4)));
    const fit = (r, grow) => {
      const span = Math.max(z > 0 ? -r[0] / z : 0, r[1] / (1 - z)) * grow || 1;
      return [-z * span, (1 - z) * span];
    };
    return [fit(r1, fixedAxis ? 1 : head), fit(r2, head)];
  };
  const domain1 = i => (alignZero ? aligned(i)[0] : (fixedAxis ? plain1(i) : finish(plain1(i))));
  const domain2 = i => {
    if (alignZero) return aligned(i)[1];
    if (sync) return domain1(i);
    const r = free ? ext2[i] : g2;
    if (!r) return [0, 1];
    if (zero2) return finish(fromZero(r));
    // lines and ticks may float: a load factor of 70-90% would be a flat line on a zero-based axis
    const span = (r[1] - r[0]) || Math.abs(r[1]) || 1;
    return [r[0] - span * 0.12, r[1] + span * (marks.length ? 0.3 : 0.12)];
  };

  const fmt1 = makeFmt(settings.fmt, decOf(settings.cdec), model.valueSample, ratio1, settings.ymode === 'unit');
  const fmt2 = makeFmt(settings.fmt2, decOf(settings.cdec2), model.value2Sample, ratio2, false);
  draw.ctx = { panels, band, share, nX, nS, fmt1, fmt2, view, draw2 };

  const hl = settings.hl.split(/[,，、;\n]/).map(s => s.trim().toLowerCase()).filter(Boolean);
  const isHl = p => hl.some(k => p.title.toLowerCase().includes(k) || (p.group && p.group.toLowerCase() === k));

  const xAt = i => (band ? (i + 0.5) * 100 / nX : i * 100 / (nX - 1));
  const f2 = v => +v.toFixed(2);
  const bwFull = 100 / nX * (nX > 40 ? 0.78 : 0.84);

  // one routine draws any mark type for either axis; layers keep the paint order area < bar < gantt < line
  const render = (layers, type, vs, y, colOf, o) => {
    const present = i => vs.some(row => row[i] !== null);
    if (type === 'bar') {
      const bw = bwFull * (o.narrow ? 0.4 : 1);
      const base = new Array(nX).fill(0), baseNeg = new Array(nX).fill(0);
      vs.forEach((row, s) => row.forEach((v, i) => {
        if (v === null) return;
        const from = v >= 0 ? base[i] : baseNeg[i], to = from + v;
        if (v >= 0) base[i] = to; else baseNeg[i] = to;
        const ya = y(Math.max(from, to)), yb = y(Math.min(from, to));
        layers.bar += `<rect x="${f2(xAt(i) - bw / 2)}" y="${ya}" width="${f2(bw)}" height="${f2(Math.max(0, yb - ya))}" fill="${colOf(s, i)}"/>`;
      }));
    } else if (type === 'gantt') {
      vs.forEach((row, s) => row.forEach((v, i) => {
        if (v === null) return;
        const x0 = f2(xAt(i) - bwFull / 2), x1 = f2(xAt(i) + bwFull / 2), yy = y(v);
        if (o.halo) layers.gantt += `<line class="gt halo" x1="${x0}" x2="${x1}" y1="${yy}" y2="${yy}"/>`;
        layers.gantt += `<line class="gt" stroke="${colOf(s, i)}" x1="${x0}" x2="${x1}" y1="${yy}" y2="${yy}"/>`;
      }));
    } else if (type === 'line') {
      vs.forEach((row, s) => {
        const pts = [];
        row.forEach((v, i) => { if (v !== null) pts.push(i); });
        if (!pts.length) return;
        const col = colOf(s, pts[0]);
        if (pts.length === 1) { layers.line += `<line class="gt" stroke="${col}" x1="${f2(xAt(pts[0]) - 1.5)}" x2="${f2(xAt(pts[0]) + 1.5)}" y1="${y(row[pts[0]])}" y2="${y(row[pts[0]])}"/>`; return; }
        // break the line where the panel has no data at all, bridge single missing members
        let d = '', prev = -1;
        for (const i of pts) {
          let gapHere = prev < 0;
          for (let k = prev + 1; k < i && !gapHere; k++) if (!present(k)) gapHere = true;
          d += (gapHere ? 'M' : 'L') + f2(xAt(i)) + ',' + y(row[i]);
          prev = i;
        }
        if (o.halo) layers.line += `<path class="ln halo" d="${d}"/>`;
        layers.line += `<path class="ln" stroke="${col}" d="${d}"/>`;
      });
    } else {   // area, stacked over contiguous runs
      const base = new Array(nX).fill(0);
      vs.forEach((row, s) => {
        let run = [];
        const flush = () => {
          if (!run.length) return;
          const lo = run.map(i => base[i]);
          run.forEach(i => { base[i] += row[i] || 0; });
          const half = 100 / nX / 2;
          const xa = i => (run.length === 1 ? [Math.max(0, xAt(i) - half), Math.min(100, xAt(i) + half)] : [xAt(i)]);
          const topPts = run.flatMap(i => xa(i).map(x => `${f2(x)},${y(base[i])}`));
          const botPts = run.flatMap((i, k) => xa(i).map(x => `${f2(x)},${y(lo[k])}`)).reverse();
          const col = colOf(s, run[0]);
          layers.area += `<path fill="${col}"${o.alpha ? ` fill-opacity="${o.alpha}"` : ''} d="M${topPts.join('L')}L${botPts.join('L')}Z"/>`;
          layers.area += o.alpha ? `<path class="edge" style="stroke:${col};stroke-opacity:1" d="M${topPts.join('L')}"/>` : `<path class="edge" d="M${topPts.join('L')}"/>`;
          run = [];
        };
        for (let i = 0; i < nX; i++) { if (present(i)) run.push(i); else flush(); }
        flush();
      });
    }
  };

  let html = '';
  if (legendH) {
    const sym = (type, col) => `<i class="k k-${type}" style="background:${col}"></i>`;
    let leftItems = '';
    if (nS > 1) leftItems += model.series.map((s, i) => `<span>${sym(t1, colors[i % colors.length])}${esc(s)}</span>`).join('');
    if (model.has2) {
      if (nS === 1) leftItems += `<span>${sym(t1, useColor ? theme.neutral : colors[0])}${esc(model.valueName)}</span>`;
      leftItems += skipped2
        ? `<span class="cn">${esc(model.value2Name)}：堆疊分色時副軸只支援折線或甘特</span>`
        : `<span>${sym(t2, nS === 1 ? color2 : 'var(--text)')}${esc(model.value2Name)}${sync ? '（共軸）' : (alignZero ? '（副軸，0 對齊）' : '（副軸）')}</span>`;
    }
    let rightItems = '';
    if (useColor) {
      const { lo, hi, loF, hiF } = model.cRange;
      const stops = [colorFor(lo), theme.neutral, colorFor(hi)].join(',');
      rightItems = `<span class="cn">${esc(model.colorName)}</span><span>▼ ${esc(fmtColor(lo, loF))}</span>` +
        `<span class="ramp" style="background:linear-gradient(90deg,${stops})"></span><span>▲ ${esc(fmtColor(hi, hiF))}</span>`;
    }
    html += `<div class="legend" style="height:${legendH}px;font-size:${fsS}px;line-height:${legendH}px">` +
      `<div class="lg">${leftItems}</div><div class="lg">${rightItems}</div></div>`;
  }

  panels.forEach((p, idx) => {
    const c = idx % cols, r = Math.floor(idx / cols);
    const left = inset + c * (pw + gap), top = inset + legendH + r * (ph + gap);
    const scaleFor = ([d0, d1]) => v => f2(100 - (Math.min(d1, Math.max(d0, v)) - d0) / (d1 - d0) * 100);
    const y1 = scaleFor(domain1(idx));
    const y2 = draw2 ? scaleFor(domain2(idx)) : null;
    const vs = view(p);

    const layers = { area: '', bar: '', gantt: '', line: '' };
    render(layers, t1, vs, y1, (s, i) => (useColor ? colorFor(p.cval[i]) : colors[s % colors.length]), {});
    if (draw2) {
      render(layers, t2, p.vals2, y2, s => (nS === 1 ? color2 : colors[s % colors.length]),
        { narrow: t1 === 'bar', alpha: t2 === 'area' ? 0.4 : 0, halo: true });
    }
    let svg = '';
    if (!band && nX <= 60) {
      for (let i = 1; i < nX - 1; i++) svg += `<line class="grid" x1="${f2(xAt(i))}" x2="${f2(xAt(i))}" y1="0" y2="100"/>`;
    }
    const yZero = y1(0);
    const zeroLine = yZero < 99.5 && yZero > 0.5 ? `<line class="zero" x1="0" x2="100" y1="${yZero}" y2="${yZero}"/>` : '';
    svg += layers.area + layers.bar + zeroLine + layers.gantt + layers.line + '<line class="hair" y1="0" y2="100"/>';

    // year labels float just above the first mark of each year, clearing both axes' marks
    let yrs = '';
    const topOf = k => {
      let t = 0;
      if (p.tot[k] !== null) {
        const v = share ? 1 : (isStacked(t1) ? p.tot[k] : Math.max(...vs.map(row => (row[k] === null ? -Infinity : row[k]))));
        t = 100 - y1(v);
      }
      if (draw2 && p.tot2[k] !== null) {
        const v2 = nS === 1 ? p.tot2[k] : Math.max(...p.vals2.map(row => (row[k] === null ? -Infinity : row[k])));
        t = Math.max(t, 100 - y2(v2));
      }
      return t;
    };
    for (const i of marks) {
      if (p.tot[i] === null && p.tot2[i] === null) continue;
      const reach = Math.max(1, Math.ceil(fsS * 0.82 * 2.6 / ((pw - pad * 2) / nX)));
      let t = 0;
      for (let k = i; k < Math.min(nX, i + reach); k++) t = Math.max(t, topOf(k));
      const hot = useColor && p.cval[i] !== null && p.cval[i] < 0 && p.cval[i] / model.cRange.lo > 0.4;
      const xPos = band ? i * 100 / nX : xAt(i);
      yrs += `<span class="yr${hot ? ' hot' : ''}" style="left:${f2(xPos)}%;bottom:min(calc(${f2(t)}% + 2px),calc(100% - 1.2em));font-size:${f2(fsS * 0.82)}px">${model.xs[i].year}</span>`;
    }

    let hd = '';
    if (showHd) {
      const subTxt = showSub && p.last >= 0
        ? esc(share ? (shareOfFirst(p, p.last) * 100).toFixed(0) + '% ' + model.series[0] : fmt1(p.lastVal, p.fmt[p.last])) +
          (!left0 && model.xs[p.last].label ? ' · ' + esc(model.xs[p.last].label) : '')
        : '';
      const g = showGroup ? `<div class="g" style="font-size:${f2(fsS * 0.9)}px">${esc(p.group)}</div>` : '';
      const t = `<div class="t${isHl(p) ? ' hl' : ''}" style="font-size:${f2(fsT)}px">${esc(p.title)}</div>`;
      const s = subTxt ? `<div class="s" style="font-size:${f2(fsS)}px">${subTxt}</div>` : '';
      hd = left0 ? `<div class="hd left">${g}<div class="row">${t}${s}</div></div>` : `<div class="hd">${g}${t}${s}</div>`;
    }
    html += `<div class="panel${bordered ? ' bd' : ''}" data-i="${idx}" style="left:${f2(left)}px;top:${f2(top)}px;width:${f2(pw)}px;height:${f2(ph)}px">${hd}` +
      `<div class="plotwrap" style="margin:0 ${f2(pad)}px"><svg class="plot" viewBox="0 0 100 100" preserveAspectRatio="none">${svg}</svg>${yrs}</div></div>`;

    // x axis under the lowest panel of each column
    if (showAxis && idx + cols >= n) {
      const maxLen = Math.max(...model.xs.map(x => x.label.length), 1);
      const fit = Math.max(1, Math.floor(pw / (maxLen * fsA * 0.62 + 18)));
      const step = Math.ceil(nX / fit);
      let ticks = '';
      for (let i = 0; i < nX; i += step) {
        const pos = xAt(i);
        const cls = pos < 8 ? 'first' : (pos > 92 ? 'last' : '');
        ticks += `<span class="${cls}" style="left:${f2(pos)}%">${esc(model.xs[i].label)}</span>`;
      }
      html += `<div class="axis" style="left:${f2(left + pad)}px;top:${f2(top + ph)}px;width:${f2(pw - pad * 2)}px;height:${axisH}px;font-size:${f2(fsA)}px">${ticks}</div>`;
    }
  });

  if (all.length > MAX_PANELS) html += `<div class="note">僅顯示前 ${MAX_PANELS} / ${all.length} 格</div>`;
  $viz.innerHTML = html;
}

// ---------- tooltip ----------

function onHover(ev) {
  const el = ev.target.closest?.('.panel');
  const ctx = draw.ctx;
  if (!el || !ctx || !model) return hideTip();
  const plot = el.querySelector('.plot'), rect = plot.getBoundingClientRect();
  const frac = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
  const nX = ctx.nX;
  const i = ctx.band ? Math.min(nX - 1, Math.floor(frac * nX)) : Math.round(frac * (nX - 1));
  const p = ctx.panels[+el.dataset.i];

  document.querySelectorAll('.hair').forEach(h => { h.style.display = 'none'; });
  const hair = plot.querySelector('.hair');
  const hx = ctx.band ? (i + 0.5) * 100 / nX : i * 100 / (nX - 1);
  hair.setAttribute('x1', hx); hair.setAttribute('x2', hx);
  hair.style.display = 'block';

  const row = (label, value, col) => `<div class="tr"><span>${col ? `<i style="background:${col}"></i>` : ''}${esc(label)}</span><b>${esc(value)}</b></div>`;
  let body = '';
  if (p.tot[i] === null && p.tot2[i] === null) body = row('無資料 No data', '');
  else if (ctx.nS === 1) {
    if (p.tot[i] !== null) body += row(model.has2 ? model.valueName : '', ctx.fmt1(p.tot[i], p.fmt[i]), model.has2 ? colors[0] : '');
    if (model.has2 && p.tot2[i] !== null) body += row(model.value2Name, ctx.fmt2(p.tot2[i], p.fmt2[i]), color2);
    if (model.useColor && p.cval[i] !== null) body += row(model.colorName, fmtColor(p.cval[i], p.cfmt[i]), colorFor(p.cval[i]));
  } else {
    const shares = ctx.view(p);
    model.series.forEach((s, k) => {
      const v = p.vals[k][i], v2 = p.vals2[k][i];
      if (v === null && v2 === null) return;
      let txt = v === null ? '–' : ctx.fmt1(v) + (ctx.share ? ` (${(shares[k][i] * 100).toFixed(0)}%)` : '');
      if (model.has2 && v2 !== null) txt += '  ·  ' + ctx.fmt2(v2);
      body += row(s, txt, colors[k % colors.length]);
    });
    if (p.tot[i] !== null) body += row('合計 Total', ctx.fmt1(p.tot[i]));
    if (model.has2) body += `<div class="tx">${esc(model.valueName)}  ·  ${esc(model.value2Name)}</div>`;
  }
  $tip.innerHTML = `<div class="tt">${esc((p.group ? p.group + ' › ' : '') + p.title)}</div><div class="tx">${esc(model.xs[i].label)}</div>${body}`;
  $tip.hidden = false;
  const tw = $tip.offsetWidth, th = $tip.offsetHeight;
  let tx = ev.clientX + 12, ty = ev.clientY + 12;
  if (tx + tw > innerWidth - 4) tx = ev.clientX - tw - 12;
  if (ty + th > innerHeight - 4) ty = ev.clientY - th - 12;
  $tip.style.left = Math.max(4, tx) + 'px';
  $tip.style.top = Math.max(4, ty) + 'px';
}

function hideTip() {
  $tip.hidden = true;
  document.querySelectorAll('.hair').forEach(h => { h.style.display = 'none'; });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- demo mode (plain browser, no Tableau) ----------
// URL parameters mirror the settings (e.g. ?cols=7&chart2=gantt&axis2=sync);
// demo=ratio|levels|series|single|margin switches the sample set (single = one measure only, margin = negative secondary)

function demoMode() {
  document.getElementById('badge').hidden = false;
  const q = new URLSearchParams(location.search);
  const kind = q.get('demo') || 'airlines';
  const over = kind === 'ratio' ? { cols: 8, ymode: 'unit', chart: 'area', theme: 'navy', align: 'center', sub: '1', sort: 'last-desc' }
    : { cols: 7, hl: 'Eva Airways' };
  for (const k of Object.keys(DEFAULTS)) if (q.has(k)) over[k] = q.get(k);
  applySettings(over);

  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const recs = [];

  if (kind === 'ratio') {
    const names = ['Sweden', 'Finland', 'Belgium', 'Spain', 'Norway', 'Portugal', 'North Macedonia', 'Denmark', 'Austria', 'Iceland',
      'Serbia', 'France', 'Italy', 'Netherlands', 'Kosovo', 'European Union', 'Germany', 'Albania', 'Latvia', 'Montenegro',
      'United Kingdom', 'Estonia', 'Luxembourg', 'Poland', 'Bulgaria', 'Ireland', 'Lithuania', 'Slovenia', 'Greece', 'Bosnia and Herzegovina',
      'Slovakia', 'Czechia', 'Croatia', 'Romania', 'Cyprus', 'Turkey', 'Malta', 'Hungary', 'Liechtenstein', 'Switzerland'];
    names.forEach((name, k) => {
      const end = 0.47 - k * 0.0095 + (rnd() - 0.5) * 0.02;
      const startYear = rnd() < 0.2 ? 2008 + Math.floor(rnd() * 9) : 2004;
      let v = Math.max(0.03, end - 0.04 - rnd() * 0.12);
      for (let yr = 2004; yr <= 2019; yr++) {
        v = Math.max(0.02, v + (end - v) / (2020 - yr) + (rnd() - 0.5) * 0.025);
        if (yr < startYear) continue;
        recs.push({ p: [name], x: { key: String(yr), label: String(yr), sort: yr, year: null }, s: null, v, f: Math.round(v * 100) + '%', v2: null, f2: null, c: null, cf: null });
      }
    });
    model = buildModel(recs, { levels: 1, valueName: 'Value', value2Name: '', colorName: '' });
    return scheduleDraw();
  }

  const names = ['Aer Lingus', 'Aeromexico', 'Air Canada', 'Air China', 'Air New Zealand', 'Alaska Airlines', 'All Nippon Airways',
    'Allegiant Air', 'American Airlines', 'Asiana Airlines', 'Austrian Airlines', 'British Airways', 'Cape Air', 'Cathay Pacific Airways',
    'China Airlines', 'China Eastern Airlines', 'China Southern Airlines', 'Copa Airlines', 'Delta Air Lines', 'El Al Israel Airlines',
    'Emirates', 'Endeavor Air', 'Envoy Air', 'Etihad Airways', 'Eva Airways', 'Frontier Airlines', 'Hainan Airlines', 'Hawaiian Airlines',
    'Horizon Air', 'Iberia', 'Icelandair', 'Japan Airlines', 'JetBlue Airways', 'KLM Royal Dutch Airlines', 'Korean Air', 'Lufthansa',
    'Qantas Airways', 'Qatar Airways', 'Singapore Airlines', 'Southwest Airlines', 'Spirit Air Lines', 'United Air Lines'];
  const regions = ['Americas', 'Asia Pacific', 'Europe'];
  const months = [];
  for (let yr = 2018; yr <= 2020; yr++) for (let m = 1; m <= (yr === 2020 ? 8 : 12); m++) months.push([yr, m]);
  const dual = kind !== 'single';
  names.forEach((name, k) => {
    const size = 20000 + rnd() * 900000, season = 0.1 + rnd() * 0.3, growth = (rnd() - 0.4) * 0.12;
    const hit = 0.85 + rnd() * 0.14, recover = rnd() * 0.06, quit = rnd() < 0.08;
    const lfBase = 0.74 + rnd() * 0.12;
    const hist = {};
    months.forEach(([yr, m], t) => {
      let v = size * (1 + growth * t / 12) * (1 + season * Math.sin((m - 4) / 12 * 2 * Math.PI)) * (0.95 + rnd() * 0.1);
      let lf = lfBase + 0.06 * Math.sin((m - 4) / 12 * 2 * Math.PI) + (rnd() - 0.5) * 0.03;
      if (yr === 2020 && m === 2) { v *= 0.9; lf -= 0.06; }
      if (yr === 2020 && m === 3) { v *= 0.5; lf -= 0.25; }
      if (yr === 2020 && m >= 4) { v *= (1 - hit) + recover * (m - 4); lf = 0.28 + rnd() * 0.12 + 0.04 * (m - 4); }
      // demo=margin: a profit-ratio style secondary measure, always negative for every 4th panel, mixed for every 3rd
      if (kind === 'margin') lf = (k % 4 === 0 ? -0.1 : (k % 3 === 0 ? 0.0 : 0.12)) + 0.05 * Math.sin(t / 3 + k) + (rnd() - 0.5) * 0.03;
      if (quit && yr === 2020 && m >= 4) return;
      v = Math.round(v);
      hist[yr + '-' + m] = v;
      const prev = hist[(yr - 1) + '-' + m];
      const dev = prev ? v / prev - 1 : null;
      const iso = `${yr}-${String(m).padStart(2, '0')}-01`;
      const p = kind === 'levels' ? [regions[k % 3], name] : [name];
      const x = { key: iso, label: `${yr}/${String(m).padStart(2, '0')}`, sort: Date.UTC(yr, m - 1, 1), year: yr };
      const two = (val, d) => (dual ? { v2: val + d, f2: ((val + d) * 100).toFixed(1) + '%' } : { v2: null, f2: null });
      if (kind === 'series') {
        recs.push({ p, x, s: 'International', v: Math.round(v * 0.6), f: null, ...two(lf, 0.03), c: null, cf: null });
        recs.push({ p, x, s: 'Domestic', v: Math.round(v * 0.4), f: null, ...two(lf, -0.05), c: null, cf: null });
      } else {
        recs.push({ p, x, s: null, v, f: v.toLocaleString('en'), ...two(lf, 0), c: dev, cf: dev === null ? null : (dev * 100).toFixed(1) + '%' });
      }
    });
  });
  model = buildModel(recs, {
    levels: kind === 'levels' ? 2 : 1, valueName: 'PAX', value2Name: dual ? (kind === 'margin' ? 'Profit Ratio' : 'Load Factor') : '',
    colorName: kind === 'series' ? '' : 'PAX Deviation % (vs 12 months before)'
  });
  scheduleDraw();
}

boot();
