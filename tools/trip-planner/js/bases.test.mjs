import test from 'node:test';
import assert from 'node:assert/strict';
import { reorderBases, remapDayState, remapPacking } from './bases.mjs';

const sample = () => ({ id: 'trip', phases: [
  { id: 'a', colorKey: 4, days: [{ dayNumber: 1, date: '2026-10-20', stops: [{ id: 'one' }] }] },
  { id: 'b', colorKey: 2, days: [{ dayNumber: 4, date: '2026-10-21', stops: [{ id: 'four' }] }, { dayNumber: 5, date: '2026-10-21', stops: [] }] },
  { id: 'empty', colorKey: 8, days: [] }
] });

test('moving a whole base renumbers days and preserves dates, identities, colours and input', () => {
  const original = sample(), before = structuredClone(original);
  const { trip, dayMap } = reorderBases(original, 'b', -1);
  assert.deepEqual(original, before);
  assert.deepEqual(trip.phases.map((p) => [p.id, p.colorKey]), [['b', 2], ['a', 4], ['empty', 8]]);
  assert.deepEqual(trip.phases.flatMap((p) => p.days.map((d) => d.dayNumber)), [1, 2, 3]);
  assert.deepEqual(trip.phases[0].days.map((d) => d.date), ['2026-10-21', '2026-10-21']);
  assert.equal(trip.phases[0].days[0].stops[0].id, 'four');
  assert.deepEqual(dayMap, { 1: 3, 4: 1, 5: 2 });
});

test('open and focused days follow their base and stop selections retain identity', () => {
  const state = { open: new Set([1, 4]), focusDay: 4, selectedId: 'four', phase: 'b' };
  const mapped = remapDayState(state, { 1: 3, 4: 1, 5: 2 });
  assert.deepEqual([...mapped.open], [3, 1]);
  assert.equal(mapped.focusDay, 1);
  assert.equal(mapped.selectedId, 'four');
  assert.equal(mapped.phase, 'b');
  assert.deepEqual([...state.open], [1, 4]);
  assert.equal(remapDayState({ open: new Set(), focusDay: null }, {}).focusDay, null);
});

test('packing remap is a simultaneous permutation, including unchecked items and other trips', () => {
  const entries = [['tp-pack:trip|1|0', '1'], ['tp-pack:trip|4|0', '0'], ['tp-pack:trip|5|2', '1'], ['tp-pack:other|1|0', '1']];
  const moved = remapPacking(entries, 'trip', { 1: 3, 4: 1, 5: 2 });
  assert.deepEqual(moved, [['tp-pack:trip|3|0', '1'], ['tp-pack:trip|1|0', '0'], ['tp-pack:trip|2|2', '1'], entries[3]]);
  assert.deepEqual(remapPacking(moved, 'trip', { 3: 1, 1: 4, 2: 5 }), entries);
});

test('invalid moves are ignored and empty bases can move', () => {
  assert.equal(reorderBases(sample(), 'a', -1), null);
  assert.equal(reorderBases(sample(), 'missing', 1), null);
  assert.equal(reorderBases(sample(), 'a', .5), null);
  assert.deepEqual(reorderBases(sample(), 'empty', -1).trip.phases.map((p) => p.id), ['a', 'empty', 'b']);
});
