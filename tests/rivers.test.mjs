import { test } from 'node:test';
import assert from 'node:assert/strict';
import { riverName, stationName, slugify, splitStation } from '../build/rivers.mjs';

// The whole point of the generated pages is that "Big Thompson temperature" has
// something to match. That only works if a USGS station name resolves to the
// river a person would type.

test('a station name resolves to the river people search for', () => {
  assert.equal(riverName('BIG THOMPSON BL MORAINE PARK NR ESTES PARK, CO', 'co'), 'Big Thompson River');
  assert.equal(riverName('S PLATTE R AT ENGLEWOOD, CO.', 'co'), 'South Platte River');
  assert.equal(riverName('CACHE LA POUDRE R ABV N 11TH AVE AT GREELEY, CO', 'co'), 'Cache la Poudre River');
  assert.equal(riverName('SF FLATHEAD R NR HUNGRY HORSE MT', 'mt'), 'South Fork Flathead River');
});

test('a name that already says what it is keeps its own noun', () => {
  assert.equal(riverName('GORE CREEK AT VAIL, CO', 'co'), 'Gore Creek');
  assert.equal(riverName('WILLIAMS FORK BLW WILLIAMS FORK RES, CO', 'co'), 'Williams Fork');
  // Only a name with no watercourse word at all gets "River" appended.
  assert.equal(riverName('BIG THOMPSON AT LOVELAND, CO', 'co'), 'Big Thompson River');
});

test('the trailing state is stripped whether or not a comma gives it away', () => {
  // ", CO" is easy. A bare "MT" is not: without this it expands to "Mount".
  assert.equal(riverName('ROCK CREEK NR CLINTON MT', 'mt'), 'Rock Creek');
  assert.equal(riverName('ROCK CREEK NR CLINTON, MT', 'mt'), 'Rock Creek');
  // A genuine Mount in the middle of a name still survives.
  assert.equal(riverName('MT HOPE CR NR MT VERNON MT', 'mt'), 'Mount Hope Creek');
});

test('Mc and O names are cased the way the map spells them', () => {
  assert.equal(riverName('MCKENZIE RIVER AT LEABURG, OR', 'or'), 'McKenzie River');
  assert.equal(riverName("O'BRIEN CREEK NR MISSOULA, MT", 'mt'), "O'Brien Creek");
});

test('the full station name is spelled out for the page heading', () => {
  assert.equal(stationName('BIG THOMPSON BL MORAINE PARK NR ESTES PARK, CO', 'co'),
    'Big Thompson below Moraine Park near Estes Park');
  assert.equal(stationName('ARKANSAS RIVER ABV PUEBLO, CO', 'co'), 'Arkansas River above Pueblo');
  assert.equal(stationName('S PLATTE R AT ENGLEWOOD, CO.', 'co'), 'South Platte River at Englewood');
});

test('a locator word never eats the first token', () => {
  // "AT" is a locator, but a river cannot begin at one — cutting at index 0
  // would leave the page with no river name at all.
  const split = splitStation('AT RIVER NR SOMEWHERE, CO', 'co');
  assert.deepEqual(split.head, ['AT', 'RIVER']);
  assert.equal(riverName('AT RIVER NR SOMEWHERE, CO', 'co'), 'At River');
});

test('an unparseable name yields nothing rather than a junk page', () => {
  assert.equal(riverName('', 'co'), null);
  assert.equal(riverName('   ', 'co'), null);
  assert.equal(riverName(null, 'co'), null);
});

test('slugs are URL-safe and stable', () => {
  assert.equal(slugify('Big Thompson River'), 'big-thompson-river');
  assert.equal(slugify("O'Brien Creek"), 'o-brien-creek');
  assert.equal(slugify('Cache la Poudre River'), 'cache-la-poudre-river');
  assert.equal(slugify('St. Vrain Creek'), 'st-vrain-creek');
});

test('two gages on one river slug to the same page', () => {
  const a = riverName('BIG THOMPSON BL MORAINE PARK NR ESTES PARK, CO', 'co');
  const b = riverName('BIG THOMPSON RIVER AT LOVELAND, CO', 'co');
  assert.equal(slugify(a), slugify(b));
});

test('"east of", "end of" and "in" are locations, not part of the river', () => {
  // These four all gage the same reservoir. Without the "<direction> OF" rule
  // they became four separate river pages, each with one gage on it.
  const names = [
    'BLUE MESA RES EAST OF WILLOW CREEK NR GUNNISON, CO',
    'BLUE MESA RES END OF IOLA BOAT RAMP NR GUNNISON CO',
    'BLUE MESA RESERVOIR IN IOLA BASIN NR GUNNISON CO',
    'BLUE MESA RES WEST OF DRY GULCH NEAR SAPINERO, CO',
    'BLUE MESA RES AT ELK CR MARINA NEAR SAPINERO, CO',
  ].map((n) => riverName(n, 'co'));
  assert.deepEqual([...new Set(names)], ['Blue Mesa Reservoir']);
});

test('a bare direction is never a locator', () => {
  // "SOUTH" only cuts when "OF" follows it, or this loses everything after
  // "Middle Fork" and files the gage under the wrong river.
  assert.equal(riverName('MF SOUTH PLATTE RIVER AT FAIRPLAY, CO', 'co'), 'Middle Fork South Platte River');
  assert.equal(riverName('SOUTH BOULDER CR AT ELDORADO SPRINGS CO', 'co'), 'South Boulder Creek');
  assert.equal(riverName('EAST RIVER AT ALMONT, CO', 'co'), 'East River');
});

test('a name is only complete if its LAST word says what kind of water it is', () => {
  // "North Fork Gunnison" contains "Fork" but is still short a noun, so it used
  // to sit in its own group away from the "NF GUNNISON RIVER" gages.
  assert.equal(riverName('NORTH FORK GUNNISON NR SOMEWHERE, CO', 'co'), 'North Fork Gunnison River');
  assert.equal(riverName('NF GUNNISON RIVER AT SOMEWHERE, CO', 'co'), 'North Fork Gunnison River');
  // A name that genuinely ends in one keeps it.
  assert.equal(riverName('WILLIAMS FORK BLW WILLIAMS FORK RES, CO', 'co'), 'Williams Fork');
  assert.equal(riverName('BLUE MESA RESERVOIR NR GUNNISON, CO', 'co'), 'Blue Mesa Reservoir');
});
