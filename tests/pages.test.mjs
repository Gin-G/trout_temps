import { test } from 'node:test';
import assert from 'node:assert/strict';
import { riverPage, gagePage, statePage, riversIndexPage, periodVerdict, esc } from '../build/templates.mjs';

const state = { code: 'co', name: 'Colorado', slug: 'colorado' };

function stats({ days = 30, over65 = 0, over60 = 30, warm = 70.7, cold = 50.2, avg = 59.8 } = {}) {
  return {
    days, warmestF: warm, coldestF: cold, averageF: avg,
    daysOver65: over65, daysOver60: over60,
    dailyHighs: Array.from({ length: days }, (_, i) => ({
      date: new Date(Date.UTC(2026, 6, 23) + i * 86400e3).toISOString().slice(0, 10),
      f: i < over65 ? 67 : 62,
    })),
    lastDate: '2026-08-21',
  };
}

const gage = (over = {}) => ({
  id: '402114105350101', state: 'co', stateName: 'Colorado',
  station: 'Big Thompson below Moraine Park near Estes Park',
  river: 'Big Thompson River', riverSlug: 'big-thompson-river',
  lat: 40.3538611, lon: -105.5841389, elevationFt: 7999, drainageSqMi: 12.3,
  huc: '10190006', stats: stats(), ...over,
});

const river = (gages = [gage()], agg = stats()) => ({
  slug: 'big-thompson-river', name: 'Big Thompson River', gages, agg,
});

// --- the bug this suite exists for -----------------------------------------

test('a month spent over the threshold never reads as safe', () => {
  // A river averaging 59.8F looks safe on the average alone, but if the daily
  // high broke 65F on twenty of thirty days it is not safe water, and the badge
  // has to say so.
  const v = periodVerdict(stats({ over65: 20, avg: 59.8 }));
  assert.equal(v.cls, 'caution');
  assert.match(v.label, /20 of 30/);

  const hot = stats({ over65: 20, avg: 59.8 });
  const html = riverPage(river([gage({ stats: hot })], hot), state);
  assert.doesNotMatch(html, /class="badge safe"/);
  assert.match(html, /class="badge caution"/);
});

test('the verdict bands track how often the line was crossed', () => {
  assert.equal(periodVerdict(stats({ over65: 0 })).cls, 'safe');
  assert.equal(periodVerdict(stats({ over65: 1 })).cls, 'caution');
  assert.equal(periodVerdict(stats({ over65: 24 })).cls, 'danger');   // 80%
  assert.equal(periodVerdict(stats({ over65: 30 })).cls, 'danger');
  assert.equal(periodVerdict(null), null);
  assert.equal(periodVerdict({ days: 0 }), null);
});

// --- what has to be in the markup before any script runs -------------------

test('the river name is in the title, the h1 and the canonical', () => {
  const html = riverPage(river(), state);
  assert.match(html, /<title>Big Thompson River Water Temperature — Colorado \| Live USGS Readings<\/title>/);
  assert.match(html, /<h1>Big Thompson River Water Temperature<\/h1>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/trout-temps\.nickknows\.net\/river\/colorado\/big-thompson-river\/">/);
  assert.match(html, /<meta name="robots" content="index,follow/);
});

test('a river page carries its readings in the served markup', () => {
  // If these numbers only arrived over fetch there would be nothing to index.
  const html = riverPage(river(), state);
  assert.match(html, /70\.7&deg;F/);      // warmest
  assert.match(html, /50\.2&deg;F/);      // coldest
  assert.match(html, /59\.8&deg;F/);      // average
  assert.match(html, /<svg viewBox="0 0 720 140"/);  // the baked sparkline
  assert.match(html, /Daily high water temperature, 2026-07-23 to 2026-08-21/);
});

test('a river page describes itself in prose, not just numbers', () => {
  const cold = riverPage(river([gage({ stats: stats({ over65: 0 }) })], stats({ over65: 0 })), state);
  assert.match(cold, /stayed under the 65&deg;F catch-and-release threshold every one of those days/);

  const hotHtml = riverPage(river([gage({ stats: stats({ over65: 30 }) })], stats({ over65: 30 })), state);
  assert.match(hotHtml, /too warm\s+to fish for trout you intend to release for the whole period/);
});

test('a one-gage river is described in the singular', () => {
  const html = riverPage(river(), state);
  assert.match(html, /1 USGS gage reporting temperature/);
  assert.match(html, /reads the single gage on the Big Thompson River/);
  assert.doesNotMatch(html, /those gages ran/);
  // The FAQ answer used to say "reads them live" twice over.
  assert.equal((html.match(/This page reads it live every time it loads/g) || []).length, 1);
});

test('a many-gage river is described in the plural', () => {
  const two = river([gage(), gage({ id: '06738000', station: 'Big Thompson River at Loveland' })]);
  const html = riverPage(two, state);
  assert.match(html, /2 USGS gages reporting temperature/);
  assert.match(html, /reads all 2 gages on the Big Thompson River/);
});

test('a river with no daily summaries still renders', () => {
  const html = riverPage(river([gage({ stats: null })], null), state);
  assert.match(html, /has not published daily summaries/);
  assert.match(html, /no daily summaries/);
  assert.doesNotMatch(html, /undefined|NaN|null&deg;/);
});

// --- gage pages -------------------------------------------------------------

test('a gage page names its gage and links its river', () => {
  const g = gage();
  const html = gagePage(g, { name: 'Big Thompson River', slug: 'big-thompson-river' }, state, [g]);
  assert.match(html, /<title>Big Thompson below Moraine Park near Estes Park Water Temperature — Live USGS Gage<\/title>/);
  assert.match(html, /<h1 id="title">Big Thompson below Moraine Park near Estes Park Water Temperature<\/h1>/);
  assert.match(html, /href="\/river\/colorado\/big-thompson-river\/"/);
  assert.match(html, /canonical" href="https:\/\/trout-temps\.nickknows\.net\/gage\/402114105350101\/"/);
});

test('a gage page hands the shared script its identity', () => {
  const g = gage();
  const html = gagePage(g, { name: 'Big Thompson River', slug: 'big-thompson-river' }, state, [g]);
  // Without this the script would overwrite the served heading with USGS' raw
  // ALL-CAPS name and rewrite the canonical at detail.html.
  assert.match(html, /window\.TROUT_GAGE=\{\s*"site": "402114105350101"/);
  assert.match(html, /<script src="\/assets\/gage\.js"><\/script>/);
});

test('a gage page publishes its location and provenance as structured data', () => {
  const g = gage();
  const html = gagePage(g, { name: 'Big Thompson River', slug: 'big-thompson-river' }, state, [g]);
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)]
    .map((m) => JSON.parse(m[1]));
  const types = blocks.map((b) => b['@type']);
  assert.deepEqual(types, ['BreadcrumbList', 'Place', 'Dataset']);
  const place = blocks[1];
  assert.equal(place.geo.latitude, 40.3538611);
  assert.equal(blocks[2].creator.name, 'U.S. Geological Survey');
});

test('sibling gages cross-link, and a lone gage has no empty section', () => {
  const a = gage();
  const b = gage({ id: '06738000', station: 'Big Thompson River at Loveland', elevationFt: 5000 });
  const r = { name: 'Big Thompson River', slug: 'big-thompson-river' };
  const both = gagePage(a, r, state, [a, b]);
  assert.match(both, /Other gages on Big Thompson River/);
  assert.match(both, /href="\/gage\/06738000\/"/);
  assert.doesNotMatch(both, /href="\/gage\/402114105350101\/"[^]*Other gages/);  // not itself

  const alone = gagePage(a, r, state, [a]);
  assert.doesNotMatch(alone, /Other gages on/);
});

// --- index pages ------------------------------------------------------------

test('a state page links every river on it', () => {
  const rivers = [river(), { slug: 'gore-creek', name: 'Gore Creek', gages: [gage()], agg: stats({ over65: 0 }) }];
  const html = statePage(state, rivers);
  // Deliberately not "Colorado River Water Temperatures" — that names an actual
  // river with its own page, and the two would compete for the same query.
  assert.match(html, /<title>Colorado Trout Streams — Live Water Temperature for 2 Rivers<\/title>/);
  assert.doesNotMatch(html, /<title>Colorado River Water/);
  assert.match(html, /href="\/river\/colorado\/big-thompson-river\/"/);
  assert.match(html, /href="\/river\/colorado\/gore-creek\/"/);
  assert.match(html, /id="LB"/);   // alphabetical anchors
  assert.match(html, /id="LG"/);
});

test('the rivers index counts what it links to', () => {
  const html = riversIndexPage([
    { name: 'Colorado', slug: 'colorado', rivers: [river(), river()], gageCount: 203 },
    { name: 'Montana', slug: 'montana', rivers: [river()], gageCount: 91 },
  ]);
  assert.match(html, /294 USGS gages · 3 rivers · 2 states/);
  assert.match(html, /href="\/rivers\/colorado\/"/);
  assert.match(html, /href="\/rivers\/montana\/"/);
});

// --- escaping ---------------------------------------------------------------

test('names are escaped into markup and JSON alike', () => {
  assert.equal(esc(`Bear "Big" & <Wild> Creek's`), 'Bear &quot;Big&quot; &amp; &lt;Wild&gt; Creek&#39;s');
  const g = gage({ station: 'Fish <script>alert(1)</script> Creek' });
  const html = gagePage(g, { name: 'A & B River', slug: 'a-b-river' }, state, [g]);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /Fish &lt;script&gt;/);
});

// --- gages that publish a mean but no maximum -------------------------------

// Some USGS gages publish only statCd 00003, the daily mean. Scoring the
// threshold against an absent maximum series counted zero days over 65°F, so a
// creek averaging 70°F was described as having "stayed under the threshold
// every one of those days" — the page told anglers to fish water that was
// cooking. The stats layer now scores the mean when that is all there is, and
// the prose says which series it used.
const meanOnly = (over65) => ({
  days: 30, warmestF: 71.2, coldestF: 68.4, averageF: 70.1,
  daysOver65: over65, daysOver60: 30,
  dailyHighs: Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 6, 23) + i * 86400e3).toISOString().slice(0, 10),
    f: 70.1,
  })),
  highsFrom: 'mean', lowsFrom: 'mean', lastDate: '2026-08-21',
});

test('a mean-only gage is not called safe, and says the peak was higher', () => {
  const s = meanOnly(30);
  const html = riverPage({ slug: 'cherry-creek', name: 'Cherry Creek', gages: [gage({ stats: s })], agg: s },
    { code: 'ca', name: 'California', slug: 'california' });
  assert.doesNotMatch(html, /stayed under the 65&deg;F catch-and-release threshold/);
  assert.match(html, /daily average broke 65&deg;F on all 30 of them/);
  assert.match(html, /publishes a daily average but no daily maximum/);
  assert.match(html, /class="badge danger"/);
});

test('a mean-only gage labels its table and chart as averages', () => {
  const s = meanOnly(30);
  const html = riverPage({ slug: 'cherry-creek', name: 'Cherry Creek', gages: [gage({ stats: s })], agg: s },
    { code: 'ca', name: 'California', slug: 'california' });
  assert.match(html, /Warmest daily average/);
  assert.match(html, /Coldest daily average/);
  assert.match(html, /this gage publishes no daily maximum/);
  assert.match(html, /aria-label="[^"]*daily average water temperature/);
  assert.doesNotMatch(html, /Warmest daily high/);
});

test('a gage with maxima keeps the plain "daily high" wording', () => {
  const html = riverPage(river(), state);
  assert.match(html, /Warmest daily high/);
  assert.match(html, /Coldest daily low/);
  assert.doesNotMatch(html, /publishes a daily average but no daily maximum/);
});

test('missing extremes never print as null', () => {
  // A gage with a mean and nothing else: no range sentence to write.
  const s = { days: 12, warmestF: null, coldestF: null, averageF: 58.3, daysOver65: 0,
              daysOver60: 0, dailyHighs: [], highsFrom: 'mean', lowsFrom: 'mean', lastDate: '2026-08-21' };
  const html = riverPage({ slug: 'x-creek', name: 'X Creek', gages: [gage({ stats: s })], agg: s }, state);
  assert.doesNotMatch(html.slice(html.indexOf('<body>')), /null|undefined|NaN/);
  assert.match(html, /averaged 58\.3&deg;F/);
});
