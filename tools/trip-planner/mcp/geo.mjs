import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';

const USER_AGENT = 'TripPlannerMCP/1.0 (local)';
const DAY = 86_400_000;
const MOUNTAIN_NOTE = 'Mountain weather is one grid point. Check local forecasts and conditions before going.';

function coordinates(lon, lat) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) {
    throw new Error('Coordinates must be finite numbers within longitude -180 to 180 and latitude -90 to 90.');
  }
}

function dateValue(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date must use YYYY-MM-DD.');
  const value = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(value) || new Date(value).toISOString().slice(0, 10) !== date) throw new Error('Date must be a real calendar date.');
  return value;
}

function queue() {
  let tail = Promise.resolve();
  let lastStart = -Infinity;
  return (operation) => {
    const next = tail.catch(() => {}).then(async () => {
      const wait = 1000 - (performance.now() - lastStart);
      if (wait > 0) await delay(Math.ceil(wait));
      lastStart = performance.now();
      return operation();
    });
    tail = next.catch(() => {});
    return next;
  };
}

export function createGeo({ fetchFn = globalThis.fetch, now = () => new Date(),
  offline = () => process.env.TRIP_MCP_OFFLINE === '1' } = {}) {
  const nominatimQueue = queue();
  const osrmQueue = queue();
  const cache = new Map();
  const pending = new Map();

  function online() {
    if (offline()) throw new Error('offline: network tools are disabled by TRIP_MCP_OFFLINE=1.');
  }

  async function request(service, url) {
    online();
    try {
      const response = await fetchFn(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error('HTTP ' + response.status + (response.status === 429 ? '. Rate limit reached; try again later.' : ''));
      const data = await response.json();
      if (data?.error) throw new Error(data.reason || String(data.error));
      return data;
    } catch (error) {
      throw new Error(service + ' request failed: ' + (error.name === 'TimeoutError' ? 'timed out after 15 seconds.' : error.message));
    }
  }

  async function searchPlace({ query, limit = 5 }) {
    online();
    if (typeof query !== 'string' || !query.trim() || query.length > 500) throw new Error('Search query must contain 1 to 500 characters.');
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error('Search limit must be 1 to 10.');
    const key = JSON.stringify([query.trim(), limit]);
    const cached = cache.get(key);
    if (cached && now().getTime() - cached.time < DAY) return cached.value;
    if (pending.has(key)) return pending.get(key);
    const work = nominatimQueue(async () => {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.search = new URLSearchParams({ q: query.trim(), limit: String(limit), format: 'jsonv2', addressdetails: '1' }).toString();
      const data = await request('Nominatim', url);
      if (!Array.isArray(data)) throw new Error('Nominatim returned an unexpected result.');
      const places = data.map((place) => {
        const lat = Number(place.lat), lon = Number(place.lon);
        coordinates(lon, lat);
        return { name: place.display_name, lat, lon, osmType: place.osm_type, osmId: place.osm_id,
          source: 'https://www.openstreetmap.org/' + place.osm_type + '/' + place.osm_id,
          boundingBox: place.boundingbox, address: place.address };
      });
      const value = { places, attribution: '© OpenStreetMap contributors, ODbL',
        note: 'Search results can mark a place center. Verify the real public entrance or trailhead before saving coordinates.' };
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(key, { time: now().getTime(), value });
      return value;
    });
    pending.set(key, work);
    try { return await work; } finally { pending.delete(key); }
  }

  async function routeBetween({ points, mode }) {
    online();
    if (!['walking', 'cycling', 'driving'].includes(mode)) throw new Error('Route mode must be walking, cycling or driving.');
    if (!Array.isArray(points) || points.length < 2 || points.length > 100) throw new Error('Route needs 2 to 100 [longitude, latitude] points.');
    for (const point of points) {
      if (!Array.isArray(point) || point.length !== 2) throw new Error('Each route point must be [longitude, latitude].');
      coordinates(...point);
    }
    return osrmQueue(async () => {
      const url = new URL('https://router.project-osrm.org/route/v1/' + mode + '/' + points.map((point) => point.join(',')).join(';'));
      url.search = new URLSearchParams({ overview: 'full', geometries: 'geojson', steps: 'true', generate_hints: 'false' }).toString();
      const data = await request('OSRM', url);
      if (data?.code !== 'Ok' || !data.routes?.length) throw new Error('OSRM could not find a route: ' + (data?.message || data?.code || 'empty response'));
      const route = data.routes[0];
      const modes = new Set((route.legs || []).flatMap((leg) => (leg.steps || []).map((step) => step.mode)));
      // A profile name in the URL does not select the graph on every public OSRM server.
      if (!modes.has(mode) || [...modes].some((actual) => actual !== mode)) {
        throw new Error('OSRM did not return a route solely for ' + mode + ' (reported: ' + ([...modes].join(', ') || 'unknown') + '). Verify this mode with a suitable provider. Boat transfers and technical hikes require separate sources.');
      }
      return { mode, distanceMeters: route.distance, durationSeconds: route.duration, geometry: route.geometry,
        waypoints: data.waypoints, source: url.toString(), attribution: '© OpenStreetMap contributors, OSRM',
        note: 'Road or path routing does not verify public access or hiking difficulty. Never infer boat transfers or technical hikes from this route.' };
    });
  }

  async function getWeather({ lat, lon, date = now().toISOString().slice(0, 10) }) {
    online();
    coordinates(lon, lat);
    const requested = dateValue(date);
    const today = dateValue(now().toISOString().slice(0, 10));
    const offset = (requested - today) / DAY;
    const fetchedAt = now().toISOString();
    if (offset >= 0 && offset < 14) {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.search = new URLSearchParams({ latitude: String(lat), longitude: String(lon), start_date: date,
        end_date: date, timezone: 'auto', daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset' }).toString();
      const data = await request('Open-Meteo forecast', url);
      const daily = data?.daily;
      const index = daily?.time?.indexOf(date) ?? -1;
      if (index < 0 || !Number.isFinite(daily.temperature_2m_max?.[index]) || !Number.isFinite(daily.temperature_2m_min?.[index])) {
        throw new Error('Open-Meteo has no forecast for this date and location.');
      }
      return { kind: 'forecast', date, fetchedAt, tMax: daily.temperature_2m_max[index], tMin: daily.temperature_2m_min[index],
        rainChance: daily.precipitation_probability_max?.[index], windMax: daily.wind_speed_10m_max?.[index],
        sunrise: daily.sunrise?.[index], sunset: daily.sunset?.[index], units: data.daily_units,
        grid: { lat: data.latitude, lon: data.longitude, elevation: data.elevation }, source: url.toString(), note: MOUNTAIN_NOTE };
    }

    const anchorYear = Math.min(Number(date.slice(0, 4)), new Date(today).getUTCFullYear());
    const dates = [];
    for (let year = anchorYear - 1; year >= Math.max(1940, anchorYear - 12) && dates.length < 3; year--) {
      const prior = String(year).padStart(4, '0') + date.slice(4);
      try { dateValue(prior); dates.push(prior); } catch { /* Skip February 29 in non-leap years. */ }
    }
    if (!dates.length) throw new Error('No prior years are available in the Open-Meteo archive for this date.');
    const results = await Promise.allSettled(dates.map(async (prior) => {
      const url = new URL('https://archive-api.open-meteo.com/v1/archive');
      url.search = new URLSearchParams({ latitude: String(lat), longitude: String(lon), start_date: prior,
        end_date: prior, timezone: 'auto', daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max' }).toString();
      const data = await request('Open-Meteo archive', url);
      const daily = data?.daily;
      if (daily?.time?.[0] !== prior || !['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'wind_speed_10m_max']
        .every((key) => Number.isFinite(daily[key]?.[0]))) throw new Error('Archive has no complete data for ' + prior + '.');
      return { date: prior, tMax: daily.temperature_2m_max[0], tMin: daily.temperature_2m_min[0],
        rainMm: daily.precipitation_sum[0], windMax: daily.wind_speed_10m_max[0], source: url.toString() };
    }));
    const samples = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
    const warnings = results.filter((result) => result.status === 'rejected').map((result) => result.reason.message);
    if (!samples.length) throw new Error('Open-Meteo archive has no usable prior years: ' + warnings.join('; '));
    const average = (key) => Math.round(samples.reduce((sum, sample) => sum + sample[key], 0) / samples.length * 10) / 10;
    return { kind: 'typical', date, fetchedAt, tMax: average('tMax'), tMin: average('tMin'), windMax: average('windMax'),
      rainChance: Math.round(samples.filter((sample) => sample.rainMm >= 0.1).length / samples.length * 100),
      rainMm: average('rainMm'), samples, warnings, units: { tMax: '°C', tMin: '°C', windMax: 'km/h', rainMm: 'mm', rainChance: '%' },
      note: 'Typical weather is the mean of up to three same-date archive samples before both the requested year and the current year. It is not a forecast. rainChance is the fraction of sampled days with at least 0.1 mm of rain. ' + MOUNTAIN_NOTE };
  }

  return { searchPlace, routeBetween, getWeather };
}
