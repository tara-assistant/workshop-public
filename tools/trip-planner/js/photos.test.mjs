import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhotoFinder } from './photos.mjs';
import { createGeo } from '../mcp/geo.mjs';
import { createToolHandler, TOOLS } from '../mcp/server.mjs';
import { defaults } from './providers.mjs';

const args = { name: 'La Cinta Beach', lat: 40.8, lon: 9.7, wikipedia: defaults.wikipedia, commons: defaults.commons };
const file = (id, overrides = {}) => ({ title: `File:Beach ${id}.jpg`, imageinfo: [{
  mime: 'image/jpeg', thumburl: `https://upload.wikimedia.org/beach-${id}.jpg`, descriptionurl: `https://commons.wikimedia.org/wiki/File:Beach_${id}.jpg`,
  extmetadata: { Artist: { value: '<a href="https://example.com">Test &amp; Author</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } }, ...overrides
}] });
const response = (pages) => ({ query: { pages: Object.fromEntries(pages.map((page, i) => [i, page])) } });

test('photo discovery uses nearby page images and Commons metadata, deduplicates and caches four candidates', async () => {
  const calls = [];
  let time = 0;
  const finder = createPhotoFinder(async (value) => {
    const url = new URL(value); calls.push(url);
    assert.equal(url.searchParams.get('origin'), '*');
    if (url.hostname === 'en.wikipedia.org') {
      assert.equal(url.searchParams.get('ggscoord'), '40.8|9.7');
      return response([{ title: 'La Cinta', pageimage: 'Beach 1.jpg' }]);
    }
    if (url.searchParams.has('titles')) return response([file(1)]);
    assert.equal(url.searchParams.get('ggsnamespace'), '6');
    return response([file(1), file(2), file(3), file(4), file(5)]);
  }, { now: () => time });
  const [a, b] = await Promise.all([finder(args), finder(args)]);
  assert.deepEqual(a, b);
  assert.equal(a.length, 4);
  assert.equal(a[0].imageCredit, 'Test & Author, CC BY-SA 4.0');
  assert.equal(a[0].imageUrl, 'https://upload.wikimedia.org/beach-1.jpg');
  assert.match(a[0].sourceUrl, /commons\.wikimedia/);
  await finder(args);
  assert.equal(calls.length, 3);
  time = 86400001;
  await finder(args);
  assert.equal(calls.length, 6);
});

test('photo discovery omits unsafe URLs, missing credit and non-photo files and degrades across providers', async () => {
  const finder = createPhotoFinder(async (value) => {
    if (new URL(value).hostname === 'en.wikipedia.org') throw new Error('Unavailable');
    return response([file(1, { mime: 'image/svg+xml' }), file(2, { extmetadata: {} }),
      file(3, { thumburl: 'javascript:alert(1)' }), file(4, { descriptionurl: 'http://example.com' }), file(5)]);
  });
  assert.deepEqual((await finder(args)).map((item) => item.imageUrl), ['https://upload.wikimedia.org/beach-5.jpg']);
  const broken = createPhotoFinder(async () => { throw new Error('Offline'); });
  await assert.rejects(broken(args), /unavailable/);
  await assert.rejects(finder({ ...args, lat: NaN }), /coordinates/);
  await assert.rejects(finder({ ...args, name: '' }), /name/);
});

test('read only MCP photo tool returns candidates without touching trip storage and respects offline mode', async () => {
  const geo = createGeo({ offline: () => false, fetchFn: async (url) => ({ ok: true, json: async () =>
    new URL(url).hostname === 'en.wikipedia.org' ? response([]) : response([file(1)]) }) });
  const handler = createToolHandler(new Proxy({}, { get: () => { throw new Error('Storage must not be accessed'); } }), geo);
  const rows = await handler('find_stop_photo', { name: args.name, lat: args.lat, lon: args.lon });
  assert.equal(rows.length, 1);
  assert.match(TOOLS.find((tool) => tool.name === 'find_stop_photo').description, /Read only/);
  await assert.rejects(handler('find_stop_photo', { name: 'Beach', lat: 999, lon: 9 }), /Invalid tool arguments/);
  const offline = createGeo({ offline: () => true, fetchFn: () => { throw new Error('No requests'); } });
  assert.throws(() => offline.findStopPhoto({ name: 'Beach', lat: 40, lon: 9 }), /offline/);
});
