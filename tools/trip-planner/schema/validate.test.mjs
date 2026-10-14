import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateTrip, lintTrip } from './validate.mjs';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const schema = read('./trip.schema.json');
const sardegna = () => read('../samples/sardegna.json');

test('Sardegna preset is valid', () => {
  assert.deepEqual(validateTrip(sardegna(), schema), []);
  assert.deepEqual(lintTrip(sardegna()), []);
});

test('missing required field is reported with a path', () => {
  const t = sardegna();
  delete t.phases[0].days[0].stops[0].lat;
  const errors = validateTrip(t, schema);
  assert.ok(errors.some((e) => e.path === '/phases/0/days/0/stops/0/lat' && /required/.test(e.message)));
});

test('bad type, bad enum, bad url and bad colour are rejected', () => {
  const t = sardegna();
  t.phases[0].days[0].stops[0].type = 'spaceport';
  t.phases[0].days[0].stops[1].lat = 'north';
  t.coverImage = 'javascript:alert(1)';
  t.theme.hero = 'red';
  const paths = validateTrip(t, schema).map((e) => e.path);
  assert.ok(paths.includes('/phases/0/days/0/stops/0/type'));
  assert.ok(paths.includes('/phases/0/days/0/stops/1/lat'));
  assert.ok(paths.includes('/coverImage'));
  assert.ok(paths.includes('/theme/hero'));
});

test('unknown fields are kept and allowed', () => {
  const t = sardegna();
  t.futureField = { a: 1 };
  t.phases[0].days[0].stops[0].agentNote = 'x';
  assert.deepEqual(validateTrip(t, schema), []);
});

test('schema version must be 1', () => {
  const t = sardegna();
  t.schema = 2;
  assert.ok(validateTrip(t, schema).some((e) => e.path === '/schema'));
});

test('lint flags duplicate stop ids', () => {
  const t = sardegna();
  t.phases[0].days[0].stops[1].id = t.phases[0].days[0].stops[0].id;
  assert.ok(lintTrip(t).some((w) => /used twice/.test(w)));
});
