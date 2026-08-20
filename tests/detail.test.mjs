import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDetail } from './harness.mjs';

// Loaded without a ?site=, so the page takes its "no gage specified" branch
// and never reaches for the network.
const detail = () => loadDetail().api;

const series = (code, values) => ({
  sourceInfo: { siteName: 'TEST GAGE', siteCode: [{ value: '06701900' }] },
  variable: { variableCode: [{ value: code }] },
  values: [{ value: values.map(v => ({ value: String(v), dateTime: '2026-08-20T12:00:00.000-06:00' })) }],
});

const points = (...vals) => vals.map((v, i) => ({ t: new Date(1755000000000 + i * 3600000), v }));

test('the verdict flips at the 65F threshold', () => {
  const api = detail();
  assert.equal(api.classifyF(59.9), 'safe');
  assert.equal(api.classifyF(60), 'caution');
  assert.equal(api.classifyF(65), 'danger');
  assert.equal(api.verdictText('danger'), 'Not safe for trout');
});

test('groupByCode keys readings by USGS parameter code', () => {
  const api = detail();
  const byCode = api.groupByCode([series('00010', [12.1, 12.4]), series('00060', [250, 245])]);
  assert.deepEqual(Object.keys(byCode).sort(), ['00010', '00060']);
  assert.equal(byCode['00010'].length, 2);
  assert.equal(byCode['00010'][1].raw, 12.4);
  assert.ok(byCode['00010'][0].t instanceof Date);
});

test('groupByCode drops no-data sentinels and unparseable values', () => {
  const api = detail();
  const byCode = api.groupByCode([series('00010', [-999999, 11.2, 'Ice'])]);
  assert.deepEqual(byCode['00010'].map(p => p.raw), [11.2]);
});

test('a parameter with nothing usable is left out entirely', () => {
  const api = detail();
  const byCode = api.groupByCode([series('63680', [-999999]), series('00010', [10])]);
  assert.deepEqual(Object.keys(byCode), ['00010']);
});

test('groupByCode tolerates an empty series list', () => {
  const api = detail();
  assert.deepEqual(api.groupByCode([]), {});
  assert.deepEqual(api.groupByCode(undefined), {});
});

test('chart scaling spans the full plot area', () => {
  const api = detail();
  const data = points(50, 55, 58);
  const { sx, sy, xMin, xMax, yMin, yMax } = api.chartScales({ dp: 1 }, data, api.CHART);
  const { W, H, padL, padR, padT, padB } = api.CHART;
  assert.equal(sx(xMin), padL);
  assert.equal(sx(xMax), W - padR);
  assert.ok(Math.abs(sy(yMax) - padT) < 1e-9);
  assert.ok(Math.abs(sy(yMin) - (H - padB)) < 1e-9);
  // y is inverted: a warmer reading sits higher on the chart.
  assert.ok(sy(58) < sy(50));
});

test('the temperature chart always makes room for the 65F line', () => {
  const api = detail();
  const cold = points(44, 46, 45);        // never near the threshold
  const { yMax, sy } = api.chartScales({ dp: 1, threshold: 65 }, cold, api.CHART);
  assert.ok(yMax >= 65, 'threshold must fall inside the y range');
  const y = sy(65);
  assert.ok(y >= 0 && y <= api.CHART.H);
});

test('a flat series still produces a usable scale', () => {
  const api = detail();
  const { sy, yMin, yMax } = api.chartScales({ dp: 1 }, points(60, 60, 60), api.CHART);
  assert.ok(yMax > yMin);
  assert.ok(Number.isFinite(sy(60)));
  // A flat line lands mid-chart rather than collapsing onto an axis.
  assert.ok(Math.abs(sy(60) - (api.CHART.padT + (api.CHART.H - api.CHART.padT - api.CHART.padB) / 2)) < 1e-6);
});

test('a single reading does not divide by zero', () => {
  const api = detail();
  const { sx, sy } = api.chartScales({ dp: 1 }, points(51), api.CHART);
  assert.ok(Number.isFinite(sx(1755000000000)));
  assert.ok(Number.isFinite(sy(51)));
});

test('the temperature card draws the threshold and labels the latest reading', () => {
  const api = detail();
  const tempParam = api.PARAMS.find(p => p.code === '00010');
  const html = api.chartCard(tempParam, points(10, 12, 18.3).map(p => ({ t: p.t, v: tempParam.convert(p.v) })));
  assert.match(html, /65°F trout threshold/);
  assert.match(html, /latest 64\.9 °F/);
  assert.match(html, /class="plot temp"/);
  assert.match(html, /aria-label="Water temperature over the last 7 days/);
  assert.ok(!html.includes('NaN'), 'no NaN should reach the SVG path');
});

test('every chart path is finite for a week of realistic readings', () => {
  const api = detail();
  const week = Array.from({ length: 7 * 24 }, (_, i) => ({
    t: new Date(1755000000000 + i * 3600000),
    v: 12 + Math.sin(i / 6) * 3,
  }));
  for (const p of api.PARAMS) {
    const html = api.chartCard(p, week);
    assert.ok(!html.includes('NaN'), `${p.label} produced NaN`);
    assert.match(html, /<path class="plot/);
  }
});
