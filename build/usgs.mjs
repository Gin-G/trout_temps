// Build-time reads of the three USGS services the generated pages are made from.
//
// Nothing here runs in the browser: the pages fetch their own live readings at
// view time. What the build bakes in is the part a crawler has to be able to see
// without running JavaScript — the station list, where each gage is, and what
// the water has actually been doing for the last month.

import { riverName, stationName, slugify } from './rivers.mjs';

const BASE = 'https://waterservices.usgs.gov/nwis';
export const DAYS = 30;

export const STATES = [
  { code: 'co', name: 'Colorado' },      { code: 'mt', name: 'Montana' },
  { code: 'wy', name: 'Wyoming' },       { code: 'id', name: 'Idaho' },
  { code: 'ut', name: 'Utah' },          { code: 'nm', name: 'New Mexico' },
  { code: 'ca', name: 'California' },    { code: 'or', name: 'Oregon' },
  { code: 'wa', name: 'Washington' },    { code: 'pa', name: 'Pennsylvania' },
  { code: 'ny', name: 'New York' },      { code: 'nc', name: 'North Carolina' },
  { code: 'vt', name: 'Vermont' },       { code: 'mi', name: 'Michigan' },
  { code: 'wi', name: 'Wisconsin' },
];

export const cToF = (c) => c * 9 / 5 + 32;

async function get(url, { json = true } = {}) {
  // USGS rate-limits and occasionally 503s a big state; a couple of retries with
  // a pause is the difference between a build that works and one that flakes.
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 2000 * attempt));
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'trout-temps-build (+https://trout-temps.nickknows.net)' } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return json ? await res.json() : await res.text();
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`USGS request failed after 4 tries: ${url}\n  ${lastErr.message}`);
}

// --- site service: where the gage is, how high, how much it drains ----------

function parseRdb(text) {
  const lines = text.split('\n').filter((l) => l && !l.startsWith('#'));
  if (lines.length < 2) return [];
  const cols = lines[0].split('\t');
  return lines.slice(2).map((line) => {
    const cells = line.split('\t');
    const row = {};
    cols.forEach((c, i) => { row[c] = (cells[i] || '').trim(); });
    return row;
  });
}

async function fetchSites(state) {
  const url = `${BASE}/site/?format=rdb&stateCd=${state}&siteOutput=expanded`
            + `&siteType=ST&hasDataTypeCd=iv&siteStatus=active`;
  const rows = parseRdb(await get(url, { json: false }));
  const byId = new Map();
  for (const r of rows) {
    if (!r.site_no) continue;
    byId.set(r.site_no, {
      elevationFt: r.alt_va ? Number(r.alt_va) : null,
      drainageSqMi: r.drain_area_va ? Number(r.drain_area_va) : null,
      huc: r.huc_cd || null,
    });
  }
  return byId;
}

// --- instantaneous values: which gages actually report temperature ----------

async function fetchGages(state) {
  const url = `${BASE}/iv/?format=json&stateCd=${state}&parameterCd=00010&siteStatus=active`;
  const body = await get(url);
  const out = new Map();
  for (const ts of body?.value?.timeSeries || []) {
    const info = ts.sourceInfo;
    const id = info?.siteCode?.[0]?.value;
    if (!id || out.has(id)) continue;   // a gage can report several sub-series
    const geo = info.geoLocation?.geogLocation;
    out.set(id, {
      id,
      state,
      rawName: info.siteName,
      lat: geo ? Number(geo.latitude) : null,
      lon: geo ? Number(geo.longitude) : null,
    });
  }
  return out;
}

// --- daily values: the month of numbers that gives each page something to say -

function isoDaysAgo(n) {
  return new Date(Date.now() - n * 86400e3).toISOString().slice(0, 10);
}

async function fetchDailyStats(state) {
  const url = `${BASE}/dv/?format=json&stateCd=${state}&parameterCd=00010`
            + `&statCd=00001,00002,00003&startDT=${isoDaysAgo(DAYS)}&endDT=${isoDaysAgo(1)}`
            + `&siteStatus=active`;
  const body = await get(url);
  const bySite = new Map();
  for (const ts of body?.value?.timeSeries || []) {
    const id = ts.sourceInfo?.siteCode?.[0]?.value;
    const stat = ts.variable?.options?.option?.find((o) => o.name === 'Statistic')?.optionCode;
    if (!id || !stat) continue;
    const entry = bySite.get(id) || { max: [], min: [], mean: [] };
    const key = stat === '00001' ? 'max' : stat === '00002' ? 'min' : stat === '00003' ? 'mean' : null;
    if (!key) continue;
    for (const v of ts.values?.[0]?.value || []) {
      const c = Number(v.value);
      // USGS uses -999999 for "no reading"; a trout stream is never -999999°C.
      if (!Number.isFinite(c) || c < -50 || c > 60) continue;
      entry[key].push({ date: v.dateTime.slice(0, 10), c });
    }
    bySite.set(id, entry);
  }
  // Collapse to the handful of figures the pages actually print.
  const out = new Map();
  for (const [id, e] of bySite) {
    const meanF = e.mean.map((d) => cToF(d.c));
    if (!e.max.length && !meanF.length) continue;

    // Not every gage publishes a daily maximum; some publish only the mean.
    // Counting threshold days off an absent maximum series gives zero, which
    // would tell an angler a creek averaging 70°F "stayed under 65°F every
    // day" — so when there is no maximum, the mean is what gets scored, and
    // the page says which it used.
    const usingMax = e.max.length > 0;
    const highs = usingMax ? e.max : e.mean;
    const highsF = highs.map((d) => cToF(d.c));

    const average = meanF.length ? meanF.reduce((a, b) => a + b, 0) / meanF.length : null;
    const lows = e.min.length ? e.min.map((d) => cToF(d.c)) : meanF;

    out.set(id, {
      days: highs.length,
      warmestF: highsF.length ? Math.max(...highsF) : null,
      coldestF: lows.length ? Math.min(...lows) : null,
      averageF: average,
      // What answers "can I fish it": how often the day's peak broke the line,
      // not whether it happened to be over it at one moment.
      daysOver65: highsF.filter((f) => f >= 65).length,
      daysOver60: highsF.filter((f) => f >= 60).length,
      // Oldest first, for the sparkline baked into the markup.
      dailyHighs: highs.map((d) => ({ date: d.date, f: Number(cToF(d.c).toFixed(1)) })),
      // 'max' when USGS published daily maxima, 'mean' when the daily average is
      // all there was. The prose and the chart caption both say so.
      highsFrom: usingMax ? 'max' : 'mean',
      lowsFrom: e.min.length ? 'min' : 'mean',
      lastDate: highs.length ? highs[highs.length - 1].date : null,
    });
  }
  return out;
}

// --- assembly ---------------------------------------------------------------

export async function collectState({ code, name }) {
  const [sites, gages, stats] = await Promise.all([
    fetchSites(code), fetchGages(code), fetchDailyStats(code),
  ]);
  const rows = [];
  for (const [id, g] of gages) {
    const meta = sites.get(id) || {};
    const river = riverName(g.rawName, code);
    if (!river) continue;
    rows.push({
      ...g,
      stateName: name,
      station: stationName(g.rawName, code),
      river,
      riverSlug: slugify(river),
      elevationFt: meta.elevationFt ?? null,
      drainageSqMi: meta.drainageSqMi ?? null,
      huc: meta.huc ?? null,
      stats: stats.get(id) || null,
    });
  }
  rows.sort((a, b) => a.station.localeCompare(b.station));
  return { code, name, gages: rows };
}

// Gages on the same watercourse, ordered so the page reads downstream-ish
// (upper gages are colder, and elevation is the only ordering key we have).
export function groupRivers(gages) {
  const bySlug = new Map();
  for (const g of gages) {
    const group = bySlug.get(g.riverSlug);
    if (group) group.gages.push(g);
    else bySlug.set(g.riverSlug, { slug: g.riverSlug, name: g.river, gages: [g] });
  }
  for (const r of bySlug.values()) {
    r.gages.sort((a, b) => (b.elevationFt ?? -1) - (a.elevationFt ?? -1)
                        || a.station.localeCompare(b.station));
  }
  return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
}
