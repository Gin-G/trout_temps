import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeOf, collectPlaces, clusterPlaces, overlapRatio, distanceMi,
         PLACE_RADIUS_MI, PLACE_WIDEN_MI, PLACE_MAX_GAGES, MIN_GAGES } from '../build/places.mjs';
import { placePage, placeAliasPage, placeMap, listSentence } from '../build/templates.mjs';

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

test('small words stay small unless they start the name', () => {
  assert.equal(placeOf('HUDSON R AT PORT OF ALBANY NY', 'ny'), 'Port of Albany');
  assert.equal(placeOf('COLUMBIA R AT THE DALLES, OR', 'or'), 'The Dalles');
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

// --- clustering -------------------------------------------------------------
//
// At a 40-mile radius every town in a metro area saw the same gages, so
// neighbouring pages became copies of each other. The radius is the fix; the
// clustering below is for what survives it — two names for the same water.

test('a place page lists the nearest gages, not everything in range', () => {
  const many = Array.from({ length: PLACE_MAX_GAGES + 6 }, (_, i) =>
    gage({ id: String(i + 1), lat: 40.37 + i * 0.002, lon: -105.52 }));
  const estes = collectPlaces(many).find((p) => p.slug === 'estes-park');
  assert.equal(estes.gages.length, PLACE_MAX_GAGES, 'the list is capped');
  const miles = estes.gages.map((g) => g.miles);
  assert.deepEqual(miles, [...miles].sort((a, b) => a - b), 'and it keeps the closest');
  assert.ok(Math.max(...miles) < distanceMi(estes.lat, estes.lon, 40.37 + 17 * 0.002, -105.52));
});

test('overlap is measured on the gages, not the names', () => {
  const p = (ids) => ({ gages: ids.map((id) => ({ id })) });
  assert.equal(overlapRatio(p(['1', '2', '3']), p(['1', '2', '3'])), 1);
  assert.equal(overlapRatio(p(['1', '2']), p(['3', '4'])), 0);
  assert.equal(overlapRatio(p(['1', '2', '3', '4']), p(['1', '2', '3'])), 0.75);
  // A duplicated id in one list must not inflate the union.
  assert.equal(overlapRatio(p(['1', '2']), p(['1', '2', '2'])), 1);
});

test('towns listing the same water merge into one page', () => {
  const ids = ['1', '2', '3', '4'];
  const shared = ids.map((id) => ({ id }));
  const places = [
    { slug: 'boring', name: 'Boring', namedBy: 1, gages: shared },
    { slug: 'gresham', name: 'Gresham', namedBy: 7, gages: shared },
    { slug: 'damascus', name: 'Damascus', namedBy: 1, gages: shared },
  ];
  const out = clusterPlaces(places);
  assert.equal(out.length, 1, 'one page, not three');
  assert.equal(out[0].slug, 'gresham', 'the town the gages are named for wins');
  assert.deepEqual(out[0].aliases.map((a) => a.name), ['Boring', 'Damascus']);
});

test('the primary is the best-known name, not the one with the longest list', () => {
  // Ranking on list length hands a metro area to whichever hamlet sits at the
  // centre of the densest gaging: Portland folded into a page called Carver.
  const near = (n) => Array.from({ length: n }, (_, i) => ({ id: String(i + 1) }));
  const out = clusterPlaces([
    { slug: 'carver', name: 'Carver', namedBy: 1, gages: near(12) },
    { slug: 'portland', name: 'Portland', namedBy: 9, gages: near(11) },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].slug, 'portland');
  assert.deepEqual(out[0].aliases.map((a) => a.name), ['Carver']);
});

test('a tie goes to the plainer name, not the alphabet', () => {
  // Durango and Cedar Hill are both named by a single gage and share a list, so
  // namedBy and length settle nothing. Sorting on name alone handed it to Cedar
  // Hill for being a C, which is how a famous tailwater town loses its page.
  const same = [{ id: '1' }, { id: '2' }, { id: '3' }];
  const out = clusterPlaces([
    { slug: 'cedar-hill', name: 'Cedar Hill', namedBy: 1, gages: same },
    { slug: 'durango', name: 'Durango', namedBy: 1, gages: same },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].slug, 'durango');
  // One word beats two before length is consulted at all.
  const out2 = clusterPlaces([
    { slug: 'four-corners', name: 'Four Corners', namedBy: 1, gages: same },
    { slug: 'cortez', name: 'Cortez', namedBy: 1, gages: same },
  ]);
  assert.equal(out2[0].slug, 'cortez');
});

test('towns with genuinely different water both keep a page', () => {
  const out = clusterPlaces([
    { slug: 'estes-park', name: 'Estes Park', namedBy: 3, gages: [{ id: '1' }, { id: '2' }, { id: '3' }] },
    { slug: 'durango', name: 'Durango', namedBy: 3, gages: [{ id: '7' }, { id: '8' }, { id: '9' }] },
  ]);
  assert.equal(out.length, 2);
  assert.ok(out.every((p) => p.aliases.length === 0));
});

test('a small town inside a big one\'s reach is not a duplicate of it', () => {
  // Three gages shared with a twelve-gage neighbour is a tighter, more useful
  // page, not the same page: 3/12 overlap must not merge.
  const big = Array.from({ length: 12 }, (_, i) => ({ id: String(i + 1) }));
  const out = clusterPlaces([
    { slug: 'big', name: 'Big', namedBy: 5, gages: big },
    { slug: 'small', name: 'Small', namedBy: 2, gages: big.slice(0, 3) },
  ]);
  assert.equal(out.length, 2, 'the smaller page survives');
});

test('a street is not a town', () => {
  assert.equal(placeOf('FANNO CREEK AT SW ROBBINS DR, OR', 'or'), null);
  assert.equal(placeOf('ASH CREEK AT MEISNER DRIVE, OR', 'or'), null);
  assert.equal(placeOf('TRYON CREEK AT LARK MEADOW TERRACE, OR', 'or'), null);
  // The landmark is mid-string here: "<street> <town>" is a spelling of the
  // town, and publishing it as its own page publishes the town's list twice.
  assert.equal(placeOf('FANNO CR AT FOWLER MIDDLE SCHOOL TIGARD, OR', 'or'), null);
  assert.equal(placeOf('TRYON CR AT OAKLEY CT PORTLAND, OR', 'or'), null);
  assert.equal(placeOf('FANNO CR AT SW WALNUT ST TIGARD, OR', 'or'), null);
});

test('the address filters do not eat real towns', () => {
  // Every one of these would fall to a lazier rule: ST to the street-type test,
  // W to the quadrant test, PARK to a suffix list that forgot Estes Park.
  assert.equal(placeOf('ST REGIS RIVER AT ST REGIS FALLS NY', 'ny'), 'Saint Regis Falls');
  assert.equal(placeOf('MADISON R NR W YELLOWSTONE MT', 'mt'), 'West Yellowstone');
  assert.equal(placeOf('BIG THOMPSON NR ESTES PARK, CO', 'co'), 'Estes Park');
  assert.equal(placeOf('FRASER RIVER AT WINTER PARK, CO', 'co'), 'Winter Park');
  assert.equal(placeOf('COLORADO R NR GRAND JUNCTION, CO', 'co'), 'Grand Junction');
  assert.equal(placeOf('S PLATTE R AT COLORADO SPGS, CO', 'co'), 'Colorado Springs');
  // LANDING, BOTTOM and CENTER end real towns. Filtering them to catch a few
  // streets deletes more places than it saves; clustering handles the copies.
  assert.equal(placeOf('SUSQUEHANNA R AT PEACH BOTTOM PA', 'pa'), 'Peach Bottom');
  assert.equal(placeOf('SAN JOAQUIN R NR CROWS LANDING CA', 'ca'), 'Crows Landing');
  assert.equal(placeOf('HUDSON R AT SCHODACK LANDING NY', 'ny'), 'Schodack Landing');
});

test('a list reads as a sentence', () => {
  assert.equal(listSentence([]), '');
  assert.equal(listSentence(['Boring']), 'Boring');
  assert.equal(listSentence(['Boring', 'Damascus']), 'Boring and Damascus');
  assert.equal(listSentence(['Boring', 'Damascus', 'Sandy']), 'Boring, Damascus and Sandy');
});

test('a merged page carries the names it absorbed', () => {
  // Merging is only defensible if the search term still lands somewhere. If the
  // page never says "Boring", folding Boring into it just loses the query.
  const place = {
    slug: 'gresham', name: 'Gresham', lat: 45.5, lon: -122.4, namedBy: 7,
    aliases: [{ slug: 'boring', name: 'Boring' }, { slug: 'damascus', name: 'Damascus' }],
    gages: [gage({ miles: 0 }), gage({ id: '2', miles: 4 }), gage({ id: '3', miles: 9 })],
  };
  const html = placePage(place, { code: 'or', name: 'Oregon', slug: 'oregon' });
  assert.match(html, /Boring and Damascus/);
  assert.match(html, /<meta name="description"[^>]*Boring and Damascus/);
  assert.match(html, /name="robots" content="index,follow/, 'the surviving page stays indexable');
});

test('a merged-away town keeps its URL but points at the page that has the table', () => {
  const html = placeAliasPage(
    { slug: 'boring', name: 'Boring' },
    { slug: 'gresham', name: 'Gresham' },
    { code: 'or', name: 'Oregon', slug: 'oregon' });
  assert.match(html, /<h1>Water Temperature near Boring, Oregon<\/h1>/);
  // The canonical is the whole point: it points at Gresham, not at itself.
  assert.match(html, /canonical" href="https:\/\/trout-temps\.nickknows\.net\/near\/gresham-or\/"/);
  assert.match(html, /href="\/near\/gresham-or\/"/);
  // And it does not reprint the table it was merged for.
  assert.doesNotMatch(html, /<table/);
  assert.doesNotMatch(html, /data-live-gage/);
});

test('a town in sparse country widens its reach rather than losing its page', () => {
  // Absarokee sits on the Stillwater with nothing inside 25 miles. The tight
  // radius is there to stop metro pages duplicating each other; applied out
  // here it just deletes the best fishing towns on the list.
  // The other two carry no locator, so they join the page without anchoring one
  // of their own — otherwise they name a second town and the two merge.
  const far = [
    gage({ id: '1', rawName: 'STILLWATER R NR ABSAROKEE MT', state: 'mt', lat: 45.52, lon: -109.44 }),
    gage({ id: '2', rawName: 'STILLWATER R BLW CLARKS FORK MT', state: 'mt', lat: 45.95, lon: -109.44 }),
    gage({ id: '3', rawName: 'BOULDER R ABV BIG ROCK MT', state: 'mt', lat: 45.10, lon: -109.44 }),
  ];
  const place = collectPlaces(far).find((p) => p.slug === 'absarokee');
  assert.ok(place, 'the town keeps its page');
  assert.equal(place.gages.length, 3);
  assert.equal(place.radiusMi, PLACE_WIDEN_MI, 'and says so');
  assert.ok(place.gages.some((g) => g.miles > PLACE_RADIUS_MI));
});

test('a town with enough water close by keeps the tight radius', () => {
  const near = [
    gage({ id: '1' }),
    gage({ id: '2', rawName: 'FALL RIVER BLW THE FALLS, CO', lat: 40.40, lon: -105.55 }),
    gage({ id: '3', rawName: 'COLORADO R ABV LAKE GRANBY, CO', lat: 40.42, lon: -105.57 }),
  ];
  const place = collectPlaces(near).find((p) => p.slug === 'estes-park');
  assert.equal(place.radiusMi, PLACE_RADIUS_MI);
  assert.ok(place.gages.every((g) => g.miles <= PLACE_RADIUS_MI));
});

test('a place page states the radius it actually used', () => {
  const wide = {
    slug: 'absarokee', name: 'Absarokee', lat: 45.52, lon: -109.44, namedBy: 1,
    radiusMi: PLACE_WIDEN_MI, aliases: [],
    gages: [gage({ miles: 0 }), gage({ id: '2', miles: 31 }), gage({ id: '3', miles: 38 })],
  };
  const html = placePage(wide, { code: 'mt', name: 'Montana', slug: 'montana' });
  assert.match(html, new RegExp(`within ${PLACE_WIDEN_MI} miles`));
  assert.doesNotMatch(html, new RegExp(`within ${PLACE_RADIUS_MI} miles`),
    'it must not claim a reach it did not use');
});

// --- the map ----------------------------------------------------------------
//
// Drawn into the HTML at build time. These pages are landed on cold from a
// search, so the map has to be there when the markup arrives -- no tiles, no
// script, nothing to wait for.

const mapState = { code: 'co', name: 'Colorado', slug: 'colorado' };
const mapPlace = (gages, over = {}) => ({
  slug: 'estes-park', name: 'Estes Park', lat: 40.37, lon: -105.52,
  namedBy: 1, aliases: [], gages, ...over,
});

test('the map is drawn into the markup, not fetched', () => {
  const html = placeMap(mapPlace([
    gage({ id: '1', miles: 0 }),
    gage({ id: '2', miles: 8, lat: 40.47, lon: -105.60 }),
    gage({ id: '3', miles: 14, lat: 40.25, lon: -105.70 }),
  ]), mapState);
  assert.match(html, /<svg viewBox="0 0 400 \d+"/);
  assert.doesNotMatch(html, /<script/, 'nothing to execute');
  assert.doesNotMatch(html, /https?:\/\//, 'and nothing to fetch');
  // Every pin is a link to its gage.
  assert.equal([...html.matchAll(/href="\/gage\//g)].length, 3);
});

test('every pin carries its verdict colour and a readable title', () => {
  const html = placeMap(mapPlace([
    gage({ id: '1', miles: 0, stats: { days: 30, daysOver65: 0, averageF: 55 } }),
    gage({ id: '2', miles: 8, lat: 40.47, stats: { days: 30, daysOver65: 28, averageF: 68 } }),
    gage({ id: '3', miles: 14, lat: 40.25, stats: null }),
  ]), mapState);
  assert.match(html, /class="pin safe"/);
  assert.match(html, /class="pin danger"/);
  assert.match(html, /class="pin unknown"/, 'a gage with no summaries is grey, not green');
  assert.match(html, /<title>[^<]*8 miles[^<]*<\/title>/);
  // Degrees are spelled out: an entity inside <title> is read aloud verbatim.
  assert.doesNotMatch(html, /<title>[^<]*&deg;/);
});

test('north is up and the town sits at its true position', () => {
  // Two gages, one due north and one due south of the town at equal distance:
  // the northern one must land above the southern one.
  const html = placeMap(mapPlace([
    gage({ id: 'n', miles: 10, lat: 40.52, lon: -105.52 }),
    gage({ id: 's', miles: 10, lat: 40.22, lon: -105.52 }),
  ]), mapState);
  const ys = [...html.matchAll(/class="pin [a-z]+" cx="([\d.]+)" cy="([\d.]+)"/g)]
    .map((m) => Number(m[2]));
  assert.equal(ys.length, 2);
  assert.ok(ys[0] < ys[1], 'the northern gage is drawn higher up');
});

test('the map is never taller than it is wide', () => {
  // Two gages on the doorstep and one twenty miles downstream is the shape that
  // frames as a near-empty column. It is meant to be a small map.
  const strung = [
    gage({ id: '1', miles: 0 }),
    gage({ id: '2', miles: 0.4, lat: 40.375, lon: -105.52 }),
    gage({ id: '3', miles: 20, lat: 40.08, lon: -105.52 }),
  ];
  const h = Number(placeMap(mapPlace(strung), mapState).match(/viewBox="0 0 400 (\d+)"/)[1]);
  assert.ok(h <= 400, `height ${h} must not exceed the 400 width`);
  assert.ok(h >= 240, `height ${h} must not collapse to a strip either`);
});

test('a place with nothing to plot draws no map', () => {
  assert.equal(placeMap(mapPlace([gage({ id: '1', miles: 0 })]), mapState), '');
  assert.equal(placeMap(mapPlace([
    gage({ id: '1', lat: NaN, lon: NaN }), gage({ id: '2', lat: NaN, lon: NaN }),
  ]), mapState), '');
});

test('the place page carries the map above the table', () => {
  const html = placePage(mapPlace([
    gage({ id: '1', miles: 0 }),
    gage({ id: '2', miles: 8, lat: 40.47, lon: -105.60 }),
    gage({ id: '3', miles: 14, lat: 40.25, lon: -105.70 }),
  ]), mapState);
  assert.ok(html.indexOf('placemap') < html.indexOf('<table'), 'map first, then the detail');
  assert.match(html, /role="img"[\s\S]*?aria-label="Map of the 3 gages nearest Estes Park/);
});
