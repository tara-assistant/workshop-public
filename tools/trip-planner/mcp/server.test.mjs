import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createGeo } from './geo.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const expectedNames = ['list_trips', 'get_trip', 'validate_trip', 'save_trip', 'delete_trip', 'add_stop',
  'update_stop', 'remove_stop', 'add_day', 'find_stop_photo', 'search_place', 'route_between', 'get_weather'];
const sample = JSON.parse(await readFile(new URL('../samples/sardegna.json', import.meta.url), 'utf8'));
const fixture = () => ({ schema: 1, id: 'test-trip', title: 'Trip test', extra: { preserved: true },
  phases: [{ id: 'first', title: 'First phase', days: [{ dayNumber: 1, title: 'First day', stops: [] }] }] });
const stop = { id: 'sample-stop', name: sample.phases[0].days[0].stops[0].name,
  lon: sample.phases[0].days[0].stops[0].lon, lat: sample.phases[0].days[0].stops[0].lat,
  source: 'Worked sample fixture, not a new place lookup', extraStop: { preserved: true } };

async function launch(t, port = 0, options = {}) {
  const directory = await mkdtemp(join(here, '.test-'));
  const child = spawn(process.execPath, [join(here, 'server.mjs'), ...(options.args || [])], {
    cwd: dirname(here), env: { ...process.env, TRIP_DIR: directory, TRIP_MCP_PORT: String(port), TRIP_MCP_OFFLINE: '1', ...options.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '', sequence = 0;
  const waiting = new Map();
  const messages = [];
  const input = createInterface({ input: child.stdout });
  child.stderr.on('data', (data) => { stderr += data; });
  input.on('line', (line) => {
    let message;
    try { message = JSON.parse(line); }
    catch { for (const item of waiting.values()) item.reject(new Error('Non-JSON stdout: ' + line)); return; }
    messages.push(message);
    const item = waiting.get(message.id);
    if (item) { waiting.delete(message.id); clearTimeout(item.timer); item.resolve(message); }
  });
  child.on('exit', (code) => {
    for (const item of waiting.values()) { clearTimeout(item.timer); item.reject(new Error('Server exited ' + code + ': ' + stderr)); }
    waiting.clear();
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.stdin.end();
      const timer = setTimeout(() => child.kill(), 3000);
      await exited;
      clearTimeout(timer);
    }
    input.close();
    // The path comes from mkdtemp under this folder, never from a tool argument.
    await rm(directory, { recursive: true, force: true });
  });
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error('RPC timeout for ' + method + ': ' + stderr)); }, 8000);
    waiting.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const call = async (name, args = {}) => {
    const message = await rpc('tools/call', { name, arguments: args });
    assert.equal(message.jsonrpc, '2.0');
    assert.equal(message.error, undefined);
    return { failed: message.result.isError === true, data: JSON.parse(message.result.content[0].text) };
  };
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  return { directory, child, rpc, call, messages };
}

test('stdio lists thirteen tools and validates, edits and preserves trip files', async (t) => {
  const client = await launch(t);
  await t.test('initialize echoes a date or falls back; notifications are silent; ping and errors work', async () => {
    assert.equal((await client.rpc('initialize', { protocolVersion: '2024-11-05' })).result.protocolVersion, '2024-11-05');
    assert.equal((await client.rpc('initialize', { protocolVersion: 'not-a-date' })).result.protocolVersion, '2025-06-18');
    const before = client.messages.length;
    client.child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    assert.deepEqual((await client.rpc('ping')).result, {});
    assert.equal(client.messages.length, before + 1);
    assert.equal((await client.rpc('missing')).error.code, -32601);
    for (const params of [7, null, 'invalid', false]) {
      assert.equal((await client.rpc('ping', params)).error.code, -32602);
    }
    assert.deepEqual((await client.rpc('ping', [])).result, {});
    const listed = (await client.rpc('tools/list')).result.tools;
    assert.equal(listed.length, 13);
    assert.deepEqual(listed.map((tool) => tool.name), expectedNames);
    for (const tool of listed) {
      for (const rule of ['public entrance or trailhead', 'Never invent', 'verify with search_place',
        'Boat transfers and technical hikes', 'one grid point', 'real photos', 'with credit', 'No personal data']) {
        assert.ok(tool.description.includes(rule), tool.name + ': ' + rule);
      }
    }
  });
  await t.test('invalid saves return errors and create no file', async () => {
    const result = await client.call('save_trip', { trip: { id: 'bad-trip' } });
    assert.equal(result.failed, true);
    assert.ok(result.data.errors.some((error) => error.path === '/schema'));
    assert.deepEqual(await readdir(client.directory), []);
  });
  await t.test('save and get roundtrip unknown fields and the worked sample', async () => {
    const trip = fixture();
    assert.equal((await client.call('save_trip', { trip })).failed, false);
    assert.deepEqual((await client.call('get_trip', { id: trip.id })).data, trip);
    assert.equal((await client.call('save_trip', { trip: sample })).failed, false);
    assert.deepEqual((await client.call('get_trip', { id: sample.id })).data, sample);
    assert.equal((await client.call('list_trips')).data.length, 2);
    assert.deepEqual((await readdir(client.directory)).sort(), [sample.id + '.json', trip.id + '.json'].sort());
  });
  await t.test('add, update and remove stop; bad edits leave the file unchanged', async () => {
    const args = { tripId: 'test-trip' };
    let result = await client.call('add_stop', { ...args, dayNumber: 1, stop, index: 0 });
    assert.equal(result.failed, false);
    assert.deepEqual(result.data.trip.phases[0].days[0].stops, [stop]);
    result = await client.call('update_stop', { ...args, stopId: stop.id, patch: { dwell: 45, visited: true } });
    assert.equal(result.failed, false);
    assert.deepEqual(result.data.trip.phases[0].days[0].stops[0], { ...stop, dwell: 45, visited: true });
    const before = await readFile(join(client.directory, 'test-trip.json'), 'utf8');
    result = await client.call('update_stop', { ...args, stopId: stop.id, patch: { lat: 200 } });
    assert.equal(result.failed, true);
    assert.ok(result.data.errors.some((error) => error.path.endsWith('/lat')));
    assert.equal(await readFile(join(client.directory, 'test-trip.json'), 'utf8'), before);
    assert.equal((await client.call('add_stop', { ...args, dayNumber: 1, stop, index: 10 })).failed, true);
    result = await client.call('remove_stop', { ...args, stopId: stop.id });
    assert.equal(result.failed, false);
    assert.deepEqual(result.data.trip.phases[0].days[0].stops, []);
    assert.deepEqual(result.data.trip.extra, { preserved: true });
  });
  await t.test('parallel edits do not lose stops; add_day and delete_trip work', async () => {
    const results = await Promise.all(['one', 'two', 'three'].map((id) => client.call('add_stop', { tripId: 'test-trip', dayNumber: 1, stop: { ...stop, id } })));
    assert.ok(results.every((result) => !result.failed));
    const trip = (await client.call('get_trip', { id: 'test-trip' })).data;
    assert.deepEqual(trip.phases[0].days[0].stops.map((item) => item.id), ['one', 'two', 'three']);
    assert.equal((await client.call('add_day', { tripId: trip.id, phaseId: 'first', day: { dayNumber: 2, title: 'Second', stops: [], extraDay: true } })).failed, false);
    assert.equal((await client.call('get_trip', { id: trip.id })).data.phases[0].days[1].extraDay, true);
    assert.equal((await client.call('delete_trip', { id: sample.id })).data.deleted, true);
    assert.equal((await client.call('get_trip', { id: sample.id })).failed, true);
  });
  await t.test('path traversal and invalid ids are refused for reads, edits and saves', async () => {
    for (const id of ['../escape', '..\\escape', '/absolute', 'upperCase', 'a/b', '', 'a.b']) {
      assert.equal((await client.call('get_trip', { id })).failed, true, id);
      assert.equal((await client.call('delete_trip', { id })).failed, true, id);
      assert.equal((await client.call('save_trip', { trip: { ...fixture(), id } })).failed, true, id);
    }
    assert.deepEqual(await readdir(client.directory), ['test-trip.json']);
  });
  await t.test('validate_trip reports validity, full errors and duplicate warnings', async () => {
    assert.deepEqual((await client.call('validate_trip', { trip: fixture() })).data, { valid: true, errors: [], warnings: [] });
    const invalid = (await client.call('validate_trip', { trip: null })).data;
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errors.length > 0);
    const trip = fixture();
    trip.phases[0].days[0].stops = [stop, stop];
    const result = await client.call('validate_trip', { trip });
    assert.equal(result.data.valid, true);
    assert.ok(result.data.warnings.some((warning) => warning.includes('used twice')));
    await client.call('save_trip', { trip });
    assert.equal((await client.call('remove_stop', { tripId: trip.id, stopId: stop.id })).failed, true);
  });
  await t.test('offline network tools return errors while storage stays usable', async () => {
    const calls = [['search_place', { query: 'Cagliari' }], ['route_between', { points: [[9, 39], [9.1, 39.1]], mode: 'driving' }],
      ['get_weather', { lat: 39, lon: 9 }], ['find_stop_photo', { name: 'Beach', lat: 39, lon: 9 }]];
    for (const [name, args] of calls) {
      const result = await client.call(name, args);
      assert.equal(result.failed, true);
      assert.match(result.data.error, /offline/);
    }
    assert.equal((await client.call('get_trip', { id: 'test-trip' })).failed, false);
  });
});

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test('HTTP is read only, restricts CORS and emits tool and disk changes', async (t) => {
  const port = await freePort();
  const client = await launch(t, port);
  const base = 'http://127.0.0.1:' + port;
  assert.equal((await (await fetch(base + '/health')).json()).ok, true);
  assert.deepEqual(await (await fetch(base + '/trips')).json(), []);
  const allowed = ['http://localhost:3000', 'http://127.0.0.1:8080', 'https://projects.metaengineershub.com'];
  const refused = ['https://evil.example', 'http://localhost.evil:3000', 'http://127.0.0.1.evil:3000', 'null',
    'https://localhost:3000', 'https://projects.metaengineershub.com.evil', 'https://projects.metaengineershub.com:444'];
  for (const origin of [...allowed, ...refused]) {
    const response = await fetch(base + '/health', { headers: { Origin: origin } });
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), allowed.includes(origin) ? origin : null, origin);
  }
  const preflight = await fetch(base + '/trips', { method: 'OPTIONS', headers: {
    Origin: allowed[2], 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Private-Network': 'true' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Private-Network'), 'true');
  assert.equal((await fetch(base + '/trips/test-trip', { method: 'POST', body: '{}' })).status, 405);
  assert.equal((await fetch(base + '/trips/%2e%2e%2fescape')).status, 400);
  assert.equal((await fetch(base + '/missing')).status, 404);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  t.after(() => { clearTimeout(timeout); controller.abort(); });
  const events = await fetch(base + '/events', { signal: controller.signal });
  assert.match(events.headers.get('content-type'), /text\/event-stream/);
  const reader = events.body.getReader();
  let buffer = '';
  const nextEvent = async () => {
    for (;;) {
      const split = buffer.indexOf('\n\n');
      if (split >= 0) {
        const block = buffer.slice(0, split); buffer = buffer.slice(split + 2);
        const data = block.split('\n').find((line) => line.startsWith('data: '));
        if (data) return JSON.parse(data.slice(6));
      } else {
        const chunk = await reader.read();
        if (chunk.done) throw new Error('SSE ended before an event.');
        buffer += Buffer.from(chunk.value).toString('utf8');
      }
    }
  };
  await client.call('save_trip', { trip: fixture() });
  let event = await nextEvent();
  assert.equal(event.id, 'test-trip');
  assert.ok(Number.isFinite(Date.parse(event.updatedAt)));
  assert.equal((await (await fetch(base + '/trips')).json())[0].id, 'test-trip');
  assert.deepEqual(await (await fetch(base + '/trips/test-trip')).json(), fixture());
  const edited = { ...fixture(), title: 'Edited on disk' };
  await writeFile(join(client.directory, 'test-trip.json'), JSON.stringify(edited));
  event = await nextEvent();
  assert.equal(event.id, 'test-trip');
  assert.equal((await (await fetch(base + '/trips/test-trip')).json()).title, edited.title);
  await client.call('delete_trip', { id: 'test-trip' });
  assert.equal((await nextEvent()).id, 'test-trip');
  assert.equal((await fetch(base + '/trips/test-trip')).status, 404);
  await reader.cancel();
});

test('geo offline guard makes no requests; Nominatim caches and queues searches', async () => {
  let calls = 0;
  const offline = createGeo({ offline: () => true, fetchFn: () => { calls++; throw new Error('Must not call network'); } });
  await assert.rejects(offline.searchPlace({ query: 'test' }), /offline/);
  await assert.rejects(offline.routeBetween({ points: [[9, 39], [9.1, 39.1]], mode: 'driving' }), /offline/);
  await assert.rejects(offline.getWeather({ lat: 39, lon: 9 }), /offline/);
  assert.equal(calls, 0);
  const starts = [];
  const geo = createGeo({ offline: () => false, fetchFn: async (url, options) => {
    assert.equal(url.hostname, 'nominatim.openstreetmap.org');
    assert.equal(options.headers['User-Agent'], 'TripPlannerMCP/1.0 (local)');
    starts.push(performance.now());
    return { ok: true, json: async () => [{ display_name: 'Fixture', lat: '39', lon: '9', osm_type: 'node', osm_id: 1 }] };
  } });
  const [a, b] = await Promise.all([geo.searchPlace({ query: 'first' }), geo.searchPlace({ query: 'first' })]);
  assert.deepEqual(a, b);
  await geo.searchPlace({ query: 'first' });
  assert.equal(starts.length, 1);
  await geo.searchPlace({ query: 'second' });
  assert.ok(starts[1] - starts[0] >= 999, 'Requests must start at least one second apart');
});

test('OSRM checks coordinates and mode and returns clear service failures', async () => {
  let actualMode = 'driving';
  const geo = createGeo({ offline: () => false, fetchFn: async (url) => {
    assert.equal(url.origin, 'https://router.project-osrm.org');
    return { ok: true, json: async () => ({ code: 'Ok', routes: [{ distance: 100, duration: 30,
      geometry: { type: 'LineString', coordinates: [[9, 39], [9.1, 39.1]] }, legs: [{ steps: [{ mode: actualMode }] }] }] }) };
  } });
  const points = [[9, 39], [9.1, 39.1]];
  assert.equal((await geo.routeBetween({ points, mode: 'driving' })).distanceMeters, 100);
  await assert.rejects(geo.routeBetween({ points, mode: 'walking' }), /did not return a route solely for walking/);
  actualMode = 'cycling';
  assert.equal((await geo.routeBetween({ points, mode: 'cycling' })).mode, 'cycling');
  await assert.rejects(geo.routeBetween({ points: [[500, 39], [9, 39]], mode: 'driving' }), /Coordinates/);
  const broken = createGeo({ offline: () => false, fetchFn: async () => ({ ok: false, status: 429 }) });
  await assert.rejects(broken.searchPlace({ query: 'test' }), /Nominatim request failed: HTTP 429/);
});

test('weather labels forecast and typical, samples prior dates and skips non-leap years', async () => {
  const requests = [];
  const now = () => new Date('2026-10-14T12:00:00Z');
  const geo = createGeo({ now, offline: () => false, fetchFn: async (url) => {
    requests.push(url.toString());
    const date = url.searchParams.get('start_date');
    return { ok: true, json: async () => ({ latitude: 39, longitude: 9, elevation: 100,
      daily: { time: [date], temperature_2m_max: [22], temperature_2m_min: [12], precipitation_probability_max: [40],
        wind_speed_10m_max: [15], precipitation_sum: [2], sunrise: [date + 'T07:00'], sunset: [date + 'T18:00'] } }) };
  } });
  assert.equal((await geo.getWeather({ lat: 39, lon: 9 })).kind, 'forecast');
  assert.equal((await geo.getWeather({ lat: 39, lon: 9, date: '2026-10-27' })).kind, 'forecast');
  let result = await geo.getWeather({ lat: 39, lon: 9, date: '2026-10-28' });
  assert.equal(result.kind, 'typical');
  assert.deepEqual(result.samples.map((sample) => sample.date), ['2025-10-28', '2024-10-28', '2023-10-28']);
  assert.equal(result.tMax, 22);
  assert.equal(result.rainChance, 100);
  result = await geo.getWeather({ lat: 39, lon: 9, date: '2028-02-29' });
  assert.deepEqual(result.samples.map((sample) => sample.date), ['2024-02-29', '2020-02-29', '2016-02-29']);
  result = await geo.getWeather({ lat: 39, lon: 9, date: '2020-05-01' });
  assert.deepEqual(result.samples.map((sample) => sample.date), ['2019-05-01', '2018-05-01', '2017-05-01']);
  await assert.rejects(geo.getWeather({ lat: 39, lon: 9, date: '2026-02-30' }), /real calendar date/);
  assert.ok(requests.some((url) => url.startsWith('https://api.open-meteo.com/v1/forecast')));
  assert.ok(requests.some((url) => url.startsWith('https://archive-api.open-meteo.com/v1/archive')));
});
