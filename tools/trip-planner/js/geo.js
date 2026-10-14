// Keyless services behind small adapters: search (Nominatim), route (FOSSGIS OSRM), weather and elevation (Open-Meteo).
// Public servers ask for light use: one request per second, cached results, no bulk calls.

export const providers = {
  search: 'https://nominatim.openstreetmap.org/search',
  routing: {
    driving: 'https://routing.openstreetmap.de/routed-car/route/v1/driving',
    walking: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving',
    cycling: 'https://routing.openstreetmap.de/routed-bike/route/v1/driving'
  },
  forecast: 'https://api.open-meteo.com/v1/forecast',
  archive: 'https://archive-api.open-meteo.com/v1/archive',
  elevation: 'https://api.open-meteo.com/v1/elevation'
};

const cache = new Map();
let lastCall = 0;
let chain = Promise.resolve();

// Serialises calls to a host that allows about one request per second.
function throttled(fn, gap = 1100) {
  const run = chain.then(async () => {
    const wait = Math.max(0, lastCall + gap - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    return fn();
  });
  chain = run.catch(() => {});
  return run;
}

async function getJson(url, signal) {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

export async function searchPlace(query, { signal, near } = {}) {
  const q = query.trim();
  if (q.length < 3) return [];
  const key = 'search|' + q.toLowerCase();
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
  const key = `route|${mode}|${coords}`;
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
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCFullYear(d.getUTCFullYear() + shiftYears);
  return d.toISOString().slice(0, 10);
};

function daysFromToday(iso) {
  return Math.round((new Date(iso + 'T12:00:00Z') - Date.now()) / 86400000);
}

const hm = (s) => (s ? s.slice(11, 16) : '');

// Forecast when the date is within about two weeks, otherwise the average of the same date in the last 5 years.
// Always labelled, so nobody reads a typical day as a forecast.
export async function weather(lat, lon, iso, { signal } = {}) {
  const key = `wx|${lat.toFixed(2)}|${lon.toFixed(2)}|${iso}`;
  if (cache.has(key)) return cache.get(key);
  const lead = daysFromToday(iso);
  let out = null;
  const daily = 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset';
  if (lead >= -1 && lead <= 14) {
    const url = `${providers.forecast}?latitude=${lat}&longitude=${lon}&daily=${daily}&timezone=auto&start_date=${iso}&end_date=${iso}`;
    const j = await getJson(url, signal);
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
      const dd = day(iso, y);
      rows.push(getJson(`${providers.archive}?latitude=${lat}&longitude=${lon}&start_date=${day(dd, 0)}&end_date=${day(dd, 0)}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,sunrise,sunset&timezone=auto`, signal).catch(() => null));
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
  const sets = [];
  for (let i = 0; i < points.length; i += 100) sets.push(points.slice(i, i + 100));
  const out = [];
  for (const set of sets) {
    const lat = set.map((p) => p[1].toFixed(5)).join(',');
    const lon = set.map((p) => p[0].toFixed(5)).join(',');
    const key = `ele|${lat}|${lon}`;
    if (!cache.has(key)) cache.set(key, (await getJson(`${providers.elevation}?latitude=${lat}&longitude=${lon}`, signal)).elevation || []);
    out.push(...cache.get(key));
  }
  return out;
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
