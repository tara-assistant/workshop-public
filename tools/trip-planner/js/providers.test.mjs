import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, normalizeProviders, validateProviderUrl } from './providers.mjs';

test('provider endpoints accept HTTPS and local HTTP', () => {
  for (const url of ['https://example.com/search', 'http://localhost:8080/search', 'http://127.0.0.1:8080/v1/forecast']) {
    assert.equal(validateProviderUrl(url), url);
  }
  assert.equal(validateProviderUrl('  https://example.com/search/  '), 'https://example.com/search');
});

test('provider endpoints refuse remote HTTP, unsafe schemes and endpoint extras', () => {
  for (const url of ['', null, {}, '/search', 'http://example.com', 'http://localhost.example.com',
    'http://127.0.0.2', 'javascript:alert(1)', 'file:///tmp/x', 'ftp://example.com',
    'https://user:pass@example.com', 'https://example.com/?key=x', 'https://example.com/#x']) {
    assert.equal(validateProviderUrl(url), null, String(url));
  }
});

test('configuration copies defaults and validates every adapter without mutation', () => {
  const config = normalizeProviders();
  assert.deepEqual(config, defaults);
  config.routing.driving = 'http://localhost:8080/route/v1/driving';
  assert.notEqual(config.routing.driving, defaults.routing.driving);
  assert.equal(normalizeProviders(config).routing.driving, config.routing.driving);
  for (const key of ['search', 'forecast', 'archive', 'elevation', 'marine']) {
    assert.throws(() => normalizeProviders({ ...defaults, [key]: 'http://remote.test' }));
  }
  for (const mode of ['driving', 'walking', 'cycling']) {
    assert.throws(() => normalizeProviders({ ...defaults, routing: { ...defaults.routing, [mode]: 'http://remote.test' } }));
  }
  assert.throws(() => normalizeProviders(null));
});
