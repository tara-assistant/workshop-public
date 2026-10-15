// Trip library kept in this browser only (localStorage). Nothing is sent anywhere.
import { validateTrip, lintTrip } from '../schema/validate.mjs';
import { slug, progress } from './util.js';

const KEY = 'trip-planner:v4';
export const PRESET_ID = 'sardegna-summer';
const MAX_IMPORT_BYTES = 2_000_000;

let data = { order: [], trips: {}, meta: {}, activeId: null };
let schema = null;
let undoStack = [];
let trash = null;
export let storageError = '';

const here = (path) => new URL(path, import.meta.url);

function publicPresetNote(trip) {
  if (trip?.id === PRESET_ID && /^This plan was tested and done by .+ for his summer trip\.$/.test(trip.note || '')) {
    trip.note = 'This plan was tested on a summer trip.';
  }
  return trip;
}

export async function loadSchema() {
  if (!schema) schema = await (await fetch(here('../schema/trip.schema.json'))).json();
  return schema;
}

export const validate = (trip) => validateTrip(trip, schema);
export const lint = lintTrip;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.trips && Array.isArray(parsed.order)) {
      data = parsed;
      publicPresetNote(data.trips[PRESET_ID]);
    }
  } catch {
    storageError = 'Saved trips could not be read. Starting fresh.';
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    storageError = '';
  } catch {
    storageError = 'This browser would not save your changes. Export your trip to keep it.';
  }
}

async function fetchPreset() {
  return publicPresetNote(await (await fetch(here('../samples/sardegna.json'))).json());
}

export async function init() {
  await loadSchema();
  load();
  if (!data.order.length) await resetPreset();
  if (!data.activeId || !data.trips[data.activeId]) data.activeId = data.order[0];
  persist();
}

export async function resetPreset() {
  const trip = await fetchPreset();
  data.trips[trip.id] = trip;
  if (!data.order.includes(trip.id)) data.order.unshift(trip.id);
  data.meta[trip.id] = { preset: true, updatedAt: Date.now() };
  data.activeId = trip.id;
  undoStack = [];
  persist();
  return trip;
}

export const presetPresent = () => !!data.trips[PRESET_ID];
export const active = () => data.trips[data.activeId];
export const getTrip = (id) => data.trips[id];
export const activeMeta = () => data.meta[data.activeId] || {};

export function setActive(id) {
  if (data.trips[id]) {
    data.activeId = id;
    undoStack = [];
    persist();
  }
}

export function list() {
  return data.order.map((id) => {
    const trip = data.trips[id];
    return {
      id, title: trip.title, destination: trip.destination || '', startDate: trip.startDate || '', endDate: trip.endDate || '',
      progress: progress(trip), preset: !!data.meta[id]?.preset, updatedAt: data.meta[id]?.updatedAt || 0
    };
  });
}

function touch(id) {
  data.meta[id] = { ...(data.meta[id] || {}), updatedAt: Date.now() };
}

// Structural edits keep a snapshot so one step can be undone.
export function mutate(label, fn, { onUndo } = {}) {
  const trip = active();
  undoStack.push({ id: data.activeId, label, onUndo, snapshot: structuredClone(trip) });
  if (undoStack.length > 30) undoStack.shift();
  fn(trip);
  touch(data.activeId);
  persist();
}

// Small state changes, like ticking a box, are not worth an undo step.
export function patch(fn, id = data.activeId) {
  if (!data.trips[id]) return;
  fn(data.trips[id]);
  touch(id);
  persist();
}

export function canUndo() {
  return undoStack.length > 0 && undoStack[undoStack.length - 1].id === data.activeId;
}

export function undo() {
  if (!canUndo()) return null;
  const step = undoStack.pop();
  data.trips[step.id] = step.snapshot;
  step.onUndo?.();
  touch(step.id);
  persist();
  return step.label;
}

function uniqueId(base) {
  let id = base;
  let n = 2;
  while (data.trips[id]) id = `${base}-${n++}`;
  return id;
}

export function importText(text, { preset = false } = {}) {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, errors: [{ path: '/', message: 'File is larger than 2 MB' }] };
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, errors: [{ path: '/', message: 'This is not valid JSON' }] };
  }
  return importTrip(obj, { preset });
}

export function importTrip(obj, { preset = false } = {}) {
  const errors = validate(obj);
  if (errors.length) return { ok: false, errors };
  const id = uniqueId(obj.id);
  obj.id = id;
  data.trips[id] = obj;
  data.order.push(id);
  data.meta[id] = { preset, updatedAt: Date.now() };
  data.activeId = id;
  undoStack = [];
  persist();
  return { ok: true, id, warnings: lint(obj) };
}

// Replace a trip with the same id (used when a connected agent saves), or add it.
export function upsert(obj) {
  const errors = validate(obj);
  if (errors.length) return { ok: false, errors };
  const isNew = !data.trips[obj.id];
  data.trips[obj.id] = obj;
  if (isNew) data.order.push(obj.id);
  data.meta[obj.id] = { ...(data.meta[obj.id] || {}), updatedAt: Date.now() };
  if (!data.activeId) data.activeId = obj.id;
  persist();
  return { ok: true, id: obj.id };
}

export function createBlank({ title, destination, startDate }) {
  const id = uniqueId(slug(title));
  const trip = {
    schema: 1, id, title, destination: destination || '', startDate: startDate || undefined,
    summary: '',
    phases: [{ id: 'p1', title: destination || 'Base 1', colorKey: 1, days: [{ dayNumber: 1, date: startDate || undefined, title: 'Day 1', mode: 'walking', stops: [], tips: [], packing: [] }] }]
  };
  if (!startDate) delete trip.startDate;
  if (!startDate) delete trip.phases[0].days[0].date;
  data.trips[id] = trip;
  data.order.push(id);
  data.meta[id] = { updatedAt: Date.now() };
  data.activeId = id;
  undoStack = [];
  persist();
  return trip;
}

export function duplicate(id) {
  const copy = structuredClone(data.trips[id]);
  copy.id = uniqueId(copy.id.replace(/-\d+$/, '') + '-copy');
  copy.title = `${copy.title} (copy)`;
  for (const phase of copy.phases) for (const day of phase.days) for (const stop of day.stops) stop.visited = false;
  data.trips[copy.id] = copy;
  data.order.push(copy.id);
  data.meta[copy.id] = { updatedAt: Date.now() };
  data.activeId = copy.id;
  undoStack = [];
  persist();
  return copy;
}

export function remove(id) {
  trash = { id, trip: data.trips[id], meta: data.meta[id], index: data.order.indexOf(id) };
  delete data.trips[id];
  delete data.meta[id];
  data.order = data.order.filter((x) => x !== id);
  if (data.activeId === id) data.activeId = data.order[0] || null;
  undoStack = [];
  persist();
}

export function restoreDeleted() {
  if (!trash) return false;
  data.trips[trash.id] = trash.trip;
  data.meta[trash.id] = trash.meta;
  data.order.splice(Math.min(trash.index, data.order.length), 0, trash.id);
  data.activeId = trash.id;
  trash = null;
  persist();
  return true;
}

export const isEmpty = () => data.order.length === 0;

export function exportJson(trip = active()) {
  return JSON.stringify(trip, null, 2);
}
