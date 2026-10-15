// Keyless services behind small adapters: search (Nominatim), route (FOSSGIS OSRM), weather and elevation (Open-Meteo).
// Public servers ask for light use: one request per second, cached results, no bulk calls.

import { normalizeProviders } from './providers.mjs';
import { createPhotoFinder } from './photos.mjs';
import { LIVE_TTL, weatherDescription } from './live.mjs';

export const providers = normalizeProviders();

export function configureProviders(value) {
  Object.assign(providers, normalizeProviders(value));
  cache.clear();
}

const cache = new Map();
const lanes = new Map();

// Queues calls per provider lane. Search and routes wait about a second between calls;
// weather and elevation wait a quarter of a second, far below the Open-Meteo limits.
function throttled(fn, gap = 1100, lane = 'osm') {
  const state = lanes.get(lane) || { last: 0, chain: Promise.resolve() };
  lanes.set(lane, state);
  const run = state.chain.then(async () => {
    const wait = Math.max(0, state.last + gap - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    state.last = Date.now();
    return fn();
  });
  state.chain = run.catch(() => {});
  return run;
}

async function getJson(url, signal) {
  const res = await fetch(url, { signal: signal || AbortSignal.timeout(15000), headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (data?.error) throw new Error(data.error.info || data.reason || 'Provider request failed.');
  return data;
}

export async function searchPlace(query, { signal, near } = {}) {
  const q = query.trim();
  if (q.length < 3) return [];
  const key = providers.search + '|search|' + q.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const url = new URL(providers.search);
  url.search = new URLSearchParams({ q, format: 'jsonv2', limit: '6', addressdetails: '0', ...(near ? { viewbox: near, bounded: '0' } : {}) });
  const rows = await throttled(() => getJson(url.href, signal));
  const result = rows.map((r) => ({ name: r.display_name, lat: Number(r.lat), lon: Number(r.lon), kind: r.type || r.category || '' }))
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon));
  cache.set(key, result);
  return result;
}

// Road, foot or bike route through the points. Returns null when no real route exists.
export async function route(points, mode = 'driving', { signal } = {}) {
  if (points.length < 2 || points.length > 25) return null;
  const base = providers.routing[mode] || providers.routing.driving;
  const coords = points.map((p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join(';');
  const key = `${base}|route|${mode}|${coords}`;
  if (cache.has(key)) return cache.get(key);
  const data = await throttled(() => getJson(`${base}/${coords}?overview=full&geometries=geojson&steps=false`, signal));
  const r = data.code === 'Ok' ? data.routes?.[0] : null;
  const out = r ? {
    coords: r.geometry.coordinates,
    distance: r.distance,
    duration: r.duration,
    legs: r.legs.map((l) => ({ distance: l.distance, duration: l.duration }))
  } : null;
  cache.set(key, out);
  return out;
}

const day = (iso, shiftYears = 0) => {
  const shifted = String(Number(iso.slice(0, 4)) + shiftYears) + iso.slice(4);
  const d = new Date(shifted + 'T12:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === shifted ? shifted : null;
};

function daysFromToday(iso) {
  return Math.round((new Date(iso + 'T00:00:00Z') - new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')) / 86400000);
}

export const inForecastWindow = (iso) => daysFromToday(iso) >= 0 && daysFromToday(iso) <= 13;

const hm = (s) => (s ? s.slice(11, 16) : '');

// Forecast when the date is within about two weeks, otherwise the average of the same date in the last 5 years.
// Always labelled, so nobody reads a typical day as a forecast.
export async function weather(lat, lon, iso, { signal } = {}) {
  const forecastBase = providers.forecast, archiveBase = providers.archive;
  const key = `${forecastBase}|${archiveBase}|wx|${lat.toFixed(2)}|${lon.toFixed(2)}|${iso}`;
  const cached = cache.get(key);
  if (cached && (cached.kind === 'typical' ? !inForecastWindow(iso) : inForecastWindow(iso) && Date.now() - Date.parse(cached.fetchedAt) < LIVE_TTL)) return cached;
  let out = null;
  const daily = 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset';
  if (inForecastWindow(iso)) {
    const url = `${forecastBase}?latitude=${lat}&longitude=${lon}&daily=${daily}&timezone=auto&start_date=${iso}&end_date=${iso}`;
    const j = await throttled(() => getJson(url, signal), 250, 'meteo');
    const d = j.daily;
    if (d?.time?.length) {
      out = {
        kind: 'forecast', tMax: d.temperature_2m_max[0], tMin: d.temperature_2m_min[0],
        rainChance: d.precipitation_probability_max[0], windMax: d.wind_speed_10m_max[0],
        sunrise: hm(d.sunrise[0]), sunset: hm(d.sunset[0]), fetchedAt: new Date().toISOString()
      };
    }
  } else {
    const rows = [];
    for (let y = -1; y >= -5; y--) {
      const anchor = Math.min(Number(iso.slice(0, 4)), new Date().getUTCFullYear()) + iso.slice(4);
      const dd = day(String(anchor), y);
      if (!dd) continue;
      const url = `${archiveBase}?latitude=${lat}&longitude=${lon}&start_date=${dd}&end_date=${dd}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,sunrise,sunset&timezone=auto`;
      rows.push(throttled(() => getJson(url, signal), 250, 'meteo').catch(() => null));
    }
    const got = (await Promise.all(rows)).map((j) => j?.daily).filter((d) => d?.time?.length);
    if (got.length) {
      const avg = (k) => got.reduce((s, d) => s + (d[k][0] ?? 0), 0) / got.length;
      out = {
        kind: 'typical', tMax: avg('temperature_2m_max'), tMin: avg('temperature_2m_min'),
        rainChance: Math.round(got.filter((d) => (d.precipitation_sum[0] ?? 0) >= 1).length / got.length * 100),
        windMax: avg('wind_speed_10m_max'), sunrise: hm(got[0].sunrise[0]), sunset: hm(got[0].sunset[0]),
        fetchedAt: new Date().toISOString(), years: got.length
      };
    }
  }
  cache.set(key, out);
  return out;
}

// Elevation in metres for up to 100 points per call.
export async function elevations(points, { signal } = {}) {
  if (!points.length) return [];
  const base = providers.elevation;
  const sets = [];
  for (let i = 0; i < points.length; i += 100) sets.push(points.slice(i, i + 100));
  const out = [];
  for (const set of sets) {
    const lat = set.map((p) => p[1].toFixed(5)).join(',');
    const lon = set.map((p) => p[0].toFixed(5)).join(',');
    const url = `${base}?latitude=${lat}&longitude=${lon}`;
    const key = `${base}|ele|${lat}|${lon}`;
    if (!cache.has(key)) cache.set(key, (await throttled(() => getJson(url, signal), 250, 'meteo')).elevation || []);
    out.push(...cache.get(key));
  }
  return out;
}

export async function waves(lat, lon, iso, { signal } = {}) {
  if (!inForecastWindow(iso)) return null;
  const url = `${providers.marine}?latitude=${lat}&longitude=${lon}&daily=wave_height_max&start_date=${iso}&end_date=${iso}&timezone=auto`;
  if (!cache.has(url)) {
    const data = await throttled(() => getJson(url, signal), 250, 'meteo');
    const value = data.daily?.wave_height_max?.[0];
    cache.set(url, Number.isFinite(value) ? value : null);
  }
  return cache.get(url);
}

export function trackStats(track) {
  let dist = 0, up = 0, down = 0;
  for (let i = 1; i < track.length; i++) {
    const [x1, y1, e1] = track[i - 1];
    const [x2, y2, e2] = track[i];
    const dx = (x2 - x1) * 111320 * Math.cos(((y1 + y2) / 2) * Math.PI / 180);
    const dy = (y2 - y1) * 110540;
    dist += Math.hypot(dx, dy);
    if (e1 != null && e2 != null) {
      const diff = e2 - e1;
      if (diff > 0) up += diff; else down -= diff;
    }
  }
  return { distance: dist, up, down, min: Math.min(...track.map((p) => p[2] ?? Infinity)), max: Math.max(...track.map((p) => p[2] ?? -Infinity)) };
}

const photoFinder = createPhotoFinder((url) => throttled(() => getJson(url), 300, 'photos'));
export function findStopPhoto(name, lat, lon) {
  return photoFinder({ name, lat, lon, wikipedia: providers.wikipedia, commons: providers.commons });
}

export async function currentWeather(lat, lon, { now = Date.now } = {}) {
  const url = new URL(providers.forecast);
  url.search = new URLSearchParams({ latitude: String(lat), longitude: String(lon), timezone: 'auto',
    current: 'temperature_2m,weather_code,wind_speed_10m', hourly: 'precipitation_probability', forecast_days: '1' });
  const key = url.href;
  const hit = cache.get(key);
  if (hit && now() - Date.parse(hit.fetchedAt) < LIVE_TTL) return hit;
  const data = await throttled(() => getJson(key), 250, 'meteo');
  const current = data.current;
  if (!current || !Number.isFinite(current.temperature_2m)) return null;
  const hour = current.time?.slice(0, 13);
  const index = data.hourly?.time?.findIndex((time) => time.slice(0, 13) === hour) ?? -1;
  const out = { temperature: current.temperature_2m, description: weatherDescription(current.weather_code),
    wind: current.wind_speed_10m, rainChance: data.hourly?.precipitation_probability?.[index], fetchedAt: new Date(now()).toISOString() };
  cache.set(key, out);
  return out;
}
