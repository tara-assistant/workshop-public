import test from 'node:test';
import assert from 'node:assert/strict';
import { weatherEligible, weatherIcon, weatherRequestKey } from './live.mjs';
import { configureProviders, weather } from './geo.js';
import { defaults } from './providers.mjs';

test('weather estimates require a dated day and a coordinate stop, including past dates', () => {
  const today = '2026-10-15', stops = [{ lat: 40, lon: 9 }];
  assert.equal(weatherEligible({ date: today, stops }, today), true);
  assert.equal(weatherEligible({ date: '2040-06-15', stops }, today), true);
  assert.equal(weatherEligible({ date: '2026-10-14', stops }, today), true);
  assert.equal(weatherEligible({ stops }, today), false);
  assert.equal(weatherEligible({ date: today, stops: [] }, today), false);
  assert.equal(weatherEligible({ date: today, stops: [{ lat: null, lon: 9 }] }, today), false);
  assert.equal(weatherIcon(0), '☀');
  assert.equal(weatherIcon(3), '☁');
});

test('far future typical weather samples past years and labels the result', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; configureProviders(defaults); });
  configureProviders(defaults);
  const years = [];
  globalThis.fetch = async (value) => {
    const date = new URL(value).searchParams.get('start_date');
    years.push(Number(date.slice(0, 4)));
    return { ok: true, json: async () => ({ daily: { time: [date], temperature_2m_max: [24], temperature_2m_min: [15],
      precipitation_sum: [0], wind_speed_10m_max: [10], sunrise: [date + 'T06:00'], sunset: [date + 'T18:00'] } }) };
  };
  const result = await weather(40, 9, '2040-06-15');
  assert.equal(result.kind, 'typical');
  assert.equal(result.years, 5);
  assert.ok(years.every((year) => year < new Date().getUTCFullYear()));
});

test('typical cache gives way to a forecast when the trip date enters the forecast window', async (t) => {
  const originalFetch = globalThis.fetch, RealDate = globalThis.Date;
  let instant = '2026-10-01T12:00:00Z';
  class ClockDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [instant])); }
  }
  globalThis.Date = ClockDate;
  t.after(() => { globalThis.Date = RealDate; globalThis.fetch = originalFetch; configureProviders(defaults); });
  configureProviders(defaults);
  const sources = [];
  globalThis.fetch = async (value) => {
    const url = new URL(value); sources.push(url.hostname);
    const date = url.searchParams.get('start_date');
    return { ok: true, json: async () => ({ daily: { time: [date], temperature_2m_max: [24], temperature_2m_min: [15],
      precipitation_sum: [0], precipitation_probability_max: [20], wind_speed_10m_max: [10], sunrise: [date+'T06:00'], sunset: [date+'T18:00'] } }) };
  };
  assert.equal((await weather(40, 9, '2026-10-15')).kind, 'typical');
  instant = '2026-10-02T12:00:00Z';
  assert.equal((await weather(40, 9, '2026-10-15')).kind, 'forecast');
  assert.equal(sources.at(-1), 'api.open-meteo.com');
});

test('each stop weather identity follows its trip, location, date and provider', () => {
  const day = { date: '2026-10-20', stops: [] }, stop = { id: 's', lat: 40, lon: 9 };
  const key = weatherRequestKey('trip', day, stop, 0, true);
  for (const candidate of [
    weatherRequestKey('other', day, stop, 0, true),
    weatherRequestKey('trip', { ...day, date: '2026-10-21' }, stop, 0, true),
    weatherRequestKey('trip', day, { ...stop, id: 'other' }, 0, true),
    weatherRequestKey('trip', day, { ...stop, lat: 40.000001 }, 0, true),
    weatherRequestKey('trip', day, { ...stop, lon: 9.000001 }, 0, true),
    weatherRequestKey('trip', day, stop, 1, true),
    weatherRequestKey('trip', day, stop, 0, false)
  ]) assert.notEqual(candidate, key);
  assert.equal(weatherEligible(day, '2026-10-15', stop), true);
  assert.equal(weatherEligible({ ...day, stops: [stop] }, '2026-10-15', { ...stop, lat: null }), false);
});
