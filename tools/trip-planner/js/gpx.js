// GPX import and export for hike tracks. Parsed with DOMParser, never inserted as HTML.

export function parseGpx(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('This is not a valid GPX file');
  const read = (sel) => [...doc.querySelectorAll(sel)].map((pt) => {
    const lat = Number(pt.getAttribute('lat'));
    const lon = Number(pt.getAttribute('lon'));
    const ele = Number(pt.querySelector('ele')?.textContent);
    return Number.isFinite(lat) && Number.isFinite(lon) ? (Number.isFinite(ele) ? [lon, lat, Math.round(ele)] : [lon, lat]) : null;
  }).filter(Boolean);
  let track = read('trkpt');
  if (!track.length) track = read('rtept');
  if (!track.length) throw new Error('No track points found in this GPX file');
  const name = doc.querySelector('trk > name, rte > name, metadata > name')?.textContent?.trim() || '';
  // Keep files light: at most 2000 points.
  if (track.length > 2000) {
    const step = Math.ceil(track.length / 2000);
    track = track.filter((_, i) => i % step === 0 || i === track.length - 1);
  }
  return { name, track };
}

const esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

export function toGpx(trip) {
  const wpts = [];
  const trks = [];
  for (const phase of trip.phases) {
    for (const day of phase.days) {
      for (const stop of day.stops) {
        wpts.push(`<wpt lat="${stop.lat}" lon="${stop.lon}"><name>${esc(stop.name)}</name><desc>${esc(stop.desc || '')}</desc></wpt>`);
        if (stop.track?.length) {
          const pts = stop.track.map((p) => `<trkpt lat="${p[1]}" lon="${p[0]}">${p[2] != null ? `<ele>${p[2]}</ele>` : ''}</trkpt>`).join('');
          trks.push(`<trk><name>${esc(stop.name)}</name><trkseg>${pts}</trkseg></trk>`);
        }
      }
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Trip Planner" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${esc(trip.title)}</name></metadata>${wpts.join('')}${trks.join('')}</gpx>\n`;
}
