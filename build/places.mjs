// Place pages: the crawlable half of "Near me".
//
// The dashboard's location mode answers "what is close to me" for a person with
// a browser. A crawler has no location, so the same question has to exist as
// URLs — and the place names are already in the data. A USGS station is named
// for the town it sits by: "BIG THOMPSON BL MORAINE PARK NR ESTES PARK, CO".
// The tail after the last NR/NEAR/AT is the settlement, and grouping on it gives
// a page per fishing town without needing a gazetteer.

import { slugify } from './rivers.mjs';

const MILES_PER_DEG_LAT = 69;

// How far a place page reaches, and how many gages it takes to be worth having.
export const PLACE_RADIUS_MI = 40;
export const MIN_GAGES = 3;

// Expanded so "GLENWOOD SPGS" and "COLO. SPRINGS" land on the same page as the
// spelled-out forms rather than beside them.
const EXPAND = new Map(Object.entries({
  SPGS: 'Springs', SPG: 'Spring', SPRS: 'Springs', SPRGS: 'Springs',
  COLO: 'Colorado', CO: 'Colorado', CAL: 'California', CALIF: 'California',
  JCT: 'Junction', JCTN: 'Junction', STA: 'Station',
  MT: 'Mount', MTN: 'Mountain', FT: 'Fort', ST: 'Saint',
  PT: 'Point', PK: 'Park', CTY: 'City', VLY: 'Valley',
  N: 'North', S: 'South', E: 'East', W: 'West',
  LK: 'Lake', BCH: 'Beach', HTS: 'Heights', VLG: 'Village',
}));

// A tail naming water or hardware is a location on the river, not a town, and a
// page called "Below Highway 85" is worth nothing to anyone.
const NOT_A_PLACE = /\b(RESERVOIR|RES|LAKE|POND|CREEK|CR|CRK|RIVER|RIV|DAM|BRIDGE|HWY|HIGHWAY|ROAD|RD|AVENUE|AVE|STREET|MOUTH|CONFLUENCE|DIVERSION|DITCH|CANAL|FLUME|INTAKE|OUTLET|PLANT|POWERPLANT|SIPHON|TUNNEL|TRAIL|CAMPGROUND|RANCH|MINE|MILL|GAGE|GAUGE|HEADGATE|WEIR|FLOODWAY|SLOUGH|WASH|DRAIN|FORK|GULCH|DRAW|LINE|BOUNDARY|MARINA|RAMP|BASIN|PUMP|WELL|TANK|FISH|HATCHERY)\b/;

const LOCATOR = /\b(NR|NEAR|AT)\b/g;

function titleCase(token) {
  const bare = token.replace(/[.,]+$/, '');
  if (!bare) return '';
  const up = bare.toUpperCase();
  if (EXPAND.has(up)) return EXPAND.get(up);
  // An acronym has no vowel to lowercase: RMNP stays RMNP, not "Rmnp".
  if (/^[A-Z]{2,5}$/.test(bare) && !/[AEIOUY]/.test(bare)) return bare;
  if (/^MC[A-Z]/i.test(bare)) return 'Mc' + bare.charAt(2).toUpperCase() + bare.slice(3).toLowerCase();
  return bare.charAt(0).toUpperCase() + bare.slice(1).toLowerCase();
}

// "BIG THOMPSON BL MORAINE PARK NR ESTES PARK, CO" -> "Estes Park"
export function placeOf(stationName, state) {
  let s = String(stationName || '').toUpperCase()
    .replace(/,\s*[A-Z]{2}\.?\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (state) {
    s = s.replace(new RegExp('[,\\s]+' + String(state).toUpperCase() + '\\.?$'), '').trim();
  }
  const hits = [...s.matchAll(LOCATOR)];
  if (!hits.length) return null;
  const last = hits[hits.length - 1];
  const tail = s.slice(last.index + last[0].length).replace(/^[\s,.]+|[\s,.]+$/g, '');
  if (!tail) return null;
  // A tail with a number in it is an address or a highway, never a town.
  if (/\d/.test(tail)) return null;
  if (NOT_A_PLACE.test(tail)) return null;
  const words = tail.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 4) return null;
  const name = words.map(titleCase).filter(Boolean).join(' ');
  if (name.length < 3) return null;
  return name;
}

export function distanceMi(aLat, aLon, bLat, bLon) {
  const R = 3958.8;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2
          + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Build the place pages for one state's gages.
//
// A place is anchored on the gages that name it, but the page lists everything
// within PLACE_RADIUS_MI of that anchor — which is the point. Somebody staying
// in Estes Park wants the Big Thompson and the Poudre and the Colorado, not
// only the one gage with "Estes Park" in its title.
export function collectPlaces(gages) {
  const named = new Map();
  for (const g of gages) {
    if (!Number.isFinite(g.lat) || !Number.isFinite(g.lon)) continue;
    const name = placeOf(g.rawName, g.state);
    if (!name) continue;
    const slug = slugify(name);
    if (!slug) continue;
    const entry = named.get(slug) || { slug, name, anchors: [] };
    // Keep the spelled-out form when variants collide: "Colorado Springs" over
    // "Colo Springs", which sort order alone would get backwards.
    if (name.length > entry.name.length) entry.name = name;
    entry.anchors.push(g);
    named.set(slug, entry);
  }

  const places = [];
  for (const entry of named.values()) {
    const lat = entry.anchors.reduce((s, g) => s + g.lat, 0) / entry.anchors.length;
    const lon = entry.anchors.reduce((s, g) => s + g.lon, 0) / entry.anchors.length;
    const nearby = gages
      .filter((g) => Number.isFinite(g.lat) && Number.isFinite(g.lon))
      .map((g) => ({ ...g, miles: distanceMi(lat, lon, g.lat, g.lon) }))
      .filter((g) => g.miles <= PLACE_RADIUS_MI)
      .sort((a, b) => a.miles - b.miles);
    // A town with two gages in reach does not need a page of its own; the river
    // pages already cover those, and a thin page is worse than no page.
    if (nearby.length < MIN_GAGES) continue;
    places.push({
      slug: entry.slug,
      name: entry.name,
      lat,
      lon,
      namedBy: entry.anchors.length,
      gages: nearby,
    });
  }
  return places.sort((a, b) => a.name.localeCompare(b.name));
}
