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

// How far a place page reaches, how many gages it lists, and how many it takes
// to be worth having at all.
//
// The radius is the whole ballgame for duplication. At 40 miles every town in a
// metro area sees the same gages, so neighbouring pages became copies of each
// other -- not because the towns are the same, but because the radius erased the
// difference between them. Twenty-five miles with the nearest dozen gages keeps
// the pages distinct, and a table whose 36th row is 40 miles away was not
// helping anyone plan a day anyway.
export const PLACE_RADIUS_MI = 25;
export const PLACE_MAX_GAGES = 12;
export const MIN_GAGES = 3;

// Sparse country gets the old reach back. Twenty-five miles is the right radius
// where gages are dense enough to make neighbouring pages copies of each other;
// out on the Stillwater or the Boulder it just deletes the town. A place that
// cannot field MIN_GAGES inside the tight radius widens to this rather than
// losing its page — and those are the towns least likely to duplicate anything,
// because there is nothing near them to duplicate.
export const PLACE_WIDEN_MI = 40;

// Two pages listing the same water are one page. Above this Jaccard overlap on
// the gage sets, the weaker name folds into the stronger one.
export const MERGE_OVERLAP = 0.9;

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
// A street or a park path is not a town, however the gage is named. Matched on
// the tail's ending, and only on words that no real town ends in: "... Park" is
// left alone because Estes Park and Winter Park are towns, and so are LANDING,
// BOTTOM and CENTER -- Crows Landing, Peach Bottom, Olive Center. Where those
// do produce a near-copy of a neighbouring town, clustering merges it; that is
// cheaper than a filter that deletes real places to catch a few streets.
const NOT_A_TOWN_SUFFIX = /\b(DRIVE|DR|COURT|CT|TERRACE|TER|LANE|LN|BOULEVARD|BLVD|CIRCLE|CIR|SCHOOL|CEMETERY|PLAZA)$/;

// A landmark anywhere in the tail, not just at the end: USGS writes plenty of
// urban gages as "<street> <town>", and "Fowler Middle School Tigard" is a
// spelling of Tigard, not a place of its own.
const NOT_A_TOWN_ANYWHERE = /\b(SCHOOL|COLLEGE|CEMETERY|HOSPITAL|AIRPORT|STADIUM|GOLF|APARTMENTS|SUBDIVISION)\b/;

// A street grid quadrant starts an address, never a town name. Single letters
// are left alone: W YELLOWSTONE is a town, SW WALNUT ST is a corner.
const ADDRESS_PREFIX = /^(SW|SE|NW|NE)\b/;

// A street type after the first word is "Main St", not "St Marys".
const STREET_TYPE_INSIDE = /^\S+\s+.*\b(ST|DR|CT|AVE|BLVD|PKWY|TER|LN|RD|CIR)\b/;

const NOT_A_PLACE = /\b(RESERVOIR|RES|LAKE|POND|CREEK|CR|CRK|RIVER|RIV|DAM|BRIDGE|HWY|HIGHWAY|ROAD|RD|AVENUE|AVE|STREET|MOUTH|CONFLUENCE|DIVERSION|DITCH|CANAL|FLUME|INTAKE|OUTLET|PLANT|POWERPLANT|SIPHON|TUNNEL|TRAIL|CAMPGROUND|RANCH|MINE|MILL|GAGE|GAUGE|HEADGATE|WEIR|FLOODWAY|SLOUGH|WASH|DRAIN|FORK|GULCH|DRAW|LINE|BOUNDARY|MARINA|RAMP|BASIN|PUMP|WELL|TANK|FISH|HATCHERY)\b/;

const LOCATOR = /\b(NR|NEAR|AT)\b/g;

// Lowercase inside a name, capitalised if they start it: "Port of Albany", but
// "The Dalles".
const SMALL_WORDS = new Set(['OF', 'THE', 'AND', 'ON', 'AT', 'BY', 'DE', 'LA', 'DEL']);

function titleCase(token, index = 0) {
  const bare = token.replace(/[.,]+$/, '');
  if (!bare) return '';
  const up = bare.toUpperCase();
  if (index > 0 && SMALL_WORDS.has(up)) return up.toLowerCase();
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
  if (NOT_A_TOWN_SUFFIX.test(tail)) return null;
  if (NOT_A_TOWN_ANYWHERE.test(tail)) return null;
  if (ADDRESS_PREFIX.test(tail)) return null;
  if (STREET_TYPE_INSIDE.test(tail)) return null;
  const words = tail.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 4) return null;
  const name = words.map((w, i) => titleCase(w, i)).filter(Boolean).join(' ');
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

// How much two places' gage lists have in common, 0 to 1 (Jaccard). Two pages
// listing the same water tell the reader the same thing, whatever the headings.
export function overlapRatio(a, b) {
  const A = new Set(a.gages.map((g) => g.id));
  let shared = 0;
  const seen = new Set();
  for (const g of b.gages) {
    if (seen.has(g.id)) continue;
    seen.add(g.id);
    if (A.has(g.id)) shared += 1;
  }
  const union = A.size + seen.size - shared;
  return union ? shared / union : 0;
}

// Fold places whose lists have converged into whichever name carries the most
// weight, so the same table is not published under four headings.
//
// Strength is how many gages are actually named for the town, not how many sit
// within reach of it. Reach is an artefact of the radius: rank on it and a
// hamlet with a dense river network outranks the city next door, and Portland
// ends up folded into a page called Carver. Being named by seven gages means
// seven USGS stations are at that town, which is as close to "somewhere people
// go" as this data gets.
export function clusterPlaces(places, threshold = MERGE_OVERLAP) {
  const words = (p) => p.name.split(/\s+/).length;
  const ranked = [...places].sort((a, b) =>
    b.namedBy - a.namedBy
    || b.gages.length - a.gages.length
    // Then the plainer name. A compound is usually the smaller place -- Cedar
    // Hill beside Durango, Four Corners beside Cortez -- and when both towns
    // are named by one gage apiece there is nothing else in the data to go on.
    // Alphabetical, which this replaces, picked the obscure one half the time.
    || words(a) - words(b)
    || a.name.length - b.name.length
    || a.name.localeCompare(b.name));

  const absorbed = new Set();
  const primaries = [];
  for (const place of ranked) {
    if (absorbed.has(place.slug)) continue;
    const aliases = [];
    for (const other of ranked) {
      if (other.slug === place.slug || absorbed.has(other.slug)) continue;
      if (overlapRatio(place, other) < threshold) continue;
      absorbed.add(other.slug);
      aliases.push({ slug: other.slug, name: other.name });
    }
    primaries.push({ ...place, aliases: aliases.sort((a, b) => a.name.localeCompare(b.name)) });
  }
  return primaries.sort((a, b) => a.name.localeCompare(b.name));
}

// Build the place pages for one state's gages.
//
// A place is anchored on the gages that name it, but the page lists the nearest
// PLACE_MAX_GAGES within PLACE_RADIUS_MI of that anchor — which is the point.
// Somebody staying in Estes Park wants the Big Thompson and the Poudre and the
// Colorado, not only the one gage with "Estes Park" in its title.
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
    const ranged = gages
      .filter((g) => Number.isFinite(g.lat) && Number.isFinite(g.lon))
      .map((g) => ({ ...g, miles: distanceMi(lat, lon, g.lat, g.lon) }))
      .sort((a, b) => a.miles - b.miles);

    const tight = ranged.filter((g) => g.miles <= PLACE_RADIUS_MI);
    const widened = tight.length >= MIN_GAGES;
    const radiusMi = widened ? PLACE_RADIUS_MI : PLACE_WIDEN_MI;
    const nearby = (widened ? tight : ranged.filter((g) => g.miles <= PLACE_WIDEN_MI))
      .slice(0, PLACE_MAX_GAGES);

    // A town with two gages even at the wider reach does not need a page of its
    // own; the river pages already cover those, and a thin page is worse than
    // no page.
    if (nearby.length < MIN_GAGES) continue;
    places.push({
      slug: entry.slug,
      name: entry.name,
      lat,
      lon,
      radiusMi,
      namedBy: entry.anchors.length,
      gages: nearby,
    });
  }
  return clusterPlaces(places);
}
