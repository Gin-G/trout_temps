// The generated pages.
//
// Every one of these has to answer its query without JavaScript, because that is
// the state a crawler indexes: the river's name in the title and the heading, a
// month of real readings in the markup, and the verdict spelled out in a
// sentence. The live reading is layered on top afterwards for the human.

import { DAYS } from './usgs.mjs';
import { PLACE_RADIUS_MI, PLACE_MAX_GAGES } from './places.mjs';

export const ORIGIN = 'https://trout-temps.nickknows.net';
const GA = 'G-08D62NHKX9';

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// JSON inside a <script> is not HTML-escaped, so a "</script>" anywhere in a
// station name would close the block early and spill the rest onto the page.
// USGS names are tame today, but they are third-party strings on 1,450 pages.
export const jsonForScript = (value) => JSON.stringify(value, null, 1)
  .replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
  .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const f1 = (n) => (n == null ? null : Number(n).toFixed(1));
const cFromF = (f) => (f - 32) * 5 / 9;

// The badge in a gage table describes the whole month, not this minute, so it
// gets its own vocabulary. Scoring it on the average would call a river that
// broke 65°F on twenty of thirty days "Safe", which is exactly backwards — the
// question is how often the daily high crossed the line.
// "Boring", "Damascus and Gresham", "Boring, Damascus and Gresham".
export function listSentence(names) {
  const list = names.filter(Boolean);
  if (list.length <= 1) return list[0] || '';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

export function periodVerdict(stats) {
  if (!stats || !stats.days) return null;
  const share = stats.daysOver65 / stats.days;
  if (stats.daysOver65 === 0) return { cls: 'safe', label: `Under 65&deg;F all ${stats.days} days` };
  if (share >= 0.8) return { cls: 'danger', label: `Over 65&deg;F ${stats.daysOver65} of ${stats.days} days` };
  return { cls: 'caution', label: `Over 65&deg;F ${stats.daysOver65} of ${stats.days} days` };
}

function head({ title, description, canonical, jsonLd = [], extraCss = [], robots = 'index,follow,max-image-preview:large' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="${esc(robots)}">
<meta name="theme-color" content="#0a1a1f">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Trout Temps">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${ORIGIN}/social-card.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Trout Temps">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${ORIGIN}/social-card.png">
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${GA}');
</script>
${jsonLd.map((o) => `<script type="application/ld+json">\n${jsonForScript(o)}\n</script>`).join('\n')}
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/logo.png" type="image/png">
<link rel="apple-touch-icon" href="/logo.png">
<link rel="stylesheet" href="/assets/gage.css">
<link rel="stylesheet" href="/assets/pages.css">
${extraCss.join('\n')}
</head>
<body>`;
}

function foot(extraScripts = '') {
  return `<footer>
  <div class="wrap">
    Data: <a href="https://waterservices.usgs.gov" target="_blank" rel="noopener">USGS Instantaneous Values</a>
    and <a href="https://waterservices.usgs.gov/rest/DV-Service.html" target="_blank" rel="noopener">Daily Values</a> services · parameter 00010 (water temperature).
    Readings are point-in-time at the gage and may differ from where you stand on the river.
    The 65&deg;F guidance is a widely used rule of thumb for coldwater trout; check local
    regulations and any voluntary fishing closures.
  </div>
</footer>
${extraScripts}
</body>
</html>
`;
}

function breadcrumbs(trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem', position: i + 1, name: t.name, item: ORIGIN + t.path,
    })),
  };
}

function crumbHtml(trail) {
  return `<nav class="crumbs" aria-label="Breadcrumb">`
    + trail.map((t, i) => (i === trail.length - 1
        ? `<span aria-current="page">${esc(t.name)}</span>`
        : `<a href="${t.path}">${esc(t.name)}</a>`)).join('<span class="sep">/</span>')
    + `</nav>`;
}

// --- the prose that makes each page worth indexing --------------------------

// The month of daily highs, said out loud. This is the sentence that answers the
// query, and it is different on every page because the numbers are.
// "daily high" is a claim about the data, not a figure of speech: it is only true
// when USGS published daily maxima. Where the mean is all there is, say so —
// a daily average of 64°F hides afternoons well over the line.
export function peakWord(stats) {
  return stats && stats.highsFrom === 'mean' ? 'daily average' : 'daily high';
}

function summarySentence(river, stateName, stats) {
  if (!stats || !stats.days) {
    return `No daily temperature summaries have been published for ${river} in the last ${DAYS} days. `
         + `The live reading above comes straight from the gage.`;
  }
  const warm = f1(stats.warmestF);
  const cold = f1(stats.coldestF);
  const avg = f1(stats.averageF);
  const over = stats.daysOver65;
  const peak = peakWord(stats);
  const parts = [];
  // A gage can report a mean with no max, or a max with no mean. Only claim the
  // figures that exist.
  if (cold != null && warm != null && cold !== warm) {
    parts.push(`Over the last ${stats.days} days, ${river} in ${stateName} ran between `
      + `${cold}&deg;F and ${warm}&deg;F${avg != null ? `, averaging ${avg}&deg;F` : ''}.`);
  } else if (avg != null) {
    parts.push(`Over the last ${stats.days} days, ${river} in ${stateName} averaged ${avg}&deg;F`
      + `${warm != null ? `, peaking at ${warm}&deg;F` : ''}.`);
  } else if (warm != null) {
    parts.push(`Over the last ${stats.days} days, ${river} in ${stateName} peaked at ${warm}&deg;F.`);
  }
  if (over === 0) {
    parts.push(`The ${peak} stayed under the 65&deg;F catch-and-release threshold every one of those days, `
      + `so this has been fishable water for trout you intend to release.`);
  } else if (over === stats.days) {
    parts.push(`The ${peak} broke 65&deg;F on all ${stats.days} of them, so this stretch has been too warm `
      + `to fish for trout you intend to release for the whole period.`);
  } else {
    parts.push(`The ${peak} broke 65&deg;F on ${over} of them. On days like that the water is usually `
      + `coldest just after dawn, so an early start is the difference between fishing and not.`);
  }
  if (stats.highsFrom === 'mean') {
    parts.push(`This gage publishes a daily average but no daily maximum, so the afternoon peak `
      + `was higher than the figures above on most of those days.`);
  }
  return parts.join(' ');
}

// A stat block a crawler can read and a person can scan, with no JS involved.
function statsTable(stats) {
  if (!stats || !stats.days) {
    return `<p class="muted">USGS has not published daily summaries for this gage in the last ${DAYS} days.</p>`;
  }
  const highLabel = stats.highsFrom === 'mean' ? 'Warmest daily average' : 'Warmest daily high';
  const lowLabel = stats.lowsFrom === 'mean' ? 'Coldest daily average' : 'Coldest daily low';
  const rows = [
    [highLabel, stats.warmestF],
    [lowLabel, stats.coldestF],
    ['Average', stats.averageF],
  ].filter(([, v]) => v != null)
   .map(([label, v]) => [label, `${f1(v)}&deg;F`, `${f1(cFromF(v))}&deg;C`]);
  return `<table class="stats">
  <caption>Water temperature over the last ${stats.days} days, from USGS daily summaries${stats.highsFrom === 'mean' ? ' (daily averages — this gage publishes no daily maximum)' : ''}</caption>
  <tbody>
    ${rows.map(([l, a, b]) => `<tr><th scope="row">${l}</th><td>${a}</td><td class="c">${b}</td></tr>`).join('\n    ')}
    <tr><th scope="row">Days over 65&deg;F</th><td colspan="2">${stats.daysOver65} of ${stats.days}</td></tr>
    <tr><th scope="row">Days over 60&deg;F</th><td colspan="2">${stats.daysOver60} of ${stats.days}</td></tr>
  </tbody>
</table>`;
}

// A month of daily highs as an inline SVG. It is in the served markup, so it is
// there before any script runs and there for anyone who blocks scripts.
function sparkline(stats, label) {
  const peak = peakWord(stats);
  const pts = stats?.dailyHighs || [];
  if (pts.length < 2) return '';
  const W = 720, H = 140, padL = 34, padR = 10, padT = 12, padB = 20;
  const vals = pts.map((p) => p.f);
  let lo = Math.min(...vals, 60), hi = Math.max(...vals, 65);
  const pad = Math.max(1, (hi - lo) * 0.12);
  lo -= pad; hi += pad;
  const sx = (i) => padL + (i / (pts.length - 1)) * (W - padL - padR);
  const sy = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(p.f).toFixed(1)}`).join('');
  const area = `${line}L${sx(pts.length - 1).toFixed(1)},${H - padB}L${padL},${H - padB}Z`;
  const thrY = sy(65);
  const showThr = 65 >= lo && 65 <= hi;
  const ticks = [lo + (hi - lo) * 0.05, (lo + hi) / 2, hi - (hi - lo) * 0.05];
  return `<figure class="spark">
  <svg viewBox="0 0 ${W} ${H}" role="img" preserveAspectRatio="none"
       aria-label="${esc(label)}: ${peak} water temperature for the last ${pts.length} days, from ${f1(Math.min(...vals))} to ${f1(Math.max(...vals))} degrees Fahrenheit">
    ${ticks.map((t) => `<line class="g" x1="${padL}" y1="${sy(t).toFixed(1)}" x2="${W - padR}" y2="${sy(t).toFixed(1)}"/><text class="gt" x="${padL - 6}" y="${(sy(t) + 4).toFixed(1)}" text-anchor="end">${t.toFixed(0)}&#176;</text>`).join('')}
    <path class="area temp" d="${area}"/>
    <path class="plot temp" d="${line}"/>
    ${showThr ? `<line class="threshold-line" x1="${padL}" y1="${thrY.toFixed(1)}" x2="${W - padR}" y2="${thrY.toFixed(1)}"/><text class="threshold-label" x="${W - padR}" y="${(thrY - 5).toFixed(1)}" text-anchor="end">65&#176;F</text>` : ''}
  </svg>
  <figcaption>${peak.charAt(0).toUpperCase() + peak.slice(1)} water temperature, ${esc(pts[0].date)} to ${esc(pts[pts.length - 1].date)}. Source: USGS daily values.</figcaption>
</figure>`;
}

function gageFacts(g) {
  const bits = [];
  if (g.elevationFt != null) bits.push(['Elevation', `${Math.round(g.elevationFt).toLocaleString()} ft`]);
  if (g.drainageSqMi != null) bits.push(['Drainage area', `${g.drainageSqMi.toLocaleString()} sq mi`]);
  if (g.lat != null && g.lon != null) bits.push(['Coordinates', `${g.lat.toFixed(4)}, ${g.lon.toFixed(4)}`]);
  bits.push(['USGS gage number', g.id]);
  if (!bits.length) return '';
  return `<dl class="facts">${bits.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}

// --- gage page --------------------------------------------------------------

export function gagePage(g, river, state, siblings, nearby = []) {
  const path = `/gage/${g.id}/`;
  const title = `${g.station} Water Temperature — Live USGS Gage`;
  const desc = g.stats && g.stats.days
    ? `Current and 7-day water temperature for the ${g.station} gage on ${river.name} in ${state.name}. `
      + `Last ${g.stats.days} days: ${f1(g.stats.coldestF)}–${f1(g.stats.warmestF)}°F, `
      + `${g.stats.daysOver65} days over the 65°F trout threshold.`
    : `Current and 7-day water temperature for the ${g.station} gage on ${river.name} in ${state.name}, `
      + `scored against the 65°F trout catch-and-release threshold.`;
  const trail = [
    { name: 'Rivers', path: '/rivers/' },
    { name: state.name, path: `/rivers/${state.slug}/` },
    { name: river.name, path: `/river/${state.slug}/${river.slug}/` },
    { name: g.station, path },
  ];
  const jsonLd = [breadcrumbs(trail)];
  if (g.lat != null && g.lon != null) {
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'Place',
      '@id': `${ORIGIN}${path}#place`,
      name: `${g.station} streamgage`,
      description: `USGS streamgage ${g.id} on ${river.name}, ${state.name}, reporting water temperature.`,
      geo: { '@type': 'GeoCoordinates', latitude: g.lat, longitude: g.lon,
             ...(g.elevationFt != null ? { elevation: `${Math.round(g.elevationFt)} ft` } : {}) },
      containedInPlace: { '@type': 'AdministrativeArea', name: state.name },
    });
  }
  if (g.stats && g.stats.days) {
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      '@id': `${ORIGIN}${path}#data`,
      name: `${g.station} water temperature`,
      description: `Water temperature readings for USGS streamgage ${g.id} on ${river.name}, ${state.name}.`,
      creator: { '@type': 'Organization', name: 'U.S. Geological Survey', url: 'https://www.usgs.gov/' },
      isAccessibleForFree: true,
      license: 'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits',
      variableMeasured: { '@type': 'PropertyValue', name: 'Water temperature', unitText: 'DEG F' },
      temporalCoverage: g.stats.dailyHighs.length
        ? `${g.stats.dailyHighs[0].date}/${g.stats.dailyHighs[g.stats.dailyHighs.length - 1].date}` : undefined,
      distribution: {
        '@type': 'DataDownload',
        encodingFormat: 'application/json',
        contentUrl: `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${g.id}&parameterCd=00010`,
      },
    });
  }

  const others = siblings.filter((s) => s.id !== g.id);
  return head({ title, description: desc, canonical: ORIGIN + path, jsonLd })
+ `<div class="wrap">${crumbHtml(trail)}</div>

<header>
  <div class="wrap">
    <div class="eyebrow">USGS gage ${esc(g.id)} · ${esc(state.name)}</div>
    <h1 id="title">${esc(g.station)} Water Temperature</h1>
    <div class="sub" id="sub">On <a href="/river/${state.slug}/${river.slug}/">${esc(river.name)}</a>
      · <a href="https://waterdata.usgs.gov/monitoring-location/${esc(g.id)}/" target="_blank" rel="noopener">USGS page &#8599;</a></div>
  </div>
</header>

<div class="wrap">
  <p class="sr-only" id="status" role="status" aria-live="polite">Loading the last 7 days for this gage…</p>
  <div class="now" id="now" style="display:none;"></div>
  <div class="charts" id="charts">
    <div class="state"><div class="spinner"></div>Pulling the last 7 days…</div>
  </div>
</div>

<section class="wrap prose">
  <h2>Recent water temperature at ${esc(g.station)}</h2>
  <p>${summarySentence(river.name, state.name, g.stats)}</p>
  ${sparkline(g.stats, g.station)}
  ${statsTable(g.stats)}
  <h2>About this gage</h2>
  <p>${esc(g.station)} is USGS streamgage ${esc(g.id)}, on ${esc(river.name)} in ${esc(state.name)}.
  ${g.elevationFt != null ? `It sits at ${Math.round(g.elevationFt).toLocaleString()} ft, ` : ''}reporting
  water temperature as parameter 00010 every 15 to 60 minutes. This page reads that feed live and scores it
  against 65&deg;F, the temperature above which catch-and-release mortality climbs sharply for trout.</p>
  ${gageFacts(g)}
  ${nearby.length ? `<h2>Other water near ${esc(g.station)}</h2>
  <p>The nearest gages on other rivers, closest first, scored on the last ${DAYS} days against the
  65&deg;F threshold. On a hot week every one of them may be warm too &mdash; that is worth knowing before
  the drive, and the higher-elevation reaches are usually the last to go.</p>
  <ul class="linklist nearlist">${nearby.map((n) => {
    const v = periodVerdict(n.stats);
    return `<li><a href="/gage/${esc(n.id)}/">${esc(n.station)}</a>
      <span class="muted">on ${esc(n.river)} · ${Math.round(n.miles)} mi</span>
      ${v ? `<span class="badge ${v.cls}">${v.label}</span>` : '<span class="muted">no daily summaries</span>'}</li>`;
  }).join('')}</ul>` : ''}
  ${others.length ? `<h2>Other gages on ${esc(river.name)}</h2>
  <ul class="linklist">${others.map((s) => `<li><a href="/gage/${s.id}/">${esc(s.station)}</a>${s.elevationFt != null ? ` <span class="muted">${Math.round(s.elevationFt).toLocaleString()} ft</span>` : ''}</li>`).join('')}</ul>` : ''}
  <p class="more"><a href="/river/${state.slug}/${river.slug}/">All ${esc(river.name)} temperatures</a>
   · <a href="/rivers/${state.slug}/">All ${esc(state.name)} trout streams</a>
   · <a href="/?state=${esc(state.code)}">Live ${esc(state.name)} map</a></p>
</section>
`
+ foot(`<script>window.TROUT_GAGE=${jsonForScript({ site: g.id, name: g.station, state: state.code })};</script>
<script src="/assets/gage.js"></script>`);
}

// --- river page -------------------------------------------------------------

export function riverPage(river, state) {
  const path = `/river/${state.slug}/${river.slug}/`;
  const n = river.gages.length;
  const title = `${river.name} Water Temperature — ${state.name} | Live USGS Readings`;
  const agg = river.agg;
  const desc = agg && agg.days
    ? `Live ${river.name} water temperature in ${state.name} from ${n} USGS gage${n === 1 ? '' : 's'}. `
      + `Last ${agg.days} days: ${f1(agg.coldestF)}–${f1(agg.warmestF)}°F. Is it too warm to fish? Check before you go.`
    : `Live ${river.name} water temperature in ${state.name} from ${n} USGS gage${n === 1 ? '' : 's'}, `
      + `scored against the 65°F trout catch-and-release threshold.`;
  const trail = [
    { name: 'Rivers', path: '/rivers/' },
    { name: state.name, path: `/rivers/${state.slug}/` },
    { name: river.name, path },
  ];

  const verdict = agg && agg.days
    ? (agg.daysOver65 === 0
        ? `Over the last ${agg.days} days the ${esc(river.name)} has stayed under 65&deg;F, so it has been safe water for catch and release.`
        : `Over the last ${agg.days} days the ${esc(river.name)} broke 65&deg;F on ${agg.daysOver65} of them, so check the live reading below before you commit to a day on it.`)
    : `USGS has not published daily summaries for the ${esc(river.name)} recently. The live readings below come straight from the gages.`;

  const jsonLd = [breadcrumbs(trail), {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${ORIGIN}${path}#faq`,
    mainEntity: [
      {
        '@type': 'Question',
        name: `What is the water temperature of the ${river.name} right now?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `${n} USGS streamgage${n === 1 ? '' : 's'} report${n === 1 ? 's' : ''} water temperature on the ${river.name} in ${state.name}.`
            + (agg && agg.days
              ? ` Over the last ${agg.days} days ${n === 1 ? 'it' : 'they'} ran between ${f1(agg.coldestF)}°F and ${f1(agg.warmestF)}°F, averaging ${f1(agg.averageF)}°F.`
              : '')
            + ` This page reads ${n === 1 ? 'it' : 'them'} live every time it loads, so the number on it is the current reading, not a forecast.`,
        },
      },
      {
        '@type': 'Question',
        name: `Is the ${river.name} too warm to fish?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Above about 65°F trout cannot get the oxygen they need to recover from a fight, so a released fish may die hours later. `
            + (agg && agg.days
              ? (agg.daysOver65 === 0
                  ? `The ${river.name} has stayed under that line on every one of the last ${agg.days} days.`
                  : `The ${river.name} broke that line on ${agg.daysOver65} of the last ${agg.days} days.`)
              : ``)
            + ` Water is coldest just after dawn and warmest in late afternoon, so an early start buys you several degrees.`,
        },
      },
    ],
  }];

  const rows = river.gages.map((g) => {
    const s = g.stats;
    const period = periodVerdict(s);
    return `<tr>
      <th scope="row"><a href="/gage/${g.id}/">${esc(g.station)}</a>
        <span class="muted">${esc(g.id)}${g.elevationFt != null ? ` · ${Math.round(g.elevationFt).toLocaleString()} ft` : ''}</span></th>
      <td class="num live" data-live-gage="${esc(g.id)}"><span class="pending">&#8212;</span></td>
      <td class="num">${s && s.averageF != null ? `${f1(s.averageF)}&deg;F` : '<span class="muted">n/a</span>'}</td>
      <td class="num">${s && s.warmestF != null ? `${f1(s.warmestF)}&deg;F` : '<span class="muted">n/a</span>'}</td>
      <td>${period ? `<span class="badge ${period.cls}">${period.label}</span>` : '<span class="muted">no daily summaries</span>'}</td>
    </tr>`;
  }).join('\n');

  return head({ title, description: desc, canonical: ORIGIN + path, jsonLd })
+ `<div class="wrap">${crumbHtml(trail)}</div>

<header>
  <div class="wrap">
    <div class="eyebrow">${esc(state.name)} · ${n} USGS gage${n === 1 ? '' : 's'} reporting temperature</div>
    <h1>${esc(river.name)} Water Temperature</h1>
    <div class="sub">Live readings scored against the 65&deg;F trout catch-and-release threshold</div>
  </div>
</header>

<div class="wrap">
  <p class="sr-only" id="status" role="status" aria-live="polite">Loading live readings…</p>
  <p class="lede">${verdict}</p>

  <h2>Gages on the ${esc(river.name)}</h2>
  <div class="tablewrap">
  <table class="gages">
    <caption>Live reading, plus the last ${agg && agg.days ? agg.days : DAYS} days of USGS daily summaries. Highest gage first.</caption>
    <thead>
      <tr><th scope="col">Gage</th><th scope="col">Now</th><th scope="col">${DAYS}-day avg</th>
          <th scope="col">Warmest</th><th scope="col">Last ${DAYS} days</th></tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
  </div>
</div>

<section class="wrap prose">
  <h2>Is the ${esc(river.name)} too warm to fish?</h2>
  <p>${summarySentence(river.name, state.name, agg)}</p>
  ${sparkline(agg, river.name)}
  ${statsTable(agg)}
  <p>Above about 65&deg;F (18&deg;C) a trout cannot take up the oxygen it needs to clear the lactic acid
  a fight produces, so a fish that swims away strongly can still die hours later. Below 60&deg;F you are in
  good shape. Between 60 and 65&deg;F is the caution band, and on rainbow, cutthroat and brook water — whose
  angling threshold is nearer 61&deg;F — treat that band as the real limit.</p>
  <p>Water on the ${esc(river.name)} is coldest just after dawn and warmest in late afternoon, so a stretch
  that is borderline at 4pm is often well within range at 6am. Tailwaters below bottom-release dams and
  higher-elevation reaches hold their cold through a heat wave better than valley water does.</p>

  <h2>Where these numbers come from</h2>
  <p>The USGS operates streamgages that report water temperature as parameter 00010 every 15 to 60 minutes,
  published free. This page reads ${n === 1 ? 'the single gage' : `all ${n} gages`} on the ${esc(river.name)}
  in ${esc(state.name)} live, converts to &deg;F, and scores each against 65&deg;F. A gage measures the water passing that one point,
  so a reading can differ by several degrees from where you actually stand on the river.</p>
  <p class="more"><a href="/rivers/${state.slug}/">All ${esc(state.name)} trout streams</a>
   · <a href="/?state=${esc(state.code)}">Live ${esc(state.name)} map</a>
   · <a href="/rivers/">Every river we track</a></p>
</section>
`
+ foot(`<script src="/assets/live.js"></script>`);
}

// --- state index ------------------------------------------------------------

export function statePage(state, rivers, places = []) {
  const path = `/rivers/${state.slug}/`;
  const gageCount = rivers.reduce((n, r) => n + r.gages.length, 0);
  // Not "${state.name} River Water Temperatures": for Colorado, Montana and a
  // dozen others that is the name of an actual river with its own page, and the
  // two would compete for the same query.
  const title = `${state.name} Trout Streams — Live Water Temperature for ${rivers.length} Rivers`;
  const desc = `Live water temperature for ${rivers.length} rivers and creeks in ${state.name}, `
    + `read from ${gageCount} USGS streamgages and scored against the 65°F trout threshold.`;
  const trail = [{ name: 'Rivers', path: '/rivers/' }, { name: state.name, path }];

  const letters = new Map();
  for (const r of rivers) {
    const k = /^[A-Za-z]/.test(r.name) ? r.name[0].toUpperCase() : '#';
    if (!letters.has(k)) letters.set(k, []);
    letters.get(k).push(r);
  }

  const jsonLd = [breadcrumbs(trail), {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${ORIGIN}${path}#collection`,
    name: title,
    description: desc,
    about: { '@type': 'AdministrativeArea', name: state.name },
  }];

  return head({ title, description: desc, canonical: ORIGIN + path, jsonLd })
+ `<div class="wrap">${crumbHtml(trail)}</div>

<header>
  <div class="wrap">
    <div class="eyebrow">${gageCount} USGS gages · parameter 00010</div>
    <h1>Trout Stream Water Temperatures in ${esc(state.name)}</h1>
    <div class="sub">Every ${esc(state.name)} river and creek with a USGS gage reporting water temperature</div>
  </div>
</header>

<section class="wrap prose">
  <p class="lede">Pick a river for its live temperature, a month of daily highs, and how many of those days
  broke the 65&deg;F catch-and-release threshold. Or open the
  <a href="/?state=${esc(state.code)}">live ${esc(state.name)} map</a> to see every gage at once.</p>
</section>

<div class="wrap">
  <div class="alphaindex">${[...letters.keys()].map((k) => `<a href="#L${k}">${k}</a>`).join('')}</div>
  ${[...letters.entries()].map(([k, list]) => `<section class="alphablock">
    <h2 id="L${k}">${k}</h2>
    <ul class="rivergrid">
      ${list.map((r) => {
        const a = r.agg;
        const period = periodVerdict(a);
        return `<li><a href="/river/${state.slug}/${r.slug}/">${esc(r.name)}</a>
          <span class="muted">${r.gages.length} gage${r.gages.length === 1 ? '' : 's'}${a && a.averageF != null ? ` · ${f1(a.averageF)}&deg;F avg` : ''}</span>
          ${period ? `<span class="dot ${period.cls}" title="${period.label.replace(/&deg;/g, '\u00b0')}"></span>` : ''}</li>`;
      }).join('\n      ')}
    </ul>
  </section>`).join('\n  ')}
</div>

${places.length ? `<section class="wrap prose">
  <h2>Or start from a town</h2>
  <p>The nearest gages to where you are staying, closest first.</p>
  <ul class="rivergrid">
    ${places.map((pl) => `<li><a href="/near/${pl.slug}-${state.code}/">${esc(pl.name)}</a>
      <span class="muted">${pl.gages.length} gages</span></li>`).join('\n    ')}
  </ul>
</section>` : ''}

<section class="wrap prose">
  <p class="more"><a href="/rivers/">Every state we track</a>
   · <a href="/near/">Every town we cover</a>
   · <a href="/">Live dashboard</a></p>
</section>
`
+ foot();
}

// --- master index -----------------------------------------------------------

export function riversIndexPage(states) {
  const path = '/rivers/';
  const totalRivers = states.reduce((n, s) => n + s.rivers.length, 0);
  const totalGages = states.reduce((n, s) => n + s.gageCount, 0);
  const title = 'River Water Temperatures by State — Every Trout Stream We Track';
  const desc = `Live water temperature for ${totalRivers} rivers and creeks across ${states.length} states, `
    + `read from ${totalGages} USGS streamgages and scored against the 65°F trout threshold.`;
  const trail = [{ name: 'Rivers', path }];
  const jsonLd = [breadcrumbs(trail), {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${ORIGIN}${path}#collection`,
    name: title,
    description: desc,
  }];

  return head({ title, description: desc, canonical: ORIGIN + path, jsonLd })
+ `<div class="wrap">${crumbHtml(trail)}</div>

<header>
  <div class="wrap">
    <div class="eyebrow">${totalGages} USGS gages · ${totalRivers} rivers · ${states.length} states</div>
    <h1>River Water Temperatures by State</h1>
    <div class="sub">Every river and creek with a USGS gage reporting water temperature</div>
  </div>
</header>

<section class="wrap prose">
  <p class="lede">Each river has its own page: the live reading from every gage on it, a month of daily
  highs, and a count of how many of those days broke 65&deg;F — the temperature above which trout struggle
  to recover from being caught. Start with a state.</p>
</section>

<div class="wrap">
  <ul class="stategrid">
    ${states.map((s) => `<li>
      <a href="/rivers/${s.slug}/">${esc(s.name)}</a>
      <span class="muted">${s.rivers.length} rivers · ${s.gageCount} gages</span>
    </li>`).join('\n    ')}
  </ul>
</div>

<section class="wrap prose">
  <p class="more"><a href="/">Live dashboard and map</a></p>
</section>
`
+ foot();
}

// --- place page -------------------------------------------------------------

// The crawlable answer to "what is close to me". The dashboard's location mode
// needs a browser and a permission prompt; a search engine has neither, so the
// same question lives here as one URL per fishing town.
// A small map of the gages around a town, drawn at build time.
//
// No tiles and no JavaScript: these are the pages people land on cold from a
// search, and a map that needs a script and a round-trip to CARTO before it
// says anything is a map they never see. What matters here is not the coastline
// -- it is which way to drive and how far, and a plain projection answers that
// the moment the HTML arrives.
//
// North is up. The rings are miles from town, so distance is readable without a
// legend, and each dot carries its verdict colour so the shape of the problem
// ("everything downstream is warm, the two up the canyon are not") is visible
// before the table is read.
export function placeMap(place, state) {
  const gages = (place.gages || []).filter((g) => Number.isFinite(g.lat) && Number.isFinite(g.lon));
  if (gages.length < 2) return '';

  const latRad = (place.lat * Math.PI) / 180;
  // Equirectangular about the town: at this scale the error is far below the
  // width of a dot, and it keeps the projection to two multiplications.
  const pts = gages.map((g) => ({
    g,
    x: (g.lon - place.lon) * 69 * Math.cos(latRad),
    y: (g.lat - place.lat) * 69,
  }));

  // Frame the water, not the compass. Gages sit on rivers, and rivers run one
  // way out of a town — centring the town in a square leaves most of the frame
  // empty. The town keeps its true position inside the box, so the rings still
  // read as distance from it; they just run off the edge like range rings on a
  // real map.
  const reach = Math.max(0.5, ...pts.map((p) => Math.hypot(p.x, p.y)));
  let [x0, x1] = [Math.min(0, ...pts.map((p) => p.x)), Math.max(0, ...pts.map((p) => p.x))];
  let [y0, y1] = [Math.min(0, ...pts.map((p) => p.y)), Math.max(0, ...pts.map((p) => p.y))];
  // Clamp the shape to somewhere between 5:3 and square. Gages string out along
  // a river, so the raw extent is often a sliver -- and a town with two gages on
  // its doorstep and a third twenty miles downstream would otherwise frame as a
  // near-empty column taller than the text beside it. This is meant to be a
  // small map, so height never exceeds width, and the sparse case spends its
  // emptiness sideways where it costs the reader nothing.
  const widen = (a, b, want) => {
    const short = (want - (b - a)) / 2;
    return short > 0 ? [a - short, b + short] : [a, b];
  };
  const span = Math.max(x1 - x0, y1 - y0, 1);
  [x0, x1] = widen(x0, x1, span * 0.62);
  [y0, y1] = widen(y0, y1, span * 0.62);
  [x0, x1] = widen(x0, x1, y1 - y0);       // never taller than wide
  const margin = Math.max(x1 - x0, y1 - y0) * 0.11;
  [x0, x1, y0, y1] = [x0 - margin, x1 + margin, y0 - margin, y1 + margin];

  const W = 400;
  const scale = W / (x1 - x0);
  const H = Math.round((y1 - y0) * scale);
  const px = (x) => ((x - x0) * scale).toFixed(1);
  const py = (y) => ((y1 - y) * scale).toFixed(1);
  const tx = px(0), ty = py(0);

  // Two or three rings at a round number of miles, whatever the reach.
  const step = [1, 2, 5, 10, 20, 25, 50].find((s) => reach / s <= 3) || 50;
  const rings = [];
  for (let m = step; m <= reach + step * 0.01; m += step) rings.push(m);

  const dot = (p) => {
    const v = periodVerdict(p.g.stats);
    const label = `${p.g.station}, ${Math.round(p.g.miles)} miles`
      + (v ? `. ${v.label.replace(/&deg;/g, ' degrees ')}` : '. No recent daily summaries');
    return `<a href="/gage/${esc(p.g.id)}/">`
      + `<circle class="pin ${v ? v.cls : 'unknown'}" cx="${px(p.x)}" cy="${py(p.y)}" r="6"/>`
      + `<title>${esc(label)}</title></a>`;
  };

  return `<figure class="placemap">
  <svg viewBox="0 0 ${W} ${H}" role="img"
       aria-label="Map of the ${gages.length} gages nearest ${esc(place.name)}, ${esc(state.name)}. North is up; rings are ${step}-mile intervals from the town. The table below lists the same gages.">
    <g class="rings">${rings.map((m) => `<circle cx="${tx}" cy="${ty}" r="${(m * scale).toFixed(1)}"/>`).join('')}</g>
    <circle class="town" cx="${tx}" cy="${ty}" r="10"/>
    ${pts.map(dot).join('\n    ')}
    <text class="townlabel" x="${tx}" y="${(Number(ty) + 26).toFixed(1)}" text-anchor="middle">${esc(place.name)}</text>
    <g class="compass"><text x="14" y="22">N</text><path d="M14 26 L14 40 M10.5 29.5 L14 26 L17.5 29.5"/></g>
  </svg>
  <figcaption>The ${gages.length} nearest gages to ${esc(place.name)}, north up, rings every ${step} miles from town.
    Colour is the last ${DAYS} days against the 65&deg;F threshold; grey is a gage with no recent daily summaries.</figcaption>
</figure>`;
}

export function placePage(place, state) {
  const path = `/near/${place.slug}-${state.code}/`;
  const n = place.gages.length;
  // Towns whose gage list had converged on this one. They no longer have pages
  // of their own, so this page has to carry their names or the search term goes
  // nowhere: naming them here is the whole reason merging is not just deletion.
  const radius = place.radiusMi || PLACE_RADIUS_MI;
  const aliases = place.aliases || [];
  const aliasNames = aliases.map((a) => a.name);
  const alsoCovers = aliasNames.length ? listSentence(aliasNames) : '';
  const withStats = place.gages.filter((g) => g.stats && g.stats.days);
  const coldest = withStats
    .filter((g) => g.stats.averageF != null)
    .sort((a, b) => a.stats.averageF - b.stats.averageF)[0] || null;
  const overCount = withStats.filter((g) => g.stats.daysOver65 > 0).length;

  const title = `Water Temperature near ${place.name}, ${state.name} — ${n} Live USGS Gages`;
  const covers = alsoCovers ? ` Also covers ${alsoCovers}.` : '';
  const desc = coldest
    ? `Live water temperature for the ${n} nearest trout gages to ${place.name}, ${state.name}. `
      + `Coldest recently: ${coldest.river} at ${f1(coldest.stats.averageF)}°F.${covers}`
    : `Live water temperature for the ${n} nearest trout gages to ${place.name}, ${state.name}, `
      + `scored against the 65°F catch-and-release threshold.${covers}`;

  const trail = [
    { name: 'Rivers', path: '/rivers/' },
    { name: state.name, path: `/rivers/${state.slug}/` },
    { name: `Near ${place.name}`, path },
  ];

  const jsonLd = [breadcrumbs(trail), {
    '@context': 'https://schema.org',
    '@type': 'Place',
    '@id': `${ORIGIN}${path}#place`,
    name: `${place.name}, ${state.name}`,
    geo: { '@type': 'GeoCoordinates', latitude: Number(place.lat.toFixed(4)), longitude: Number(place.lon.toFixed(4)) },
    containedInPlace: { '@type': 'AdministrativeArea', name: state.name },
  }, {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${ORIGIN}${path}#faq`,
    mainEntity: [{
      '@type': 'Question',
      name: `Where can I fish near ${place.name}, ${state.name} right now?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: `${n} USGS gages within ${radius} miles of ${place.name} report water temperature.`
          + (alsoCovers ? ` The same water is the closest cold water to ${alsoCovers}.` : '')
          + (coldest ? ` Over the last ${coldest.stats.days} days the coldest of them was ${coldest.river}, averaging ${f1(coldest.stats.averageF)}°F.` : '')
          + ` This page reads all of them live, so you can pick a cold stretch before you drive out.`,
      },
    }, {
      '@type': 'Question',
      name: `Is the water near ${place.name} too warm to fish?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: `Above about 65°F trout cannot get the oxygen they need to recover from a fight.`
          + (withStats.length
              ? ` Of the ${withStats.length} gages near ${place.name} with recent daily summaries, ${overCount} broke 65°F at least once in the last ${DAYS} days.`
              : '')
          + ` Water is coldest just after dawn, and higher-elevation reaches hold their cold longest.`,
      },
    }],
  }];

  const rows = place.gages.map((g) => {
    const st = g.stats;
    const period = periodVerdict(st);
    return `<tr>
      <th scope="row"><a href="/gage/${g.id}/">${esc(g.station)}</a>
        <span class="muted">on <a href="/river/${state.slug}/${g.riverSlug}/">${esc(g.river)}</a>${g.elevationFt != null ? ` · ${Math.round(g.elevationFt).toLocaleString()} ft` : ''}</span></th>
      <td class="num">${Math.round(g.miles)} mi</td>
      <td class="num live" data-live-gage="${esc(g.id)}"><span class="pending">&#8212;</span></td>
      <td class="num">${st && st.averageF != null ? `${f1(st.averageF)}&deg;F` : '<span class="muted">n/a</span>'}</td>
      <td>${period ? `<span class="badge ${period.cls}">${period.label}</span>` : '<span class="muted">no daily summaries</span>'}</td>
    </tr>`;
  }).join('\n');

  // The rivers in reach, which is how someone plans a day rather than a cast.
  const rivers = [...new Map(place.gages.map((g) => [g.riverSlug, g])).values()]
    .sort((a, b) => a.miles - b.miles);

  return head({ title, description: desc, canonical: ORIGIN + path, jsonLd })
+ `<div class="wrap">${crumbHtml(trail)}</div>

<header>
  <div class="wrap">
    <div class="eyebrow">${esc(state.name)} · ${n} gage${n === 1 ? '' : 's'} within ${radius} miles</div>
    <h1>Water Temperature near ${esc(place.name)}, ${esc(state.name)}</h1>
    <div class="sub">The nearest USGS gages, closest first, scored against the 65&deg;F trout threshold</div>
    ${alsoCovers ? `<p class="alsocovers">Also the closest cold water to ${esc(alsoCovers)}.</p>` : ''}
  </div>
</header>

<div class="wrap">
  <p class="sr-only" id="status" role="status" aria-live="polite">Loading live readings…</p>
  <p class="lede">${coldest
    ? `Over the last ${coldest.stats.days} days the coldest water within ${radius} miles of ${esc(place.name)} `
      + `was ${esc(coldest.river)}, averaging ${f1(coldest.stats.averageF)}&deg;F. `
      + `${overCount === 0
          ? `None of the gages here broke the 65&deg;F threshold in that time.`
          : `${overCount} of the ${withStats.length} gages with recent summaries broke 65&deg;F at least once.`}`
    : `USGS has not published recent daily summaries for the gages near ${esc(place.name)}. The live readings below come straight from them.`}</p>

  ${placeMap(place, state)}

  <h2>Nearest gages to ${esc(place.name)}</h2>
  <div class="tablewrap">
  <table class="gages">
    <caption>The ${n} closest of the gages within ${radius} miles, nearest first. Distances are from
      ${esc(place.name)}; the live column reads USGS when this page loads.</caption>
    <thead>
      <tr><th scope="col">Gage</th><th scope="col">Distance</th><th scope="col">Now</th>
          <th scope="col">${DAYS}-day avg</th><th scope="col">Last ${DAYS} days</th></tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
  </div>
</div>

<section class="wrap prose">
  <h2>Rivers within reach of ${esc(place.name)}</h2>
  <ul class="linklist">${rivers.map((g) => `<li><a href="/river/${state.slug}/${g.riverSlug}/">${esc(g.river)}</a> <span class="muted">${Math.round(g.miles)} mi</span></li>`).join('')}</ul>

  <h2>Planning a day near ${esc(place.name)}</h2>
  <p>Water is coldest just after dawn and warmest in late afternoon, so a stretch that is borderline at 4pm
  is often well within range at 6am. Where several of these gages are close together, the higher-elevation
  one is usually the colder, and tailwaters below bottom-release dams hold their cold through a heat wave
  better than valley water does.</p>
  <p>A gage measures the water passing one point. A reading can differ by several degrees from where you
  actually stand, so treat these as a guide to which drainage to drive to rather than a promise about a
  particular run. Check your state agency for current regulations and any voluntary closures.</p>
  <p class="more"><a href="/rivers/${state.slug}/">All ${esc(state.name)} trout streams</a>
   · <a href="/near/">Every town we cover</a>
   · <a href="/?state=${esc(state.code)}">Live ${esc(state.name)} map</a></p>
</section>
`
+ foot(`<script src="/assets/live.js"></script>`);
}

// A town whose gage list turned out to be the same water as a neighbour's.
//
// The URL stays alive because it was published and may be linked, but it does
// not repeat the table: the canonical points at the page that does, so the two
// are scored as one page rather than competing with each other. Left out of the
// sitemap for the same reason — a crawler should be spending its budget on the
// page that has the content.
export function placeAliasPage(alias, primary, state) {
  const path = `/near/${alias.slug}-${state.code}/`;
  const target = `/near/${primary.slug}-${state.code}/`;
  const title = `Water Temperature near ${alias.name}, ${state.name}`;
  const desc = `The nearest trout gages to ${alias.name}, ${state.name} are the same ones we list for `
    + `${primary.name}. Live USGS water temperature, scored against the 65°F threshold.`;

  const trail = [
    { name: 'Rivers', path: '/rivers/' },
    { name: state.name, path: `/rivers/${state.slug}/` },
    { name: `Near ${alias.name}`, path },
  ];

  return head({
    title,
    description: desc,
    canonical: ORIGIN + target,
    jsonLd: [breadcrumbs(trail)],
  })
+ `<div class="wrap">${crumbHtml(trail)}</div>

<header>
  <div class="wrap">
    <div class="eyebrow">${esc(state.name)}</div>
    <h1>Water Temperature near ${esc(alias.name)}, ${esc(state.name)}</h1>
    <div class="sub">The same water we track for ${esc(primary.name)}</div>
  </div>
</header>

<section class="wrap prose">
  <p class="lede">Every USGS gage within reach of ${esc(alias.name)} is also within reach of
  ${esc(primary.name)}, so rather than print the same table twice we keep one page for both.</p>
  <p class="more"><a href="${target}">Water temperature near ${esc(primary.name)}, ${esc(state.name)}</a>
   · <a href="/rivers/${state.slug}/">All ${esc(state.name)} trout streams</a>
   · <a href="/near/">Every town we cover</a></p>
</section>
`
+ foot();
}

// --- places index -----------------------------------------------------------

export function placesIndexPage(states) {
  const path = '/near/';
  const total = states.reduce((n, s) => n + s.places.length, 0);
  const title = `Trout Water Temperatures by Town — ${total} Places`;
  const desc = `Live trout water temperature for the nearest gages to ${total} towns `
    + `across ${states.length} states, scored against the 65°F catch-and-release threshold.`;
  const trail = [{ name: 'Near a town', path }];
  const jsonLd = [breadcrumbs(trail), {
    '@context': 'https://schema.org', '@type': 'CollectionPage',
    '@id': `${ORIGIN}${path}#collection`, name: title, description: desc,
  }];

  return head({ title, description: desc, canonical: ORIGIN + path, jsonLd })
+ `<div class="wrap">${crumbHtml(trail)}</div>

<header>
  <div class="wrap">
    <div class="eyebrow">${total} towns · ${states.length} states</div>
    <h1>Trout Water Temperatures by Town</h1>
    <div class="sub">The nearest USGS gages to where you are staying, closest first</div>
  </div>
</header>

<section class="wrap prose">
  <p class="lede">The dashboard can find what is closest to you if you let it read your location.
  These are the same lists, one per town, for when you are planning a trip rather than standing in one.</p>
</section>

<div class="wrap">
  ${states.filter((s) => s.places.length).map((s) => `<section class="alphablock">
    <h2 id="S${s.slug}">${esc(s.name)}</h2>
    <ul class="rivergrid">
      ${s.places.map((pl) => `<li><a href="/near/${pl.slug}-${s.code}/">${esc(pl.name)}</a>
        <span class="muted">${pl.gages.length} gages</span>${(pl.aliases || []).length
          ? `<span class="muted alsolist">also ${esc(listSentence(pl.aliases.map((a) => a.name)))}</span>`
          : ''}</li>`).join('\n      ')}
    </ul>
  </section>`).join('\n  ')}
</div>

<section class="wrap prose">
  <p class="more"><a href="/rivers/">Every river we track</a> · <a href="/">Live dashboard</a></p>
</section>
`
+ foot();
}
