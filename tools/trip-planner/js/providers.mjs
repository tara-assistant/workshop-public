export const defaults = Object.freeze({
  search: 'https://nominatim.openstreetmap.org/search',
  routing: Object.freeze({
    driving: 'https://routing.openstreetmap.de/routed-car/route/v1/driving',
    walking: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving',
    cycling: 'https://routing.openstreetmap.de/routed-bike/route/v1/driving'
  }),
  forecast: 'https://api.open-meteo.com/v1/forecast',
  archive: 'https://archive-api.open-meteo.com/v1/archive',
  elevation: 'https://api.open-meteo.com/v1/elevation',
  marine: 'https://marine-api.open-meteo.com/v1/marine'
});

export function validateProviderUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return url.href.replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function normalizeProviders(value = defaults) {
  const out = { routing: {} };
  for (const key of ['search', 'forecast', 'archive', 'elevation', 'marine']) {
    out[key] = validateProviderUrl(value?.[key]);
    if (!out[key]) throw new Error('Invalid ' + key + ' URL. Use HTTPS, or HTTP on localhost or 127.0.0.1, without credentials, query or fragment.');
  }
  for (const mode of ['driving', 'walking', 'cycling']) {
    out.routing[mode] = validateProviderUrl(value?.routing?.[mode]);
    if (!out.routing[mode]) throw new Error('Invalid ' + mode + ' routing URL.');
  }
  return out;
}
