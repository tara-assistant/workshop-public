// Pages deploys only the reviewed public bundle, never the source checkout.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSafe, scan, sharedUiAssets, sharedUiSources, uiManifest, validatePublicCatalog } from './release-inputs.mjs';

const projectDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(projectDir, '../..');

export function hostingHeaders(manifest) {
  if (manifest?.schemaVersion !== 1 || !manifest.assets || Object.keys(manifest.assets).length !== sharedUiSources.length) throw new Error('Invalid shared UI manifest.');
  const blocks = ['/assets/ui-manifest.json\n  Cache-Control: no-cache'];
  for (const name of sharedUiSources) {
    const asset = manifest.assets[name];
    const ext = name.endsWith('.mjs') ? 'mjs' : 'css';
    const stem = name.slice(0, -(ext.length + 1));
    if (!asset || !new RegExp(`^assets/${stem}\\.[0-9a-f]{16}\\.${ext}$`).test(asset.path) || !/^sha384-[A-Za-z0-9+/]{64}$/.test(asset.integrity)) throw new Error('Invalid pinned asset in hosting manifest.');
    // These public bytes also serve protected preview hosts. No credentials are allowed.
    blocks.push(`/${asset.path}\n  Access-Control-Allow-Origin: *\n  Content-Type: ${ext === 'mjs' ? 'text/javascript' : 'text/css'}; charset=utf-8\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff`);
  }
  return blocks.join('\n\n') + '\n';
}

async function listFiles(root, prefix = '') {
  const files = [];
  for (const entry of await readdir(resolve(root, prefix), { withFileTypes: true })) {
    if (entry.isSymbolicLink() || !(entry.isFile() || entry.isDirectory())) throw new Error('Unexpected deployment entry.');
    if (entry.isDirectory()) files.push(...await listFiles(root, `${prefix}${entry.name}/`));
    else files.push(prefix + entry.name);
  }
  return files.sort();
}

export async function buildPages(out = 'dist') {
  const outputRoot = resolve(repositoryRoot, out);
  const result = execFileSync(process.execPath, [resolve(projectDir, 'build.mjs'), '--out', outputRoot], { cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.trim()) console.log(result.trim());
  const catalog = JSON.parse(await readSafe(repositoryRoot, resolve(projectDir, 'projects.json')));
  const assets = await sharedUiAssets(repositoryRoot, projectDir);
  const expected = [...validatePublicCatalog(catalog, repositoryRoot, projectDir), ...assets.map(asset => asset.path)].sort();
  assert.deepEqual(await listFiles(outputRoot), expected, 'Unexpected file in public deployment bundle.');
  const manifest = JSON.parse(await readFile(resolve(outputRoot, 'assets/ui-manifest.json'), 'utf8'));
  assert.deepEqual(manifest, uiManifest(assets));
  const headers = Buffer.from(hostingHeaders(manifest));
  scan(headers, '_headers');
  await writeFile(resolve(outputRoot, '_headers'), headers, { flag: 'wx' });
  assert.deepEqual(await listFiles(outputRoot), [...expected, '_headers'].sort());
  console.log(`Pages bundle verified: ${expected.length + 1} allowlisted files including explicit shared-asset headers.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--out' || !args[1])) throw new Error('Usage: node tools/app-hub/build-pages.mjs [--out <new-public-output>].');
  await buildPages(args[1] || 'dist');
}
