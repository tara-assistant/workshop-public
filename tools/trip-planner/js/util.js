// Small helpers. No user text is ever turned into HTML: build nodes with h().

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export function safeUrl(value) {
  try {
    const u = new URL(String(value));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

export const osmPoint = (lat, lon, zoom = 17) =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`;

export function osmDirections(lat, lon, mode = 'driving') {
  const engine = mode === 'walking' ? 'fossgis_osrm_foot' : mode === 'cycling' ? 'fossgis_osrm_bike' : 'fossgis_osrm_car';
  return `https://www.openstreetmap.org/directions?engine=${engine}&route=%3B${lat}%2C${lon}`;
}

// Weekday comes from the date, never from stored text.
export function fmtDay(iso, withWeekday = true) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '';
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: withWeekday ? 'short' : undefined, day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function fmtRange(start, end) {
  if (!start) return '';
  const a = fmtDay(start, false);
  const b = end && end !== start ? fmtDay(end, false) : '';
  const year = start.slice(0, 4);
  return b ? `${a} to ${b} ${year}` : `${a} ${year}`;
}

export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export const TYPE_LABEL = {
  sight: 'Sight', gem: 'Hidden gem', hike: 'Hike', dining: 'Food', cafe: 'Cafe',
  swim: 'Swim', boat: 'Boat', lodging: 'Stay', transport: 'Travel'
};

export function chipLabels(stop) {
  const out = [];
  const add = (label) => { if (label && !out.includes(label)) out.push(label); };
  add(TYPE_LABEL[stop.type]);
  for (const tag of stop.tags || []) add(TYPE_LABEL[tag] || tag.charAt(0).toUpperCase() + tag.slice(1));
  return out;
}

export const PALETTE = ['#1B4965', '#7B2D8E', '#B44215', '#2D6A4F', '#9A6B00', '#0F766E', '#8B1E3F', '#475569'];

export function slug(text) {
  return String(text).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'trip';
}

export function allDays(trip) {
  return trip.phases.flatMap((phase) => phase.days.map((day) => ({ phase, day })));
}

export function allStops(trip) {
  return allDays(trip).flatMap(({ day }) => day.stops);
}

export function progress(trip) {
  const stops = allStops(trip);
  const done = stops.filter((s) => s.visited).length;
  return { done, total: stops.length };
}
