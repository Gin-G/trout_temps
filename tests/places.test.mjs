import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeOf, collectPlaces, distanceMi, PLACE_RADIUS_MI, MIN_GAGES } from '../build/places.mjs';
import { placePage } from '../build/templates.mjs';

// "Near me" needs a browser and a permission prompt. A crawler has neither, so
// the same question has to exist as URLs — and the town names are already in the
// station names, which is what these pull out.

test('the town is the tail after the last NR / NEAR / AT', () => {
  assert.equal(placeOf('BIG THOMPSON BL MORAINE PARK NR ESTES PARK, CO', 'co'), 'Estes Park');
  assert.equal(placeOf('CACHE LA POUDRE R ABV N 11TH AVE AT GREELEY, CO', 'co'), 'Greeley');
  assert.equal(placeOf('ARKANSAS RIVER AT CANON CITY, CO.', 'co'), 'Canon City');
  // The LAST one: an earlier "BL MORAINE PARK" is a spot on the river, not a town.
  assert.equal(placeOf('ROCK CREEK NR CLINTON MT', 'mt'), 'Clinton');
});

test('abbreviated towns land on the same page as their spelled-out form', () => {
  // Colorado Springs appears both ways in the gage list; two pages for one town
  // splits the signal and gives neither of them the gages.
  assert.equal(placeOf('FOUNTAIN CREEK NEAR COLORADO SPRINGS, CO.', 'co'), 'Colorado Springs');
  assert.equal(placeOf('MONUMENT CREEK AT BIJOU ST. AT COLO. SPRINGS, CO', 'co'), 'Colorado Springs');
  assert.equal(placeOf('COLORADO RIVER NEAR GLENWOOD SPGS, CO', 'co'), 'Glenwood Springs');
});

test('water and hardware are not towns', () => {
  // A page called "Below Highway 85" is worth nothing to anyone.
  for (const name of [
    'SOUTH PLATTE RIVER ABV STRONTIA SPGS RESERVOIR, CO',
    'CACHE LA POUDRE RIVER BELOW HWY 85 AT GREELEY, CO',   // has a number
    'BLUE RIVER AT DILLON DAM, CO',
    'COLORADO R NEAR COLORADO-UTAH STATE LINE, CO',
    'SOME CREEK NR THE FISH HATCHERY, CO',
  ]) {
    const p = placeOf(name, 'co');
    assert.ok(p === null || !/reservoir|hwy|dam|state line|hatchery/i.test(p),
      `${name} -> ${p}`);
  }
});

test('an acronym keeps its capitals', () => {
  // Title-casing gave "Rmnp", which reads as a typo on a page meant to rank.
  assert.equal(placeOf('NORTH INLET BLW SUMMERLAND PARK AT RMNP, CO', 'co'), 'RMNP');
});

test('a station with no locator has no town', () => {
  assert.equal(placeOf('SOUTH PLATTE RIVER, CO', 'co'), null);
  assert.equal(placeOf('', 'co'), null);
  assert.equal(placeOf(null, 'co'), null);
});

// --- grouping ---------------------------------------------------------------

const gage = (over = {}) => ({
  id: '1', state: 'co', rawName: 'BIG THOMPSON NR ESTES PARK, CO',
  station: 'Big Thompson near Estes Park', river: 'Big Thompson River',
  riverSlug: 'big-thompson-river', lat: 40.37, lon: -105.52,
  elevationFt: 8000, stats: null, ...over,
});

test('a place page lists what is near it, not only what is named for it', () => {
  // Somebody staying in Estes Park wants the Poudre and the Colorado too, not
  // just the one gage with "Estes Park" in its title.
  const gages = [
    gage({ id: '1' }),
    gage({ id: '2', rawName: 'FALL RIVER AT SOMEWHERE ELSE, CO', river: 'Fall River', lat: 40.40, lon: -105.55 }),
    gage({ id: '3', rawName: 'COLORADO R NR GRAND LAKE, CO', river: 'Colorado River', lat: 40.25, lon: -105.82 }),
  ];
  const places = collectPlaces(gages);
  const estes = places.find((p) => p.slug === 'estes-park');
  assert.ok(estes, 'Estes Park should have a page');
  assert.equal(estes.gages.length, 3, 'all three are within the radius');
  assert.equal(estes.namedBy, 1, 'only one of them names the town');
  // Nearest first is the whole point of the ordering.
  const miles = estes.gages.map((g) => g.miles);
  assert.deepEqual(miles, [...miles].sort((a, b) => a - b));
});

test('a town with too little around it gets no page', () => {
  // A thin page is worse than no page: the river pages already cover these.
  const lonely = [gage({ id: '1' }), gage({ id: '2', lat: 40.38, lon: -105.53 })];
  assert.equal(collectPlaces(lonely).length, 0, `${MIN_GAGES} gages is the floor`);
});

test('gages beyond the radius are left off', () => {
  const far = [
    gage({ id: '1' }), gage({ id: '2', lat: 40.38, lon: -105.53 }), gage({ id: '3', lat: 40.39, lon: -105.54 }),
    // Roughly 300 miles south — a different trip entirely.
    gage({ id: '4', rawName: 'ANIMAS R AT DURANGO, CO', lat: 37.27, lon: -107.88 }),
  ];
  const estes = collectPlaces(far).find((p) => p.slug === 'estes-park');
  assert.equal(estes.gages.length, 3);
  assert.ok(estes.gages.every((g) => g.miles <= PLACE_RADIUS_MI));
});

test('a gage with no coordinates cannot anchor or join a place', () => {
  const broken = [
    gage({ id: '1', lat: NaN, lon: NaN }),
    gage({ id: '2', lat: 40.38, lon: -105.53 }),
    gage({ id: '3', lat: 40.39, lon: -105.54 }),
    gage({ id: '4', lat: 40.40, lon: -105.55 }),
  ];
  const places = collectPlaces(broken);
  assert.ok(places.every((p) => p.gages.every((g) => Number.isFinite(g.lat))));
  assert.ok(Number.isFinite(places[0].lat), 'the anchor must be a real coordinate');
});

test('distance is spherical', () => {
  assert.ok(Math.abs(distanceMi(40.585, -105.084, 39.739, -104.990) - 58) < 4);
  assert.equal(distanceMi(40, -105, 40, -105), 0);
});

// --- the page ---------------------------------------------------------------

const state = { code: 'co', name: 'Colorado', slug: 'colorado' };

test('a place page names the town in its title, h1 and canonical', () => {
  const place = {
    slug: 'estes-park', name: 'Estes Park', lat: 40.37, lon: -105.52, namedBy: 1,
    gages: [gage({ miles: 0 }), gage({ id: '2', miles: 12, river: 'Fall River', riverSlug: 'fall-river' }),
            gage({ id: '3', miles: 20, river: 'Colorado River', riverSlug: 'colorado-river' })],
  };
  const html = placePage(place, state);
  assert.match(html, /<title>Water Temperature near Estes Park, Colorado — 3 Live USGS Gages<\/title>/);
  assert.match(html, /<h1>Water Temperature near Estes Park, Colorado<\/h1>/);
  assert.match(html, /canonical" href="https:\/\/trout-temps\.nickknows\.net\/near\/estes-park-co\/"/);
  // It has to lead somewhere: rivers, gages, and the state index.
  assert.match(html, /href="\/river\/colorado\/fall-river\/"/);
  assert.match(html, /href="\/gage\/2\/"/);
  assert.match(html, /href="\/rivers\/colorado\/"/);
  assert.match(html, /0 mi|12 mi|20 mi/);
});

test('a place page publishes its coordinates as structured data', () => {
  const place = {
    slug: 'estes-park', name: 'Estes Park', lat: 40.3712345, lon: -105.5219876, namedBy: 1,
    gages: [gage({ miles: 0 }), gage({ id: '2', miles: 12 }), gage({ id: '3', miles: 20 })],
  };
  const blocks = [...placePage(place, state)
    .matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)].map((m) => JSON.parse(m[1]));
  assert.deepEqual(blocks.map((b) => b['@type']), ['BreadcrumbList', 'Place', 'FAQPage']);
  // Rounded: four decimals is about 11 metres, which is plenty for a town.
  assert.equal(blocks[1].geo.latitude, 40.3712);
  assert.match(blocks[2].mainEntity[0].name, /Where can I fish near Estes Park, Colorado right now\?/);
});
