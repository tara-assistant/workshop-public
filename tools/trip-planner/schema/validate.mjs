// Minimal JSON Schema validator for trip.schema.json. No dependencies.
// Runs in browsers and in Node. Unknown fields are allowed on purpose, so a
// newer agent's extra data survives an older viewer.
// Supported keywords: type, const, enum, required, properties, items,
// prefixItems, minItems, maxItems, minLength, maxLength, minimum, maximum,
// pattern, format (date only), $ref (local "#/$defs/..." only).

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

function isType(v, t) {
  if (t === 'integer') return Number.isInteger(v);
  if (t === 'number') return typeof v === 'number' && Number.isFinite(v);
  return typeOf(v) === t;
}

function resolveRef(root, ref) {
  if (!ref.startsWith('#/')) throw new Error('Unsupported $ref: ' + ref);
  return ref.slice(2).split('/').reduce((node, key) => node?.[key], root);
}

function check(root, schema, value, path, errors) {
  if (schema.$ref) return check(root, resolveRef(root, schema.$ref), value, path, errors);
  const fail = (message) => errors.push({ path: path || '/', message });

  if ('const' in schema && value !== schema.const) return fail(`must be ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) return fail(`must be one of ${schema.enum.join(', ')}`);
  if (schema.type && !isType(value, schema.type)) return fail(`must be ${schema.type}, got ${typeOf(value)}`);

  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) fail(`needs at least ${schema.minLength} characters`);
    if (schema.maxLength != null && value.length > schema.maxLength) fail(`is longer than ${schema.maxLength} characters`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail('has the wrong format');
    if (schema.format === 'date') {
      const ok = /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z'));
      if (!ok) fail('must be a date like 2026-06-05');
    }
  }
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) fail(`must be at least ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) fail(`must be at most ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) fail(`needs at least ${schema.minItems} items`);
    if (schema.maxItems != null && value.length > schema.maxItems) fail(`has more than ${schema.maxItems} items`);
    if (schema.prefixItems) {
      schema.prefixItems.forEach((s, i) => { if (i < value.length) check(root, s, value[i], `${path}/${i}`, errors); });
    }
    if (schema.items) {
      const start = schema.prefixItems ? schema.prefixItems.length : 0;
      for (let i = start; i < value.length; i++) check(root, schema.items, value[i], `${path}/${i}`, errors);
    }
  }
  if (typeOf(value) === 'object') {
    for (const key of schema.required || []) {
      if (!(key in value)) errors.push({ path: `${path}/${key}`, message: 'is required' });
    }
    for (const [key, sub] of Object.entries(schema.properties || {})) {
      if (key in value) check(root, sub, value[key], `${path}/${key}`, errors);
    }
  }
}

export function validateTrip(trip, schema) {
  const errors = [];
  check(schema, schema, trip, '', errors);
  return errors;
}

// Extra rules a JSON Schema cannot express. Returns warnings, not errors.
export function lintTrip(trip) {
  const warnings = [];
  const ids = new Set();
  const dayNumbers = new Set();
  for (const phase of trip.phases || []) {
    for (const day of phase.days || []) {
      if (dayNumbers.has(day.dayNumber)) warnings.push(`Day number ${day.dayNumber} is used twice.`);
      dayNumbers.add(day.dayNumber);
      for (const stop of day.stops || []) {
        if (ids.has(stop.id)) warnings.push(`Stop id ${stop.id} is used twice.`);
        ids.add(stop.id);
        if (stop.lat === 0 && stop.lon === 0) warnings.push(`Stop ${stop.name} sits at 0,0. Check its coordinates.`);
      }
    }
  }
  return warnings;
}

export function formatErrors(errors, limit = 12) {
  const lines = errors.slice(0, limit).map((e) => `${e.path} ${e.message}`);
  if (errors.length > limit) lines.push(`and ${errors.length - limit} more`);
  return lines.join('\n');
}
