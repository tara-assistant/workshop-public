import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateTrip } from '../schema/validate.mjs';
import { TripStore, TripError, inspectTrip } from './store.mjs';
import { createGeo } from './geo.mjs';

const RULES = 'Coordinates must be the real public entrance or trailhead. Never invent places or coordinates; verify with search_place. Boat transfers and technical hikes are never inferred from road routing. Mountain forecast is one grid point. Images must be real photos of the actual place with credit. No personal data in trip files.';
const text = { type: 'string', minLength: 1 };
const tripId = { ...text, maxLength: 80, pattern: '^[a-z0-9_-]+$' };
const object = { type: 'object' };
const latitude = { type: 'number', minimum: -90, maximum: 90 };
const longitude = { type: 'number', minimum: -180, maximum: 180 };
const definition = (name, description, properties = {}, required = Object.keys(properties)) => ({
  name, description: description + ' ' + RULES,
  inputSchema: { type: 'object', properties, required },
});

export const TOOLS = [
  definition('list_trips', 'List trip ids, titles, dates and file update times.'),
  definition('get_trip', 'Read one complete trip, including unknown fields.', { id: tripId }),
  definition('validate_trip', 'Check a trip against schema v1 and return errors and warnings without saving.', { trip: {} }),
  definition('save_trip', 'Validate and atomically save a complete trip. Return errors if invalid. Keep unknown fields.', { trip: {} }),
  definition('delete_trip', 'Delete one trip file.', { id: tripId }),
  definition('add_stop', 'Insert a stop into the unique numbered day. Index is zero based; omit to append.',
    { tripId, dayNumber: { type: 'integer', minimum: 1 }, stop: object, index: { type: 'integer', minimum: 0 } }, ['tripId', 'dayNumber', 'stop']),
  definition('update_stop', 'Merge fields into the uniquely identified stop. Arrays and nested objects are replaced. Validate before saving.',
    { tripId, stopId: text, patch: object }),
  definition('remove_stop', 'Remove the uniquely identified stop and validate before saving.', { tripId, stopId: text }),
  definition('add_day', 'Append a day to the uniquely identified phase and validate before saving.', { tripId, phaseId: text, day: object }),
  definition('find_stop_photo', 'Read only. Find up to four nearby Wikipedia and Wikimedia Commons photos with author, license and source. Confirm the actual place, then use update_stop to save imageUrl and imageCredit.',
    { name: { ...text, maxLength: 160 }, lat: latitude, lon: longitude }),
  definition('search_place', 'Search Nominatim for sourced places. Results may be place centers; check entrances. Limit defaults to 5.',
    { query: { ...text, maxLength: 500 }, limit: { type: 'integer', minimum: 1, maximum: 10 } }, ['query']),
  definition('route_between', 'Request an OSRM route through [longitude, latitude] points. Refuse a different reported mode.',
    { points: { type: 'array', minItems: 2, maxItems: 100, items: { type: 'array', minItems: 2, maxItems: 2, prefixItems: [longitude, latitude] } },
      mode: { enum: ['walking', 'cycling', 'driving'] } }),
  definition('get_weather', 'Get a forecast for today through 13 days ahead, otherwise typical weather from the same date in prior years. Label which. Date defaults to today in UTC.',
    { lat: latitude, lon: longitude, date: { type: 'string', format: 'date' } }, ['lat', 'lon']),
];

function unique(items, label) {
  if (items.length !== 1) throw new TripError(items.length ? label + ' is ambiguous; fix duplicate ids or day numbers first.' : label + ' was not found.');
  return items[0];
}

export function createToolHandler(store, geo = createGeo()) {
  return async (name, args = {}) => {
    const tool = TOOLS.find((item) => item.name === name);
    if (!tool) throw new TripError('Unknown tool: ' + name);
    const errors = validateTrip(args, tool.inputSchema);
    if (errors.length) throw new TripError('Invalid tool arguments.', errors);
    const days = (trip) => trip.phases.flatMap((phase) => phase.days);
    const findStop = (trip, id) => unique(days(trip).flatMap((day) => day.stops
      .map((stop, index) => ({ day, stop, index })).filter((item) => item.stop.id === id)), 'Stop ' + id);
    switch (name) {
      case 'list_trips': return store.list();
      case 'get_trip': return store.get(args.id);
      case 'validate_trip': return inspectTrip(args.trip);
      case 'save_trip': return store.save(args.trip);
      case 'delete_trip': return store.delete(args.id);
      case 'add_stop': return store.edit(args.tripId, (trip) => {
        const day = unique(days(trip).filter((item) => item.dayNumber === args.dayNumber), 'Day ' + args.dayNumber);
        const index = args.index ?? day.stops.length;
        if (index > day.stops.length) throw new TripError('Stop index must be between 0 and ' + day.stops.length + '.');
        day.stops.splice(index, 0, args.stop);
      });
      case 'update_stop': return store.edit(args.tripId, (trip) => {
        const item = findStop(trip, args.stopId);
        item.day.stops[item.index] = { ...item.stop, ...args.patch };
      });
      case 'remove_stop': return store.edit(args.tripId, (trip) => {
        const item = findStop(trip, args.stopId);
        item.day.stops.splice(item.index, 1);
      });
      case 'add_day': return store.edit(args.tripId, (trip) => {
        unique(trip.phases.filter((phase) => phase.id === args.phaseId), 'Phase ' + args.phaseId).days.push(args.day);
      });
      case 'find_stop_photo': return geo.findStopPhoto(args);
      case 'search_place': return geo.searchPlace(args);
      case 'route_between': return geo.routeBetween(args);
      case 'get_weather': return geo.getWeather(args);
    }
  };
}

function allowedOrigin(origin) {
  return typeof origin === 'string' && (/^http:\/\/(localhost|127\.0\.0\.1):\d{1,5}$/.test(origin)
    || origin === 'https://projects.metaengineershub.com');
}

export async function startHttp(store, port, log) {
  const clients = new Set();
  const json = (response, status, value) => {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(value));
  };
  const server = createServer((request, response) => {
    response.setHeader('Vary', 'Origin');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const origin = request.headers.origin;
    if (allowedOrigin(origin)) response.setHeader('Access-Control-Allow-Origin', origin);
    const handle = async () => {
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(request.headers.host || '')) return json(response, 403, { error: 'Use a localhost or 127.0.0.1 URL.' });
      if (request.method === 'OPTIONS' && allowedOrigin(origin)) {
        response.setHeader('Access-Control-Allow-Methods', 'GET');
        if (request.headers['access-control-request-private-network'] === 'true') response.setHeader('Access-Control-Allow-Private-Network', 'true');
        response.writeHead(204);
        return response.end();
      }
      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        return json(response, 405, { error: 'HTTP is read only. Use MCP tools to edit trips.' });
      }
      // Inspect the raw path so URL normalization cannot hide traversal attempts.
      const path = (request.url || '').split('?')[0];
      if (path === '/health') return json(response, 200, { ok: true, service: 'TripPlannerMCP', version: '1.0.0' });
      if (path === '/trips') return json(response, 200, await store.list());
      if (path.startsWith('/trips/')) return json(response, 200, await store.get(decodeURIComponent(path.slice(7))));
      if (path === '/events') {
        response.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
        response.write(': connected\n\n');
        clients.add(response);
        response.on('close', () => clients.delete(response));
        response.on('error', () => { clients.delete(response); response.destroy(); });
        return;
      }
      return json(response, 404, { error: 'Endpoint not found.' });
    };
    handle().catch((error) => {
      if (!response.headersSent) json(response, error.status || 400, { error: error.message, errors: error.errors || [] });
      else response.destroy();
    });
  });
  const broadcast = (change) => {
    for (const client of clients) {
      if (!client.write('data: ' + JSON.stringify(change) + '\n\n')) client.destroy();
    }
  };
  const heartbeat = setInterval(() => {
    for (const client of clients) if (!client.write(': keepalive\n\n')) client.destroy();
  }, 20_000);
  heartbeat.unref();
  store.on('change', broadcast);
  const cleanup = () => {
    clearInterval(heartbeat);
    store.off('change', broadcast);
    for (const client of clients) client.end();
    clients.clear();
  };
  server.on('close', cleanup);
  try {
    await new Promise((accept, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => { server.off('error', reject); accept(); });
    });
  } catch (error) { cleanup(); throw error; }
  server.on('error', (error) => log('HTTP: ' + error.message));
  log('Trip Planner HTTP listening on http://127.0.0.1:' + server.address().port);
  return { close: () => { cleanup(); server.close(); server.closeIdleConnections?.(); } };
}

function options() {
  let directory = process.env.TRIP_DIR || resolve('trips');
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--dir' && args[index + 1]) directory = args[++index];
    else if (args[index].startsWith('--dir=') && args[index].length > 6) directory = args[index].slice(6);
    else throw new Error('Usage: node server.mjs [--dir /path/to/trips]');
  }
  const value = process.env.TRIP_MCP_PORT ?? '4789';
  if (!/^\d+$/.test(value) || Number(value) > 65535) throw new Error('TRIP_MCP_PORT must be 0 to disable HTTP, or a port from 1 to 65535.');
  return { directory, port: Number(value) };
}

export async function main() {
  const log = (message) => process.stderr.write(message + '\n');
  const { directory, port } = options();
  const store = await new TripStore(directory, log).start();
  const callTool = createToolHandler(store);
  let http;
  if (port) {
    try { http = await startHttp(store, port, log); }
    catch (error) { log('HTTP could not start: ' + error.message + '. MCP remains available. Set TRIP_MCP_PORT to a free port.'); }
  }
  const MAX_LINE = 2_000_000;
  const MAX_ACTIVE = 8;
  const active = new Set();
  const send = (message) => process.stdout.write(JSON.stringify(message) + '\n');
  const rpcError = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
  const dispatch = async (line) => {
    let request;
    try { request = JSON.parse(line); } catch { rpcError(null, -32700, 'Parse error. Send one JSON object per line.'); return; }
    if (!request || Array.isArray(request) || request.jsonrpc !== '2.0' || typeof request.method !== 'string'
      || ('id' in request && request.id !== null && typeof request.id !== 'string' && typeof request.id !== 'number')) {
      rpcError(null, -32600, 'Invalid JSON-RPC 2.0 request.'); return;
    }
    if (!('id' in request)) return;
    const { id, method, params } = request;
    if ('params' in request && (params === null || typeof params !== 'object')) {
      rpcError(id, -32602, 'Params must be an object or array.'); return;
    }
    let result;
    switch (method) {
      case 'initialize': {
        const version = params?.protocolVersion;
        const parsed = typeof version === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(version) ? Date.parse(version + 'T00:00:00Z') : NaN;
        const date = Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === version;
        result = { protocolVersion: date ? version : '2025-06-18', capabilities: { tools: {} },
          serverInfo: { name: 'trip-planner', version: '1.0.0' }, instructions: RULES };
        break;
      }
      case 'ping': result = {}; break;
      case 'tools/list': result = { tools: TOOLS }; break;
      case 'tools/call':
        if (!params || typeof params.name !== 'string') { rpcError(id, -32602, 'tools/call needs a tool name.'); return; }
        try {
          const value = await callTool(params.name, params.arguments ?? {});
          result = { content: [{ type: 'text', text: JSON.stringify(value) }] };
        } catch (error) {
          result = { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: error.message, errors: error.errors || [] }) }] };
        }
        break;
      default: rpcError(id, -32601, 'Method not found: ' + method); return;
    }
    send({ jsonrpc: '2.0', id, result });
  };
  const feed = (line) => {
    if (!line.trim()) return;
    if (line.length > MAX_LINE) { rpcError(null, -32600, 'Message too large. Send one JSON object per line, under 2 MB.'); return; }
    if (active.size >= MAX_ACTIVE) {
      let id = null;
      try { id = JSON.parse(line)?.id ?? null; } catch { id = null; }
      rpcError(typeof id === 'string' || typeof id === 'number' ? id : null, -32000, 'Server busy. Retry shortly.');
      return;
    }
    const task = dispatch(line).catch((error) => log('MCP: ' + error.message));
    active.add(task);
    task.finally(() => active.delete(task));
  };
  // Lines are split by hand so a message with no newline cannot grow without limit.
  let buffer = '';
  let skipping = false;
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (skipping) { skipping = false; continue; }
      feed(line);
    }
    if (buffer.length > MAX_LINE) {
      buffer = '';
      skipping = true;
      rpcError(null, -32600, 'Message too large. Send one JSON object per line, under 2 MB.');
    }
  });
  const close = () => { store.close(); http?.close(); };
  process.stdin.on('end', async () => {
    if (buffer.trim() && !skipping) feed(buffer);
    await Promise.allSettled([...active]);
    close();
  });
  process.once('SIGINT', () => { close(); process.exit(0); });
  process.once('SIGTERM', () => { close(); process.exit(0); });
  process.stdout.on('error', () => { close(); process.exit(0); });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write('Trip Planner startup failed: ' + error.message + '\n'); process.exitCode = 1; });
}
