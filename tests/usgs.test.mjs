import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onlyStreams } from '../build/usgs.mjs';

// The instantaneous-values service answers with everything reporting parameter
// 00010 in a state, which is not the same question as "where is there a trout
// stream". Groundwater wells report water temperature too, and a well named
// "29N.12W.22.1321A BLM-15 CRN WELL" parses into a river of that name — which is
// how the site came to publish a hundred pages titled "... Well River".

const gageMap = (...ids) => new Map(ids.map((id) => [id, { id }]));
const siteMap = (...ids) => new Map(ids.map((id) => [id, { elevationFt: 1 }]));

test('gages USGS does not type as streams are left out', () => {
  const kept = onlyStreams(gageMap('09010500', 'LGRB-Poly25', '402114105350101'),
                           siteMap('09010500', '402114105350101'));
  assert.deepEqual([...kept.keys()], ['09010500', '402114105350101']);
});

test('an empty site list publishes everything rather than nothing', () => {
  // A build that silently ships zero pages for a state is worse than one that
  // ships a few wells: the first looks like success and deletes the state.
  const gages = gageMap('09010500', 'LGRB-Poly25');
  assert.equal(onlyStreams(gages, new Map()).size, 2);
  assert.equal(onlyStreams(gages, null).size, 2);
  assert.equal(onlyStreams(gages, undefined).size, 2);
});

test('filtering keeps the gage objects intact', () => {
  const gages = new Map([['1', { id: '1', rawName: 'BIG THOMPSON NR ESTES PARK, CO' }]]);
  const kept = onlyStreams(gages, siteMap('1'));
  assert.equal(kept.get('1').rawName, 'BIG THOMPSON NR ESTES PARK, CO');
});
