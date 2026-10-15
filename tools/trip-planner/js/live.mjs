export const LIVE_TTL = 600000;

export function weatherEligible(day, today = new Date().toLocaleDateString('en-CA')) {
  return !!day.date && day.date >= today && day.stops.some((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lon));
}

export function weatherIcon(code) {
  if (code === 0 || code === 1) return '☀';
  if ([2, 3, 45, 48].includes(code)) return '☁';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '❄';
  return '☂';
}
