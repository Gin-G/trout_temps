// The dashboard keeps its logic in an inline <script>, and the gage view shares
// /assets/gage.js with the 1,450 generated gage pages. Either way the tests run
// the source that actually ships, against a stub DOM — no framework, and no
// second copy of the code to drift from the first.
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');

export function readPage(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

// Files served as-is to the browser: /assets/gage.js and friends.
export function readAsset(file) {
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
  const el = {
    style: {}, innerHTML: '', textContent: '', value: '', href: '',
    hidden: false, disabled: false, className: '',
    attrs: {}, classes: new Set(),
    dataset: {}, addEventListener() {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    querySelector: () => null,
    ...extra,
  };
  el.classList = extra.classList || {
    toggle(name, on) { if (on) el.classes.add(name); else el.classes.delete(name); },
    add(name) { el.classes.add(name); },
    remove(name) { el.classes.delete(name); },
    contains(name) { return el.classes.has(name); },
  };
  // The controls wrap each <select> in a .field; the page dims that wrapper.
  el.closest = extra.closest || (() => fakeEl());
  return el;
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
function fakeLeaflet({ broken = false } = {}) {
  if (broken) {
    // Stands in for Leaflet being blocked, or a version without what we call.
    const boom = () => { throw new TypeError('L.circleMarker is not a function'); };
    return { map: boom, tileLayer: boom, layerGroup: boom, divIcon: boom, marker: boom, circleMarker: boom };
  }
  const chain = (...args) => {
    const o = { addTo: () => o, bindPopup: () => o, on: () => o, clearLayers: () => {} };
    // marker(latlng, options) — the pin tests assert on the icon that was built.
    if (args.length > 1 && args[1]) o.options = args[1];
    return o;
  };
  const map = {
    setView: () => map, on: () => map, fitBounds: () => map,
    getZoom: () => 7, invalidateSize: () => {}, removeLayer: () => {},
    project: ([lat, lon]) => ({ x: lon * 100, y: lat * 100 }),
  };
  return {
    map: () => map, tileLayer: chain, layerGroup: chain,
    divIcon: o => o, marker: chain, circleMarker: chain,
  };
}

// `geo` stands in for navigator.geolocation: pass { lat, lon } to have it
// succeed, an Error to have it fail the way a denied prompt does, or leave it
// out to model a browser with no location support at all.
export function loadDashboard({ search = '', stored = {}, fetchImpl = offline, geo, brokenMap = false } = {}) {
  const options = stateOptions();
  const { document, nodes } = fakeDocument({
    state: { value: options[0].value, options },
    filter: { value: '' },
    sort: { value: 'temp' },
  });
  const localStorage = fakeStorage(stored);
  const navigator = {};
  if (geo !== undefined) {
    navigator.geolocation = {
      getCurrentPosition(ok, fail) {
        if (geo instanceof Error) fail({ code: geo.code ?? 1, message: geo.message });
        else ok({ coords: { latitude: geo.lat, longitude: geo.lon } });
      },
    };
  }
  const src = inlineScript('trout_temps.html')
    + '\n;return { classify, badgeText, worstClass, parseSeries, timeAgo, detailLink,'
    + ' initialState, stateName, load, render, clusterRows, cache, els, gagePin, clusterPin,'
    + ' distanceMi, boundingBox, fmtMiles, setMode, withDistance, get mode() { return mode; } };';
  const api = new Function('document', 'localStorage', 'location', 'L', 'fetch', 'setTimeout',
    'console', 'navigator', 'URLSearchParams', src)(
    document, localStorage, { search }, fakeLeaflet({ broken: brokenMap }), fetchImpl, () => {}, console,
    navigator, URLSearchParams);
  return { api, nodes, localStorage };
}

// `gage` seeds window.TROUT_GAGE, which is how a generated /gage/<id>/ page tells
// the shared script that its title, heading and canonical are already correct.
// Left null, the script falls back to the query string like detail.html does.
export function loadDetail({ search = '', fetchImpl = offline, gage = null } = {}) {
  const { document, nodes } = fakeDocument();
  const src = readAsset('assets/gage.js')
    + '\n;return { classifyF, verdictText, groupByCode, chartScales, chartCard, setPageIdentity, GAGE, site, CHART, PARAMS };';
  const api = new Function('document', 'location', 'fetch', 'console', 'window', src)(
    document, { search }, fetchImpl, console, { TROUT_GAGE: gage });
  return { api, nodes };
}

// Let the page's own async startup settle before asserting on the DOM.
export const flush = () => new Promise(r => setImmediate(r));

// "Near me" chains geolocation, a fetch and a json() before it renders, and a
// mode switch starts a second run while the first is still going. One tick is
// not enough to see the end of that; this waits for the dust.
export async function settle(rounds = 12) {
  for (let i = 0; i < rounds; i++) await new Promise(r => setImmediate(r));
}
