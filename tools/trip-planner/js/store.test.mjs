import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schema = JSON.parse(readFileSync(new URL('../schema/trip.schema.json', import.meta.url), 'utf8'));
const samples = {
  sardegna: JSON.parse(readFileSync(new URL('../samples/sardegna.json', import.meta.url), 'utf8')),
  portugal: JSON.parse(readFileSync(new URL('../samples/portugal-6-day-demo.json', import.meta.url), 'utf8'))
};
const samplePaths = {
  sardegna: '/samples/sardegna.json',
  portugal: '/samples/portugal-6-day-demo.json'
};
let moduleId = 0;

async function isolatedStore(t, initialData = null) {
  const originalFetch = globalThis.fetch;
  const originalStorage = globalThis.localStorage;
  const values = new Map();
  if (initialData) values.set('trip-planner:v4', JSON.stringify(initialData));
  const requests = [];
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
  globalThis.fetch = async (input) => {
    const pathname = new URL(input).pathname;
    requests.push(pathname);
    if (pathname.endsWith('/schema/trip.schema.json')) return { ok: true, json: async () => structuredClone(schema) };
    const sampleName = Object.keys(samplePaths).find((name) => pathname.endsWith(samplePaths[name]));
    if (sampleName) return { ok: true, json: async () => structuredClone(samples[sampleName]) };
    return { ok: false, json: async () => ({}) };
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  });
  const store = await import(`./store.js?isolated=${++moduleId}`);
  return { store, requests, values };
}

test('a fresh browser library starts empty and does not fetch a sample', async (t) => {
  const { store, requests, values } = await isolatedStore(t);
  await store.init();
  assert.deepEqual(store.list(), []);
  assert.equal(store.active(), undefined);
  assert.equal(requests.length, 1);
  assert.ok(requests[0].endsWith('/schema/trip.schema.json'));
  assert.deepEqual(JSON.parse(values.get('trip-planner:v4')).order, []);
});

test('initialization preserves an already saved active trip', async (t) => {
  const trip = structuredClone(samples.sardegna);
  const initial = { order: [trip.id], trips: { [trip.id]: trip }, meta: {}, activeId: trip.id };
  const { store, requests } = await isolatedStore(t, initial);
  await store.init();
  assert.equal(store.active().id, trip.id);
  assert.equal(store.list().length, 1);
  assert.equal(requests.length, 1);
  assert.ok(requests[0].endsWith('/schema/trip.schema.json'));
});

test('both bundled samples load only when explicitly requested', async (t) => {
  const { store, requests } = await isolatedStore(t);
  await store.init();
  assert.deepEqual(store.list(), []);
  const sardegnaResult = await store.importSample('sardegna');
  assert.equal(sardegnaResult.ok, true);
  assert.equal(store.active().id, samples.sardegna.id);
  assert.equal(store.list()[0].preset, true);
  const portugalResult = await store.importSample('portugal');
  assert.equal(portugalResult.ok, true);
  assert.equal(store.active().id, samples.portugal.id);
  assert.equal(store.list()[1].preset, false);
  assert.deepEqual(store.list().map((trip) => trip.id), [samples.sardegna.id, samples.portugal.id]);
  assert.ok(requests.some((path) => path.endsWith(samplePaths.sardegna)));
  assert.ok(requests.some((path) => path.endsWith(samplePaths.portugal)));
});

test('sample loader rejects names outside the shipped allowlist', async (t) => {
  const { store, requests } = await isolatedStore(t);
  await store.init();
  await assert.rejects(store.importSample('unknown'), /available sample trips/);
  assert.equal(requests.length, 1);
  assert.ok(requests[0].endsWith('/schema/trip.schema.json'));
});
