import { createHash, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { watch } from 'node:fs';
import { lstat, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

import { validateTrip, lintTrip, formatErrors } from '../schema/validate.mjs';

export const tripSchema = JSON.parse(await readFile(new URL('../schema/trip.schema.json', import.meta.url), 'utf8'));

export class TripError extends Error {
  constructor(message, errors = [], status = 400) {
    super(message);
    this.errors = errors;
    this.status = status;
  }
}

export function checkId(id) {
  if (typeof id !== 'string' || !/^[a-z0-9_-]{1,80}$/.test(id)) {
    throw new TripError('Trip id must have 1 to 80 lowercase letters, digits, hyphens or underscores.');
  }
  return id;
}

export function inspectTrip(trip) {
  const errors = validateTrip(trip, tripSchema);
  if (trip && typeof trip === 'object' && 'id' in trip) {
    try { checkId(trip.id); } catch (error) { errors.push({ path: '/id', message: error.message }); }
  }
  return { valid: errors.length === 0, errors, warnings: errors.length ? [] : lintTrip(trip) };
}

function requireValid(trip) {
  const result = inspectTrip(trip);
  if (!result.valid) throw new TripError('Trip was not saved. Fix these errors:\n' + formatErrors(result.errors), result.errors);
  return result;
}

export class TripStore extends EventEmitter {
  constructor(directory, log = (message) => process.stderr.write(message + '\n')) {
    super();
    this.directory = resolve(directory);
    this.log = log;
    this.locks = new Map();
    this.timers = new Map();
    this.fingerprints = new Map();
    this.closed = false;
  }

  async start() {
    await mkdir(this.directory, { recursive: true });
    for (const id of await this.ids()) this.fingerprints.set(id, await this.fingerprint(id));
    this.watcher = watch(this.directory, (_event, filename) => {
      if (filename) {
        const match = /^([a-z0-9_-]{1,80})\.json$/.exec(String(filename));
        if (match) this.changed(match[1]);
      } else {
        this.rescan().catch((error) => this.log('Trip watch: ' + error.message));
      }
    });
    this.watcher.on('error', (error) => this.log('Trip watch: ' + error.message));
    return this;
  }

  path(id) { return join(this.directory, checkId(id) + '.json'); }

  async safePath(id) {
    const path = this.path(id);
    try {
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink()) throw new TripError('Trip files must be regular files, not links.');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return path;
  }

  async ids() {
    return (await readdir(this.directory)).filter((name) => /^[a-z0-9_-]{1,80}\.json$/.test(name))
      .map((name) => name.slice(0, -5)).sort();
  }

  async get(id) {
    try {
      const file = await this.safePath(id);
      if ((await stat(file)).size > 2_000_000) throw new TripError('Trip file is larger than 2 MB: ' + id);
      const trip = JSON.parse(await readFile(file, 'utf8'));
      if (!trip || trip.id !== id) throw new TripError('Trip id does not match its filename.');
      return trip;
    } catch (error) {
      if (error.code === 'ENOENT') throw new TripError('Trip not found: ' + id, [], 404);
      if (error instanceof SyntaxError) throw new TripError('Trip file is not valid JSON: ' + id);
      throw error;
    }
  }

  async list() {
    const results = await Promise.allSettled((await this.ids()).map(async (id) => {
      const trip = await this.get(id);
      const info = await stat(this.path(id));
      return { id, title: trip.title, destination: trip.destination, startDate: trip.startDate,
        endDate: trip.endDate, updatedAt: info.mtime.toISOString() };
    }));
    const trips = [];
    for (const result of results) {
      if (result.status === 'fulfilled') trips.push(result.value);
      else this.log('Skipped trip: ' + result.reason.message);
    }
    return trips;
  }

  async locked(id, operation) {
    checkId(id);
    const previous = this.locks.get(id) || Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    this.locks.set(id, next);
    try { return await next; }
    finally { if (this.locks.get(id) === next) this.locks.delete(id); }
  }

  async write(trip) {
    const result = requireValid(trip);
    const target = await this.safePath(trip.id);
    const temporary = join(this.directory, '.' + trip.id + '.' + randomUUID() + '.tmp');
    try {
      await writeFile(temporary, JSON.stringify(trip, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      await rename(temporary, target);
    } finally { await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') this.log(error.message); }); }
    this.changed(trip.id);
    return { trip, warnings: result.warnings };
  }

  async save(trip) {
    requireValid(trip);
    return this.locked(trip.id, () => this.write(trip));
  }

  async delete(id) {
    return this.locked(id, async () => {
      try { await unlink(await this.safePath(id)); }
      catch (error) { if (error.code === 'ENOENT') throw new TripError('Trip not found: ' + id, [], 404); throw error; }
      this.changed(id);
      return { id, deleted: true };
    });
  }

  async edit(id, operation) {
    return this.locked(id, async () => {
      const trip = await this.get(id);
      requireValid(trip);
      operation(trip);
      return this.write(trip);
    });
  }

  async fingerprint(id) {
    try {
      const path = await this.safePath(id);
      return createHash('sha256').update(await readFile(path)).digest('hex');
    } catch (error) {
      if (error.code !== 'ENOENT') this.log('Trip watch: ' + error.message);
      return null;
    }
  }

  changed(id) {
    if (this.closed) return;
    clearTimeout(this.timers.get(id));
    this.timers.set(id, setTimeout(() => {
      this.timers.delete(id);
      this.publish(id).catch((error) => this.log('Trip watch: ' + error.message));
    }, 120));
  }

  async publish(id) {
    const fingerprint = await this.fingerprint(id);
    if (this.closed || (this.fingerprints.get(id) ?? null) === fingerprint) return;
    this.fingerprints.set(id, fingerprint);
    let updatedAt = new Date().toISOString();
    if (fingerprint) updatedAt = (await stat(this.path(id))).mtime.toISOString();
    this.emit('change', { id, updatedAt });
  }

  async rescan() {
    for (const id of new Set([...await this.ids(), ...this.fingerprints.keys()])) this.changed(id);
  }

  close() {
    this.closed = true;
    this.watcher?.close();
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
