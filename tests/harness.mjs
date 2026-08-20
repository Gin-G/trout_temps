// The app is two static pages with their logic in inline <script> blocks, so
// tests pull that source out of the HTML and run it against a stub DOM. No
// build step, no framework — the pages stay the thing that ships.
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');

export function readPage(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

// The app script is the last attribute-less <script>; earlier ones are the
// analytics tag.
export function inlineScript(file) {
  const blocks = [...readPage(file).matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  if (!blocks.length) throw new Error(`no inline script found in ${file}`);
  return blocks[blocks.length - 1];
}

function fakeEl(extra = {}) {
  return {
    style: {}, innerHTML: '', textContent: '', value: '', href: '',
    classList: { toggle() {}, add() {}, remove() {} },
    dataset: {}, addEventListener() {},
    ...extra,
  };
}

function fakeDocument(seed = {}) {
  const nodes = new Map(Object.entries(seed).map(([id, el]) => [id, fakeEl(el)]));
  const document = {
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, fakeEl());
      return nodes.get(id);
    },
    querySelectorAll: () => [],
  };
  return { document, nodes };
}

function fakeStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    store,
  };
}

// The real <select> options, so tests can't drift from the shipped state list.
export function stateOptions() {
  return [...readPage('trout_temps.html').matchAll(/<option value="([a-z]{2})">([^<]+)<\/option>/g)]
    .map(m => ({ value: m[1], text: m[2] }));
}

const offline = () => Promise.reject(new Error('offline'));

// Just enough Leaflet for the map code to run headless. project() is the part
// that matters: clustering is decided in projected pixels, and this keeps the
// arithmetic honest at 100px per degree.
function fakeLeaflet() {
  const chain = () => { const o = { addTo: () => o, bindPopup: () => o, on: () => o, clearLayers: () => {} }; return o; };
  const map = {
    setView: () => map, on: () => map, fitBounds: () => map,
    getZoom: () => 7, invalidateSize: () => {},
    project: ([lat, lon]) => ({ x: lon * 100, y: lat * 100 }),
  };
  return {
    map: () => map, tileLayer: chain, layerGroup: chain,
    divIcon: o => o, marker: chain,
  };
}

export function loadDashboard({ search = '', stored = {}, fetchImpl = offline } = {}) {
  const options = stateOptions();
  const { document, nodes } = fakeDocument({
    state: { value: options[0].value, options },
    filter: { value: '' },
    sort: { value: 'temp' },
  });
  const localStorage = fakeStorage(stored);
  const src = inlineScript('trout_temps.html')
    + '\n;return { classify, badgeText, worstClass, parseSeries, timeAgo, detailLink,'
    + ' initialState, stateName, load, render, clusterRows, cache, els };';
  const api = new Function('document', 'localStorage', 'location', 'L', 'fetch', 'setTimeout', 'console', src)(
    document, localStorage, { search }, fakeLeaflet(), fetchImpl, () => {}, console);
  return { api, nodes, localStorage };
}

export function loadDetail({ search = '', fetchImpl = offline } = {}) {
  const { document, nodes } = fakeDocument();
  const src = inlineScript('detail.html')
    + '\n;return { classifyF, verdictText, groupByCode, chartScales, chartCard, CHART, PARAMS };';
  const api = new Function('document', 'location', 'fetch', 'console', src)(
    document, { search }, fetchImpl, console);
  return { api, nodes };
}

// Let the page's own async startup settle before asserting on the DOM.
export const flush = () => new Promise(r => setImmediate(r));
