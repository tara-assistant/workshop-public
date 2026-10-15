export const LIVE_TTL = 600000;

export function tripDayState(trip, today = new Date().toLocaleDateString('en-CA')) {
  const days = trip.phases.flatMap((phase) => phase.days).filter((day) => day.date).sort((a, b) => a.date.localeCompare(b.date));
  const current = days.find((day) => day.date === today);
  const next = days.find((day) => day.date > today);
  const target = current || next || days.at(-1);
  if (!target) return { day: null, label: 'Add trip dates' };
  if (current) return { day: current, label: `Day ${days.indexOf(current) + 1} of ${days.length}, today` };
  if (!next) return { day: target, label: '' };
  const count = Math.round((Date.parse(target.date + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86400000);
  return { day: target, label: `${count} days to go` };
}

export function weatherDescription(code) {
  if (code === 0) return 'Clear';
  if ([1, 2, 3].includes(code)) return 'Cloudy';
  if ([45, 48].includes(code)) return 'Fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([95, 96, 99].includes(code)) return 'Thunderstorms';
  return 'Conditions unavailable';
}
