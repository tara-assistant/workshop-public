// Trip Planner app. Static, keyless. All user text goes in through textContent via h().
import * as store from './store.js';
import { h, safeUrl, stopMapLinks, fmtRange, TYPE_LABEL, PALETTE, allStops, allDays, progress, chipLabels } from './util.js';
import { MapView } from './mapview.js';
import * as geo from './geo.js';
import { parseGpx, toGpx } from './gpx.js';
import { defaults, normalizeProviders } from './providers.mjs';
import { weatherIcon, weatherEligible, weatherRequestKey } from './live.mjs';
import { acceptsAutoPhoto, canApplyAutoPhoto } from './photos.mjs';
import { reorderBases, remapDayState, remapPacking } from './bases.mjs';

const $ = (id) => document.getElementById(id);

const ui = {
  phase: 'all',           // phase filter: 'all' or phase id
  open: new Set([1]),     // show the first day's photo and plan on arrival
  collapsedBases: new Set(),
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
let librarySelectedId = null;
let managedBaseId = null;
let settingsReturningToMenu = false;

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

// Stable identity ordering keeps base colours distinct through filtering and reordering.
const colorOf = (trip, phase) => {
  const index = trip.phases.map((base) => base.id).sort().indexOf(phase.id);
  return `hsl(${(150 + index * 137.508) % 360} 46% 36%)`;
};

function chevron(className) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'm6 9 6 6 6-6');
  svg.append(path);
  return svg;
}

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
  const days = allDays(trip);
  const dates = new Set(days.map(({ day }) => day.date).filter(Boolean)).size;
  const dateLabel = dates ? `${dates} ${dates === 1 ? 'date' : 'dates'}` : `${days.length} ${days.length === 1 ? 'day' : 'days'}`;
  const baseLabel = `${trip.phases.length} ${trip.phases.length === 1 ? 'base' : 'bases'}`;
  $('hero').replaceChildren(
    h('h1', { text: trip.title }),
    h('p', { class: 'meta', text: [fmtRange(trip.startDate, trip.endDate), trip.destination, `${days.length} days`, `${p.total} stops`].filter(Boolean).join(' · ') })
  );
  $('tripMark').textContent = `${dateLabel} · ${baseLabel}`;
  $('tripProgress').hidden = false;
  $('tripProgress').replaceChildren(
    h('strong', { text: 'Trip progress' }),
    h('span', { class: 'progress-count', text: `${p.done} of ${p.total} stops visited` }),
    h('progress', { max: Math.max(1, p.total), value: p.done, 'aria-label': 'Stops visited' })
  );
}

function renderPhaseNav(trip) {
  const nav = $('phaseNav');
  nav.hidden = false;
  nav.replaceChildren(
    h('button', { class: 'chip', type: 'button', 'aria-pressed': String(ui.phase === 'all'), text: 'All days', onClick: () => { ui.phase = 'all'; render(); } }),
    ...trip.phases.map((phase, pi) => h('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(ui.phase === phase.id),
      onClick: () => { ui.phase = phase.id; render(); }
    }, h('span', { class: 'phase-dot', style: `--c:${colorOf(trip, phase, pi)}`, 'aria-hidden': 'true' }), phase.title))
  );
}

const elevationKey = (stop) => `${stop.lon.toFixed(5)},${stop.lat.toFixed(5)}`;
const weatherKey = (trip, day, stop) => weatherRequestKey(trip.id, day, stop, providerVersion, geo.inForecastWindow(day.date));

function stopWeather(trip, day, stop) {
  const value = weatherEligible(day, undefined, stop) ? wxCache.get(weatherKey(trip, day, stop)) : null;
  const el = h('div', { class: 'stop-weather', dataset: { weatherStop: stop.id }, hidden: !value });
  if (value) fillStopWeather(el, value, day, stop);
  return el;
}

function fillStopWeather(el, w, day, stop) {
  const round = (value) => Number.isFinite(value) ? Math.round(value) : '\u2014';
  const kind = w.kind === 'forecast' ? 'Forecast' : 'Historical typical weather';
  const label = `${kind} for ${stop.name}, ${day.date}: low ${round(w.tMin)}, high ${round(w.tMax)} degrees Celsius`;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', label);
  el.title = label;
  el.replaceChildren(
    h('span', { class: 'day-weather-icon', text: weatherIcon(w.code), 'aria-hidden': 'true' }),
    h('span', { class: 'day-weather-temperature', text: `${round(w.tMin)}\u2013${round(w.tMax)} \u00b0C`, 'aria-hidden': 'true' })
  );
  el.hidden = false;
}

function mapChoice(links) {
  const summary = h('summary', { class: 'navigate-action' },
    h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, h('path', { d: 'M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z' }), h('circle', { cx: '12', cy: '9', r: '2.2' })),
    h('span', { text: 'Navigate' }), chevron('menu-chevron'));
  const items = h('div', { class: 'menu-items', popover: 'manual', 'aria-label': 'Open directions with' }, [...links].reverse().map((link) =>
    h('a', { href: link.url, target: '_blank', rel: 'noopener noreferrer', text: link.label.startsWith('Google') ? 'Google Maps' : 'OpenStreetMap', onClick: () => { chooser.open = false; } })));
  const chooser = h('details', { class: 'menu navigate-menu', onToggle: () => {
    if (!chooser.isConnected) return;
    if (!chooser.open) { items.hidePopover(); return; }
    document.querySelectorAll('details.menu[open]').forEach((other) => { if (other !== chooser) other.open = false; });
    items.showPopover();
    const anchor = summary.getBoundingClientRect();
    const bottom = innerHeight - 8;
    const height = items.offsetHeight;
    items.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - items.offsetWidth - 8))}px`;
    items.style.top = `${anchor.bottom + height + 4 > bottom ? Math.max(8, anchor.top - height - 4) : anchor.bottom + 4}px`;
  } }, summary, items);
  return chooser;
}

function actionGlyph(path) {
  return h('svg', { class: 'menu-action-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, h('path', { d: path }));
}

function stopActionsMenu(day, stop, index) {
  let chooser;
  const items = h('div', { class: 'menu-items stop-action-items', popover: 'manual', 'aria-label': `${stop.name} actions` });
  const item = (label, path, run, { disabled = false, danger = false, ariaLabel = label } = {}) => {
    const button = h('button', {
      type: 'button', class: `menu-action${danger ? ' menu-action-danger' : ''}`, 'aria-label': ariaLabel,
      onClick: () => {
        if (items.matches(':popover-open')) items.hidePopover();
        chooser.open = false;
        run();
      }
    }, actionGlyph(path), h('span', { text: label }));
    button.disabled = disabled;
    return button;
  };
  items.append(
    item('Edit', 'M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4', () => openStopDialog(day.dayNumber, stop.id), { ariaLabel: `Edit ${stop.name}` }),
    item('Move up', 'M12 19V5m-6 6 6-6 6 6', () => moveStop(stop.id, -1), { disabled: index === 0, ariaLabel: `Move ${stop.name} up` }),
    item('Move down', 'M12 5v14m-6-6 6 6 6-6', () => moveStop(stop.id, 1), { disabled: index === day.stops.length - 1, ariaLabel: `Move ${stop.name} down` }),
    item('Delete', 'M5 7h14M10 11v6m4-6v6M6.5 7l.8 14h9.4l.8-14M9 7V4h6v3', () => deleteStop(stop.id), { danger: true, ariaLabel: `Delete ${stop.name}` })
  );
  const summary = h('summary', { class: 'stop-more-action', 'aria-label': `Actions for ${stop.name}` },
    actionGlyph('M5 12h.01M12 12h.01M19 12h.01'), h('span', { text: 'Actions' }), chevron('menu-chevron'));
  chooser = h('details', { class: 'menu stop-action-menu', onToggle: () => {
    if (!chooser.isConnected) return;
    if (!chooser.open) { if (items.matches(':popover-open')) items.hidePopover(); return; }
    document.querySelectorAll('details.menu[open]').forEach((other) => { if (other !== chooser) other.open = false; });
    items.showPopover();
    const anchor = summary.getBoundingClientRect();
    const bottom = innerHeight - 8;
    const height = items.offsetHeight;
    items.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - items.offsetWidth - 8))}px`;
    items.style.top = `${anchor.bottom + height + 4 > bottom ? Math.max(8, anchor.top - height - 4) : anchor.bottom + 4}px`;
  } }, summary, items);
  return chooser;
}

const TYPE_ICON_PATH = {
  sight: 'M3 20h18M5 20V9l7-5 7 5v11M9 20v-6h6v6',
  gem: 'M12 3 3 9l9 12 9-12-9-6Zm-9 6h18M8 9l4 12 4-12',
  hike: 'M3 20h18M4 19l6-9 3 4 3-7 4 12',
  dining: 'M5 3v7m-2-7v4a3 3 0 0 0 6 0V3m-3 7v11m9-18v18m0-18c4 3 4 8 0 10',
  cafe: 'M5 7h12v9a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V7Zm12 2h2a2 2 0 1 1 0 4h-2M8 3v2m5-2v2',
  swim: 'M3 14c3-3 5 3 8 0s5 3 10 0M3 19c3-3 5 3 8 0s5 3 10 0',
  boat: 'M4 14 6 6h12l2 8-8 5-8-5Zm2 0 6 2 6-2M12 6V3',
  lodging: 'M3 20V10l9-7 9 7v10h-7v-6H9v6H3',
  transport: 'M4 12h15m-6-6 6 6-6 6M4 5v14'
};

const CHIP_ICON_PATH = {
  sight: TYPE_ICON_PATH.sight, 'hidden gem': TYPE_ICON_PATH.gem, gem: TYPE_ICON_PATH.gem, hike: TYPE_ICON_PATH.hike,
  food: TYPE_ICON_PATH.dining, dining: TYPE_ICON_PATH.dining, cafe: TYPE_ICON_PATH.cafe, swim: TYPE_ICON_PATH.swim,
  boat: TYPE_ICON_PATH.boat, stay: TYPE_ICON_PATH.lodging, travel: TYPE_ICON_PATH.transport,
  culture: 'M3 20h18M5 20V9l7-5 7 5v11M9 20v-6h6v6',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Zm0 0v13a3 3 0 0 0 3 3m2-12h6m-6 4h6',
  optional: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17l-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z',
  default: 'M12 3a7 7 0 0 0-7 7c0 5 7 11 7 11s7-6 7-11a7 7 0 0 0-7-7Zm0 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z'
};

function renderStopChips(stop) {
  const labels = chipLabels(stop);
  if (!labels.length) return null;
  return h('div', { class: 'stop-chips', 'aria-label': 'Stop categories' }, labels.map((label) =>
    h('span', { class: 'stop-chip' },
      h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, h('path', { d: CHIP_ICON_PATH[label.toLowerCase()] || CHIP_ICON_PATH.default })),
      h('span', { text: label })
    )
  ));
}

function renderStop(trip, phase, pi, day, stop, index) {
  const img = safeUrl(stop.imageUrl);
  const referenceLinks = (stop.links || []).map((link) => {
    const href = safeUrl(link.url);
    return href ? h('a', { class: 'stop-action-link', href, target: '_blank', rel: 'noopener noreferrer' },
      h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, h('path', { d: 'M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1m3.1 6a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1' })),
      h('span', { text: link.label || 'Website' })) : null;
  }).filter(Boolean);
  const directions = stopMapLinks(stop.lat, stop.lon, day.mode || 'driving').filter((link) => link.label.endsWith(' directions'));
  const stopActions = [directions.length ? mapChoice(directions) : null, ...referenceLinks].filter(Boolean);
  const select = () => selectStop(stop.id, { scroll: false });
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
        h('div', { class: 'stop-title-row' },
          typeIcon(stop),
          h('button', { class: 'stop-name', type: 'button', text: stop.name, 'aria-expanded': stop.desc ? 'false' : undefined, 'aria-controls': stop.desc ? 'desc-' + stop.id : undefined, onClick: (event) => {
            card.dataset.expanded = String(card.dataset.expanded !== 'true');
            if (stop.desc) event.currentTarget.setAttribute('aria-expanded', card.dataset.expanded);
            select();
          } })
        ),
        h('p', { class: 'stop-time', text: [stop.time, stop.dwell ? `${stop.dwell} min` : ''].filter(Boolean).join(' · ') }),
        renderStopChips(stop),
        stop.desc && h('p', { class: 'stop-desc', id: 'desc-' + stop.id, text: stop.desc })
      ),
      img && h('img', { class: 'stop-photo', src: img, alt: stop.name, loading: 'lazy', referrerpolicy: 'no-referrer', onError: (e) => e.target.remove() })
    ),
    img && stop.imageCredit && h('p', { class: 'credit stop-image-credit', text: 'Photo: ' + stop.imageCredit }),
    stopWeather(trip, day, stop),
    h('div', { class: 'stop-details' },
      h('p', { class: 'stop-elevation ele', dataset: { elevation: elevationKey(stop) }, hidden: !Number.isFinite(elevationCache.get(elevationKey(stop))), text: Number.isFinite(elevationCache.get(elevationKey(stop))) ? `Elevation ${Math.round(elevationCache.get(elevationKey(stop)))} m` : '' }),
      stop.track?.length > 1 && trackBlock(stop)
    ),
    stopActions.length && h('div', { class: 'stop-actions' }, ...stopActions),
    h('div', { class: 'stop-edit' }, stopActionsMenu(day, stop, index))
  );
  return card;
}

function typeIcon(stop) {
  const path = TYPE_ICON_PATH[stop.type] || TYPE_ICON_PATH.sight;
  return h('span', { class: 'type-icon', role: 'img', 'aria-label': TYPE_LABEL[stop.type] || 'Stop' },
    h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, h('path', { d: path })));
}

function renderPhotoCredit(day) {
  const parts = String(day.photoCredit || '').split(/\s*·\s*/).filter(Boolean);
  const author = parts.shift() || 'Unknown author';
  const license = parts.join(' · ');
  const sourceUrl = safeUrl(day.photoSourceUrl);
  const licenseUrl = safeUrl(day.photoLicenseUrl);
  return h('figcaption', { class: 'credit photo-credit' },
    h('span', { text: `Photo: ${author}` }),
    license && licenseUrl ? h('a', { href: licenseUrl, target: '_blank', rel: 'noopener noreferrer', text: license }) : license && h('span', { text: license }),
    sourceUrl && h('a', { href: sourceUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Source page' }));
}

function linkifyText(value) {
  const text = String(value ?? '');
  const fragment = document.createDocumentFragment();
  const pattern = /https?:\/\/[^\s<>"']+/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const raw = match[0];
    const trailing = (raw.match(/[),.;!?]+$/) || [''])[0];
    const candidate = raw.slice(0, raw.length - trailing.length);
    const href = safeUrl(candidate);
    if (!href) continue;
    fragment.append(document.createTextNode(text.slice(cursor, match.index)));
    fragment.append(h('a', { href, target: '_blank', rel: 'noopener noreferrer', text: candidate }));
    if (trailing) fragment.append(document.createTextNode(trailing));
    cursor = match.index + raw.length;
  }
  fragment.append(document.createTextNode(text.slice(cursor)));
  return fragment;
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

function renderDayPacking(trip, day) {
  if (!day.packing?.length) return null;
  const box = h('div', { class: 'pack' });
  day.packing.forEach((item, i) => {
    const key = `${trip.id}|${day.dayNumber}|${i}`;
    const input = h('input', { type: 'checkbox', checked: localStorage.getItem('tp-pack:' + key) === '1', onChange: (e) => localStorage.setItem('tp-pack:' + key, e.target.checked ? '1' : '0') });
    input.style.cssText = 'width:20px;min-height:20px;height:20px';
    box.append(h('label', {}, input, h('span', { text: item })));
  });
  return h('section', { class: 'day-detail-card day-pack-card' },
    h('h3', { class: 'day-detail-title', text: 'Packing checklist' }), box);
}

function renderDay(trip, phase, pi, day) {
  const c = colorOf(trip, phase, pi);
  const open = ui.open.has(day.dayNumber);
  const photo = safeUrl(day.photoUrl);
  const date = day.date ? new Date(`${day.date}T12:00:00Z`) : null;
  const dateMonth = date ? new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(date).toUpperCase() : 'DAY';
  const dateDay = date ? new Intl.DateTimeFormat('en', { day: '2-digit', timeZone: 'UTC' }).format(date) : String(day.dayNumber);
  const fullDate = date ? new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date) : '';
  const stopCount = `${day.stops.length} ${day.stops.length === 1 ? 'stop' : 'stops'}`;
  const head = h('button', { class: 'day-head', type: 'button', 'aria-expanded': String(open), onClick: () => toggleDay(day.dayNumber) },
    h('span', { class: 'day-number', 'aria-hidden': 'true' }, h('span', { text: dateMonth }), h('strong', { text: dateDay })),
    h('span', { class: 'day-title' }, h('strong', { text: day.title }), h('span', { text: [`Day ${day.dayNumber}`, fullDate, phase.title, stopCount].filter(Boolean).join(' · ') })),
    chevron('chev')
  );
  const body = h('div', { class: 'day-body' });
  if (open) {
    if (photo) body.append(h('figure', { class: 'day-figure' },
      h('img', { class: 'day-photo', src: photo, alt: day.title, loading: 'lazy', referrerpolicy: 'no-referrer', onError: (e) => e.target.closest('.day-figure')?.remove() }),
      renderPhotoCredit(day)));
    const packingCard = renderDayPacking(trip, day);
    if (ui.focusDay === day.dayNumber) body.append(h('p', { class: 'route-line', id: 'routeLine', text: day.stops.length > 1 ? 'Finding travel times…' : '' }));
    if (day.stops.length) {
      const stopList = h('ol', { class: 'day-stop-list', 'aria-label': `Stops for day ${day.dayNumber}` });
      day.stops.forEach((stop, i) => {
        const item = h('li', { class: 'day-stop-item' });
        if (i > 0 && ui.focusDay === day.dayNumber) item.append(h('p', { class: 'leg', dataset: { leg: i - 1 }, text: legCache.get(trip.id + '|' + day.dayNumber)?.[i - 1] || '' }));
        item.append(renderStop(trip, phase, pi, day, stop, i));
        stopList.append(item);
      });
      body.append(stopList);
    } else body.append(h('p', { class: 'empty', text: 'No stops yet. Use Add stop above to start this day.' }));
    const details = h('div', { class: 'day-practical' });
    if (day.bookings?.length) {
      details.append(h('p', { class: 'sect', text: 'Book ahead' }));
      for (const b of day.bookings) {
        const u = safeUrl(b.url);
        details.append(h('div', { class: 'tip book' }, u ? h('a', { href: u, target: '_blank', rel: 'noopener noreferrer', text: b.label }) : b.label));
      }
    }
    if (day.food) details.append(h('p', { class: 'sect', text: 'Food and drink' }), h('div', { class: 'tip food' }, linkifyText(day.food)));
    // Hide the obsolete research diagnostic only in presentation; retain the original tips.
    const staleDateTip = /^\s*No travel dates: weather values and forecasts are omitted\. Research check date: \d{4}-\d{2}-\d{2}, not the travel date\.\s*$/;
    const tips = (day.tips || []).filter((tip) => !staleDateTip.test(tip));
    if (tips.length) {
      const hintList = h('ul', { class: 'day-hint-list' });
      for (const tip of tips) hintList.append(h('li', { class: 'day-hint' },
        h('span', {}, linkifyText(tip))));
      details.append(h('section', { class: 'day-hints', 'aria-label': 'Tips for this day' },
        h('h3', { class: 'day-hints-title', text: 'Tips' }), hintList));
    }
    if (packingCard) details.append(packingCard);
    if (details.childElementCount) body.append(details);
  }
  return h('section', { class: 'day', id: 'day-' + day.dayNumber, style: `--c:${c}`, dataset: { open } },
    h('div', { class: 'day-heading' }, head, h('div', { class: 'day-actions' },
      h('button', { class: 'btn day-add-stop', type: 'button', text: 'Add stop', onClick: () => openStopDialog(day.dayNumber, null) }),
      h('button', { class: 'btn day-edit', type: 'button', text: 'Edit day', onClick: () => openDayDialog(day.dayNumber, phase.id) }))), body);
}

function toggleBase(id) {
  if (ui.collapsedBases.has(id)) ui.collapsedBases.delete(id);
  else ui.collapsedBases.add(id);
  render();
}

function renderList(trip) {
  const list = $('list');
  list.replaceChildren(h('div', { class: 'itinerary-heading' },
    h('h2', { text: 'Itinerary' }),
    h('span', { class: 'panel-count', text: `${allDays(trip).length} day plans` })));
  for (const { phase, pi } of visiblePhases(trip)) {
    const c = colorOf(trip, phase, pi);
    const collapsed = ui.collapsedBases.has(phase.id);
    const meta = [phase.subtitle, `${phase.days.length} days`].filter(Boolean).join(' · ');
    const content = h('div', { class: 'phase-content', id: `base-${phase.id}`, hidden: collapsed });
    const toggle = h('button', { class: 'phase-toggle', type: 'button', 'aria-expanded': String(!collapsed), 'aria-controls': `base-${phase.id}`, onClick: () => toggleBase(phase.id) },
      h('span', { class: 'phase-name' }, h('strong', { text: phase.title }), h('small', { text: meta })),
      chevron('phase-chevron'));
    const section = h('section', { class: 'phase-section', style: `--c:${c}`, dataset: { phaseId: phase.id, collapsed }, 'aria-label': phase.title },
      h('div', { class: 'phase-head' }, toggle,
        h('button', { class: 'btn phase-add-day', type: 'button', text: 'Add day', onClick: () => openDayDialog(null, phase.id) })));
    for (const day of phase.days) content.append(renderDay(trip, phase, pi, day));
    if (!phase.days.length) content.append(h('p', { class: 'hint', text: 'Add a day to this base before adding its stops.' }));
    section.append(content);
    list.append(section);
  }
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
  ['shareExportBtn', 'addBaseBtn', 'manageBasesBtn', 'clearTicksBtn'].forEach((id) => { $(id).disabled = false; });
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
  fetchDayServices();
  updateRoute();
  document.title = `${trip.title} · My Trip Planner`;
}

function showEmpty() {
  ['shareExportBtn', 'addBaseBtn', 'manageBasesBtn', 'clearTicksBtn'].forEach((id) => { $(id).disabled = true; });
  $('undoBtn').hidden = true;
  $('mapCaption').textContent = '';
  $('hero').replaceChildren(h('h1', { text: 'No trips yet' }), h('p', { class: 'summary', text: 'Create a trip, import one, or restore the Sardegna preset.' }),
    h('div', { class: 'row', style: 'margin-top:12px' },
      h('button', { class: 'btn btn-primary', type: 'button', text: 'New trip', onClick: () => openMenuPage('new-trip') }),
      h('button', { class: 'btn', type: 'button', text: 'Restore Sardegna preset', onClick: () => openMenuPage('library') })));
  $('list').replaceChildren();
  $('tripProgress').hidden = true;
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
  if (innerWidth < 960) { element.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); return; }
  list.scrollTo({ top: list.scrollTop + element.getBoundingClientRect().top - list.getBoundingClientRect().top - 12, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
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
  const tripId = store.active()?.id;
  if (!tripId) return;
  const packing = packingEntries(tripId);
  packing.forEach(([key]) => localStorage.removeItem(key));
  store.mutate('Clear ticks', (trip) => { for (const s of allStops(trip)) s.visited = false; }, {
    onUndo: () => restorePacking(tripId, packing)
  });
  render();
  setTripPage('home');
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

function deleteStop(id) {
  const found = findStop(store.active(), id);
  store.mutate('Delete stop', (trip) => { const f = findStop(trip, id); f.day.stops.splice(f.index, 1); });
  legCache.delete(store.active().id + '|' + found.day.dayNumber);
  render();
  toast(`Deleted ${found.stop.name}.`, { label: 'Undo', run: doUndo });
}

function addPhase(name) {
  const title = String(name || '').trim();
  if (!title || !store.active()) return false;
  store.mutate('Add base', (trip) => {
    trip.phases.push({ id: 'p' + Date.now().toString(36), title: title.slice(0, 120), colorKey: trip.phases.length % PALETTE.length + 1, days: [] });
  });
  render();
  return true;
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

function syncBaseActions(phases = store.active()?.phases || []) {
  const phase = phases.find((item) => item.id === managedBaseId);
  const index = phase ? phases.indexOf(phase) : -1;
  $('baseActions').hidden = !phase;
  $('selectedBaseSummary').textContent = phase ? `${phase.title} · ${index + 1} of ${phases.length} bases` : '';
  $('moveBaseUpBtn').disabled = !phase || index === 0;
  $('moveBaseDownBtn').disabled = !phase || index === phases.length - 1;
  if (phase) {
    $('moveBaseUpBtn').setAttribute('aria-label', `Move ${phase.title} up`);
    $('moveBaseDownBtn').setAttribute('aria-label', `Move ${phase.title} down`);
  }
  document.querySelectorAll('#basesList .base-row').forEach((row) => { row.dataset.selected = String(row.dataset.baseId === managedBaseId); });
}

function renderBases() {
  const trip = store.active();
  const phases = trip?.phases || [];
  if (!phases.some((phase) => phase.id === managedBaseId)) managedBaseId = phases[0]?.id || null;
  $('basesList').replaceChildren(...phases.map((phase, index) => {
    const radio = h('input', {
      type: 'radio', name: 'managedBase', value: phase.id, checked: phase.id === managedBaseId,
      'aria-label': `Select ${phase.title}`, onChange: () => { managedBaseId = phase.id; syncBaseActions(phases); }
    });
    return h('li', { class: 'base-row', dataset: { baseId: phase.id, selected: phase.id === managedBaseId } },
      h('label', { class: 'base-choice' }, radio,
        h('span', { class: 'base-choice-copy' }, h('strong', { text: phase.title }),
          h('small', { text: `${phase.days.length} ${phase.days.length === 1 ? 'day' : 'days'} · Base ${index + 1}` }))));
  }));
  syncBaseActions(phases);
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

function refreshWeatherStop(tripId, stopId, key) {
  const trip = store.active();
  const found = trip?.id === tripId ? findStop(trip, stopId) : null;
  const value = wxCache.get(key);
  if (!found || !value || !ui.open.has(found.day.dayNumber) || weatherKey(trip, found.day, found.stop) !== key || !weatherEligible(found.day, undefined, found.stop)) return;
  const el = $('stop-' + stopId)?.querySelector('[data-weather-stop]');
  if (el) fillStopWeather(el, value, found.day, found.stop);
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
  let failures = 0;
  const MAX_CONSECUTIVE_FAILURES = 3;
  try {
    // Choose again after every response so edits and trip switches discard obsolete work.
    for (;;) {
      const trip = store.active();
      if (!trip) break;
      const pending = visiblePhases(trip)
        .filter(({ phase }) => !ui.collapsedBases.has(phase.id))
        .flatMap(({ phase }) => phase.days.map((day) => ({ day })))
        .filter(({ day }) => ui.open.has(day.dayNumber))
        .flatMap(({ day }) => day.stops.map((stop) => ({ day, stop })))
        .find(({ day, stop }) => weatherEligible(day, undefined, stop) && !wxCache.has(weatherKey(trip, day, stop)));
      if (!pending) break;
      const { day, stop } = pending;
      const key = weatherKey(trip, day, stop), version = providerVersion;
      try {
        const value = await geo.weather(stop.lat, stop.lon, day.date);
        if (version !== providerVersion) continue;
        const valid = value && Number.isFinite(value.tMax) && Number.isFinite(value.tMin);
        wxCache.set(key, valid ? value : null);
        if (valid) {
          refreshWeatherStop(trip.id, stop.id, key);
          failures = 0;
        } else {
          failures++;
        }
      } catch {
        wxCache.set(key, null);
        failures++;
      }
      if (failures >= MAX_CONSECUTIVE_FAILURES) break;
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
  $('dfPhotoSource').value = d?.photoSourceUrl || '';
  $('dfPhotoLicense').value = d?.photoLicenseUrl || '';
  $('dfDelete').hidden = !d;
  $('dayDlg').showModal();
}

function submitDay(e) {
  e.preventDefault();
  if (e.submitter?.value === 'cancel') { $('dayDlg').close(); return; }
  const photo = $('dfPhoto').value.trim();
  const source = $('dfPhotoSource').value.trim();
  const license = $('dfPhotoLicense').value.trim();
  if (photo && !safeUrl(photo)) { toast('The photo address must start with https://'); return; }
  if (source && !safeUrl(source)) { toast('The photo source must start with https://'); return; }
  if (license && !safeUrl(license)) { toast('The photo licence link must start with https://'); return; }
  const lines = (id) => $(id).value.split('\n').map((t) => t.trim()).filter(Boolean);
  const { dayNumber } = ui.dayEdit;
  const targetPhase = $('dfPhase').value;
  const fields = {
    title: $('dfTitle').value.trim(), date: $('dfDate').value || undefined, mode: $('dfMode').value,
    tips: lines('dfTips'), food: $('dfFood').value.trim() || undefined, packing: lines('dfPacking'),
    photoUrl: photo || undefined, photoCredit: $('dfCredit').value.trim() || undefined,
    photoSourceUrl: source || undefined, photoLicenseUrl: license || undefined
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

/* ---------- library, import, share ---------- */

function syncLibraryActions(trips = store.list()) {
  const trip = trips.find((item) => item.id === librarySelectedId);
  $('tripActions').hidden = !trip;
  $('selectedTripSummary').textContent = trip ? trip.title : '';
  ['openSelectedTripBtn', 'duplicateSelectedTripBtn', 'deleteSelectedTripBtn'].forEach((id) => { $(id).disabled = !trip; });
  document.querySelectorAll('#tripList .trip-item').forEach((row) => { row.dataset.selected = String(row.dataset.tripId === librarySelectedId); });
}

function renderLibrary() {
  const box = $('tripList');
  const trips = store.list();
  const current = store.active()?.id;
  if (!trips.some((trip) => trip.id === librarySelectedId)) librarySelectedId = current || trips[0]?.id || null;
  box.replaceChildren(...trips.map((trip) => {
    const radio = h('input', {
      type: 'radio', name: 'libraryTrip', value: trip.id, checked: trip.id === librarySelectedId,
      'aria-label': `Select ${trip.title}`, onChange: () => { librarySelectedId = trip.id; syncLibraryActions(trips); }
    });
    return h('li', { class: 'trip-item', dataset: { tripId: trip.id, active: trip.id === current, selected: trip.id === librarySelectedId } },
      h('label', { class: 'trip-choice' }, radio,
        h('span', { class: 'trip-choice-copy' },
          h('strong', { text: trip.title }),
          h('small', { text: [trip.destination, fmtRange(trip.startDate, trip.endDate), `${trip.progress.done}/${trip.progress.total} visited`, trip.preset ? 'Preset' : ''].filter(Boolean).join(' · ') }))));
  }));
  syncLibraryActions(trips);
  $('presetBtn').hidden = store.presetPresent();
}

function openSelectedTrip() {
  const trip = store.getTrip(librarySelectedId);
  if (!trip) return;
  store.setActive(trip.id);
  ui.open.clear(); ui.focusDay = null; ui.phase = 'all'; ui.selectedId = null;
  $('tripMenuDlg').close();
  render();
  mapView?.fit();
}

function duplicateSelectedTrip() {
  if (!store.getTrip(librarySelectedId)) return;
  const copy = store.duplicate(librarySelectedId);
  librarySelectedId = copy.id;
  renderLibrary();
  render();
}

function deleteSelectedTrip() {
  const trip = store.list().find((item) => item.id === librarySelectedId);
  if (!trip) return;
  store.remove(trip.id);
  librarySelectedId = store.active()?.id || store.list()[0]?.id || null;
  renderLibrary();
  render();
  toast(`Deleted ${trip.title}.`, { label: 'Undo', run: () => {
    if (!store.restoreDeleted()) return;
    librarySelectedId = store.active()?.id || null;
    renderLibrary();
    render();
  } });
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
  $('tripMenuDlg').close();
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

function setTripPage(page) {
  const pages = [...document.querySelectorAll('[data-menu-content="trip"] [data-trip-page]')];
  pages.forEach((panel) => { panel.hidden = panel.dataset.tripPage !== page; });
  $('menuContent').scrollTop = 0;
  pages.find((panel) => panel.dataset.tripPage === page)?.querySelector('h3')?.focus({ preventScroll: true });
}

function setMenuSection(section) {
  document.querySelectorAll('[data-menu-section]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.menuSection === section)));
  document.querySelectorAll('[data-menu-content]').forEach((panel) => { panel.hidden = panel.dataset.menuContent !== section; });
  if (section === 'trip') setTripPage('home');
  else $('menuContent').scrollTop = 0;
}

function openMenuPage(page) {
  setMenuSection('trip');
  if (page === 'library') { $('importError').hidden = true; renderLibrary(); }
  if (page === 'new-trip') $('newTripForm').reset();
  setTripPage(page);
  if (!$('tripMenuDlg').open) $('tripMenuDlg').showModal();
}

function setupProviders() {
  try {
    const saved = localStorage.getItem('tp-providers');
    if (saved) geo.configureProviders(JSON.parse(saved));
  } catch { notice('Saved provider settings could not be loaded. Using public defaults.'); }
  $('providerFields').replaceChildren(...providerFields.map(([key, label]) => h('label', { text: label }, h('input', { id: 'provider-' + key, type: 'url', required: true }))));
  document.querySelectorAll('[data-menu-section]').forEach((button) => { button.onclick = () => setMenuSection(button.dataset.menuSection); });
  $('menuClose').onclick = () => $('tripMenuDlg').close();
  $('menuDoneBtn').onclick = () => $('tripMenuDlg').close();
  $('settingsBtn').onclick = () => {
    $('tripMenuDlg').close();
    settingsReturningToMenu = false;
    document.querySelector('[data-settings=agent]').click();
    fillProviderFields(geo.providers);
    $('providerError').hidden = true;
    $('settingsDlg').showModal();
  };
  $('settingsBack').onclick = () => {
    settingsReturningToMenu = true;
    $('settingsDlg').close();
    setMenuSection('app');
    $('tripMenuDlg').showModal();
    $('settingsBtn').focus();
  };
  $('settingsClose').onclick = () => $('settingsDlg').close();
  $('settingsCancel').onclick = () => $('settingsDlg').close();
  $('settingsDlg').addEventListener('close', () => {
    if (settingsReturningToMenu) { settingsReturningToMenu = false; return; }
    $('menuBtn').focus();
  });
  document.querySelectorAll('[data-settings]').forEach((button) => {
    button.onclick = () => {
      document.querySelectorAll('[data-settings]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      document.querySelectorAll('[data-settings-content]').forEach((panel) => { panel.hidden = panel.dataset.settingsContent !== button.dataset.settings; });
      $('settingsContent').scrollTop = 0;
    };
  });
  $('providerForm').onsubmit = (event) => {
    event.preventDefault();
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
  $('zoomIn').onclick = () => mapView?.map?.zoomIn();
  $('zoomOut').onclick = () => mapView?.map?.zoomOut();
  $('compass').onclick = () => mapView?.map?.resetNorth();
  $('resetMap').onclick = () => { mapView?.reset(ui.focusDay == null ? undefined : findDay(store.active(), ui.focusDay)?.day.stops.map((s) => s.id)); $('tilt').setAttribute('aria-pressed', 'false'); };
  $('addBaseBtn').onclick = () => { $('baseForm').reset(); setTripPage('add-base'); };
  $('manageBasesBtn').onclick = () => { renderBases(); setTripPage('bases'); };
  $('moveBaseUpBtn').onclick = () => { if (managedBaseId) reorderBase(managedBaseId, -1); };
  $('moveBaseDownBtn').onclick = () => { if (managedBaseId) reorderBase(managedBaseId, 1); };
  $('clearTicksBtn').onclick = () => setTripPage('clear-ticks');
  $('clearTicksConfirmBtn').onclick = clearTicks;
  $('shareExportBtn').onclick = () => { $('shareInfo').textContent = ''; setTripPage('share'); };
  $('baseForm').addEventListener('submit', (event) => {
    event.preventDefault();
    if (addPhase($('baseName').value)) { $('baseForm').reset(); setTripPage('home'); }
  });
  document.querySelectorAll('[data-menu-back]').forEach((button) => { button.onclick = () => setTripPage(button.dataset.menuBack); });
  $('toolsBtn').onclick = () => {
    const open = $('mapTools').hidden;
    $('mapTools').hidden = !open;
    $('toolsBtn').setAttribute('aria-expanded', String(open));
  };
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') document.querySelectorAll('details.menu[open]').forEach((d) => { d.open = false; }); });
  document.addEventListener('click', (event) => document.querySelectorAll('details.menu[open]').forEach((d) => { if (!d.contains(event.target)) d.open = false; }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) fetchDayServices(); if (document.hidden && gpsToken) stopGps('Location tracking stopped while the page was hidden.'); });
  window.addEventListener('pagehide', () => { if (gpsToken) stopGps(); });
  $('libraryBtn').onclick = () => { $('importError').hidden = true; renderLibrary(); setTripPage('library'); };
  $('openSelectedTripBtn').onclick = openSelectedTrip;
  $('duplicateSelectedTripBtn').onclick = duplicateSelectedTrip;
  $('deleteSelectedTripBtn').onclick = deleteSelectedTrip;
  $('undoBtn').onclick = doUndo;
  $('menuBtn').onclick = () => { setMenuSection('trip'); $('tripMenuDlg').showModal(); };
  $('newTripBtn').onclick = () => { $('newTripForm').reset(); setTripPage('new-trip'); };
  $('importBtn').onclick = async () => { const f = await pickFile('.json,.gpx,application/json,application/gpx+xml'); if (f) importFile(f); };
  $('presetBtn').onclick = async () => { await store.resetPreset(); ui.open.clear(); $('tripMenuDlg').close(); render(); mapView?.fit(); };
  $('newTripForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.submitter?.value === 'cancel') { e.target.reset(); setTripPage('library'); return; }
    if (!e.target.reportValidity()) return;
    const t = store.createBlank({ title: $('ntTitle').value.trim(), destination: $('ntDest').value.trim(), startDate: $('ntDate').value });
    e.target.reset();
    ui.open = new Set([1]); ui.focusDay = 1; ui.phase = 'all';
    $('tripMenuDlg').close();
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
    toast('Tap the map where the stop is.');
  };
  $('exportJson').onclick = () => download(`${store.active().id}.json`, store.exportJson(), 'application/json');
  $('exportGpx').onclick = () => download(`${store.active().id}.gpx`, toGpx(store.active()), 'application/gpx+xml');
  $('printBtn').onclick = () => { $('tripMenuDlg').close(); allDays(store.active()).forEach(({ day }) => ui.open.add(day.dayNumber)); ui.phase = 'all'; render(); setTimeout(() => window.print(), 250); };
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
