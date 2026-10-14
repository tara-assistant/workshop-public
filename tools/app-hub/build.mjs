import { lstat, mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cardsHtml } from './assets/app-cards.mjs';
import { checkPath, publicCards, readSafe, scan, sharedUiAssets, uiManifest, validatePublicCatalog } from './release-inputs.mjs';

const projectDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(projectDir, '../..');
const args = process.argv.slice(2);
let outputArg = 'dist';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out' && args[i + 1]) outputArg = args[++i];
  else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
}
const outputRoot = resolve(process.cwd(), outputArg);
const outputRelative = relative(repositoryRoot, outputRoot);
if (isAbsolute(outputRelative) || outputRelative === '..' || outputRelative.startsWith(`..${sep}`)) {
  throw new Error('Output must be inside the public repository root.');
}
await checkPath(repositoryRoot, outputRoot, true);
try { await lstat(outputRoot); throw new Error(`Refusing to overwrite an existing output directory: ${outputRelative}`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

const catalogPath = resolve(projectDir, 'projects.json');
const catalog = JSON.parse((await readSafe(repositoryRoot, catalogPath)).toString('utf8'));
validatePublicCatalog(catalog, repositoryRoot, projectDir);

async function listFiles(root, prefix = '') {
  const files = [];
  for (const entry of await readdir(resolve(root, prefix), { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Symbolic link in generated input: ${prefix}${entry.name}`);
    if (entry.isDirectory()) files.push(...await listFiles(root, `${prefix}${entry.name}/`));
    else if (entry.isFile()) files.push(`${prefix}${entry.name}`);
    else throw new Error(`Unsupported generated input: ${prefix}${entry.name}`);
  }
  return files.sort();
}

const cardMarkup = cardsHtml(publicCards(catalog)).replace(/^/gm, '        ');
const uiAssets = await sharedUiAssets(repositoryRoot, projectDir);
let template = (await readSafe(repositoryRoot, resolve(projectDir, 'index.html'))).toString('utf8');
for (const asset of uiAssets.filter(item => item.name.endsWith('.css'))) {
  const href = `href="/assets/${asset.name}"`;
  if (template.split(href).length !== 2) throw new Error(`index.html must link ${asset.name} exactly once.`);
  template = template.replace(href, `href="/${asset.path}"`);
}
const startMarker = '<!-- PROJECTS:START -->';
const endMarker = '<!-- PROJECTS:END -->';
const start = template.indexOf(startMarker);
const startAfter = start < 0 ? -1 : start + startMarker.length;
const end = startAfter < 0 ? -1 : template.indexOf(endMarker, startAfter);
if (template.split(startMarker).length !== 2 || template.split(endMarker).length !== 2 || start < 0 || end < 0 || end < startAfter) throw new Error('Project card placeholders are missing or out of order in index.html.');
const page = template.slice(0, startAfter) + '\n' + cardMarkup + '\n        ' + template.slice(end);
const insertedCards = page.split('class="project-card"').length - 1;
if (insertedCards !== catalog.projects.length) throw new Error(`Catalog render mismatch: expected ${catalog.projects.length} cards, found ${insertedCards}.`);
const files = new Map([
  ['index.html', Buffer.from(page)],
  ['tara/index.html', await readSafe(repositoryRoot, resolve(projectDir, 'tara.html'))],
  ['assets/tara-avatar.jpg', await readSafe(repositoryRoot, resolve(projectDir, 'assets/tara-avatar.jpg'))],
  ['assets/ui-manifest.json', Buffer.from(`${JSON.stringify(uiManifest(uiAssets), null, 2)}
`)],
  ...uiAssets.map(asset => [asset.path, asset.bytes])
]);
for (const item of catalog.projects) {
  const sourceRoot = resolve(repositoryRoot, item.sourceRoot);
  for (const file of item.files) {
    const bytes = await readSafe(sourceRoot, resolve(sourceRoot, file));
    files.set(`${item.slug}/${file}`, bytes);
  }
}
for (const [file, bytes] of files) scan(bytes, file);
await mkdir(dirname(outputRoot), { recursive: true });
await checkPath(repositoryRoot, dirname(outputRoot));
await mkdir(outputRoot, { recursive: false });
for (const [file, bytes] of files) {
  const target = resolve(outputRoot, file);
  await checkPath(outputRoot, target, true);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: 'wx' });
}
console.log(`Built ${catalog.projects.length} public projects plus the Tara portfolio into ${outputRelative}: ${files.size} allowlisted files, no credential patterns.`);
