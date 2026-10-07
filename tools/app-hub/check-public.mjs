import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { cardsHtml } from './assets/app-cards.mjs';
import { publicCards, readSafe, sharedUiAssets, uiManifest, validatePublicCatalog } from './release-inputs.mjs';

const projectDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(projectDir, '../..');
const [candidateArg] = process.argv.slice(2);
if (!candidateArg) throw new Error('Usage: node tools/app-hub/check-public.mjs <public-candidate>; set PLAYWRIGHT_MODULE if needed.');
const candidateRoot = resolve(process.cwd(), candidateArg);
const catalog = JSON.parse(await readFile(resolve(projectDir, 'projects.json'), 'utf8'));
const uiAssets = await sharedUiAssets(repositoryRoot, projectDir);
const expectedFiles = [...validatePublicCatalog(catalog, repositoryRoot, projectDir), ...uiAssets.map(asset => asset.path)].sort();
assert.equal(expectedFiles.length, 20, 'Public content allowlist must remain exactly 20 files.');
const privateBoundary = /private[.-]projects\.|private[- ]apps|PRIVATE_PROJECTS:|No private apps yet|private-apps\.json|private-hub\.html|private-app-hub\.css|catalog\.json/i;
for (const name of ['index.html', 'tara.html', ...uiAssets.map(asset => `assets/${asset.name}`)]) {
  assert.doesNotMatch((await readSafe(repositoryRoot, resolve(projectDir, name))).toString('utf8'), privateBoundary, `Private address or navigation in public source: ${name}`);
}
async function listFiles(root, prefix = '') {
  const files = [];
  for (const entry of await readdir(resolve(root, prefix), { withFileTypes: true })) {
    const name = prefix + entry.name;
    assert(!entry.isSymbolicLink(), `Symbolic link is not allowed in candidate: ${name}`);
    assert(entry.isFile() || entry.isDirectory(), `Unexpected filesystem entry: ${name}`);
    if (entry.isDirectory()) files.push(...await listFiles(root, `${name}/`));
    else files.push(name);
  }
  return files.sort();
}
assert.deepEqual(await listFiles(candidateRoot), expectedFiles, 'Public candidate must contain exactly the catalog allowlist.');
const publicBytes = new Map();
for (const name of expectedFiles) {
  const bytes = await readSafe(candidateRoot, resolve(candidateRoot, name));
  publicBytes.set(name, bytes);
  if (['.html', '.css', '.js', '.json', '.mjs'].includes(extname(name).toLowerCase())) {
    assert.doesNotMatch(bytes.toString('utf8'), privateBoundary, `Private address, navigation, or hub content leaked into public candidate: ${name}`);
  }
}
const candidateManifest = JSON.parse(publicBytes.get('assets/ui-manifest.json').toString('utf8'));
assert.deepEqual(candidateManifest, uiManifest(uiAssets), 'Shared UI manifest must match the shared asset sources.');
for (const { path, integrity } of Object.values(candidateManifest.assets)) {
  assert.match(path, /^assets\/[a-z-]+\.[0-9a-f]{16}\.(?:css|mjs)$/, `Shared UI asset outside the versioned assets path: ${path}`);
  assert.equal(`sha384-${createHash('sha384').update(publicBytes.get(path)).digest('base64')}`, integrity, `Shared UI asset bytes do not match their pinned hash: ${path}`);
}
const portfolioHtml = publicBytes.get('index.html').toString('utf8');
const compatibilityHtml = publicBytes.get('tara/index.html').toString('utf8');
assert.match(compatibilityHtml, /<meta http-equiv="refresh" content="0;url=\/#profile">/);
assert.match(compatibilityHtml, /window\.location\.replace\('\/#profile'\)/);
assert.match(compatibilityHtml, /<a href="\/#profile">/);
assert(portfolioHtml.includes(cardsHtml(publicCards(catalog)).replace(/^/gm, '        ')), 'Server-rendered cards must equal the shared module output.');
for (const asset of uiAssets.filter(item => item.name.endsWith('.css'))) assert(portfolioHtml.includes(`href="/${asset.path}"`), `Portfolio must link the versioned ${asset.name}.`);
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const screenshotDir = await mkdtemp(join(tmpdir(), 'public-app-hub-check-'));
const externalRequests = new Set();
const servedFiles = new Set();
const missingLocalFiles = [];
const report = { candidateFiles: expectedFiles, routes: [], viewports: [], interactions: [], linkChecks: [], screenshots: [], externalRequestsBlocked: [], missingLocalFiles };
let browser;
let context;
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
  context = await browser.newContext({ offline: true, serviceWorkers: 'block' });
  const servePublicRoute = async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'public.audit.invalid') { externalRequests.add(url.hostname); return route.abort(); }
    const path = decodeURIComponent(url.pathname.slice(1)) + (url.pathname.endsWith('/') ? 'index.html' : '');
    const body = publicBytes.get(path);
    if (!body) { missingLocalFiles.push(url.pathname); return route.fulfill({ status: 404, body: `Not in public candidate: ${url.pathname}` }); }
    servedFiles.add(path);
    const contentType = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' }[extname(path).toLowerCase()] || 'application/octet-stream';
    return route.fulfill({ status: 200, body, contentType });
  };
  await context.route('**/*', servePublicRoute);
  const pages = [['portfolio', '/'], ['tara', '/tara/'], ...catalog.projects.map(item => [item.slug, `/${item.slug}/`])];
  const page = await context.newPage();
  let pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  for (const width of [320, 375, 1280]) {
    const height = width === 1280 ? 900 : 812;
    await page.setViewportSize({ width, height });
    for (const [label, routePath] of pages) {
      pageErrors = [];
      const response = await page.goto(`https://public.audit.invalid${routePath}`);
      if (routePath === '/tara/') await page.waitForURL('https://public.audit.invalid/#profile');
      await page.waitForTimeout(100);
      assert.equal(response.status(), 200, `Route did not load: ${routePath}`);
      const metrics = await page.evaluate(() => {
        const visible = element => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
        };
        const inBoundScroller = element => {
          for (let parent = element.parentElement; parent && parent !== document.body && parent !== document.documentElement; parent = parent.parentElement) {
            const style = getComputedStyle(parent);
            const rect = parent.getBoundingClientRect();
            if (['auto', 'scroll', 'overlay'].includes(style.overflowX) && parent.scrollWidth > parent.clientWidth + 1) return rect.width > 0 && rect.left >= -1 && rect.right <= innerWidth + 1;
          }
          return false;
        };
        const controls = [...document.querySelectorAll('a[href],button,input:not([type="hidden"]),select,textarea')].filter(visible).map(element => {
          const rect = element.getBoundingClientRect();
          return { name: element.getAttribute('aria-label') || element.innerText || element.getAttribute('title') || element.getAttribute('placeholder') || element.tagName, left: rect.left, right: rect.right, inBoundScroller: inBoundScroller(element) };
        });
        return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, h1: document.querySelectorAll('h1').length, outOfBounds: controls.filter(item => !item.inBoundScroller && (item.left < -1 || item.right > innerWidth + 1)) };
      });
      const unnamedLinks = await page.getByRole('link', { name: '', exact: true }).count();
      const unnamedButtons = await page.getByRole('button', { name: '', exact: true }).count();
      const accessibleH1 = await page.getByRole('heading', { level: 1 }).count();
      const errors = [...pageErrors];
      report.routes.push({ label, path: routePath, ...metrics, accessibleH1, unnamedLinks, unnamedButtons, errors });
      assert.equal(metrics.h1, 1, `Expected one h1: ${routePath} at ${width}`);
      assert.equal(accessibleH1, 1, `Expected one accessible h1: ${routePath} at ${width}`);
      assert(metrics.scrollWidth <= width, `Horizontal overflow: ${routePath} at ${width}`);
      assert.deepEqual(metrics.outOfBounds, [], `Visible control outside viewport: ${routePath} at ${width}`);
      assert.equal(unnamedLinks + unnamedButtons, 0, `Unnamed links or buttons: ${routePath} at ${width}`);
      if (routePath !== '/trip-planner/') assert.deepEqual(errors, [], `JavaScript error: ${routePath} at ${width}`);
      const current = new URL(page.url());
      if (routePath === '/' || routePath === '/tara/') {
        assert.equal(await page.locator('#profile').count(), 1, 'Home must have one combined profile section.');
        assert(await page.locator('#profile').getByRole('heading', { name: 'Jihad Karaki', exact: true }).isVisible());
        assert(await page.locator('#profile').getByRole('heading', { name: 'Tara', exact: true }).isVisible());
        assert.match(await page.locator('#profile').innerText(), /PhD[\s\S]*Politecnico di Milano[\s\S]*AI assistant[\s\S]*ATM Milan/);
        assert(await page.evaluate(() => Boolean(document.querySelector('#projects').compareDocumentPosition(document.querySelector('#profile')) & Node.DOCUMENT_POSITION_FOLLOWING)), 'Tools must precede the shared profile.');
        assert.match(await page.locator('#projects').innerText(), /Field Atlas is a prototype demo with synthetic readings/);
        assert.equal(await page.locator('.project-card').count(), 3);
        assert.deepEqual(await page.locator('.project-card h3').allTextContents(), catalog.projects.map(item => item.title));
        assert(await page.locator('.project-card').evaluateAll(cards => cards.every(card => {
          const rect = card.getBoundingClientRect();
          const style = getComputedStyle(card);
          return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        })), 'All three catalog cards must be visible, with no conditional hiding.');
        const links = await page.locator('a[href]').evaluateAll(elements => elements.map(element => ({ href: element.getAttribute('href'), target: element.getAttribute('target'), rel: element.getAttribute('rel') })));
        assert.equal(links.filter(link => !link.href.startsWith('#')).length, 11, 'Expected three apps, four work/docs links and four social/workshop links.');
        for (const link of links) {
          if (link.href.startsWith('#')) {
            assert(!link.target || link.target === '_self', `Section navigation must stay local: ${link.href}`);
          } else {
            assert.equal(link.target, '_blank', `App, work, docs and social links must open a new tab: ${link.href}`);
            assert.deepEqual(new Set((link.rel || '').split(/\s+/)), new Set(['noopener', 'noreferrer']), `Unsafe new-tab link: ${link.href}`);
          }
        }
        report.linkChecks.push({ route: routePath, width, newTabLinks: 11, sectionLinksStayLocal: true, sharedProfile: true });
        const favicon = page.locator('link[rel="icon"]');
        assert.equal(await favicon.count(), 1);
        assert.equal(await favicon.getAttribute('type'), 'image/svg+xml');
        assert.match(await favicon.getAttribute('href'), /^data:image\/svg\+xml,/);
        assert(await page.evaluate(async () => {
          const icon = new Image();
          icon.src = document.querySelector('link[rel="icon"]').href;
          try { await icon.decode(); return icon.naturalWidth > 0; } catch { return false; }
        }), 'Inline workshop favicon must decode successfully without another build file.');
      }
      const hrefs = await page.locator('a[href]').evaluateAll(elements => elements.map(element => element.getAttribute('href')));
      for (const href of hrefs) {
        const targetUrl = new URL(href, current);
        if (targetUrl.origin !== current.origin) continue;
        const target = targetUrl.pathname.slice(1) + (targetUrl.pathname.endsWith('/') ? 'index.html' : '');
        assert(publicBytes.has(target), `Missing local link target ${href} on ${routePath}`);
        if (targetUrl.pathname === current.pathname && targetUrl.hash) assert(await page.locator(targetUrl.hash).count(), `Missing anchor ${href} on ${routePath}`);
      }
      const filename = `${label}-${width}.png`;
      await page.screenshot({ path: join(screenshotDir, filename), fullPage: true });
      report.screenshots.push(join(screenshotDir, filename));
      if (routePath === '/' && [375, 1280].includes(width)) {
        const viewportFilename = `workshop-${width}x${height}.png`;
        await page.screenshot({ path: join(screenshotDir, viewportFilename) });
        report.screenshots.push(join(screenshotDir, viewportFilename));
      }
      report.viewports.push({ route: routePath, width, height, horizontalOverflow: false, visibleControlsWithinViewport: true });
    }
  }
  const tripPage = await context.newPage();
  for (const width of [320, 375, 1280]) {
    const height = width === 1280 ? 900 : 812;
    await tripPage.setViewportSize({ width, height });
    await tripPage.goto('https://public.audit.invalid/trip-planner/');
    for (const [modalId, trigger, field] of [['newPlanModal', 'newPlanBtn', 'inputPlanTitle'], ['addStopModal', 'addStopBtn', 'inputStopName']]) {
      const modal = tripPage.locator(`#${modalId}`);
      await tripPage.locator(`#${trigger}`).click();
      await modal.waitFor({ state: 'visible' });
      const bounds = await modal.locator('.modal-dialog').boundingBox();
      assert(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1, `${modalId} escaped ${width}x${height}.`);
      assert(await tripPage.locator(`#${field}`).isVisible(), `${modalId} form is not visible at ${width}px.`);
      await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
      await modal.waitFor({ state: 'hidden' });
    }
    report.interactions.push(`Trip Planner New Plan and Add Stop modals open, close, and stay within ${width}x${height}.`);
  }
  await tripPage.close();
  for (const mode of ['ordinary', 'sdk-only', 'launch']) {
    const navPage = await context.newPage();
    if (mode !== 'ordinary') await navPage.addInitScript(launch => {
      window.__opened = [];
      window.Telegram = { WebApp: { initData: launch ? 'local-simulation' : '', platform: launch ? 'android' : 'unknown', ready() {}, expand() {}, setHeaderColor() {}, setBackgroundColor() {}, openLink(url) { window.__opened.push(url); } } };
    }, mode === 'launch');
    for (const width of [320, 375, 1280]) {
      await navPage.setViewportSize({ width, height: width === 1280 ? 900 : 812 });
      await navPage.goto('https://public.audit.invalid/');
      assert.equal(await navPage.locator('#private-apps-link').count(), 0, `Private navigation must not exist in ${mode} mode at ${width}px.`);
      assert.doesNotMatch(await navPage.content(), privateBoundary, `Private address must not be hidden or conditional in ${mode} mode.`);
      assert(await navPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Portfolio overflow in ${mode} mode at ${width}px.`);
      await navPage.getByRole('link', { name: 'Jihad + Tara', exact: true }).click();
      assert.equal(new URL(navPage.url()).hash, '#profile');
      assert.equal(new URL(navPage.url()).pathname, '/');
      if (mode === 'launch') {
        assert.deepEqual(await navPage.evaluate(() => window.__opened), [], 'Section anchors must not call Telegram openLink.');
        const publicLinks = await navPage.locator('a[target="_blank"]').evaluateAll(links => links.map(link => link.href));
        for (const href of publicLinks) await navPage.locator('a[target="_blank"]').evaluateAll((links, url) => links.find(link => link.href === url).click(), href);
        assert.deepEqual(await navPage.evaluate(() => window.__opened), publicLinks, 'Telegram must receive only the visible public app, product, docs and social URLs.');
        assert.equal(new URL(navPage.url()).pathname, '/', 'Telegram tap should use openLink without navigating the audit page.');
        await navPage.evaluate(() => { window.__opened = []; });
      } else if (width === 375) {
        const links = navPage.locator('a[target="_blank"]');
        const hrefs = await links.evaluateAll(elements => elements.map(link => link.href));
        for (let index = 0; index < hrefs.length; index++) {
          const popupPromise = navPage.waitForEvent('popup');
          await links.nth(index).click();
          const popup = await popupPromise;
          await popup.waitForLoadState().catch(() => {});
          assert.equal(await popup.evaluate(() => window.opener), null, 'New tabs must have no opener.');
          const request = popup.mainFrame().url();
          assert(request === hrefs[index] || request === 'chrome-error://chromewebdata/', `Unexpected popup destination: ${request}`);
          await popup.close();
        }
        assert.equal(new URL(navPage.url()).hash, '#profile', 'Opening tools and work must preserve the workshop page.');
      }
    }
    await navPage.close();
    report.interactions.push(`No private address or navigation in ${mode} mode at 320, 375, and 1280px; section anchors stay local; ${mode === 'launch' ? 'all eleven public links call Telegram openLink' : 'all eleven app, work/docs and social links open tabs without an opener'}.`);
  }
  const noJsContext = await browser.newContext({ offline: true, javaScriptEnabled: false, serviceWorkers: 'block' });
  try {
    await noJsContext.route('**/*', servePublicRoute);
    const fallbackPage = await noJsContext.newPage();
    await fallbackPage.goto('https://public.audit.invalid/tara/');
    await fallbackPage.waitForURL('https://public.audit.invalid/#profile');
    assert(await fallbackPage.locator('#profile').getByRole('heading', { name: 'Jihad + Tara', exact: true }).isVisible());
    report.interactions.push('Legacy /tara/ redirects to /#profile with JavaScript enabled and disabled; the template also includes a same-page fallback link.');
  } finally { await noJsContext.close(); }
  const atlasPage = await context.newPage();
  await atlasPage.setViewportSize({ width: 375, height: 812 });
  await atlasPage.goto('https://public.audit.invalid/field-atlas/');
  await atlasPage.evaluate(() => localStorage.removeItem('field-atlas-inspected'));
  await atlasPage.reload();
  await atlasPage.getByRole('button', { name: 'Healthy · 4', exact: true }).click();
  await atlasPage.getByRole('button', { name: 'Mark inspected on this device', exact: true }).click();
  await atlasPage.reload();
  await atlasPage.getByRole('button', { name: 'Healthy · 4', exact: true }).click();
  assert.match(await atlasPage.locator('#inspection').innerText(), /Marked inspected locally/);
  await atlasPage.getByRole('button', { name: 'Inspected ✓ · undo', exact: true }).click();
  assert.match(await atlasPage.locator('#mapNotice').innerText(), /Map library unavailable/);
  report.interactions.push('Field Atlas offline readings, persistent local inspection mark, undo, and map-unavailable fallback pass.');
  await atlasPage.close();
  const mapPage = await context.newPage();
  await mapPage.setViewportSize({ width: 375, height: 812 });
  await mapPage.addInitScript(() => {
    window.__map = { loaded: false, handlers: {}, sources: {}, states: {}, layers: {}, terrain: null, lastEase: null };
    window.maplibregl = {
      Map: class {
        constructor(options) {
          for (const [id, source] of Object.entries(options.style.sources)) window.__map.sources[id] = { data: source.data, setData(data) { this.data = data; } };
          for (const layer of options.style.layers) window.__map.layers[layer.id] = { layout: { ...(layer.layout || {}) } };
        }
        on(event, ...args) { window.__map.handlers[event] = args.at(-1); }
        isStyleLoaded() { return window.__map.loaded; }
        getSource(id) { return window.__map.sources[id]; }
        setFeatureState({ id }, state) { window.__map.states[id] = state; }
        setLayoutProperty(id, key, value) { window.__map.layers[id].layout[key] = value; }
        setTerrain(terrain) { window.__map.terrain = terrain; }
        addControl() {} fitBounds() {} easeTo(options) { window.__map.lastEase = options; } resize() {}
      }, NavigationControl: class {}, AttributionControl: class {}
    };
  });
  await mapPage.goto('https://public.audit.invalid/field-atlas/');
  await mapPage.getByRole('button', { name: 'Healthy · 4', exact: true }).click();
  await mapPage.evaluate(() => { window.__map.loaded = true; window.__map.handlers.load(); });
  assert.equal(await mapPage.evaluate(() => window.__map.sources['asset-points'].data.features.length), 4);
  assert.equal(await mapPage.evaluate(() => window.__map.states.torino.selected), true);
  await mapPage.getByRole('button', { name: 'Needs a look · 2', exact: true }).click();
  assert.equal(await mapPage.evaluate(() => window.__map.states.torino.selected), false);
  assert.equal(await mapPage.evaluate(() => window.__map.states.milano.selected), true);
  assert.equal(await mapPage.evaluate(() => window.__map.sources['asset-points'].data.features.length), 2);
  assert.deepEqual(await mapPage.evaluate(() => Object.keys(window.__map.sources).sort()), ['asset-points', 'corridor', 'elevation', 'osm', 'satellite', 'topo']);
  for (const [button, visibleLayer, hiddenLayer] of [['Satellite · NASA', 'satellite-base', 'osm-base'], ['Topographic', 'topo-base', 'satellite-base'], ['Standard · OSM', 'osm-base', 'topo-base']]) {
    await mapPage.getByRole('button', { name: button, exact: true }).click();
    assert.equal(await mapPage.evaluate(id => window.__map.layers[id].layout.visibility, visibleLayer), 'visible');
    assert.equal(await mapPage.evaluate(id => window.__map.layers[id].layout.visibility, hiddenLayer), 'none');
    assert.equal(await mapPage.getByRole('button', { name: button, exact: true }).getAttribute('aria-pressed'), 'true');
  }
  const terrainButton = mapPage.getByRole('button', { name: '3D terrain', exact: true });
  await terrainButton.click();
  assert.equal(await mapPage.evaluate(() => window.__map.terrain.source), 'elevation');
  assert.equal(await mapPage.evaluate(() => window.__map.lastEase.pitch), 58);
  assert.equal(await terrainButton.getAttribute('aria-pressed'), 'true');
  await terrainButton.click();
  assert.equal(await mapPage.evaluate(() => window.__map.terrain), null);
  assert.equal(await mapPage.evaluate(() => window.__map.lastEase.pitch), 0);
  assert.equal(await terrainButton.getAttribute('aria-pressed'), 'false');
  report.interactions.push('Field Atlas delayed map load and asset filters pass; OSM, satellite, and topographic visibility switch correctly; elevation terrain turns on and off with the 3D pitch and pressed state.');
  await mapPage.close();
  for (const asset of uiAssets.filter(item => item.name.endsWith('.css'))) assert(servedFiles.has(asset.path), `Versioned ${asset.name} was not loaded.`);
  assert(![...externalRequests].some(host => /^private[.-]/i.test(host)), 'A public page contacted a private host.');
  assert.deepEqual(missingLocalFiles, [], 'Candidate requested a file outside the public allowlist.');
  report.externalRequestsBlocked = [...externalRequests].sort();
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (context) await context.close();
  if (browser) await browser.close();
}
