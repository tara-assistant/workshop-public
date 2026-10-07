import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { cardHtml, cardsHtml, MAX_CARDS, renderCards, safeHref } from './assets/app-cards.mjs';
import { publicCards, scan, sharedUiAssets, sharedUiSources, validatePublicCatalog } from './release-inputs.mjs';

const projectDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(projectDir, '../..');
const catalog = JSON.parse(await readFile(resolve(projectDir, 'projects.json'), 'utf8'));
// 12 app files, index, Tara, avatar and the UI manifest; the 4 versioned shared assets are added by the builder (20 in all).
test('catalog allowlist has 16 fixed public release files and uses category source roots', () => {
  const files = [...validatePublicCatalog(catalog, repositoryRoot, projectDir)];
  assert.equal(files.length, 16);
  assert(!files.some(file => /private|projects\.json/.test(file)));
  assert.deepEqual(catalog.projects.map(item => item.sourceRoot), [
    'tools/trip-planner',
    'diagnostics/field-atlas',
    'games/snake'
  ]);
  assert.equal(catalog.projects[0].build, 'trip-planner-preview');
});
test('ordinary-browser private navigation is present and initially visible', async () => {
  const template = await readFile(resolve(projectDir, 'index.html'), 'utf8');
  assert.match(template, /href="\/assets\/app-hub-nav\.css"/);
  assert.match(template, /id="private-apps-link" href="https:\/\/private\.projects\.metaengineershub\.com\/"/);
  assert.doesNotMatch(template, /id="private-apps-link"[^>]*\shidden(?:\s|>|=)/i);
});
for (const [name, change] of [
  ['reserved Tara route', item => { item.slug = 'tara'; }],
  ['reserved asset route', item => { item.slug = 'assets'; }],
  ['App Hub template input', item => { item.sourceRoot = 'tools/app-hub'; }],
  ['staging input', item => { item.sourceRoot = 'tools/app-hub/staging/private'; }],
  ['private-designated source path', item => { item.sourceRoot = 'private/field-atlas'; }],
  ['legacy nested source path', item => { item.sourceRoot = 'projects/tools/trip-planner'; }],
  ['unknown source category', item => { item.sourceRoot = 'assets/trip-planner'; }],
  ['absolute Windows source', item => { item.sourceRoot = 'C:/private'; }],
  ['source traversal', item => { item.sourceRoot = 'tools/../private'; }],
  ['missing Trip Planner bundle builder', item => { delete item.build; }],
  ['unapproved build operation', item => { item.build = 'run-arbitrary-command'; }],
  ['hidden file', item => { item.files.push('.env'); }],
  ['unsupported executable', item => { item.files.push('server.py'); }],
  ['file traversal', item => { item.files.push('../private-hub.html'); }],
  ['case collision', item => { item.files.push('INDEX.HTML'); }],
  ['file/directory collision', item => { item.files.push('app.js/index.html'); }],
  ['missing entry point', item => { item.files = ['app.js']; }],
  ['Windows device', item => { item.files.push('CON.html'); }]
]) {
  test(`reject ${name}`, () => {
    const changed = structuredClone(catalog);
    change(changed.projects[0]);
    assert.throws(() => validatePublicCatalog(changed, repositoryRoot, projectDir));
  });
}
test('reject build operation on an unapproved route', () => {
  const changed = structuredClone(catalog);
  changed.projects[1].build = 'trip-planner-preview';
  assert.throws(() => validatePublicCatalog(changed, repositoryRoot, projectDir));
});
test('scan byte encodings and expanded credential formats', () => {
  const samples = ['github_pat_' + 'A'.repeat(24), 'ASIA' + 'A'.repeat(16), '123456789:' + 'a'.repeat(35), '-----BEGIN ENCRYPTED PRIVATE KEY-----'];
  for (const sample of samples) {
    for (const encoding of ['utf8', 'utf16le', 'latin1']) assert.throws(() => scan(Buffer.from(sample, encoding), 'synthetic fixture'));
  }
  assert.doesNotThrow(() => scan(Buffer.from('Visitors provide their own public token.'), 'privacy copy'));
});
test('JPEG Huffman tables are not bot tokens', async () => {
  const avatar = await readFile(resolve(projectDir, 'assets/tara-avatar.jpg'));
  assert.doesNotThrow(() => scan(avatar, 'avatar JPEG'));
});
test('shared UI assets ship under content-hashed names with matching integrity', async () => {
  const assets = await sharedUiAssets(repositoryRoot, projectDir);
  assert.deepEqual(assets.map(asset => asset.name), sharedUiSources);
  for (const asset of assets) {
    assert.match(asset.path, /^assets\/[a-z-]+\.[0-9a-f]{16}\.(?:css|mjs)$/);
    assert.equal(asset.integrity, `sha384-${createHash('sha384').update(asset.bytes).digest('base64')}`);
    assert(!asset.bytes.includes(13), `${asset.name} must hash with normalized line endings`);
  }
});
test('portfolio template links each shared stylesheet exactly once', async () => {
  const template = await readFile(resolve(projectDir, 'index.html'), 'utf8');
  for (const name of sharedUiSources.filter(item => item.endsWith('.css'))) assert.equal(template.split(`href="/assets/${name}"`).length, 2, name);
});
const goodCard = { title: 'Example', status: 'Live', description: 'A short neutral description.', href: '/example/' };
test('app cards escape hostile text instead of rendering markup', () => {
  const html = cardHtml({ ...goodCard, title: '<img src=x onerror=alert(1)>', description: '"><script>alert(1)</script>', category: "x' onmouseover='y", privacy: '&<>' });
  assert.doesNotMatch(html, /<img|<script|' onmouseover/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /aria-label="Open project: &lt;img/);
});
test('app card links accept only same-site routes', () => {
  for (const href of ['javascript:alert(1)', 'https://example.com/', '//example.com/', '/../x/', '/x', '/x/?a=1', '/X/', ' /x/', 'data:text/html,x']) {
    assert.throws(() => safeHref(href), href);
    assert.throws(() => cardHtml({ ...goodCard, href }), href);
  }
  assert.equal(safeHref('/station-two/'), '/station-two/');
});
for (const [name, card] of [
  ['unknown field', { ...goodCard, onclick: 'x' }],
  ['missing title', { ...goodCard, title: undefined }],
  ['blank description', { ...goodCard, description: '   ' }],
  ['oversized title', { ...goodCard, title: 'x'.repeat(81) }],
  ['control character', { ...goodCard, description: 'line\u0000break' }],
  ['non-string status', { ...goodCard, status: 1 }],
  ['array card', [goodCard]]
]) {
  test(`reject app card with ${name}`, () => assert.throws(() => cardHtml(card)));
}
test('card lists are bounded and render all or nothing', () => {
  assert.throws(() => cardsHtml([]));
  assert.throws(() => cardsHtml(Array(MAX_CARDS + 1).fill(goodCard)));
  const container = { innerHTML: 'unchanged' };
  assert.throws(() => renderCards(container, [goodCard, { ...goodCard, href: 'javascript:x' }]));
  assert.equal(container.innerHTML, 'unchanged');
  assert.equal(renderCards(container, publicCards(catalog)), 3);
  assert.equal(container.innerHTML.split('class="project-card"').length - 1, 3);
});
