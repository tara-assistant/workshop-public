import test from 'node:test';
import assert from 'node:assert/strict';
import { googlePoint, googleDirections, stopMapLinks, safeUrl } from './util.js';

test('map URLs carry coordinates and the requested travel mode as plain links', () => {
  assert.equal(googlePoint(40.8, 9.7), 'https://www.google.com/maps/search/?api=1&query=40.8,9.7');
  for (const mode of ['driving', 'walking', 'transit']) {
    assert.equal(googleDirections(40.8, 9.7, mode), `https://www.google.com/maps/dir/?api=1&destination=40.8,9.7&travelmode=${mode}`);
  }
  assert.match(googleDirections(40, 9, 'cycling'), /travelmode=bicycling$/);
  assert.match(googleDirections(40, 9, 'invalid'), /travelmode=driving$/);
  assert.equal(stopMapLinks(40, 9, 'walking').length, 4);
  for (const [choice, hostname] of [['osm', 'www.openstreetmap.org'], ['google', 'www.google.com']]) {
    const links = stopMapLinks(40, 9, 'walking', choice);
    assert.equal(links.length, 2);
    assert.ok(links.every((link) => new URL(link.url).hostname === hostname && safeUrl(link.url)));
  }
  assert.deepEqual(stopMapLinks(NaN, 9), []);
  assert.deepEqual(stopMapLinks(91, 9), []);
  assert.equal(safeUrl('javascript:alert(1)'), null);
});
