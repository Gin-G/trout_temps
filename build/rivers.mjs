// Turning USGS station names into things a person would type into Google.
//
// A station name is two halves: the watercourse and where on it the gage sits —
// "BIG THOMPSON BL MORAINE PARK NR ESTES PARK, CO". Nobody searches for the
// second half, so the river pages are keyed on the first, and the whole name is
// spelled out in prose for the gage pages.

// Words that start the "where on it" half. Matched on a token boundary, so a
// river genuinely called "Near Creek" would need a longer name to survive — no
// such gage exists in the 15 states this covers.
const LOCATORS = new Set([
  'ABV', 'ABOVE', 'ABOV', 'AB', 'BL', 'BLW', 'BLO', 'BELOW', 'BEL',
  'NR', 'NEAR', 'AT', 'A', 'US', 'DS', 'UPSTREAM', 'DOWNSTREAM', 'MOUTH', 'IN',
]);

// Words that only mean "where on it" when "OF" follows. A bare SOUTH cannot be a
// locator or "MIDDLE FORK SOUTH PLATTE RIVER" would be cut down to "Middle Fork",
// but "BLUE MESA RES EAST OF WILLOW CREEK" has to lose everything from EAST on
// or one reservoir becomes four rivers.
const LOCATOR_OF = new Set(['EAST', 'WEST', 'NORTH', 'SOUTH', 'E', 'W', 'N', 'S', 'END', 'HEAD', 'OUT']);

// USGS abbreviates hard. Expanding these is most of what makes a title
// searchable: "CACHE LA POUDRE R" ranks for nothing, "Cache la Poudre River" does.
const ABBREV = new Map(Object.entries({
  R: 'River', RIV: 'River', RV: 'River', RVR: 'River',
  CR: 'Creek', CK: 'Creek', CRK: 'Creek', C: 'Creek',
  BR: 'Branch', BRH: 'Branch', FK: 'Fork', FRK: 'Fork',
  NF: 'North Fork', SF: 'South Fork', EF: 'East Fork', WF: 'West Fork',
  MF: 'Middle Fork', 'M FK': 'Middle Fork',
  N: 'North', S: 'South', E: 'East', W: 'West', M: 'Middle',
  L: 'Little', LT: 'Little', LTL: 'Little', BG: 'Big',
  LK: 'Lake', RES: 'Reservoir', RESV: 'Reservoir',
  TRIB: 'Tributary', TR: 'Tributary', SL: 'Slough',
  DIV: 'Diversion', DIVER: 'Diversion', DTCH: 'Ditch', CN: 'Canal', CNL: 'Canal',
  SPGS: 'Springs', SPG: 'Spring', SPRS: 'Springs',
  ST: 'Saint', 'ST.': 'Saint', MTN: 'Mountain', MT: 'Mount',
  PK: 'Peak', VLY: 'Valley', CYN: 'Canyon', CN_: 'Canyon',
}));

// The same map, but for the location half, where these read as prepositions.
const LOCATOR_WORDS = new Map(Object.entries({
  ABV: 'above', ABOV: 'above', AB: 'above', ABOVE: 'above',
  BL: 'below', BLW: 'below', BLO: 'below', BEL: 'below', BELOW: 'below',
  NR: 'near', NEAR: 'near', AT: 'at', A: 'at',
  US: 'upstream of', DS: 'downstream of',
  UPSTREAM: 'upstream of', DOWNSTREAM: 'downstream of',
}));

// A name ending in one of these already says what kind of water it is. The test
// is on the LAST word, not anywhere in the name: "North Fork Gunnison" contains
// "Fork" but is still short a noun, and leaving it alone split it from the gages
// named "NF GUNNISON RIVER" into a second, near-empty river page.
const WATERCOURSE = /(?:^|\s)(River|Creek|Fork|Branch|Brook|Run|Bayou|Slough|Ditch|Canal|Drain|Wash|Kill|Stream|Lake|Reservoir|Bay|Sound|Harbor|Canyon|Arroyo|Rio|Outlet|Spring|Springs|Gulch|Draw|Coulee|Basin|Pond|Inlet|Channel|Aqueduct|Flume|Tailrace|Race|Water|Waters)$/i;

// Left lowercase inside a name, never at the start of one.
const MINOR = new Set(['of', 'the', 'la', 'las', 'los', 'el', 'de', 'del', 'du', 'at', 'on', 'and']);

function titleToken(raw) {
  const t = raw.replace(/[.,]+$/, '');
  if (!t) return '';
  // Roman numerals and pure numbers stay as they are: "HWY 85", "NO. 2".
  if (/^\d+$/.test(t)) return t;
  // A short run of consonants with no vowel in it is an acronym, not a word:
  // RMNP, BLM, NWR. Title-casing those gives "Rmnp", which looks like a typo.
  if (/^[A-Z]{2,5}$/.test(t) && !/[AEIOUY]/.test(t)) return t;
  const lower = t.toLowerCase();
  // Mc- and O'- names, which a plain capitalise gets wrong.
  if (/^MC[A-Z]/.test(t)) return 'Mc' + t.charAt(2) + t.slice(3).toLowerCase();
  if (/^O'[A-Z]/.test(t)) return "O'" + t.charAt(2) + t.slice(3).toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function expand(tokens, dictionary) {
  return tokens
    .map((raw) => {
      const bare = raw.replace(/[.,]+$/, '').toUpperCase();
      const mapped = dictionary.get(bare);
      return mapped || titleToken(raw);
    })
    .filter(Boolean);
}

function casedJoin(parts) {
  return parts
    .map((p, i) => (i > 0 && MINOR.has(p.toLowerCase()) ? p.toLowerCase() : p))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// "BIG THOMPSON BL MORAINE PARK NR ESTES PARK, CO" -> { head, tail }
// `state` is the two-letter code the gage was fetched under. Most names end in
// ", CO" and the comma gives it away, but some end in a bare "MT" that would
// otherwise expand to "Mount" — so the known code is stripped either way.
export function splitStation(stationName, state) {
  let cleaned = String(stationName || '')
    .toUpperCase()
    .replace(/,\s*[A-Z]{2}\.?\s*$/, '')   // trailing ", CO"
    .replace(/\s+/g, ' ')
    .trim();
  if (state) {
    const code = String(state).toUpperCase();
    cleaned = cleaned.replace(new RegExp('[,\\s]+' + code + '\\.?$'), '').trim();
  }
  if (!cleaned) return null;
  const tokens = cleaned.split(' ');
  const bare = (i) => (tokens[i] || '').replace(/[.,]+$/, '');
  // Never cut at token 0: a gage named "AT ..." would otherwise lose its river.
  let cut = tokens.length;
  for (let i = 1; i < tokens.length; i++) {
    const t = bare(i);
    if (LOCATORS.has(t) || (LOCATOR_OF.has(t) && bare(i + 1) === 'OF')) { cut = i; break; }
  }
  return { head: tokens.slice(0, cut), tail: tokens.slice(cut) };
}

// The searchable river name: "Big Thompson River", "Cache la Poudre River".
export function riverName(stationName, state) {
  const split = splitStation(stationName, state);
  if (!split) return null;
  let name = casedJoin(expand(split.head, ABBREV));
  if (!name) return null;
  // A bare "Big Thompson" is the Big Thompson River. Only add the noun when the
  // name does not already end in one, or "Gore Creek" becomes a river.
  if (!WATERCOURSE.test(name)) name += ' River';
  return name;
}

// The whole station, spelled out: "Big Thompson below Moraine Park near Estes Park".
export function stationName(raw, state) {
  const split = splitStation(raw, state);
  if (!split) return '';
  const head = casedJoin(expand(split.head, ABBREV));
  if (!split.tail.length) return head;
  const tail = split.tail
    .map((raw2, i) => {
      const bare = raw2.replace(/[.,]+$/, '').toUpperCase();
      if (LOCATOR_WORDS.has(bare)) return LOCATOR_WORDS.get(bare);
      const expanded = ABBREV.get(bare);
      // Only expand abbreviations that aren't the first word of a place name
      // fragment, so "AT ST CHARLES MESA" keeps Saint but "8TH ST" keeps St.
      return expanded && i > 0 ? expanded : titleToken(raw2);
    })
    .filter(Boolean);
  return casedJoin([head, ...tail]);
}

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
