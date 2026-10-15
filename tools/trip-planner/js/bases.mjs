export function reorderBases(trip, phaseId, delta) {
  const next = structuredClone(trip);
  const index = next.phases.findIndex((phase) => phase.id === phaseId);
  const target = index + delta;
  if (index < 0 || !Number.isInteger(delta) || target < 0 || target >= next.phases.length) return null;
  next.phases.splice(target, 0, next.phases.splice(index, 1)[0]);
  const dayMap = {};
  let number = 0;
  for (const phase of next.phases) for (const day of phase.days) {
    dayMap[day.dayNumber] = ++number;
    day.dayNumber = number;
  }
  return { trip: next, dayMap };
}

export function remapDayState(state, dayMap) {
  return {
    ...state,
    open: new Set([...state.open].map((number) => dayMap[number]).filter((number) => number != null)),
    focusDay: dayMap[state.focusDay] ?? null
  };
}

export function remapPacking(entries, tripId, dayMap) {
  const prefix = `tp-pack:${tripId}|`;
  return entries.map(([key, value]) => {
    if (!key.startsWith(prefix)) return [key, value];
    const [number, item] = key.slice(prefix.length).split('|');
    return dayMap[number] == null ? [key, value] : [`${prefix}${dayMap[number]}|${item}`, value];
  });
}
