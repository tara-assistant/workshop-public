// Trip Planner app. Static, keyless. All user text goes in through textContent via h().
import * as store from './store.js';
import { h, safeUrl, stopMapLinks, fmtDay, fmtRange, TYPE_LABEL, PALETTE, allStops, allDays, progress } from './util.js';
import { MapView } from './mapview.js';
import * as geo from './geo.js';
import { parseGpx, toGpx } from './gpx.js';
import { defaults, normalizeProviders } from './providers.mjs';
import { weatherIcon, weatherEligible } from './live.mjs';
import { acceptsAutoPhoto, canApplyAutoPhoto } from './photos.mjs';
import { reorderBases, remapDayState, remapPacking } from './bases.mjs';

const $ = (id) => document.getElementById(id);

const ui = {
  editMode: localStorage.getItem('tp-edit-mode') === '1',
  phase: 'all',           // phase filter: 'all' or phase id
  open: new Set(),        // open day numbers
  focusDay: null,         // day used for routing
  selectedId: null,
  picking: false,
  stopEdit: null,         // { dayNumber, stopId|null }
  dayEdit: null           // { dayNumber|null, phaseId }
};

const wxCache = new Map();
const elevationCache = new Map();
let providerVersion = 0;
let gpsWatch = null;
let gpsToken = null;
let routeVer = 0;
let routeCtl = null;
const legCache = new Map();
let mapView = null;
let weatherRunning = false;

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

const accentColor = () => getComputedStyle(document.documentElement).getPropertyValue('--leaf').trim();

const visiblePhases = (trip) => trip.phases.map((phase, pi) => ({ phase, pi })).filter(({ phase }) => ui.phase === 'all' || phase.id === ui.phase);

/* ---------- render ---------- */

function renderHero(trip) {
  const p = progress(trip);
  $('hero').replaceChildren(
    h('h1', { text: trip.title }),
    h('p', { class: 'meta', text: fmtRange(trip.startDate, trip.endDate) || trip.destination || '' }),
    h('span', { class: 'progress-count', text: `${p.done}/${p.total}`, 'aria-label': `${p.done} of ${p.total} stops visited` })
  );
}

function renderPhaseNav(trip) {
  const nav = $('phaseNav');
  nav.hidden = false;
  nav.replaceChildren(
    h('button', { class: 'chip', type: 'button', 'aria-pressed': String(ui.phase === 'all'), text: 'All', onClick: () => { ui.phase = 'all'; render(); } }),
    ...trip.phases.map((phase, pi) => h('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(ui.phase === phase.id),
      onClick: () => { ui.phase = phase.id; render(); }
    }, h('span', { class: 'phase-dot', style: `--c:${colorOf(trip, phase, pi)}`, 'aria-hidden': 'true' }), phase.title)),
    h('button', { class: 'chip', type: 'button', text: '+', 'aria-label': 'Add a base', onClick: addPhase })
  );
}

const elevationKey = (stop) => `${stop.lon.toFixed(5)},${stop.lat.toFixed(5)}`;
const weatherKey = (trip, day) => {
  const boat = day.stops.find((s) => s.type === 'boat');
  return `${providerVersion}|${trip.id}|${day.dayNumber}|${day.date}|${geo.inForecastWindow(day.date)}|${day.stops[0] ? elevationKey(day.stops[0]) : ''}|boat:${boat ? elevationKey(boat) : ''}`;
};

function wxLine(day) {
  const w = weatherEligible(day) ? wxCache.get(weatherKey(store.active(), day)) : null;
  const el = h('p', { class: 'wx', dataset: { wx: day.dayNumber }, hidden: !w });
  if (w) fillWx(el, w);
  return el;
}

function fillWx(el, w) {
  const r = Math.round;
  el.textContent = `${w.kind === 'forecast' ? 'Forecast.' : `Typical for these dates, average of ${w.years} recent years.`} High ${r(w.tMax)}°, low ${r(w.tMin)}°. Rain chance ${r(w.rainChance)}%. Wind to ${r(w.windMax)} km/h. Sunrise ${w.sunrise || 'unavailable'}, sunset ${w.sunset || 'unavailable'}. Weather is for one point, the first stop of this day. Check local conditions before a hike or boat trip.`;
  el.hidden = false;
}

function weatherChip(day) {
  const w = weatherEligible(day) ? wxCache.get(weatherKey(store.active(), day)) : null;
  const el = h('span', { class: 'wx-chip', dataset: { weatherChip: day.dayNumber }, hidden: !w });
  if (w) fillWeatherChip(el, w);
  return el;
}

function fillWeatherChip(el, w) {
  el.replaceChildren(...[h('span', { text: `${weatherIcon(w.code)} ${Math.round(w.tMax)}° ${Math.round(w.tMin)}°` }),
    w.kind === 'typical' ? h('small', { text: 'typical' }) : null].filter(Boolean));
  el.setAttribute('aria-label', `${w.kind}, high ${Math.round(w.tMax)} degrees, low ${Math.round(w.tMin)} degrees`);
  el.hidden = false;
}

function mapChoice(links) {
  const summary = h('summary', { text: 'Directions' });
  const items = h('div', { class: 'menu-items', popover: 'manual', 'aria-label': 'Open directions with' }, [...links].reverse().map((link) =>
    h('a', { href: link.url, target: '_blank', rel: 'noopener noreferrer', text: link.label.startsWith('Google') ? 'Google Maps' : 'OpenStreetMap', onClick: () => { chooser.open = false; } })));
  const chooser = h('details', { class: 'menu', onToggle: () => {
    if (!chooser.isConnected) return;
    if (!chooser.open) { items.hidePopover(); return; }
    document.querySelectorAll('details.menu[open]').forEach((other) => { if (other !== chooser) other.open = false; });
    items.showPopover();
    const anchor = summary.getBoundingClientRect();
    const bottom = document.querySelector('.add-stop-bar').getBoundingClientRect().top - 8;
    const height = items.offsetHeight;
    items.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - items.offsetWidth - 8))}px`;
    items.style.top = `${anchor.bottom + height + 4 > bottom ? Math.max(8, anchor.top - height - 4) : anchor.bottom + 4}px`;
  } }, summary, items);
  return chooser;
}

function setMapExpanded(expanded) {
  document.querySelector('.map-panel').classList.toggle('map-expanded', expanded);
  $('mapSize').setAttribute('aria-expanded', String(expanded));
  $('mapSize').querySelector('.map-handle-label').textContent = expanded ? 'Collapse map' : 'Expand map';
  localStorage.setItem('tp-map-expanded', expanded ? '1' : '0');
  setTimeout(() => mapView?.resize(), 240);
}

const TYPE_ICON = { sight: '⌖', gem: '◇', hike: '△', dining: '♧', cafe: '☕', swim: '≈', boat: '⚓', lodging: '⌂', transport: '↗' };

function renderStop(trip, phase, pi, day, stop, index) {
  const img = safeUrl(stop.imageUrl);
  const select = () => { if (innerWidth < 960) setMapExpanded(true); selectStop(stop.id, { scroll: false }); };
  const card = h('article', { class: 'stop', id: 'stop-' + stop.id, dataset: { selected: ui.selectedId === stop.id, done: !!stop.visited, expanded: false },
    onClick: (event) => {
      if (event.target.closest('button,a,summary,details')) return;
      if (event.target.closest('.stop-desc')) {
        card.dataset.expanded = String(card.dataset.expanded !== 'true');
        card.querySelector('.stop-name').setAttribute('aria-expanded', card.dataset.expanded);
      }
      select();
    }
  },
    h('div', { class: 'stop-top' },
      h('button', { class: 'check', type: 'button', 'aria-pressed': String(!!stop.visited), 'aria-label': `Mark ${stop.name} visited`, onClick: () => toggleVisited(stop.id) }, h('span', { text: '✓' })),
      h('div', { class: 'stop-main' },
        h('button', { class: 'stop-name', type: 'button', text: stop.name, 'aria-expanded': 'false', onClick: (event) => {
          card.dataset.expanded = String(card.dataset.expanded !== 'true');
          event.currentTarget.setAttribute('aria-expanded', card.dataset.expanded);
          select();
        } }),
        h('p', { class: 'stop-time', text: [stop.time, stop.dwell ? `${stop.dwell} min` : ''].filter(Boolean).join(' · ') }),
        stop.desc && h('p', { class: 'stop-desc', text: stop.desc })
      ),
      img ? h('img', { class: 'stop-photo', src: img, alt: stop.name, loading: 'lazy', referrerpolicy: 'no-referrer', onError: (e) => { e.target.replaceWith(typeIcon(stop)); } }) : typeIcon(stop)
    ),
    h('div', { class: 'links' }, mapChoice(stopMapLinks(stop.lat, stop.lon, day.mode || 'driving').filter((link) => link.label.endsWith(' directions')))),
    h('div', { class: 'stop-details' },
      img && stop.imageCredit && h('p', { class: 'credit', text: 'Photo: ' + stop.imageCredit }),
      h('p', { class: 'stop-elevation ele', dataset: { elevation: elevationKey(stop) }, hidden: !Number.isFinite(elevationCache.get(elevationKey(stop))), text: Number.isFinite(elevationCache.get(elevationKey(stop))) ? `Elevation ${Math.round(elevationCache.get(elevationKey(stop)))} m` : '' }),
      stop.track?.length > 1 && trackBlock(stop),
      ...(stop.links || []).map((link) => safeUrl(link.url) ? h('a', { href: safeUrl(link.url), target: '_blank', rel: 'noopener noreferrer', text: link.label || 'Website' }) : null)
    ),
    ui.editMode && h('button', { class: 'drag-handle', type: 'button', text: '⠿', 'aria-label': `Drag ${stop.name} to reorder`, onPointerDown: (e) => startStopDrag(e, stop.id) }),
    ui.editMode && h('div', { class: 'stop-edit' },
      h('button', { class: 'btn', type: 'button', text: 'Edit', onClick: () => openStopDialog(day.dayNumber, stop.id) }),
      h('button', { class: 'btn', type: 'button', text: 'Move up', 'aria-label': `Move ${stop.name} up`, disabled: index === 0, onClick: () => moveStop(stop.id, -1) }),
      h('button', { class: 'btn', type: 'button', text: 'Move down', 'aria-label': `Move ${stop.name} down`, disabled: index === day.stops.length - 1, onClick: () => moveStop(stop.id, 1) }),
      stop.type === 'hike' && h('button', { class: 'btn', type: 'button', text: stop.track?.length ? 'Replace GPX' : 'Add GPX track', onClick: () => attachGpx(stop.id) }),
      h('button', { class: 'btn btn-danger', type: 'button', text: 'Delete', onClick: () => deleteStop(stop.id) })
    )
  );
  return card;
}

function typeIcon(stop) {
  return h('span', { class: 'type-icon', text: TYPE_ICON[stop.type] || '⌖', role: 'img', 'aria-label': TYPE_LABEL[stop.type] || 'Stop' });
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
  area.setAttribute('fill', 'var(--ok-bg)');
  const line = document.createElementNS(NS, 'path');
  line.setAttribute('d', d);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', 'var(--leaf)');
  line.setAttribute('stroke-width', '2');
  svg.append(area, line);
  return svg;
}

function renderDay(trip, phase, pi, day) {
  const c = colorOf(trip, phase, pi);
  const open = ui.open.has(day.dayNumber);
  const photo = safeUrl(day.photoUrl);
  const head = h('button', { class: 'day-head', type: 'button', 'aria-expanded': String(open), onClick: () => toggleDay(day.dayNumber) },
    h('span', { class: 'day-title' }, h('strong', { text: day.date ? new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(day.date + 'T12:00:00Z')) : day.title }), h('span', { text: `Day ${day.dayNumber} · ${day.stops.length} stops` })),
    weatherChip(day),
    h('span', { class: 'chev', 'aria-hidden': 'true', text: '▾' })
  );
  const body = h('div', { class: 'day-body' });
  if (open) {
    body.append(h('p', { class: 'day-context', text: day.title }));
    if (photo) body.append(h('img', { class: 'day-photo', src: photo, alt: day.title, loading: 'lazy', referrerpolicy: 'no-referrer', onError: (e) => e.target.remove() }), ...day.photoCredit ? [h('p', { class: 'credit', text: 'Photo: ' + day.photoCredit })] : []);
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

  }
  return h('section', { class: 'day', id: 'day-' + day.dayNumber, style: `--c:${c}`, dataset: { open } }, h('div', { class: 'day-heading' }, head), ui.editMode && h('button', { class: 'btn day-edit', type: 'button', text: 'Edit day', onClick: () => openDayDialog(day.dayNumber, phase.id) }), body);
}

function renderList(trip) {
  const list = $('list');
  list.replaceChildren();
  for (const { phase, pi } of visiblePhases(trip)) {
    const c = colorOf(trip, phase, pi);
    list.append(h('div', { class: 'phase-head', style: `--c:${c}` }, h('h2', {}, h('span', { class: 'phase-dot', 'aria-hidden': 'true' }), phase.title), phase.subtitle ? h('p', { text: phase.subtitle }) : null));
    for (const day of phase.days) list.append(renderDay(trip, phase, pi, day));
    if (ui.editMode) list.append(h('div', { class: 'phase-actions' }, h('button', { class: 'btn btn-small', type: 'button', text: 'Add day to this base', onClick: () => openDayDialog(null, phase.id) })));
  }
  list.append($('footerTemplate').content.cloneNode(true));
}

function mapData(trip) {
  const items = [];
  const lines = [];
  for (const { phase, pi } of visiblePhases(trip)) {
    const color = colorOf(trip, phase, pi);
    for (const day of phase.days) {
      day.stops.forEach((s, i) => items.push({ id: s.id, n: i + 1, name: s.name, lat: s.lat, lon: s.lon, color, visited: !!s.visited }));
      if (day.stops.length > 1 && ui.focusDay !== day.dayNumber) lines.push({ color: accentColor(), coords: day.stops.map((s) => [s.lon, s.lat]) });
    }
  }
  const tracks = visiblePhases(trip).flatMap(({ phase }) => phase.days.flatMap((d) => d.stops.filter((s) => s.track?.length > 1).map((s) => s.track)));
  return { items, lines, tracks };
}

function render() {
  const trip = store.active();
  if (!trip) { showEmpty(); return; }
  const focused = document.activeElement;
  const focusRoot = focused?.closest('[id]');
  const focusIndex = focusRoot ? [...focusRoot.querySelectorAll('button,input,select,a')].indexOf(focused) : -1;
  const scroller = $('list').scrollTop;
  ['shareExportBtn', 'addBaseBtn', 'manageBasesBtn', 'clearTicksBtn', 'editModeBtn'].forEach((id) => { $(id).disabled = false; });
  renderHero(trip);
  renderPhaseNav(trip);
  renderList(trip);
  $('undoBtn').hidden = !store.canUndo();
  const data = mapData(trip);
  mapView?.setData(data);
  mapView?.setTracks(data.tracks);
  mapView?.select(ui.selectedId, { fly: false });
  $('mapCaption').textContent = findStop(trip, ui.selectedId)?.stop.name || '';
  $('list').scrollTop = scroller;
  if (focused && !focused.isConnected && focusRoot) {
    const replacement = document.getElementById(focusRoot.id);
    (focusIndex < 0 ? replacement : replacement?.querySelectorAll('button,input,select,a')[focusIndex])?.focus({ preventScroll: true });
  }
  $('editModeBtn').textContent = `Edit mode: ${ui.editMode ? 'on' : 'off'}`;
  $('editModeBtn').setAttribute('aria-pressed', String(ui.editMode));
  $('addStopBtn').disabled = !allDays(trip).length;
  fetchDayServices();
  updateRoute();
  document.title = `${trip.title} · Trip Planner`;
}

function showEmpty() {
  ['shareExportBtn', 'addBaseBtn', 'manageBasesBtn', 'clearTicksBtn', 'editModeBtn', 'addStopBtn'].forEach((id) => { $(id).disabled = true; });
  $('undoBtn').hidden = true;
  $('mapCaption').textContent = '';
  $('hero').replaceChildren(h('h1', { text: 'No trips yet' }), h('p', { class: 'summary', text: 'Create a trip, import one, or restore the Sardegna preset.' }),
    h('div', { class: 'row', style: 'margin-top:12px' },
      h('button', { class: 'btn btn-primary', type: 'button', text: 'New trip', onClick: () => $('newTripDlg').showModal() }),
      h('button', { class: 'btn', type: 'button', text: 'Restore Sardegna preset', onClick: async () => { await store.resetPreset(); render(); } })));
  $('list').replaceChildren();
  $('list').append($('footerTemplate').content.cloneNode(true));
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
  if (scroll) {
    scrollListTo($('stop-' + id));
    $('stop-' + id)?.querySelector('.stop-name')?.focus({ preventScroll: true });
  }
}

function scrollListTo(element) {
  if (!element) return;
  const list = $('list');
  list.scrollTo({ top: list.scrollTop + element.getBoundingClientRect().top - list.getBoundingClientRect().top - 12, behavior: 'smooth' });
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
  if (label) { invalidateDayCaches(); render(); toast(`Undone: ${label}`); }
}

function moveStop(id, delta) {
  const found = findStop(store.active(), id);
  const j = found.index + delta;
  if (j < 0 || j >= found.day.stops.length || delta === 0) return;
  store.mutate('Move stop', (trip) => {
    const f = findStop(trip, id);
    const arr = f.day.stops;
    arr.splice(j, 0, arr.splice(f.index, 1)[0]);
  });
  legCache.delete(store.active().id + '|' + found.day.dayNumber);
  render();
}

function startStopDrag(event, id) {
  if (!event.isPrimary || event.button !== 0) return;
  event.preventDefault();
  const handle = event.currentTarget;
  const card = handle.closest('.stop');
  const others = [...card.parentElement.querySelectorAll('.stop')].filter((el) => el !== card);
  if (!others.length) return;
  const original = findStop(store.active(), id).index;
  let target = original, y = event.clientY, frame;
  handle.setPointerCapture(event.pointerId);
  card.classList.add('dragging');
  const update = () => {
    others.forEach((el) => el.classList.remove('drop-before', 'drop-after'));
    target = others.findIndex((el) => y < el.getBoundingClientRect().top + el.offsetHeight / 2);
    if (target < 0) target = others.length;
    if (target < others.length) others[target].classList.add('drop-before');
    else others.at(-1).classList.add('drop-after');
  };
  const scroll = () => {
    const bounds = $('list').getBoundingClientRect();
    const edge = Math.min(60, bounds.height / 4);
    if (y > bounds.bottom - edge) $('list').scrollBy(0, 14);
    else if (y < bounds.top + edge) $('list').scrollBy(0, -14);
    update();
    frame = requestAnimationFrame(scroll);
  };
  const move = (e) => { y = e.clientY; update(); };
  const finish = (e) => {
    cancelAnimationFrame(frame);
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', finish);
    handle.removeEventListener('pointercancel', finish);
    handle.removeEventListener('lostpointercapture', finish);
    card.classList.remove('dragging');
    others.forEach((el) => el.classList.remove('drop-before', 'drop-after'));
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    if (e.type === 'pointerup' && target !== original) {
      moveStop(id, target - original);
      const moved = $('stop-' + id);
      moved?.querySelector('.drag-handle')?.focus({ preventScroll: true });
      toast('Stop order updated.', { label: 'Undo', run: doUndo });
    }
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
  handle.addEventListener('lostpointercapture', finish);
  frame = requestAnimationFrame(scroll);
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
    trip.phases.push({ id: 'p' + Date.now().toString(36), title: name.trim().slice(0, 120), colorKey: trip.phases.length % PALETTE.length + 1, days: [] });
  });
  render();
}

/* ---------- weather and routes ---------- */

function invalidateDayCaches() {
  providerVersion++;
  wxCache.clear(); legCache.clear();
  routeCtl?.abort(); routeVer++;
}

function packingEntries(tripId) {
  return Object.keys(localStorage).filter((key) => key.startsWith(`tp-pack:${tripId}|`)).map((key) => [key, localStorage.getItem(key)]);
}

function restorePacking(tripId, entries) {
  packingEntries(tripId).forEach(([key]) => localStorage.removeItem(key));
  entries.forEach(([key, value]) => localStorage.setItem(key, value));
}

function renderBases() {
  const trip = store.active();
  $('basesList').replaceChildren(...trip.phases.map((phase, index) => h('div', { class: 'base-row', dataset: { baseId: phase.id } },
    h('strong', { text: phase.title }), h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', text: 'Up', disabled: index === 0, onClick: () => reorderBase(phase.id, -1) }),
      h('button', { class: 'btn', type: 'button', text: 'Down', disabled: index === trip.phases.length - 1, onClick: () => reorderBase(phase.id, 1) })
    ))));
}

function reorderBase(phaseId, delta) {
  const trip = store.active();
  const result = reorderBases(trip, phaseId, delta);
  if (!result) return;
  const state = { open: new Set(ui.open), focusDay: ui.focusDay, selectedId: ui.selectedId, phase: ui.phase };
  const packing = packingEntries(trip.id);
  store.mutate('Reorder bases', (active) => {
    active.phases = result.trip.phases;
    Object.assign(ui, remapDayState(state, result.dayMap));
    restorePacking(trip.id, remapPacking(packing, trip.id, result.dayMap));
  }, { onUndo: () => { Object.assign(ui, state); restorePacking(trip.id, packing); } });
  invalidateDayCaches();
  render(); renderBases();
}

function refreshWeatherDay(tripId, number, key) {
  const trip = store.active();
  const day = trip?.id === tripId ? findDay(trip, number)?.day : null;
  const value = wxCache.get(key);
  if (!day || !value || weatherKey(trip, day) !== key || !weatherEligible(day)) return;
  const chip = document.querySelector(`[data-weather-chip="${number}"]`);
  if (chip) fillWeatherChip(chip, value);
  const detail = document.querySelector(`[data-wx="${number}"]`);
  if (detail) fillWx(detail, value);
}

function fetchDayServices() {
  const trip = store.active();
  if (!trip) return;
  const version = providerVersion;
  for (const { day } of allDays(trip)) {
    if (!ui.open.has(day.dayNumber)) continue;
    const missing = day.stops.filter((stop) => !elevationCache.has(elevationKey(stop))).map((stop) => ({ key: elevationKey(stop), point: [stop.lon, stop.lat] }));
    if (missing.length) {
      missing.forEach(({ key }) => elevationCache.set(key, null));
      geo.elevations(missing.map(({ point }) => point)).then((values) => {
        if (version !== providerVersion) return;
        missing.forEach(({ key }, i) => {
          if (!Number.isFinite(values[i])) return;
          elevationCache.set(key, values[i]);
          document.querySelectorAll('[data-elevation]').forEach((el) => {
            if (el.dataset.elevation === key) { el.textContent = `Elevation ${Math.round(values[i])} m`; el.hidden = false; }
          });
        });
      }).catch(() => {});
    }
  }
  runWeatherQueue();
}

async function runWeatherQueue() {
  if (weatherRunning) return;
  weatherRunning = true;
  try {
    // Choose again after every response so edits and trip switches discard obsolete work.
    for (;;) {
      const trip = store.active();
      if (!trip) break;
      const day = allDays(trip).map(({ day }) => day).find((day) => weatherEligible(day) && !wxCache.has(weatherKey(trip, day)));
      if (!day) break;
      const key = weatherKey(trip, day), number = day.dayNumber, version = providerVersion;
      wxCache.set(key, null);
      const stop = day.stops.find((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lon));
      try {
        const value = await geo.weather(stop.lat, stop.lon, day.date);
        if (version !== providerVersion) continue;
        if (value && Number.isFinite(value.tMax) && Number.isFinite(value.tMin)) {
          wxCache.set(key, value);
          refreshWeatherDay(trip.id, number, key);
        }
      } catch { /* Hide failed weather; saving and the itinerary keep working. */ }
    }
  } finally { weatherRunning = false; }
}

const MODE_WORD = { driving: 'by car', walking: 'on foot', cycling: 'by bike' };

async function updateRoute() {
  const v = ++routeVer;
  routeCtl?.abort();
  routeCtl = new AbortController();
  const trip = store.active();
  const found = ui.focusDay != null ? findDay(trip, ui.focusDay) : null;
  if (!found || found.day.stops.length < 2) { mapView?.setRoutes([]); return; }
  const { day } = found;
  const color = accentColor();
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
  photoVersion++;
  $('stopAdvanced').open = false;
  $('sfPhotos').replaceChildren();
  $('sfFindPhoto').disabled = false;
  $('sfPhotoStatus').textContent = 'Photos from Wikipedia and Wikimedia Commons. Check that the photo shows this stop.';
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

let photoVersion = 0;
async function findPhotos() {
  const version = ++photoVersion;
  const identity = () => JSON.stringify([$('sfName').value, $('sfLat').value, $('sfLon').value, providerVersion]);
  const snapshot = identity();
  $('sfFindPhoto').disabled = true;
  $('sfPhotos').replaceChildren();
  $('sfPhotoStatus').textContent = 'Looking for nearby photos...';
  try {
    const rows = await geo.findStopPhoto($('sfName').value.trim(), $('sfLat').value === '' ? NaN : Number($('sfLat').value), $('sfLon').value === '' ? NaN : Number($('sfLon').value));
    if (version !== photoVersion || !$('stopDlg').open || snapshot !== identity()) return;
    $('sfPhotos').replaceChildren(...rows.map((row, index) => h('div', { class: 'photo-choice' },
      h('button', { type: 'button', 'aria-label': `Use photo ${index + 1}`, 'aria-pressed': 'false', onClick: (event) => {
        if (snapshot !== identity()) { $('sfPhotoStatus').textContent = 'The stop changed. Find photos again.'; return; }
        $('sfImage').value = row.imageUrl;
        $('sfCredit').value = row.imageCredit;
        $('sfPhotos').querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(button === event.currentTarget)));
        $('sfPhotoStatus').textContent = 'Photo selected. Save the stop to keep it.';
      } }, h('img', { src: row.imageUrl, alt: `Candidate ${index + 1}`, referrerpolicy: 'no-referrer', onError: (event) => { event.target.hidden = true; } })),
      h('span', { class: 'credit', text: row.imageCredit }),
      h('a', { href: safeUrl(row.sourceUrl), text: 'Photo source', target: '_blank', rel: 'noopener noreferrer' })
    )));
    $('sfPhotoStatus').textContent = rows.length ? 'Choose one photo. Verify the place and credit at its source.' : 'No credited photos found nearby. Paste an image URL instead.';
  } catch {
    if (version === photoVersion) $('sfPhotoStatus').textContent = 'Photo search is unavailable. Paste an image URL instead.';
  } finally {
    if (version === photoVersion) $('sfFindPhoto').disabled = false;
  }
}

function submitStop(e) {
  e.preventDefault();
  if (e.submitter?.value === 'cancel') { $('stopDlg').close(); return; }
  const err = $('sfError');
  const lat = Number($('sfLat').value), lon = Number($('sfLon').value);
  if (!$('sfLat').value || !$('sfLon').value || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) { err.textContent = 'Enter valid coordinates, or search for the place.'; err.hidden = false; return; }
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
  let addedId = null;
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
      addedId = stop.id;
    }
  });
  legCache.delete(store.active().id + '|' + dayNumber);
  ui.open.add(dayNumber);
  ui.focusDay = dayNumber;
  $('stopDlg').close();
  render();
  if (addedId && !image) autoPhoto(store.active().id, addedId, next);
}

async function autoPhoto(tripId, id, snapshot) {
  try {
    const rows = await geo.findStopPhoto(snapshot.name, snapshot.lat, snapshot.lon);
    const photo = rows[0];
    if (!acceptsAutoPhoto(snapshot.name, photo)) return;
    const trip = store.getTrip(tripId);
    const stop = trip ? findStop(trip, id)?.stop : null;
    if (!canApplyAutoPhoto(stop, snapshot)) return;
    store.patch(() => { stop.imageUrl = photo.imageUrl; stop.imageCredit = photo.imageCredit; }, tripId);
    if (store.active()?.id === tripId) render();
  } catch { /* Photo discovery must never interrupt editing. */ }
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



/* ---------- boot ---------- */

const providerFields = [
  ['wikipedia', 'Wikipedia photo endpoint'],
  ['commons', 'Wikimedia Commons photo endpoint'],
  ['search', 'Place search (Nominatim endpoint)'],
  ['driving', 'Car routing (OSRM route base)'],
  ['walking', 'Foot routing (OSRM route base)'],
  ['cycling', 'Bike routing (OSRM route base)'],
  ['forecast', 'Weather forecast endpoint'],
  ['archive', 'Weather history endpoint'],
  ['elevation', 'Elevation endpoint'],
  ['marine', 'Marine weather endpoint']
];
const routingModes = ['driving', 'walking', 'cycling'];

function fillProviderFields(value) {
  for (const [key] of providerFields) $('provider-' + key).value = routingModes.includes(key) ? value.routing[key] : value[key];
}

function applyProviderSettings(value) {
  geo.configureProviders(value);
  providerVersion++;
  wxCache.clear();
  elevationCache.clear();
  legCache.clear();
  render();
}

function setupProviders() {
  try {
    const saved = localStorage.getItem('tp-providers');
    if (saved) geo.configureProviders(JSON.parse(saved));
  } catch { notice('Saved provider settings could not be loaded. Using public defaults.'); }
  $('providerFields').replaceChildren(...providerFields.map(([key, label]) => h('label', { text: label }, h('input', { id: 'provider-' + key, type: 'url', required: true }))));
  $('settingsBtn').onclick = () => {
    fillProviderFields(geo.providers);
    $('providerError').hidden = true;
    $('tripMenuDlg').close();
    $('settingsDlg').showModal();
  };
  $('providerForm').onsubmit = (event) => {
    event.preventDefault();
    if (event.submitter?.value === 'cancel') { $('settingsDlg').close(); return; }
    try {
      const value = { routing: {} };
      for (const [key] of providerFields) {
        if (routingModes.includes(key)) value.routing[key] = $('provider-' + key).value;
        else value[key] = $('provider-' + key).value;
      }
      const next = normalizeProviders(value);
      localStorage.setItem('tp-providers', JSON.stringify(next));
      applyProviderSettings(next);
      $('settingsDlg').close();
      toast('Provider settings saved in this browser.');
    } catch (error) {
      $('providerError').textContent = error.message;
      $('providerError').hidden = false;
    }
  };
  $('resetProviders').onclick = () => {
    try {
      localStorage.removeItem('tp-providers');
      applyProviderSettings(defaults);
      fillProviderFields(defaults);
      $('providerError').hidden = true;
      toast('Public providers restored.');
    } catch { $('providerError').textContent = 'This browser could not reset the saved settings.'; $('providerError').hidden = false; }
  };
}

function gpsMessage(text) {
  $('gpsStatus').textContent = text;
  $('gpsStatus').hidden = !text;
}

function stopGps(text = 'Location tracking stopped.') {
  gpsToken = null;
  if (gpsWatch !== null) navigator.geolocation?.clearWatch(gpsWatch);
  gpsWatch = null;
  mapView?.setLocation(null);
  $('gps').setAttribute('aria-pressed', 'false');
  gpsMessage(text);
}

function toggleGps() {
  if (gpsToken) { stopGps(); return; }
  if (!navigator.geolocation) { gpsMessage('Location is unavailable in this browser.'); return; }
  const token = gpsToken = {};
  $('gps').setAttribute('aria-pressed', 'true');
  gpsMessage('Waiting for location permission. Coordinates stay on this device.');
  try {
    gpsWatch = navigator.geolocation.watchPosition((position) => {
      if (gpsToken !== token) return;
      mapView?.setLocation([position.coords.longitude, position.coords.latitude]);
      gpsMessage('Location active. Blue dot shown when inside the map view. Press My location to stop.');
    }, (error) => {
      if (gpsToken !== token) return;
      stopGps(error.code === 1 ? 'Location permission denied. Allow location in your browser settings to try again.' : 'Location unavailable. Check your device location settings and try again.');
    }, { enableHighAccuracy: false, maximumAge: 30000, timeout: 15000 });
  } catch { stopGps('Location unavailable in this browser.'); }
}

function wire() {
  setupProviders();
  $('gps').onclick = toggleGps;
  $('mapSize').onclick = () => setMapExpanded(!document.querySelector('.map-panel').classList.contains('map-expanded'));
  setMapExpanded(localStorage.getItem('tp-map-expanded') === '1');
  $('zoomIn').onclick = () => mapView?.map?.zoomIn();
  $('zoomOut').onclick = () => mapView?.map?.zoomOut();
  $('compass').onclick = () => mapView?.map?.resetNorth();
  $('resetMap').onclick = () => { mapView?.reset(ui.focusDay == null ? undefined : findDay(store.active(), ui.focusDay)?.day.stops.map((s) => s.id)); $('tilt').setAttribute('aria-pressed', 'false'); };
  $('addStopBtn').onclick = () => {
    const days = allDays(store.active()).map(({ day }) => day);
    const day = days.find((d) => d.dayNumber === ui.focusDay) || days.find((d) => ui.open.has(d.dayNumber)) || days[0];
    if (day) openStopDialog(day.dayNumber, null);
  };
  $('editModeBtn').onclick = () => { ui.editMode = !ui.editMode; localStorage.setItem('tp-edit-mode', ui.editMode ? '1' : '0'); $('tripMenuDlg').close(); render(); };
  $('addBaseBtn').onclick = () => { $('tripMenuDlg').close(); addPhase(); };
  $('manageBasesBtn').onclick = () => { $('tripMenuDlg').close(); renderBases(); $('basesDlg').showModal(); };
  $('clearTicksBtn').onclick = () => { $('tripMenuDlg').close(); clearTicks(); };
  $('shareExportBtn').onclick = () => { $('tripMenuDlg').close(); $('shareInfo').textContent = ''; $('menuDlg').showModal(); };
  $('toolsBtn').onclick = () => {
    const open = $('mapTools').hidden;
    $('mapTools').hidden = !open;
    $('toolsBtn').setAttribute('aria-expanded', String(open));
  };
  document.addEventListener('click', (event) => { if (event.target.closest('[data-about]')) $('aboutDlg').showModal(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') document.querySelectorAll('details.menu[open]').forEach((d) => { d.open = false; }); });
  document.addEventListener('click', (event) => document.querySelectorAll('details.menu[open]').forEach((d) => { if (!d.contains(event.target)) d.open = false; }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) fetchDayServices(); if (document.hidden && gpsToken) stopGps('Location tracking stopped while the page was hidden.'); });
  window.addEventListener('pagehide', () => { if (gpsToken) stopGps(); });
  $('libraryBtn').onclick = () => { $('tripMenuDlg').close(); $('importError').hidden = true; renderLibrary(); $('libraryDlg').showModal(); };
  $('undoBtn').onclick = () => { $('tripMenuDlg').close(); doUndo(); };
  $('menuBtn').onclick = () => $('tripMenuDlg').showModal();
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
  $('sfFindPhoto').onclick = findPhotos;
  $('stopDlg').addEventListener('close', () => { photoVersion++; });
  $('sfPick').onclick = () => {
    ui.picking = true;
    document.body.classList.add('picking');
    $('stopDlg').close();
    setMapExpanded(true);
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
    onReset: () => {
      const day = ui.focusDay != null ? findDay(store.active(), ui.focusDay)?.day : null;
      mapView.reset(day?.stops.map((stop) => stop.id));
      $('tilt').setAttribute('aria-pressed', 'false');
    },
    onReady: () => { const d = mapData(store.active() || { phases: [] }); mapView.setData(d); mapView.setTracks(d.tracks); mapView.fit(false); },
    onSelectStop: (id) => selectStop(id),
    onMapClick: (ll) => {
      if (!ui.picking) { if (innerWidth < 960) setMapExpanded(!document.querySelector('.map-panel').classList.contains('map-expanded')); return; }
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
