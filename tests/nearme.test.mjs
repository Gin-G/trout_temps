import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDashboard, settle } from './harness.mjs';

// A state line is not a fishing constraint: from Fort Collins the closest cold
// water is over the Wyoming border, and picking "Colorado" hides it. "Near me"
// reads a box around the visitor instead.

const FORT_COLLINS = { lat: 40.585, lon: -105.084 };

// Timestamps are relative to now, because the page calls anything over a day old
// stale. `ageHours` is how a test asks for a gage that stopped reporting.
const payload = (gages) => ({
  value: {
    timeSeries: gages.map((g) => ({
      sourceInfo: {
        siteName: g.name,
        siteCode: [{ value: g.site }],
        geoLocation: { geogLocation: { latitude: g.lat, longitude: g.lon } },
      },
      values: [{ value: [{
        value: String(g.c ?? 12),
        dateTime: new Date(Date.now() - (g.ageHours ?? 1) * 3600e3).toISOString(),
      }] }],
    })),
  },
});

// --- the maths --------------------------------------------------------------

test('distance is measured over the globe, not the coordinate grid', () => {
  const { api } = loadDashboard();
  // Fort Collins to Denver is about 57 miles.
  const d = api.distanceMi(40.585, -105.084, 39.739, -104.990);
  assert.ok(d > 55 && d < 62, `expected ~58 miles, got ${d}`);
  assert.equal(api.distanceMi(40, -105, 40, -105), 0);
});

test('the bounding box stays inside the area USGS will accept', () => {
  const { api } = loadDashboard();
  // USGS rejects a box whose width x height x cos(latitude nearest the equator)
  // is over 25 square degrees, so every box we can produce has to be under it.
  for (const lat of [25, 33, 40, 45, 49]) {
    for (const miles of [100, 150, 400]) {
      const b = api.boundingBox(lat, -105, miles);
      const height = b.north - b.south;
      const width = b.east - b.west;
      const edge = Math.min(Math.abs(b.north), Math.abs(b.south));
      const area = width * height * Math.cos((edge * Math.PI) / 180);
      assert.ok(area <= 25.5, `lat ${lat}, ${miles}mi -> ${area.toFixed(1)} sq deg`);
      assert.ok(b.north > b.south && b.east > b.west, 'box must be non-empty');
    }
  }
});

test('the box brackets the visitor and is rounded before it leaves the browser', () => {
  const { api } = loadDashboard();
  const b = api.boundingBox(FORT_COLLINS.lat, FORT_COLLINS.lon, 100);
  assert.ok(b.south < FORT_COLLINS.lat && b.north > FORT_COLLINS.lat);
  assert.ok(b.west < FORT_COLLINS.lon && b.east > FORT_COLLINS.lon);
  // One decimal is about seven miles: enough for USGS, not a home address.
  for (const v of [b.north, b.south, b.east, b.west]) {
    assert.equal(v, Math.round(v * 10) / 10, `${v} is finer than one decimal`);
  }
  // 100 miles is roughly 1.45 degrees of latitude either way.
  assert.ok(Math.abs(b.north - b.south - 2.9) < 0.2);
});

test('miles read the way a person would say them', () => {
  const { api } = loadDashboard();
  assert.equal(api.fmtMiles(3.42), '3.4 mi');
  assert.equal(api.fmtMiles(47.6), '48 mi');
});

// --- the mode ---------------------------------------------------------------

test('near me queries a box, not a state', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    return { ok: true, json: async () => payload([{ name: 'CACHE LA POUDRE', site: '1', lat: 40.6, lon: -105.2 }]) };
  };
  const { api } = loadDashboard({ fetchImpl, geo: FORT_COLLINS });
  await settle();
  api.setMode('near');
  await settle();
  const boxCall = urls.find((u) => u.includes('bBox='));
  assert.ok(boxCall, 'expected a bBox query, got: ' + urls.join(' | '));
  assert.ok(!boxCall.includes('stateCd='), 'a box query must not also pin a state');
  assert.ok(boxCall.includes('parameterCd=00010'));
});

test('every row is stamped with its distance and sorted by it', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => payload([
      { name: 'FAR CREEK', site: '2', lat: 41.5, lon: -105.1 },
      { name: 'NEAR CREEK', site: '1', lat: 40.6, lon: -105.1 },
    ]),
  });
  const { api, nodes } = loadDashboard({ fetchImpl, geo: FORT_COLLINS });
  await settle();
  api.setMode('near');
  await settle();
  assert.equal(api.els.sort.value, 'dist', 'near me should default to nearest first');
  const html = nodes.get('stations').innerHTML;
  assert.ok(html.indexOf('NEAR CREEK') < html.indexOf('FAR CREEK'), 'nearest gage should be listed first');
  assert.match(html, /mi away/);
});

test('a gage with no coordinates sorts last instead of jumping to the front', async () => {
  const { api } = loadDashboard({ geo: FORT_COLLINS });
  const rows = api.withDistance(
    [{ name: 'NOWHERE', lat: NaN, lon: NaN }, { name: 'SOMEWHERE', lat: 40.6, lon: -105.1 }],
    FORT_COLLINS);
  assert.equal(rows[0].miles, null);
  assert.ok(rows[1].miles > 0);
  // Infinity, not NaN: a NaN comparison would leave the order to chance.
  const sorted = [...rows].sort((a, b) => (a.miles ?? Infinity) - (b.miles ?? Infinity));
  assert.equal(sorted[0].name, 'SOMEWHERE');
});

test('a denied prompt falls back to the state picker and says why', async () => {
  const denied = Object.assign(new Error('denied'), { code: 1 });
  const fetchImpl = async () => ({ ok: true, json: async () => payload([{ name: 'X', site: '1', lat: 39, lon: -105 }]) });
  const { api, nodes } = loadDashboard({ fetchImpl, geo: denied });
  await settle();
  api.setMode('near');
  await settle();
  assert.equal(api.mode, 'state', 'a refused prompt must not leave the page in near mode');
  assert.match(nodes.get('locnote').innerHTML, /permission was denied/i);
  assert.match(nodes.get('status').textContent, /Colorado/);
});

test('a browser with no geolocation at all is handled, not crashed into', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => payload([{ name: 'X', site: '1', lat: 39, lon: -105 }]) });
  const { api, nodes } = loadDashboard({ fetchImpl });   // no geo stub at all
  await settle();
  api.setMode('near');
  await settle();
  assert.equal(api.mode, 'state');
  assert.match(nodes.get('locnote').innerHTML, /no location support/i);
});

test('choosing a state turns location off', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => payload([{ name: 'X', site: '1', lat: 40.6, lon: -105.1 }]) });
  const { api, localStorage } = loadDashboard({ fetchImpl, geo: FORT_COLLINS });
  await settle();
  api.setMode('near');
  await settle();
  assert.equal(api.mode, 'near');
  api.setMode('state');
  await settle();
  assert.equal(api.mode, 'state');
  assert.equal(localStorage.getItem('troutTemps.mode'), 'state');
  assert.notEqual(api.els.sort.value, 'dist', 'the distance sort should go away with the distances');
});

test('a cold visitor is never prompted for location unasked', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => payload([{ name: 'X', site: '1', lat: 39, lon: -105 }]) });
  const { api } = loadDashboard({ fetchImpl, geo: FORT_COLLINS });
  await settle();
  assert.equal(api.mode, 'state');
  // A permission prompt nobody asked for is the thing this guards against.
  assert.equal(api.els.nearme.getAttribute('aria-pressed'), 'false');
  assert.equal(api.els.sortDist.hidden, true);
});

test('a returning visitor reopens in near me, unless a ?state= says otherwise', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => payload([{ name: 'X', site: '1', lat: 40.6, lon: -105.1 }]) });
  const remembered = { fetchImpl, geo: FORT_COLLINS, stored: { 'troutTemps.mode': 'near' } };

  const { api } = loadDashboard(remembered);
  await settle();
  assert.equal(api.mode, 'near');

  // The link back from a gage page carries ?state=, and that is an explicit ask.
  const { api: pinned } = loadDashboard({ ...remembered, search: '?state=mt' });
  await settle();
  assert.equal(pinned.mode, 'state');
  assert.equal(pinned.els.state.value, 'mt');
});

test('a broken map does not get reported as a USGS outage', async () => {
  // renderMap runs inside load()'s try, so anything Leaflet throws used to
  // surface as "Couldn't reach the USGS service" and send people to Refresh
  // forever. The readings are the page; the map is an enhancement.
  const fetchImpl = async () => ({
    ok: true,
    json: async () => payload([{ name: 'CACHE LA POUDRE', site: '1', lat: 40.6, lon: -105.1 }]),
  });
  const { api, nodes } = loadDashboard({
    fetchImpl,
    geo: FORT_COLLINS,
    brokenMap: true,
  });
  await settle();
  api.setMode('near');
  await settle();
  const html = nodes.get('stations').innerHTML;
  assert.doesNotMatch(html, /Couldn't reach the USGS service/);
  assert.match(html, /CACHE LA POUDRE/, 'the list still has to render');
});

test('the note and the way back survive a cached result', async () => {
  // load() returns early on a cache hit. That path used to skip the note, so
  // toggling back into "Near me" inside the 5-minute TTL left the visitor with
  // a distance-sorted list, no explanation, and no link back to the states.
  const fetchImpl = async () => ({
    ok: true,
    json: async () => payload([{ name: 'CACHE LA POUDRE', site: '1', lat: 40.6, lon: -105.1 }]),
  });
  const { api, nodes } = loadDashboard({ fetchImpl, geo: FORT_COLLINS });
  await settle();

  api.setMode('near');
  await settle();
  const first = nodes.get('locnote').innerHTML;
  assert.match(first, /within 100 miles of you/);

  api.setMode('state');
  await settle();
  assert.equal(nodes.get('locnote').innerHTML, '');

  api.setMode('near');          // served from cache this time
  await settle();
  const cached = nodes.get('locnote').innerHTML;
  assert.match(cached, /within 100 miles of you/);
  assert.match(cached, /Browse by state instead/);
  assert.match(cached, /stays in your browser/);
});

// --- gages that stopped reporting -------------------------------------------

// USGS keeps answering with the last value a decommissioned gage ever sent, so a
// creek that went quiet in 2024 still returns a temperature. Sorted by distance
// those land at the top of the list, and a cold one looks like exactly what the
// visitor came for. Near Fort Collins three of the seven closest gages were two
// years stale and every one of them was badged "SAFE" in green.
const aged = (hours) => ({
  ok: true,
  json: async () => payload([
    { name: 'LIVE CREEK', site: '1', lat: 40.6, lon: -105.1, c: 18 },       // 64.4F caution
    { name: 'DEAD CREEK', site: '2', lat: 40.59, lon: -105.09, c: 6 },      // 42.8F, looks great
  ].map((g, i) => (i === 1 ? { ...g, ageHours: hours } : { ...g, ageHours: 1 }))),
});

test('a gage that stopped reporting gets no safety verdict', async () => {
  const { api, nodes } = loadDashboard({ fetchImpl: async () => aged(801 * 24), geo: FORT_COLLINS });
  await settle();
  api.setMode('near');
  await settle();
  const html = nodes.get('stations').innerHTML;
  assert.match(html, /DEAD CREEK/, 'it should still be listed, just not vouched for');
  // The dangerous outcome is a two-year-old reading wearing a green Safe badge.
  // Just this row: the window has to reach past the temperature block to the
  // badge, which is the last thing in it.
  const dead = html.slice(html.indexOf('DEAD CREEK'), html.indexOf('DEAD CREEK') + 800);
  assert.doesNotMatch(dead, /badge safe/);
  assert.match(dead, /badge stale/);
  assert.match(dead, /Not reporting/);
});

test('a dead gage sinks to the bottom however the list is sorted', async () => {
  const { api, nodes } = loadDashboard({ fetchImpl: async () => aged(801 * 24), geo: FORT_COLLINS });
  await settle();
  api.setMode('near');
  await settle();
  // DEAD CREEK is both nearer and colder, so it would top either sort.
  for (const sort of ['dist', 'temp', 'name']) {
    api.els.sort.value = sort;
    api.render();
    const html = nodes.get('stations').innerHTML;
    assert.ok(html.indexOf('LIVE CREEK') < html.indexOf('DEAD CREEK'),
      `sorted by ${sort}, the reporting gage should come first`);
  }
});

test('the summary counts only gages that are actually reporting', async () => {
  const { api, nodes } = loadDashboard({ fetchImpl: async () => aged(801 * 24), geo: FORT_COLLINS });
  await settle();
  api.setMode('near');
  await settle();
  assert.equal(nodes.get('cTotal').textContent, 1, 'two gages returned, one is reporting');
  assert.equal(nodes.get('cSafe').textContent, 0, 'the dead one must not pad the safe count');
  assert.equal(nodes.get('cCaution').textContent, 1);
});

test('a reading from this morning is not stale', async () => {
  const { api, nodes } = loadDashboard({ fetchImpl: async () => aged(6), geo: FORT_COLLINS });
  await settle();
  api.setMode('near');
  await settle();
  assert.equal(nodes.get('cTotal').textContent, 2);
  assert.doesNotMatch(nodes.get('stations').innerHTML, /Not reporting/);
});

test('stale gages are their own section, not just the tail of the list', async () => {
  const { api, nodes } = loadDashboard({ fetchImpl: async () => aged(801 * 24), geo: FORT_COLLINS });
  await settle();
  api.setMode('near');
  await settle();
  const html = nodes.get('stations').innerHTML;
  // A heading that says what the group is, and a count.
  assert.match(html, /<details class="stalebox"/);
  assert.match(html, /1 nearby gage stopped reporting/);
  assert.match(html, /carry no verdict/);
  // The live gage is above the section; the dead one is inside it.
  const box = html.indexOf('<details class="stalebox"');
  assert.ok(html.indexOf('LIVE CREEK') < box, 'reporting gages come before the section');
  assert.ok(html.indexOf('DEAD CREEK') > box, 'the dead gage belongs inside the section');
  // "updated 801 d ago" reads like a live figure; "last read" does not.
  assert.match(html.slice(box), /last read/);
});

test('the section is plural when it should be', async () => {
  const two = async () => ({
    ok: true,
    json: async () => payload([
      { name: 'LIVE CREEK', site: '1', lat: 40.6, lon: -105.1, c: 12, ageHours: 1 },
      { name: 'DEAD ONE', site: '2', lat: 40.6, lon: -105.1, c: 6, ageHours: 900 * 24 },
      { name: 'DEAD TWO', site: '3', lat: 40.6, lon: -105.1, c: 7, ageHours: 700 * 24 },
    ]),
  });
  const { api, nodes } = loadDashboard({ fetchImpl: two, geo: FORT_COLLINS });
  await settle();
  api.setMode('near');
  await settle();
  assert.match(nodes.get('stations').innerHTML, /2 nearby gages stopped reporting/);
});

test('when nothing is reporting the page says so and opens the section', async () => {
  const allDead = async () => ({
    ok: true,
    json: async () => payload([
      { name: 'DEAD ONE', site: '1', lat: 40.6, lon: -105.1, c: 6, ageHours: 900 * 24 },
      { name: 'DEAD TWO', site: '2', lat: 40.6, lon: -105.1, c: 7, ageHours: 700 * 24 },
    ]),
  });
  const { api, nodes } = loadDashboard({ fetchImpl: allDead, geo: FORT_COLLINS });
  await settle();
  api.setMode('near');
  await settle();
  const html = nodes.get('stations').innerHTML;
  assert.match(html, /No gage here is reporting a current water temperature/);
  // A collapsed section would be the only thing on the page otherwise.
  assert.match(html, /<details class="stalebox" open>/);
  assert.equal(nodes.get('cTotal').textContent, 0);
});

test('a cluster is coloured and counted by the gages that are reporting', async () => {
  const { api } = loadDashboard({ geo: FORT_COLLINS });
  // One live cold gage sharing a screen cell with a dead one that last read hot.
  // The cluster must be green and say "1 gage", not red and not "1 gages".
  const group = [
    { name: 'LIVE', lat: 40.6, lon: -105.1, f: 50, c: 10, cls: 'safe', stale: false, site: '1', time: new Date().toISOString() },
    { name: 'DEAD', lat: 40.6, lon: -105.1, f: 72, c: 22, cls: 'danger', stale: true, site: '2', time: new Date(0).toISOString() },
  ];
  const html = api.clusterPin(group).options.icon.html;
  assert.match(html, /pin cluster safe/, 'a dead hot gage must not paint the cluster red');
  assert.match(html, />1</);
  assert.match(html, /gage<\/span>/, 'one gage is not "1 gages"');
  assert.doesNotMatch(html, /gages<\/span>/);
});

test('a cluster with nothing reporting is grey and small', async () => {
  const { api } = loadDashboard({ geo: FORT_COLLINS });
  const group = [
    { name: 'DEAD A', lat: 40.6, lon: -105.1, f: 50, c: 10, cls: 'safe', stale: true, site: '1', time: new Date(0).toISOString() },
    { name: 'DEAD B', lat: 40.6, lon: -105.1, f: 52, c: 11, cls: 'safe', stale: true, site: '2', time: new Date(0).toISOString() },
  ];
  const marker = api.clusterPin(group);
  assert.match(marker.options.icon.html, /pin cluster stale/);
  assert.deepEqual(marker.options.icon.iconSize, [30, 30], 'a dead cluster shrinks like a dead pin');
  assert.match(marker.options.icon.html, />2</, 'with none live it falls back to the raw count');
});

test('a stale pin is small, grey and carries no temperature', async () => {
  const { api } = loadDashboard({ geo: FORT_COLLINS });
  const dead = { name: 'DEAD', lat: 40.6, lon: -105.1, f: 44.1, c: 6.7, cls: 'safe',
                 stale: true, site: '1', time: new Date(Date.now() - 671 * 864e5).toISOString() };
  const icon = api.gagePin(dead).options.icon;
  assert.deepEqual(icon.iconSize, [26, 26]);
  assert.match(icon.html, /pin stale/);
  // A number on a map pin is read as the temperature there now.
  assert.doesNotMatch(icon.html, /44|°/);

  const live = { ...dead, stale: false };
  const liveIcon = api.gagePin(live).options.icon;
  assert.deepEqual(liveIcon.iconSize, [46, 46]);
  assert.match(liveIcon.html, /pin safe/);
  assert.match(liveIcon.html, /44°/);
});
