import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDashboard, flush } from './harness.mjs';

// A trimmed-down shape of what waterservices.usgs.gov actually returns.
function usgsPayload(sites) {
  return {
    value: {
      timeSeries: sites.map(s => ({
        sourceInfo: {
          siteName: s.name,
          siteCode: [{ value: s.site }],
          geoLocation: s.geo === false ? {} : { geogLocation: { latitude: s.lat ?? 39.1, longitude: s.lon ?? -105.2 } },
        },
        variable: { variableCode: [{ value: '00010' }] },
        values: [{ value: (s.values ?? []).map(v => ({ value: String(v), dateTime: '2026-08-20T12:00:00.000-06:00' })) }],
      })),
    },
  };
}

test('classify puts each reading in the right band', () => {
  const { api } = loadDashboard();
  assert.equal(api.classify(45), 'safe');
  assert.equal(api.classify(59.9), 'safe');
  assert.equal(api.classify(60), 'caution');     // caution starts at 60
  assert.equal(api.classify(64.9), 'caution');
  assert.equal(api.classify(65), 'danger');      // the recovery threshold itself is a stop
  assert.equal(api.classify(80), 'danger');
});

test('badge wording matches the band', () => {
  const { api } = loadDashboard();
  assert.equal(api.badgeText('safe'), 'Safe');
  assert.equal(api.badgeText('caution'), 'Caution');
  assert.equal(api.badgeText('danger'), 'Not safe for trout');
});

test('a cluster takes the worst band it contains', () => {
  const { api } = loadDashboard();
  assert.equal(api.worstClass([{ cls: 'safe' }, { cls: 'safe' }]), 'safe');
  assert.equal(api.worstClass([{ cls: 'safe' }, { cls: 'caution' }]), 'caution');
  assert.equal(api.worstClass([{ cls: 'safe' }, { cls: 'danger' }, { cls: 'caution' }]), 'danger');
});

test('parseSeries keeps the latest reading and converts to Fahrenheit', () => {
  const { api } = loadDashboard();
  const rows = api.parseSeries(usgsPayload([
    { name: 'SOUTH PLATTE RIVER', site: '06701900', values: ['10.0', '18.3'] },
  ]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'SOUTH PLATTE RIVER');
  assert.equal(rows[0].site, '06701900');
  assert.equal(rows[0].c, 18.3);
  assert.ok(Math.abs(rows[0].f - 64.94) < 0.001);
  assert.equal(rows[0].cls, 'caution');
  assert.equal(rows[0].lat, 39.1);
});

test('parseSeries drops gages with no usable reading', () => {
  const { api } = loadDashboard();
  const rows = api.parseSeries(usgsPayload([
    { name: 'NO DATA', site: '1', values: [] },
    { name: 'SENTINEL', site: '2', values: ['12.0', '-999999'] },
    { name: 'BLANK', site: '3', values: [''] },
    { name: 'JUNK', site: '4', values: ['n/a'] },
    { name: 'GOOD', site: '5', values: ['9.4'] },
  ]));
  assert.deepEqual(rows.map(r => r.name), ['GOOD']);
});

test('parseSeries de-dupes sites that report several sub-series', () => {
  const { api } = loadDashboard();
  const rows = api.parseSeries(usgsPayload([
    { name: 'FRYING PAN RIVER', site: '09080400', values: ['8.0'] },
    { name: 'FRYING PAN RIVER', site: '09080400', values: ['8.4'] },
    { name: 'ROARING FORK', site: '09085000', values: ['11.0'] },
  ]));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].c, 8.0);   // first sub-series wins
});

test('parseSeries survives an empty or malformed payload', () => {
  const { api } = loadDashboard();
  assert.deepEqual(api.parseSeries({}), []);
  assert.deepEqual(api.parseSeries({ value: {} }), []);
  assert.deepEqual(api.parseSeries({ value: { timeSeries: [] } }), []);
});

test('a gage with no coordinates parses but is not mappable', () => {
  const { api } = loadDashboard();
  const [row] = api.parseSeries(usgsPayload([
    { name: 'NO GEO', site: '7', values: ['10'], geo: false },
  ]));
  assert.ok(Number.isNaN(row.lat));
});

test('the remembered state is used when no state is in the URL', () => {
  const { api } = loadDashboard({ stored: { 'troutTemps.state': 'mt' } });
  assert.equal(api.initialState(), 'mt');
});

test('a state in the URL beats the remembered one', () => {
  const { api } = loadDashboard({ search: '?state=wy', stored: { 'troutTemps.state': 'mt' } });
  assert.equal(api.initialState(), 'wy');
});

test('an unknown state falls back rather than querying nonsense', () => {
  const { api } = loadDashboard({ search: '?state=zz', stored: { 'troutTemps.state': 'qq' } });
  assert.equal(api.initialState(), 'co');
});

test('loading a state remembers it', async () => {
  const { api, localStorage } = loadDashboard();
  api.els.state.value = 'id';
  await api.load();
  assert.equal(localStorage.getItem('troutTemps.state'), 'id');
});

test('detail links carry the gage and the state to come back to', () => {
  const { api } = loadDashboard({ search: '?state=nm' });
  api.els.state.value = 'nm';
  const href = api.detailLink({ site: '08279500', name: 'RIO GRANDE DEL RANCHO' });
  assert.ok(href.startsWith('detail.html?site=08279500'));
  assert.ok(href.includes('name=RIO%20GRANDE%20DEL%20RANCHO'));
  assert.ok(href.endsWith('&state=nm'));
});

test('readings are cached per state until Refresh forces a re-fetch', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return { ok: true, json: async () => usgsPayload([{ name: 'CACHED', site: '9', values: ['10'] }]) };
  };
  const { api } = loadDashboard({ fetchImpl });
  await flush();                       // the page's own startup load
  assert.equal(calls, 1);
  await api.load();                    // same state, still fresh
  assert.equal(calls, 1);
  await api.load({ force: true });     // Refresh
  assert.equal(calls, 2);
  api.els.state.value = 'mt';          // a different state is not cached yet
  await api.load();
  assert.equal(calls, 3);
});

test('a failed fetch explains itself in the live region', async () => {
  const { api, nodes } = loadDashboard({ fetchImpl: async () => ({ ok: false, status: 503 }) });
  await api.load();
  assert.match(nodes.get('stations').innerHTML, /Couldn't reach the USGS service/);
  assert.match(nodes.get('status').textContent, /503/);
});

test('a successful load announces the counts', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => usgsPayload([
      { name: 'COLD CREEK', site: '1', values: ['8'] },     // 46.4F safe
      { name: 'WARM CREEK', site: '2', values: ['16'] },    // 60.8F caution
      { name: 'HOT CREEK', site: '3', values: ['20'] },     // 68.0F danger
    ]),
  });
  const { api, nodes } = loadDashboard({ fetchImpl });
  await api.load({ force: true });
  assert.match(nodes.get('status').textContent, /3 gages reporting in Colorado: 1 safe, 1 caution, 1 over the threshold/);
  assert.equal(nodes.get('cTotal').textContent, 3);
  assert.match(nodes.get('stations').innerHTML, /COLD CREEK/);
});

test('timeAgo reads like a person wrote it', () => {
  const { api } = loadDashboard();
  const ago = ms => api.timeAgo(new Date(Date.now() - ms).toISOString());
  assert.equal(ago(10 * 1000), 'just now');
  assert.equal(ago(15 * 60 * 1000), '15 min ago');
  assert.equal(ago(3 * 3600 * 1000), '3 hr ago');
  assert.equal(ago(2 * 86400 * 1000), '2 d ago');
});

test('gages that overlap on screen collapse into one cluster pin', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => usgsPayload([{ name: 'ANY', site: '1', values: ['10'] }]),
  });
  const { api } = loadDashboard({ fetchImpl });
  // At the stub projection (100px per degree) a 54px cell is 0.54 degrees.
  const rows = [
    { site: '1', name: 'A', lat: 39.00, lon: -105.00, f: 50, cls: 'safe' },
    { site: '2', name: 'B', lat: 39.01, lon: -105.01, f: 52, cls: 'caution' },
    { site: '3', name: 'C', lat: 41.00, lon: -103.00, f: 55, cls: 'safe' },
  ];
  await api.load({ force: true });         // a rendered map is what holds project()
  const groups = api.clusterRows(rows, 7);
  assert.equal(groups.length, 2);
  const sizes = groups.map(g => g.length).sort();
  assert.deepEqual(sizes, [1, 2]);
});
