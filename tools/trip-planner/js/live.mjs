export const LIVE_TTL = 600000;

export function weatherEligible(day, _today = new Date().toLocaleDateString('en-CA'), stop) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day?.date || '') && (stop ? [stop] : day.stops).some((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
}

export function weatherIcon(code) {
  if (code === 0 || code === 1) return '☀';
  if ([2, 3, 45, 48].includes(code)) return '☁';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '❄';
  return '☂';
}

export function weatherRequestKey(tripId, day, stop, providerVersion, forecast) {
  return JSON.stringify([providerVersion, tripId, stop.id, day.date, stop.lat, stop.lon, forecast]);
}
