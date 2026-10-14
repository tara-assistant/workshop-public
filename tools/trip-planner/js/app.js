// Trip Planner app. Static, keyless. All user text goes in through textContent via h().
import * as store from './store.js';
import { h, safeUrl, osmPoint, osmDirections, fmtDay, fmtRange, debounce, TYPE_LABEL, chipLabels, PALETTE, allStops, allDays, progress } from './util.js';
import { MapView } from './mapview.js';
import * as geo from './geo.js';
import { parseGpx, toGpx } from './gpx.js';

const $ = (id) => document.getElementById(id);

const ui = {
  phase: 'all',           // phase filter: 'all' or phase id
  open: new Set(),        // open day numbers
  focusDay: null,         // day used for routing
  selectedId: null,
  picking: false,
  stopEdit: null,         // { dayNumber, stopId|null }
  dayEdit: null           // { dayNumber|null, phaseId }
};

const wxCache = new Map();
let routeVer = 0;
let routeCtl = null;
const legCache = new Map();
let mapView = null;
let mcp = null;

/* ---------- helpers ---------- */

function toast(text, action) {
  const el = $('toast');
  el.replaceChildren(h('span', { text }));
  if (action) el.append(h('button', { type: 'button', text: action.label, onClick: () => { el.hidden = true; action.run(); } }));
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, action ? 8000 : 3500);
}

function notice(text) {
  const el = $('notice');
  el.textContent = text || '';
  el.hidden = !text;
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const colorOf = (trip, phase, index) => {
  const key = (phase.colorKey || index + 1) - 1;
  return trip.theme?.phases?.[key] || PALETTE[key % PALETTE.length];
};

const findDay = (trip, dayNumber) => {
  for (const [pi, phase] of trip.phases.entries()) {
    for (const day of phase.days) if (day.dayNumber === dayNumber) return { phase, day, pi };
  }
  return null;
};

const findStop = (trip, id) => {
  for (const [pi, phase] of trip.phases.entries()) {
    for (const day of phase.days) {
      const index = day.stops.findIndex((s) => s.id === id);
      if (index >= 0) return { phase, day, stop: day.stops[index], index, pi };
    }
  }
  return null;
};

const visiblePhases = (trip) => trip.phases.map((phase, pi) => ({ phase, pi })).filter(({ phase }) => ui.phase === 'all' || phase.id === ui.phase);

/* ---------- render ---------- */

function renderHero(trip) {
  const p = progress(trip);
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  $('hero').replaceChildren(
    h('h1', { text: trip.title }),
    h('p', { class: 'meta', text: [trip.destination, fmtRange(trip.startDate, trip.endDate), `${allDays(trip).length} days, ${p.total} stops`].filter(Boolean).join(' · ') }),
    trip.summary && h('p', { class: 'summary', text: trip.summary }),
    trip.note && h('p', { class: 'banner', text: trip.note }),
    h('div', { class: 'progress' },
      h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct, 'aria-label': 'Stops visited' }, h('span', { style: `width:${pct}%` })),
      h('span', { text: `${p.done} of ${p.total} visited` }),
      p.done ? h('button', { class: 'btn btn-small', type: 'button', text: 'Clear ticks', onClick: clearTicks }) : null
    )
  );
}

function renderPhaseNav(trip) {
  const nav = $('phaseNav');
  nav.hidden = trip.phases.length < 2;
  nav.replaceChildren(
    h('button', { class: 'chip', type: 'button', 'aria-pressed': ui.phase === 'all', text: 'All', onClick: () => { ui.phase = 'all'; render(); } }),
    ...trip.phases.map((phase, pi) => h('button', {
      class: 'chip', type: 'button', style: `--c:${colorOf(trip, phase, pi)}`, 'aria-pressed': ui.phase === phase.id, text: phase.title,
      onClick: () => { ui.phase = phase.id; render(); }
    }))
  );
}

function wxLine(day) {
  const w = wxCache.get(day.dayNumber + '|' + day.date);
  const el = h('div', { class: 'wx', dataset: { wx: day.dayNumber }, hidden: !w });
  if (w) fillWx(el, w, day);
  return el;
}

function fillWx(el, w, day) {
  const r = (n) => Math.round(n);
  const hasHike = day.stops.some((s) => s.type === 'hike');
  el.replaceChildren(
    h('span', {}, h('b', { text: `${r(w.tMin)} to ${r(w.tMax)} °C` })),
    h('span', { text: `Rain ${r(w.rainChance)}%` }),
    h('span', { text: `Wind to ${r(w.windMax)} km/h` }),
    w.sunrise && h('span', { text: `Sun ${w.sunrise} to ${w.sunset}` }),
    h('span', { class: 'wx-note', text: (w.kind === 'forecast' ? 'Forecast.' : `Typical for these dates, average of ${w.years} recent years. Not a forecast.`) + (hasHike ? ' The forecast is for one point. Check the local mountain forecast before a hike.' : '') })
  );
  el.hidden = false;
}

function renderStop(trip, phase, pi, day, stop, index) {
  const c = colorOf(trip, phase, pi);
  const dir = day.mode || 'driving';
  const links = [
    h('button', { type: 'button', text: 'Show on map', onClick: () => selectStop(stop.id, { scroll: false }) }),
    h('a', { href: osmPoint(stop.lat, stop.lon), target: '_blank', rel: 'noopener noreferrer', text: 'Open map' }),
    h('a', { href: osmDirections(stop.lat, stop.lon, dir), target: '_blank', rel: 'noopener noreferrer', text: 'Directions' }),
    ...(stop.links || []).map((l) => { const u = safeUrl(l.url); return u ? h('a', { href: u, target: '_blank', rel: 'noopener noreferrer', text: l.label || 'Link' }) : null; })
  ];
  const img = safeUrl(stop.imageUrl);
  const card = h('article', { class: 'stop', id: 'stop-' + stop.id, style: `--c:${c}`, dataset: { selected: ui.selectedId === stop.id, done: !!stop.visited } },
    h('div', { class: 'stop-top' },
      h('button', { class: 'check', type: 'button', 'aria-pressed': !!stop.visited, 'aria-label': `Mark ${stop.name} visited`, onClick: () => toggleVisited(stop.id) }, h('span', { text: '✓' })),
      h('div', { class: 'stop-main' },
        h('button', { class: 'stop-name', type: 'button', text: `${index + 1}. ${stop.name}`, onClick: () => selectStop(stop.id, { scroll: false }) }),
        h('div', { class: 'stop-time', text: [stop.time, stop.dwell ? `about ${stop.dwell} min` : ''].filter(Boolean).join(' · ') })
      )
    ),
    img && h('img', { class: 'stop-photo', src: img, alt: stop.name, loading: 'lazy', referrerpolicy: 'no-referrer', onError: (e) => { e.target.remove(); } }),
    img && stop.imageCredit && h('p', { class: 'credit', text: 'Photo: ' + stop.imageCredit }),
    stop.desc && h('p', { class: 'stop-desc', text: stop.desc }),
    h('div', { class: 'chips' }, chipLabels(stop).map((label, i) => h('span', { class: 'tag' + (i === 0 ? ' type' : ''), text: label }))),
    stop.track?.length > 1 && trackBlock(stop),
    h('div', { class: 'links' }, links),
    h('div', { class: 'stop-edit' },
      h('button', { class: 'btn btn-small', type: 'button', text: 'Edit', onClick: () => openStopDialog(day.dayNumber, stop.id) }),
      h('button', { class: 'btn btn-small', type: 'button', text: 'Up', 'aria-label': `Move ${stop.name} up`, disabled: index === 0, onClick: () => moveStop(stop.id, -1) }),
      h('button', { class: 'btn btn-small', type: 'button', text: 'Down', 'aria-label': `Move ${stop.name} down`, disabled: index === day.stops.length - 1, onClick: () => moveStop(stop.id, 1) }),
      stop.type === 'hike' ? h('button', { class: 'btn btn-small', type: 'button', text: stop.track?.length ? 'Replace GPX' : 'Add GPX track', onClick: () => attachGpx(stop.id) }) : null,
      h('button', { class: 'btn btn-small btn-danger', type: 'button', text: 'Delete', onClick: () => deleteStop(stop.id) })
    )
  );
  return card;
}

function trackBlock(stop) {
  const s = geo.trackStats(stop.track);
  const hasEle = Number.isFinite(s.min) && Number.isFinite(s.max);
  const wrap = h('div', {},
    h('p', { class: 'ele', text: `Track: ${(s.distance / 1000).toFixed(1)} km` + (hasEle ? `, climb ${Math.round(s.up)} m, descent ${Math.round(s.down)} m, ${Math.round(s.min)} to ${Math.round(s.max)} m high` : ', no elevation data') })
  );
  if (hasEle) wrap.append(profileSvg(stop.track));
  return wrap;
}

function profileSvg(track) {
  const pts = track.filter((p) => p[2] != null);
  const W = 300, H = 70;
  const step = Math.max(1, Math.floor(pts.length / 150));
  const sample = pts.filter((_, i) => i % step === 0);
  const lo = Math.min(...sample.map((p) => p[2])), hi = Math.max(...sample.map((p) => p[2]));
  const span = Math.max(1, hi - lo);
  const d = sample.map((p, i) => `${i ? 'L' : 'M'}${(i / (sample.length - 1 || 1)) * W},${H - 4 - ((p[2] - lo) / span) * (H - 8)}`).join('');
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'profile');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Elevation profile from ${Math.round(lo)} to ${Math.round(hi)} metres`);
  const area = document.createElementNS(NS, 'path');
  area.setAttribute('d', `${d}L${W},${H}L0,${H}Z`);
  area.setAttribute('fill', '#c2410c22');
  const line = document.createElementNS(NS, 'path');
  line.setAttribute('d', d);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', '#c2410c');
  line.setAttribute('stroke-width', '2');
  svg.append(area, line);
  return svg;
}

function renderDay(trip, phase, pi, day) {
  const c = colorOf(trip, phase, pi);
  const open = ui.open.has(day.dayNumber);
  const photo = safeUrl(day.photoUrl);
  const head = h('button', { class: 'day-head', type: 'button', 'aria-expanded': open, onClick: () => toggleDay(day.dayNumber) },
    h('span', { class: 'day-badge', text: 'D' + day.dayNumber }),
    h('span', { class: 'day-title' }, h('strong', { text: day.title }), h('span', { text: [fmtDay(day.date), `${day.stops.length} stops`].filter(Boolean).join(' · ') })),
    h('span', { class: 'chev', 'aria-hidden': 'true', text: '▾' })
  );
  const body = h('div', { class: 'day-body' });
  if (open) {
    if (photo) body.append(h('img', { class: 'day-photo', src: photo, alt: day.title, loading: 'lazy', referrerpolicy: 'no-referrer', onError: (e) => e.target.remove() }), day.photoCredit ? h('p', { class: 'credit', text: 'Photo: ' + day.photoCredit }) : null);
    if (day.date) body.append(wxLine(day));
    if (ui.focusDay === day.dayNumber) body.append(h('p', { class: 'route-line', id: 'routeLine', text: day.stops.length > 1 ? 'Finding travel times…' : '' }));
    day.stops.forEach((stop, i) => {
      if (i > 0 && ui.focusDay === day.dayNumber) body.append(h('p', { class: 'leg', dataset: { leg: i - 1 }, text: legCache.get(trip.id + '|' + day.dayNumber)?.[i - 1] || '' }));
      body.append(renderStop(trip, phase, pi, day, stop, i));
    });
    if (!day.stops.length) body.append(h('p', { class: 'empty', text: 'No stops yet. Add one below.' }));
    if (day.bookings?.length) {
      body.append(h('p', { class: 'sect', text: 'Book ahead' }));
      for (const b of day.bookings) {
        const u = safeUrl(b.url);
        body.append(h('div', { class: 'tip book' }, u ? h('a', { href: u, target: '_blank', rel: 'noopener noreferrer', text: b.label }) : b.label));
      }
    }
    if (day.tips?.length) { body.append(h('p', { class: 'sect', text: 'Tips' })); day.tips.forEach((t) => body.append(h('div', { class: 'tip', text: t }))); }
    if (day.food) body.append(h('p', { class: 'sect', text: 'Food and drink' }), h('div', { class: 'tip food', text: day.food }));
    if (day.packing?.length) {
      body.append(h('p', { class: 'sect', text: 'Pack' }));
      const box = h('div', { class: 'pack' });
      day.packing.forEach((item, i) => {
        const key = `${trip.id}|${day.dayNumber}|${i}`;
        const input = h('input', { type: 'checkbox', checked: localStorage.getItem('tp-pack:' + key) === '1', onChange: (e) => localStorage.setItem('tp-pack:' + key, e.target.checked ? '1' : '0') });
        input.style.cssText = 'width:20px;min-height:20px;height:20px';
        box.append(h('label', {}, input, h('span', { text: item })));
      });
      body.append(box);
    }
    body.append(h('div', { class: 'day-tools' },
      h('button', { class: 'btn btn-small btn-primary', type: 'button', text: 'Add stop', onClick: () => openStopDialog(day.dayNumber, null) }),
      h('button', { class: 'btn btn-small', type: 'button', text: 'Edit day', onClick: () => openDayDialog(day.dayNumber, phase.id) })
    ));
  }
  return h('section', { class: 'day', id: 'day-' + day.dayNumber, style: `--c:${c}`, dataset: { open } }, head, body);
}

function renderList(trip) {
  const list = $('list');
  list.replaceChildren();
  for (const { phase, pi } of visiblePhases(trip)) {
    const c = colorOf(trip, phase, pi);
    list.append(h('div', { class: 'phase-head', style: `--c:${c}` }, h('h2', { text: phase.title }), phase.subtitle ? h('p', { text: phase.subtitle }) : null));
    for (const day of phase.days) list.append(renderDay(trip, phase, pi, day));
    list.append(h('div', { class: 'phase-actions' }, h('button', { class: 'btn btn-small', type: 'button', text: 'Add day to this base', onClick: () => openDayDialog(null, phase.id) })));
  }
  list.append(h('div', { class: 'phase-actions' }, h('button', { class: 'btn btn-small', type: 'button', text: 'Add a base', onClick: addPhase })));
}

function mapData(trip) {
  const items = [];
  const lines = [];
  for (const { phase, pi } of visiblePhases(trip)) {
    const color = colorOf(trip, phase, pi);
    for (const day of phase.days) {
      day.stops.forEach((s, i) => items.push({ id: s.id, n: i + 1, name: s.name, lat: s.lat, lon: s.lon, color, visited: !!s.visited }));
      if (day.stops.length > 1 && ui.focusDay !== day.dayNumber) lines.push({ color, coords: day.stops.map((s) => [s.lon, s.lat]) });
    }
  }
  const tracks = visiblePhases(trip).flatMap(({ phase }) => phase.days.flatMap((d) => d.stops.filter((s) => s.track?.length > 1).map((s) => s.track)));
  return { items, lines, tracks };
}

function render() {
  const trip = store.active();
  if (!trip) { showEmpty(); return; }
  const scroller = document.scrollingElement.scrollTop;
  renderHero(trip);
  renderPhaseNav(trip);
  renderList(trip);
  $('undoBtn').hidden = !store.canUndo();
  const data = mapData(trip);
  mapView?.setData(data);
  mapView?.setTracks(data.tracks);
  mapView?.select(ui.selectedId, { fly: false });
  document.scrollingElement.scrollTop = scroller;
  fetchWeatherForOpenDays();
  updateRoute();
  document.title = `${trip.title} · Trip Planner`;
}

function showEmpty() {
  $('hero').replaceChildren(h('h1', { text: 'No trips yet' }), h('p', { class: 'summary', text: 'Create a trip, import one, or restore the Sardegna preset.' }),
    h('div', { class: 'row', style: 'margin-top:12px' },
      h('button', { class: 'btn btn-primary', type: 'button', text: 'New trip', onClick: () => $('newTripDlg').showModal() }),
      h('button', { class: 'btn', type: 'button', text: 'Restore Sardegna preset', onClick: async () => { await store.resetPreset(); render(); } })));
  $('list').replaceChildren();
  $('phaseNav').hidden = true;
  mapView?.setData({ items: [], lines: [] });
}

/* ---------- interaction ---------- */

function toggleDay(n) {
  if (ui.open.has(n)) {
    ui.open.delete(n);
    if (ui.focusDay === n) ui.focusDay = null;
  } else {
    ui.open.add(n);
    ui.focusDay = n;
  }
  render();
  if (ui.open.has(n)) fitDay(n);
}

function fitDay(n) {
  const trip = store.active();
  const found = findDay(trip, n);
  if (!found || !mapView?.loaded) return;
  mapView.fitItems(found.day.stops.map((s) => s.id));
}

function selectStop(id, { scroll = true } = {}) {
  const trip = store.active();
  const found = findStop(trip, id);
  if (!found) return;
  ui.selectedId = id;
  const needsOpen = !ui.open.has(found.day.dayNumber);
  if (needsOpen) { ui.open.add(found.day.dayNumber); ui.focusDay = found.day.dayNumber; render(); }
  else {
    document.querySelectorAll('.stop[data-selected=true]').forEach((el) => { el.dataset.selected = 'false'; });
    $('stop-' + id)?.setAttribute('data-selected', 'true');
  }
  mapView?.select(id);
  $('mapCaption').textContent = found.stop.name;
  if (scroll) $('stop-' + id)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function toggleVisited(id) {
  const trip = store.active();
  const found = findStop(trip, id);
  store.patch(() => { found.stop.visited = !found.stop.visited; });
  const card = $('stop-' + id);
  if (card) {
    card.dataset.done = String(!!found.stop.visited);
    card.querySelector('.check')?.setAttribute('aria-pressed', String(!!found.stop.visited));
  }
  mapView?.markVisited(id, found.stop.visited);
  renderHero(trip);
}

function clearTicks() {
  store.mutate('Clear ticks', (trip) => { for (const s of allStops(trip)) s.visited = false; });
  render();
  toast('Ticks cleared.', { label: 'Undo', run: doUndo });
}

function doUndo() {
  const label = store.undo();
  if (label) { render(); toast(`Undone: ${label}`); }
}

function moveStop(id, delta) {
  const found = findStop(store.active(), id);
  const j = found.index + delta;
  if (j < 0 || j >= found.day.stops.length) return;
  store.mutate('Move stop', (trip) => {
    const f = findStop(trip, id);
    const arr = f.day.stops;
    [arr[f.index], arr[j]] = [arr[j], arr[f.index]];
  });
  legCache.delete(store.active().id + '|' + found.day.dayNumber);
  render();
}

function deleteStop(id) {
  const found = findStop(store.active(), id);
  store.mutate('Delete stop', (trip) => { const f = findStop(trip, id); f.day.stops.splice(f.index, 1); });
  legCache.delete(store.active().id + '|' + found.day.dayNumber);
  render();
  toast(`Deleted ${found.stop.name}.`, { label: 'Undo', run: doUndo });
}

function addPhase() {
  const name = window.prompt('Name of the new base (for example, Cagliari):');
  if (!name || !name.trim()) return;
  store.mutate('Add base', (trip) => {
    trip.phases.push({ id: 'p' + Date.now().toString(36), title: name.trim().slice(0, 120), colorKey: trip.phases.length + 1, days: [] });
  });
  render();
}

/* ---------- weather and routes ---------- */

async function fetchWeatherForOpenDays() {
  const trip = store.active();
  for (const day of allDays(trip).map((x) => x.day)) {
    if (!ui.open.has(day.dayNumber) || !day.date || !day.stops.length) continue;
    const key = day.dayNumber + '|' + day.date;
    if (wxCache.has(key)) continue;
    wxCache.set(key, null);
    const s = day.stops[0];
    geo.weather(s.lat, s.lon, day.date).then((w) => {
      if (!w) { wxCache.delete(key); return; }
      wxCache.set(key, w);
      const el = document.querySelector(`[data-wx="${day.dayNumber}"]`);
      if (el) fillWx(el, w, day);
    }).catch(() => wxCache.delete(key));
  }
}

const MODE_WORD = { driving: 'by car', walking: 'on foot', cycling: 'by bike' };

async function updateRoute() {
  const v = ++routeVer;
  routeCtl?.abort();
  routeCtl = new AbortController();
  const trip = store.active();
  const found = ui.focusDay != null ? findDay(trip, ui.focusDay) : null;
  if (!found || found.day.stops.length < 2) { mapView?.setRoutes([]); return; }
  const { day, phase, pi } = found;
  const color = colorOf(trip, phase, pi);
  const mode = day.mode || 'driving';
  const stops = day.stops;
  // Boat legs are never routed over roads.
  const noRoad = (a, b) => a.type === 'boat' || b.type === 'boat';
  const labels = new Array(stops.length - 1).fill('');
  const lines = [];
  let total = 0, time = 0, failed = false;
  let i = 0;
  while (i < stops.length - 1) {
    if (noRoad(stops[i], stops[i + 1])) { labels[i] = 'By boat or on foot at sea. No road route is shown.'; i++; continue; }
    let j = i;
    while (j < stops.length - 1 && !noRoad(stops[j], stops[j + 1])) j++;
    const run = stops.slice(i, j + 1);
    try {
      const r = await geo.route(run.map((s) => [s.lon, s.lat]), mode, { signal: routeCtl.signal });
      if (v !== routeVer) return;
      if (r) {
        r.legs.forEach((l, k) => { labels[i + k] = `${Math.max(1, Math.round(l.duration / 60))} min, ${(l.distance / 1000).toFixed(1)} km ${MODE_WORD[mode]}`; });
        lines.push({ color, coords: r.coords });
        total += r.distance; time += r.duration;
      } else { failed = true; for (let k = i; k < j; k++) labels[k] = 'No route found.'; }
    } catch (e) {
      if (e.name === 'AbortError' || v !== routeVer) return;
      failed = true;
      for (let k = i; k < j; k++) labels[k] = 'Travel time unavailable right now.';
    }
    i = j;
  }
  legCache.set(trip.id + '|' + day.dayNumber, labels);
  mapView?.setRoutes(lines);
  document.querySelectorAll('.leg').forEach((el) => { el.textContent = labels[Number(el.dataset.leg)] || ''; });
  const line = $('routeLine');
  if (line) line.textContent = failed && !lines.length ? 'Travel times are unavailable. The stops and map still work.' : `Day total: about ${Math.round(time / 60)} min and ${(total / 1000).toFixed(0)} km ${MODE_WORD[mode]}, driving or walking only. Boat legs and visits are not included.`;
}

/* ---------- stop dialog ---------- */

function openStopDialog(dayNumber, stopId) {
  const trip = store.active();
  const found = stopId ? findStop(trip, stopId) : null;
  ui.stopEdit = { dayNumber, stopId };
  const s = found?.stop;
  $('stopTitle').textContent = s ? 'Edit stop' : 'Add stop';
  $('sfName').value = s?.name || '';
  $('sfType').value = s?.type || 'sight';
  $('sfTime').value = s?.time || '';
  $('sfLat').value = s ? s.lat : '';
  $('sfLon').value = s ? s.lon : '';
  $('sfDwell').value = s?.dwell ?? 45;
  $('sfTags').value = (s?.tags || []).join(', ');
  $('sfDesc').value = s?.desc || '';
  $('sfLink').value = s?.links?.[0]?.url || '';
  $('sfLinkLabel').value = s?.links?.[0]?.label || '';
  $('sfImage').value = s?.imageUrl || '';
  $('sfCredit').value = s?.imageCredit || '';
  $('sfSearch').value = '';
  $('sfResults').replaceChildren();
  $('sfError').hidden = true;
  $('stopDlg').showModal();
}

async function runSearch() {
  const q = $('sfSearch').value;
  const box = $('sfResults');
  if (q.trim().length < 3) { box.replaceChildren(); return; }
  box.replaceChildren(h('li', {}, h('button', { type: 'button', disabled: true, text: 'Searching…' })));
  try {
    const rows = await geo.searchPlace(q);
    box.replaceChildren(...(rows.length ? rows : []).map((r) => h('li', { role: 'option' }, h('button', {
      type: 'button', text: r.name, onClick: () => {
        $('sfName').value = $('sfName').value || r.name.split(',')[0];
        $('sfLat').value = r.lat.toFixed(5);
        $('sfLon').value = r.lon.toFixed(5);
        box.replaceChildren();
      }
    }))));
    if (!rows.length) box.replaceChildren(h('li', {}, h('button', { type: 'button', disabled: true, text: 'No results. Try a different spelling, or pick on the map.' })));
  } catch {
    box.replaceChildren(h('li', {}, h('button', { type: 'button', disabled: true, text: 'Search is unavailable right now. You can still type coordinates or pick on the map.' })));
  }
}

function submitStop(e) {
  e.preventDefault();
  if (e.submitter?.value === 'cancel') { $('stopDlg').close(); return; }
  const err = $('sfError');
  const lat = Number($('sfLat').value), lon = Number($('sfLon').value);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) { err.textContent = 'Enter valid coordinates, or search for the place.'; err.hidden = false; return; }
  const link = $('sfLink').value.trim();
  if (link && !safeUrl(link)) { err.textContent = 'The link must start with https://'; err.hidden = false; return; }
  const image = $('sfImage').value.trim();
  if (image && !safeUrl(image)) { err.textContent = 'The photo address must start with https://'; err.hidden = false; return; }
  const next = {
    name: $('sfName').value.trim(), type: $('sfType').value, time: $('sfTime').value.trim() || undefined,
    dwell: Math.max(0, Math.round(Number($('sfDwell').value) || 0)), lat, lon, desc: $('sfDesc').value.trim() || undefined,
    tags: $('sfTags').value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 12),
    imageUrl: image || undefined, imageCredit: $('sfCredit').value.trim() || undefined
  };
  const { dayNumber, stopId } = ui.stopEdit;
  store.mutate(stopId ? 'Edit stop' : 'Add stop', (trip) => {
    const f = findDay(trip, dayNumber);
    if (stopId) {
      const target = findStop(trip, stopId).stop;
      Object.assign(target, next);
      const links = (target.links || []).slice(1);
      target.links = link ? [{ kind: 'web', label: $('sfLinkLabel').value.trim() || 'Link', url: link }, ...links] : links;
    } else {
      const stop = { id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), links: link ? [{ kind: 'web', label: $('sfLinkLabel').value.trim() || 'Link', url: link }] : [], visited: false, ...next };
      f.day.stops.push(stop);
      ui.selectedId = stop.id;
    }
  });
  legCache.delete(store.active().id + '|' + dayNumber);
  ui.open.add(dayNumber);
  ui.focusDay = dayNumber;
  $('stopDlg').close();
  render();
}

/* ---------- day dialog ---------- */

function openDayDialog(dayNumber, phaseId) {
  const trip = store.active();
  const found = dayNumber != null ? findDay(trip, dayNumber) : null;
  ui.dayEdit = { dayNumber, phaseId };
  const d = found?.day;
  $('dayTitle').textContent = d ? 'Edit day' : 'Add day';
  $('dfTitle').value = d?.title || '';
  $('dfDate').value = d?.date || '';
  $('dfMode').value = d?.mode || 'driving';
  $('dfPhase').replaceChildren(...trip.phases.map((p) => h('option', { value: p.id, text: p.title, selected: p.id === (found?.phase.id || phaseId) })));
  $('dfTips').value = (d?.tips || []).join('\n');
  $('dfFood').value = d?.food || '';
  $('dfPacking').value = (d?.packing || []).join('\n');
  $('dfPhoto').value = d?.photoUrl || '';
  $('dfCredit').value = d?.photoCredit || '';
  $('dfDelete').hidden = !d;
  $('dayDlg').showModal();
}

function submitDay(e) {
  e.preventDefault();
  if (e.submitter?.value === 'cancel') { $('dayDlg').close(); return; }
  const photo = $('dfPhoto').value.trim();
  if (photo && !safeUrl(photo)) { toast('The photo address must start with https://'); return; }
  const lines = (id) => $(id).value.split('\n').map((t) => t.trim()).filter(Boolean);
  const { dayNumber } = ui.dayEdit;
  const targetPhase = $('dfPhase').value;
  const fields = {
    title: $('dfTitle').value.trim(), date: $('dfDate').value || undefined, mode: $('dfMode').value,
    tips: lines('dfTips'), food: $('dfFood').value.trim() || undefined, packing: lines('dfPacking'),
    photoUrl: photo || undefined, photoCredit: $('dfCredit').value.trim() || undefined
  };
  let openNumber = dayNumber;
  store.mutate(dayNumber != null ? 'Edit day' : 'Add day', (trip) => {
    if (dayNumber != null) {
      const f = findDay(trip, dayNumber);
      Object.assign(f.day, fields);
      if (f.phase.id !== targetPhase) {
        f.phase.days = f.phase.days.filter((x) => x !== f.day);
        trip.phases.find((p) => p.id === targetPhase).days.push(f.day);
      }
    } else {
      openNumber = Math.max(0, ...allDays(trip).map((x) => x.day.dayNumber)) + 1;
      trip.phases.find((p) => p.id === targetPhase).days.push({ dayNumber: openNumber, stops: [], bookings: [], ...fields });
    }
  });
  ui.open.add(openNumber);
  ui.focusDay = openNumber;
  $('dayDlg').close();
  render();
}

function deleteDay() {
  const { dayNumber } = ui.dayEdit;
  store.mutate('Delete day', (trip) => { const f = findDay(trip, dayNumber); f.phase.days = f.phase.days.filter((d) => d !== f.day); });
  ui.open.delete(dayNumber);
  if (ui.focusDay === dayNumber) ui.focusDay = null;
  $('dayDlg').close();
  render();
  toast('Day deleted.', { label: 'Undo', run: doUndo });
}

/* ---------- GPX ---------- */

function pickFile(accept) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, hidden: true });
    input.addEventListener('change', () => { resolve(input.files[0] || null); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

async function attachGpx(stopId) {
  const file = await pickFile('.gpx,application/gpx+xml');
  if (!file) return;
  try {
    const { track } = parseGpx(await file.text());
    store.mutate('Add GPX track', (trip) => { findStop(trip, stopId).stop.track = track; });
    render();
    toast(`Track added: ${track.length} points.`);
  } catch (err) { toast(err.message); }
}

/* ---------- library, import, share ---------- */

function renderLibrary() {
  const box = $('tripList');
  const current = store.active()?.id;
  box.replaceChildren(...store.list().map((t) => h('li', { class: 'trip-item', dataset: { active: t.id === current } },
    h('strong', { text: t.title }),
    h('small', { text: [t.destination, fmtRange(t.startDate, t.endDate), `${t.progress.done}/${t.progress.total} visited`, t.preset ? 'Preset' : ''].filter(Boolean).join(' · ') }),
    h('div', { class: 'row' },
      h('button', { class: 'btn btn-small btn-primary', type: 'button', text: 'Open', onClick: () => { store.setActive(t.id); ui.open.clear(); ui.focusDay = null; ui.phase = 'all'; ui.selectedId = null; $('libraryDlg').close(); render(); mapView?.fit(); } }),
      h('button', { class: 'btn btn-small', type: 'button', text: 'Duplicate', onClick: () => { store.duplicate(t.id); renderLibrary(); render(); } }),
      h('button', { class: 'btn btn-small btn-danger', type: 'button', text: 'Delete', onClick: () => { store.remove(t.id); renderLibrary(); render(); toast(`Deleted ${t.title}.`, { label: 'Undo', run: () => { store.restoreDeleted(); render(); } }); } })
    )
  )));
  $('presetBtn').hidden = store.presetPresent();
}

function gpxToTrip(name, track) {
  const first = track[0];
  const id = 'gpx-' + Date.now().toString(36);
  return {
    schema: 1, id, title: name || 'Imported track', destination: '', summary: 'Imported from a GPX file.',
    phases: [{ id: 'p1', title: 'Track', colorKey: 1, days: [{ dayNumber: 1, title: 'Hike', mode: 'walking', tips: [], packing: [], stops: [{ id: 's1', name: name || 'Trailhead', type: 'hike', dwell: 120, lat: first[1], lon: first[0], tags: ['hike'], links: [], track, visited: false }] }] }]
  };
}

async function importFile(file) {
  const err = $('importError');
  err.hidden = true;
  const text = await file.text();
  let result;
  if (/\.gpx$/i.test(file.name) || text.trimStart().startsWith('<')) {
    try { const g = parseGpx(text); result = store.importTrip(gpxToTrip(g.name, g.track)); } catch (e) { result = { ok: false, errors: [{ path: '/', message: e.message }] }; }
  } else result = store.importText(text);
  if (!result.ok) {
    err.textContent = 'This file was not imported.\n' + result.errors.slice(0, 8).map((x) => `${x.path} ${x.message}`).join('\n');
    err.hidden = false;
    return;
  }
  ui.open.clear(); ui.focusDay = null; ui.phase = 'all';
  $('libraryDlg').close();
  render();
  mapView?.fit();
  toast(result.warnings?.length ? `Imported with notes: ${result.warnings[0]}` : 'Trip imported.');
}

async function packShare(trip) {
  const stream = new Blob([JSON.stringify(trip)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const MAX_PLAN_BYTES = 2_000_000;

// Reads a stream but stops as soon as it passes the limit, so a small link cannot expand into a huge one.
async function readCapped(stream, limit = MAX_PLAN_BYTES) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) { await reader.cancel().catch(() => {}); throw new Error('The trip is larger than 2 MB.'); }
    chunks.push(value);
  }
  return new TextDecoder().decode(await new Blob(chunks).arrayBuffer());
}

async function unpackShare(code) {
  if (code.length > 1_000_000) throw new Error('The share link is too long.');
  const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return readCapped(stream);
}

async function loadFromUrlParams() {
  const params = new URLSearchParams(location.search);
  const remote = params.get('plan');
  const hash = location.hash.startsWith('#plan=') ? location.hash.slice(6) : '';
  let text = '';
  try {
    if (hash) text = await unpackShare(hash);
    else if (remote) {
      const u = safeUrl(remote);
      if (!u || !u.startsWith('https:')) throw new Error('The plan link must start with https://');
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 15000);
      try {
        const res = await fetch(u, { headers: { Accept: 'application/json' }, signal: ctl.signal, credentials: 'omit' });
        if (!res.ok) throw new Error('The plan link did not load (HTTP ' + res.status + ').');
        if (Number(res.headers.get('content-length')) > MAX_PLAN_BYTES) throw new Error('The trip is larger than 2 MB.');
        text = res.body ? await readCapped(res.body) : '';
      } finally { clearTimeout(timer); }
    } else return;
  } catch (e) { notice('Could not open the shared trip. ' + e.message); return; }
  const result = store.importText(text);
  history.replaceState(null, '', location.pathname);
  if (!result.ok) notice('The shared trip was not valid, so it was not opened:\n' + result.errors.slice(0, 4).map((x) => `${x.path} ${x.message}`).join('; '));
  else toast('Opened the shared trip. It is saved in this browser.');
}

/* ---------- local agent connector (optional) ---------- */

async function connectMcp() {
  const base = $('mcpUrl').value.trim().replace(/\/$/, '');
  const status = $('mcpStatus');
  const u = safeUrl(base);
  if (!u || !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base)) { status.textContent = 'Use a local address such as http://127.0.0.1:4789'; return; }
  status.textContent = 'Connecting…';
  try {
    const health = await (await fetch(base + '/health')).json();
    if (!health.ok) throw new Error('not ok');
  } catch { status.textContent = 'Nothing answered. Start the connector first (see mcp/README.md).'; return; }
  mcp?.close();
  mcp = new EventSource(base + '/events');
  const sync = async (id) => {
    try {
      const obj = await (await fetch(`${base}/trips/${encodeURIComponent(id)}`)).json();
      const r = store.upsert(obj);
      if (r.ok) { render(); toast(`Updated from your agent: ${obj.title}`); }
      else notice('Your agent saved a trip that does not match the format: ' + r.errors.slice(0, 3).map((x) => `${x.path} ${x.message}`).join('; '));
    } catch { /* trip may have been deleted */ }
  };
  mcp.onmessage = (ev) => { try { sync(JSON.parse(ev.data).id); } catch { /* ignore */ } };
  mcp.onerror = () => { status.textContent = 'Connection lost. It retries by itself.'; };
  mcp.onopen = () => { status.textContent = 'Connected. Changes your agent makes appear here.'; };
  try { for (const t of await (await fetch(base + '/trips')).json()) await sync(t.id); } catch { /* ignore */ }
}

/* ---------- boot ---------- */

function wire() {
  $('libraryBtn').onclick = () => { $('importError').hidden = true; renderLibrary(); $('libraryDlg').showModal(); };
  $('undoBtn').onclick = doUndo;
  $('menuBtn').onclick = () => { $('shareInfo').textContent = ''; $('menuDlg').showModal(); };
  $('newTripBtn').onclick = () => { $('libraryDlg').close(); $('newTripDlg').showModal(); };
  $('importBtn').onclick = async () => { const f = await pickFile('.json,.gpx,application/json,application/gpx+xml'); if (f) importFile(f); };
  $('presetBtn').onclick = async () => { await store.resetPreset(); ui.open.clear(); $('libraryDlg').close(); render(); mapView?.fit(); };
  $('newTripForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.submitter?.value === 'cancel') { $('newTripDlg').close(); return; }
    const t = store.createBlank({ title: $('ntTitle').value.trim(), destination: $('ntDest').value.trim(), startDate: $('ntDate').value });
    e.target.reset();
    ui.open = new Set([1]); ui.focusDay = 1; ui.phase = 'all';
    $('newTripDlg').close();
    render();
    toast(`Created ${t.title}. Add your first stop.`);
  });
  $('stopForm').addEventListener('submit', submitStop);
  $('dayForm').addEventListener('submit', submitDay);
  $('dfDelete').onclick = deleteDay;
  // Public Nominatim forbids search-as-you-type, so a search runs only on Enter or the Search button.
  $('sfSearch').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); runSearch(); } });
  $('sfGo').onclick = runSearch;
  $('sfPick').onclick = () => {
    ui.picking = true;
    document.body.classList.add('picking');
    $('stopDlg').close();
    toast('Tap the map where the stop is.');
  };
  $('exportJson').onclick = () => download(`${store.active().id}.json`, store.exportJson(), 'application/json');
  $('exportGpx').onclick = () => download(`${store.active().id}.gpx`, toGpx(store.active()), 'application/gpx+xml');
  $('printBtn').onclick = () => { $('menuDlg').close(); allDays(store.active()).forEach(({ day }) => ui.open.add(day.dayNumber)); ui.phase = 'all'; render(); setTimeout(() => window.print(), 250); };
  $('shareBtn').onclick = async () => {
    try {
      const code = await packShare(store.active());
      const link = `${location.origin}${location.pathname}#plan=${code}`;
      await navigator.clipboard.writeText(link).catch(() => {});
      $('shareInfo').textContent = link.length > 8000 ? `Link copied, but it is long (${link.length} characters). Some apps cut long links. Download the JSON instead for big trips.` : 'Link copied. Anyone with it can open this trip. Nothing was uploaded.';
    } catch { $('shareInfo').textContent = 'Could not build a link in this browser. Download the JSON instead.'; }
  };
  $('mcpConnect').onclick = connectMcp;
  const sel = $('sfType');
  Object.entries(TYPE_LABEL).forEach(([v, l]) => sel.append(h('option', { value: v, text: l })));
  document.querySelectorAll('[data-layer]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('[data-layer]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    mapView?.setMode(b.dataset.layer);
  }));
  $('tilt').onclick = (e) => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', String(on)); mapView?.set3D(on); };
  $('fit').onclick = () => (ui.focusDay != null ? fitDay(ui.focusDay) : mapView?.fit());
  document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));
}

async function boot() {
  wire();
  try { await store.init(); } catch (e) { notice('The app could not load its files. Reload the page. ' + e.message); return; }
  await loadFromUrlParams();
  if (store.storageError) notice(store.storageError);
  mapView = new MapView($('map'), {
    onNotice: notice,
    onReady: () => { const d = mapData(store.active() || { phases: [] }); mapView.setData(d); mapView.setTracks(d.tracks); mapView.fit(false); },
    onSelectStop: (id) => selectStop(id),
    onMapClick: (ll) => {
      if (!ui.picking) return;
      ui.picking = false;
      document.body.classList.remove('picking');
      $('sfLat').value = ll.lat.toFixed(5);
      $('sfLon').value = ll.lng.toFixed(5);
      $('stopDlg').showModal();
    }
  });
  mapView.start();
  render();
}

boot();
