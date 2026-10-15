import test from 'node:test';
import assert from 'node:assert/strict';
import { tripDayState, weatherDescription, LIVE_TTL } from './live.mjs';
import { configureProviders, currentWeather, weather } from './geo.js';
import { defaults } from './providers.mjs';

test('countdown selects the next or current dated day and reports a finished trip', () => {
  const days = [{ dayNumber: 1, date: '2026-10-20' }, { dayNumber: 2, date: '2026-10-21' }];
  const trip = { phases: [{ days }] };
  assert.deepEqual(tripDayState(trip, '2026-10-15'), { day: days[0], label: '5 days to go' });
  assert.deepEqual(tripDayState(trip, '2026-10-21'), { day: days[1], label: 'Day 2 of 2, today' });
  assert.deepEqual(tripDayState(trip, '2026-10-22'), { day: days[1], label: '' });
  assert.equal(tripDayState({ phases: [] }).label, 'Add trip dates');
  assert.equal(weatherDescription(0), 'Clear');
  assert.equal(weatherDescription(63), 'Rain');
  assert.equal(weatherDescription(null), 'Conditions unavailable');
});

test('current weather uses local hourly rain chance, caches for ten minutes and fails quietly at the caller', async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; configureProviders(defaults); });
  configureProviders(defaults);
  let time = Date.now(), calls = 0;
  const options = { now: () => time };
  globalThis.fetch = async (value) => {
    const url = new URL(value); calls++;
    assert.match(url.searchParams.get('current'), /weather_code/);
    assert.equal(url.searchParams.get('timezone'), 'auto');
    return { ok: true, json: async () => ({ current: { time: '2026-10-15T09:15', temperature_2m: 23, weather_code: 2, wind_speed_10m: 12 },
      hourly: { time: ['2026-10-15T08:00', '2026-10-15T09:00'], precipitation_probability: [10, 35] } }) };
  };
  const value = await currentWeather(40, 9, options);
  assert.equal(value.temperature, 23);
  assert.equal(value.description, 'Cloudy');
  assert.equal(value.wind, 12);
  assert.equal(value.rainChance, 35);
  assert.equal(await currentWeather(40, 9, options), value);
  assert.equal(calls, 1);
  time += LIVE_TTL + 1;
  await currentWeather(40, 9, options);
  assert.equal(calls, 2);
  globalThis.fetch = async () => { throw new Error('Offline'); };
  configureProviders(defaults);
  await assert.rejects(currentWeather(40, 9), /Offline/);
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
