import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhotoFinder, acceptsAutoPhoto, photoNameScore, canApplyAutoPhoto } from './photos.mjs';
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

test('automatic photos accept clear name matches and reject mere proximity or generic titles', () => {
  const candidate = (title) => ({ imageUrl: 'https://upload.wikimedia.org/photo.jpg', imageCredit: 'Author, CC BY-SA', matchTitle: title, nameScore: photoNameScore('La Cinta Beach', title) });
  assert.equal(acceptsAutoPhoto('La Cinta Beach', candidate('File:La Cinta Beach at sunset.jpg')), true);
  assert.equal(acceptsAutoPhoto('La Cinta Beach', candidate('File:Nearby harbour.jpg')), false);
  assert.equal(acceptsAutoPhoto('La Cinta Beach', candidate('File:Beach 1.jpg')), false);
  assert.equal(acceptsAutoPhoto('La Cinta Beach', candidate('File:Cintarella.jpg')), false);
  assert.equal(acceptsAutoPhoto('Beach', candidate('File:Beach.jpg')), false);
  assert.equal(photoNameScore('Capo Testa', 'File:Capo from nearby.jpg'), .5);
  assert.equal(acceptsAutoPhoto('Capo Testa', { ...candidate('Capo'), nameScore: 1 }), false);
});

test('late photo results do not overwrite edits, changed coordinates or deleted stops', () => {
  const snapshot = { name: 'La Cinta', lat: 40, lon: 9 };
  assert.equal(canApplyAutoPhoto({ ...snapshot }, snapshot), true);
  assert.equal(canApplyAutoPhoto(null, snapshot), false);
  assert.equal(canApplyAutoPhoto({ ...snapshot, imageUrl: 'https://example.com/manual.jpg' }, snapshot), false);
  assert.equal(canApplyAutoPhoto({ ...snapshot, lat: 41 }, snapshot), false);
  assert.equal(canApplyAutoPhoto({ ...snapshot, name: 'Other' }, snapshot), false);
});
