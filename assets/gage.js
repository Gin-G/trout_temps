// Shared by two kinds of page, which is why nothing here assumes a query string:
//
//   * the generated /gage/<id>/ pages, which are already built with the right
//     title, heading and canonical, and set window.TROUT_GAGE to say so. Those
//     are the pages search engines index, so the script must not touch the
//     identity the crawler was served.
//   * detail.html?site=..., the app's old dynamic view, where the identity has
//     to be written in from the query string at runtime.
const GAGE = window.TROUT_GAGE || null;

// SEO: on the dynamic page the gage name is what people search for, so mirror it
// into <title> and point the canonical at the bare ?site= URL, so the name/state
// display hints don't split one gage across many indexed URLs. On a generated
// page the served markup is already right and this must leave it alone.
function setPageIdentity(name) {
  if (GAGE) return;
  if (name) document.title = name + ' Water Temperature — 7-Day History';
  const link = document.getElementById('canonical');
  const id = new URLSearchParams(location.search).get('site');
  // The built page for this gage is the indexable one; send the credit there.
  if (link && /^[0-9]+$/.test(id || '')) {
    link.href = 'https://trout-temps.nickknows.net/gage/' + id + '/';
  }
}
// Parameter catalog: USGS code -> display config
const PARAMS = [
  { code: '00010', key: 'temp',  label: 'Water temperature', unit: '°F',  cls: 'temp',  convert: c => c * 9/5 + 32, dp: 1, threshold: 65 },
  { code: '00060', key: 'flow',  label: 'Discharge (flow)',  unit: 'ft³/s', cls: 'flow', convert: v => v, dp: 0 },
  { code: '00065', key: 'stage', label: 'Gage height',       unit: 'ft',  cls: 'stage', convert: v => v, dp: 2 },
  { code: '63680', key: 'turb',  label: 'Turbidity',         unit: 'FNU', cls: 'turb',  convert: v => v, dp: 1 },
  { code: '00300', key: 'do',    label: 'Dissolved oxygen',  unit: 'mg/L', cls: 'do',   convert: v => v, dp: 1 },
];
const codeList = PARAMS.map(p => p.code).join(',');
const CHART = { W: 1000, H: 220, padL: 52, padR: 16, padT: 16, padB: 28 };

const qs = new URLSearchParams(location.search);
const site = GAGE ? GAGE.site : qs.get('site');
const nameHint = GAGE ? GAGE.name : qs.get('name');
const fromState = GAGE ? GAGE.state : qs.get('state');

const cToF = c => c * 9/5 + 32;
function classifyF(f){ return f >= 65 ? 'danger' : f >= 60 ? 'caution' : 'safe'; }
function verdictText(c){ return c==='danger'?'Not safe for trout':c==='caution'?'Caution':'Safe'; }
// Screen readers get the loading/error narration the spinner implies.
function announce(msg){ document.getElementById('status').textContent = msg; }

// A generated page ships its own heading and back link; only the dynamic page
// has to fill them in.
if (!GAGE) {
  if (nameHint) document.getElementById('title').textContent = nameHint;
  // Return to the state the visitor was browsing, not whatever the list defaults to.
  if (/^[a-z]{2}$/.test(fromState || '')) {
    document.getElementById('back').href = `/?state=${fromState}`;
  }
}
setPageIdentity(nameHint);

if (!site) {
  document.getElementById('charts').innerHTML =
    '<div class="state err">No gage specified. Go back and pick one from the list or map.</div>';
  announce('No gage specified. Go back and pick one from the list or map.');
} else {
  load();
}

// Group a USGS payload into readings per parameter code, dropping no-data points.
function groupByCode(series) {
  const byCode = {};
  (series || []).forEach(ts => {
    const code = ts.variable?.variableCode?.[0]?.value;
    const pts = (ts.values?.[0]?.value || [])
      .map(v => ({ t: new Date(v.dateTime), raw: parseFloat(v.value) }))
      .filter(p => !isNaN(p.raw) && p.raw !== -999999);
    if (pts.length) byCode[code] = pts;
  });
  return byCode;
}

async function load() {
  const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${site}`
            + `&parameterCd=${codeList}&period=P7D`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('USGS service returned ' + res.status);
    const json = await res.json();
    const series = json.value?.timeSeries || [];
    if (!series.length) throw new Error('No data returned for this gage in the last 7 days');

    // Header info from the first series. A generated page already carries a
    // title-cased heading and its own sub-line, and USGS' raw ALL-CAPS name
    // would be a downgrade — so only the dynamic page takes these.
    const info = series[0].sourceInfo;
    if (!GAGE) {
      document.getElementById('title').textContent = info.siteName;
      setPageIdentity(info.siteName);
      document.getElementById('sub').innerHTML =
        `Gage ${site} · `
        + `<a href="https://waterdata.usgs.gov/monitoring-location/${site}/" target="_blank" rel="noopener">USGS page ↗</a>`;
    }

    const byCode = groupByCode(series);
    renderNow(byCode);
    renderCharts(byCode);
  } catch (e) {
    document.getElementById('charts').innerHTML =
      `<div class="state err">Couldn't load this gage — ${e.message}.</div>`;
    announce(`Couldn't load this gage — ${e.message}.`);
  }
}

function renderNow(byCode) {
  const tempPts = byCode['00010'];
  if (!tempPts) return;
  const lastC = tempPts[tempPts.length - 1].raw;
  const f = cToF(lastC);
  const cls = classifyF(f);
  const now = document.getElementById('now');
  const flowPts = byCode['00060'];
  let flowHtml = '';
  if (flowPts) {
    const fl = flowPts[flowPts.length - 1].raw;
    flowHtml = `<div class="big"><div class="v">${Math.round(fl).toLocaleString()}</div><div class="l">ft³/s flow</div></div>`;
  }
  now.innerHTML =
    `<div class="big"><div class="v">${f.toFixed(1)}°F</div><div class="l">${lastC.toFixed(1)}°C · current temp</div></div>`
    + flowHtml
    + `<div class="verdict ${cls}">${verdictText(cls)}</div>`;
  now.style.display = 'flex';
  announce(`Current water temperature ${f.toFixed(1)} degrees Fahrenheit — ${verdictText(cls)}.`);
}

function renderCharts(byCode) {
  const container = document.getElementById('charts');
  const cards = [];
  PARAMS.forEach(p => {
    const pts = byCode[p.code];
    if (!pts) return;
    const data = pts.map(pt => ({ t: pt.t, v: p.convert(pt.raw) }));
    cards.push(chartCard(p, data));
  });
  if (!cards.length) {
    container.innerHTML = '<div class="state">This gage didn\'t report any of the tracked parameters in the last 7 days.</div>';
    announce('This gage didn\'t report any of the tracked parameters in the last 7 days.');
    return;
  }
  container.innerHTML = cards.join('');
}

// Map data values to SVG coordinates. Separated out so it can be tested directly.
function chartScales(p, data, dims) {
  const { W, H, padL, padR, padT, padB } = dims;
  const xs = data.map(d => d.t.getTime());
  const ys = data.map(d => d.v);
  let yMin = Math.min(...ys), yMax = Math.max(...ys);
  // include threshold in range so the line is visible
  if (p.threshold != null) { yMin = Math.min(yMin, p.threshold); yMax = Math.max(yMax, p.threshold); }
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  const pad = (yMax - yMin) * 0.1; yMin -= pad; yMax += pad;
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  return {
    yMin, yMax, xMin, xMax,
    sx: t => padL + (t - xMin) / (xMax - xMin || 1) * (W - padL - padR),
    sy: v => H - padB - (v - yMin) / (yMax - yMin || 1) * (H - padT - padB),
  };
}

function chartCard(p, data) {
  const { W, H, padL, padR, padT, padB } = CHART;
  const { yMin, yMax, xMin, xMax, sx, sy } = chartScales(p, data, CHART);

  const linePath = data.map((d,i) => (i?'L':'M') + sx(d.t.getTime()).toFixed(1) + ' ' + sy(d.v).toFixed(1)).join(' ');
  const areaPath = linePath + ` L${sx(xMax).toFixed(1)} ${H-padB} L${sx(xMin).toFixed(1)} ${H-padB} Z`;

  // y gridlines (4)
  let grid = '';
  for (let i=0;i<=4;i++){
    const v = yMin + (yMax-yMin)*i/4;
    const y = sy(v);
    grid += `<line class="gridline" x1="${padL}" y1="${y.toFixed(1)}" x2="${W-padR}" y2="${y.toFixed(1)}"/>`;
    grid += `<text class="axis-label" x="${padL-8}" y="${(y+3).toFixed(1)}" text-anchor="end">${v.toFixed(p.dp)}</text>`;
  }
  // x day labels
  let xlab = '';
  const dayMs = 86400000;
  let d0 = new Date(xMin); d0.setHours(0,0,0,0);
  for (let t=d0.getTime(); t<=xMax; t+=dayMs){
    if (t < xMin) continue;
    const x = sx(t);
    xlab += `<line class="gridline" x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${H-padB}"/>`;
    const lbl = new Date(t).toLocaleDateString(undefined,{month:'numeric',day:'numeric'});
    xlab += `<text class="axis-label" x="${x.toFixed(1)}" y="${H-padB+16}" text-anchor="middle">${lbl}</text>`;
  }
  // threshold
  let thr = '';
  if (p.threshold != null && p.threshold >= yMin && p.threshold <= yMax){
    const y = sy(p.threshold);
    thr = `<line class="threshold-line" x1="${padL}" y1="${y.toFixed(1)}" x2="${W-padR}" y2="${y.toFixed(1)}"/>`
        + `<text class="threshold-label" x="${W-padR}" y="${(y-5).toFixed(1)}" text-anchor="end">65°F trout threshold</text>`;
  }

  const last = data[data.length-1];
  const range = `${new Date(xMin).toLocaleDateString(undefined,{month:'short',day:'numeric'})} – ${new Date(xMax).toLocaleDateString(undefined,{month:'short',day:'numeric'})}`;

  return `<div class="chart-card">
    <div class="chart-head">
      <h2>${p.label}</h2>
      <span class="unit">latest ${last.v.toFixed(p.dp)} ${p.unit}</span>
      <span class="range">${range}</span>
    </div>
    <div class="svgwrap">
      <svg class="line" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${p.label} over the last 7 days, latest ${last.v.toFixed(p.dp)} ${p.unit}">
        ${grid}${xlab}
        <path class="area ${p.cls}" d="${areaPath}"/>
        <path class="plot ${p.cls}" d="${linePath}"/>
        ${thr}
      </svg>
    </div>
  </div>`;
}
