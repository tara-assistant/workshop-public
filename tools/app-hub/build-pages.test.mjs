import assert from 'node:assert/strict';
import test from 'node:test';
import { hostingHeaders } from './build-pages.mjs';
import { sharedUiSources, versionedAsset } from './release-inputs.mjs';

const manifest = () => ({ schemaVersion: 1, assets: Object.fromEntries(sharedUiSources.map(name => [name, versionedAsset(name, Buffer.from(`/* ${name} */\n`))])) });

test('only the four content-hashed shared assets receive anonymous private-origin CORS', () => {
  const m = manifest();
  const text = hostingHeaders(m);
  assert.equal(text.split('Access-Control-Allow-Origin: https://private.projects.metaengineershub.com').length - 1, 4);
  assert.equal(text.split('Cache-Control: public, max-age=31536000, immutable').length - 1, 4);
  assert.equal(text.split('X-Content-Type-Options: nosniff').length - 1, 4);
  for (const [name, asset] of Object.entries(m.assets)) {
    const type = name.endsWith('.mjs') ? 'text/javascript' : 'text/css';
    assert(text.includes(`/${asset.path}\n  Access-Control-Allow-Origin:`));
    assert(text.includes(`Content-Type: ${type}; charset=utf-8`));
  }
  assert(text.startsWith('/assets/ui-manifest.json\n  Cache-Control: no-cache\n'));
  assert.doesNotMatch(text, /Allow-Credentials|catalog\.json|station-flow|digital-health|api[_-]?key|\*/);
});

for (const [label, change] of [
  ['missing asset', m => delete m.assets['app-cards.mjs']],
  ['extra asset', m => { m.assets['unknown.css'] = m.assets['app-cards.css']; }],
  ['unpinned path', m => { m.assets['app-cards.css'].path = 'assets/app-cards.css'; }],
  ['header injection', m => { m.assets['app-cards.css'].path += '\n  Set-Cookie: unsafe'; }],
  ['path escape', m => { m.assets['app-cards.css'].path = '../private/index.html'; }],
  ['weak hash', m => { m.assets['app-cards.css'].integrity = 'sha256-abc'; }],
  ['wrong schema', m => { m.schemaVersion = 2; }]
]) {
  test(`hosting headers reject ${label}`, () => {
    const m = manifest();
    change(m);
    assert.throws(() => hostingHeaders(m));
  });
}
