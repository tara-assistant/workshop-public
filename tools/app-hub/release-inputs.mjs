import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

export const isWithin = (base, target) => {
  const rel = relative(base, target);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
};
const safePath = value => typeof value === 'string' && value.split('/').every(part =>
  /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(part) && !part.endsWith('.') &&
  !/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part) &&
  !/^(?:node_modules|staging|credentials?|secrets?)(?:\.|$)/i.test(part));
const extensions = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.txt', '.webmanifest', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2']);
const sourceCategories = new Set(['tools', 'diagnostics', 'games']);
export const fixedPublicFiles = ['index.html', 'tara/index.html', 'assets/tara-avatar.jpg', 'assets/ui-manifest.json'];
// Shared presentation assets. Each ships under a content-hashed name so a consumer can pin it.
export const sharedUiSources = ['app-hub.css', 'app-hub-nav.css', 'app-cards.css', 'app-cards.mjs'];
const requiredProjectKeys = ['slug', 'title', 'description', 'privacy', 'status', 'sourceRoot', 'files'];
const allowedProjectKeys = new Set([...requiredProjectKeys, 'icon', 'category', 'build']);

export function validatePublicCatalog(catalog, repositoryRoot, projectDir) {
  if (catalog?.schemaVersion !== 1 || !Array.isArray(catalog.projects) || !catalog.projects.length) throw new Error('Invalid project catalog schema.');
  const seen = new Set(['assets', 'tara']);
  const expected = new Set(fixedPublicFiles);
  for (const item of catalog.projects) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || requiredProjectKeys.some(key => !Object.hasOwn(item, key)) || Object.keys(item).some(key => !allowedProjectKeys.has(key))) throw new Error('Invalid public catalog fields.');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug) || !safePath(item.slug) || seen.has(item.slug)) throw new Error('Invalid, reserved, or duplicate public route.');
    seen.add(item.slug);
    if (['title', 'description', 'privacy'].some(key => typeof item[key] !== 'string' || !item[key].trim()) || item.status !== 'Live') throw new Error(`Incomplete public metadata for ${item.slug}.`);
    for (const key of ['category', 'icon']) {
      if (Object.hasOwn(item, key) && (typeof item[key] !== 'string' || !item[key].trim())) throw new Error(`Invalid public metadata for ${item.slug}: ${key}.`);
    }
    const sourceParts = typeof item.sourceRoot === 'string' ? item.sourceRoot.split('/') : [];
    if (!safePath(item.sourceRoot) || sourceParts.length !== 2 || !sourceCategories.has(sourceParts[0]) || sourceParts.some(part => part.toLowerCase() === 'private') || isWithin(projectDir, resolve(repositoryRoot, item.sourceRoot))) throw new Error(`Unsafe source root for ${item.slug}.`);
    if (item.slug === 'trip-planner') {
      if (item.build !== 'trip-planner-preview' || item.sourceRoot !== 'tools/trip-planner') throw new Error('Trip Planner must use its reviewed public bundle builder.');
    } else if (Object.hasOwn(item, 'build')) {
      throw new Error(`Unapproved public build operation for ${item.slug}.`);
    }
    if (Object.hasOwn(item, 'build') && item.build !== 'trip-planner-preview') throw new Error(`Unknown public build operation for ${item.slug}.`);
    if (!Array.isArray(item.files) || !item.files.includes('index.html')) throw new Error(`Public allowlist needs index.html: ${item.slug}.`);
    const files = new Set();
    for (const file of item.files) {
      if (!safePath(file) || !extensions.has(extname(file).toLowerCase()) || files.has(file.toLowerCase())) throw new Error(`Unsafe, unsupported, or duplicate public file: ${item.slug}.`);
      files.add(file.toLowerCase());
      expected.add(`${item.slug}/${file}`);
    }
    for (const file of files) {
      const parts = file.split('/');
      for (let i = 1; i < parts.length; i++) {
        if (files.has(parts.slice(0, i).join('/'))) throw new Error(`Public file/directory collision: ${item.slug}.`);
      }
    }
  }
  return expected;
}

export async function checkPath(base, target, allowMissing = false) {
  if (!isWithin(base, target)) throw new Error('Path escaped its allowed root.');
  let current = base;
  const parts = relative(base, target).split(sep).filter(Boolean);
  for (let i = -1; i < parts.length; i++) {
    if (i >= 0) current = resolve(current, parts[i]);
    let info;
    try { info = await lstat(current); }
    catch (error) { if (allowMissing && error.code === 'ENOENT') return; throw error; }
    if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile()) || (info.isFile() && info.nlink !== 1)) throw new Error('Links and special filesystem entries are not allowed.');
    if (i < parts.length - 1 && !info.isDirectory()) throw new Error('Expected a directory in the path.');
    if (!isWithin(base, await realpath(current))) throw new Error('Path resolves outside its allowed root.');
  }
}

const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bsk_(?:live|test)_[A-Za-z0-9]{12,}\b/,
  /\bsk-[A-Za-z0-9_-]{24,}\b/,
  /\b(?:pk|sk)\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
  /(?:^|[\s"'=]|\/bot)\d{6,12}:[A-Za-z0-9_-]{30,}\b/,
  /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
  /(?:api[_-]?key|secret[_-]?key|private[_-]?token|access[_-]?token|client[_-]?secret|bot[_-]?token|password|authorization)["']?\s*[:=]\s*["'][^"'\r\n]{16,}["']/i
];
export function scan(bytes, label) {
  for (const encoding of ['utf8', 'utf16le', 'latin1']) {
    if (secretPatterns.some(pattern => pattern.test(bytes.toString(encoding)))) throw new Error(`Potential credential detected in ${label}.`);
  }
}
export async function readSafe(base, source) {
  await checkPath(base, source);
  if (!(await lstat(source)).isFile()) throw new Error('Allowlisted input must be a regular file.');
  const bytes = await readFile(source);
  scan(bytes, relative(base, source));
  return bytes;
}

export function versionedAsset(name, bytes) {
  const digest = createHash('sha384').update(bytes).digest();
  const ext = extname(name);
  return { path: `assets/${name.slice(0, -ext.length)}.${digest.toString('hex').slice(0, 16)}${ext}`, integrity: `sha384-${digest.toString('base64')}` };
}
export async function sharedUiAssets(repositoryRoot, projectDir) {
  const assets = [];
  for (const name of sharedUiSources) {
    // Line endings are normalized so a checkout on any platform yields the same pinned hash.
    const bytes = Buffer.from((await readSafe(repositoryRoot, resolve(projectDir, 'assets', name))).toString('utf8').replace(/\r\n/g, '\n'));
    assets.push({ name, bytes, ...versionedAsset(name, bytes) });
  }
  return assets;
}
export const uiManifest = assets => ({ schemaVersion: 1, assets: Object.fromEntries(assets.map(({ name, path, integrity }) => [name, { path, integrity }])) });
export const publicCards = catalog => catalog.projects.map(({ slug, title, icon, category, status, description, privacy }) =>
  ({ title, icon, category, status, description, privacy, href: `/${slug}/` }));
