"""Build the public Trip Planner preview without reading or injecting any API key."""
import argparse
from html.parser import HTMLParser
import pathlib
import re


def repository_root(directory: pathlib.Path) -> pathlib.Path:
    for ancestor in (directory, *directory.parents):
        marker = ancestor / '.git'
        if marker.is_dir() or marker.is_file():
            return ancestor
    raise SystemExit('Build refused: no Git repository root found (.git directory or file required).')


ROOT = pathlib.Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', required=True, type=pathlib.Path,
                    help='Fresh output directory; existing paths are refused.')
OUTPUT = parser.parse_args().output.absolute()
for protected in (ROOT / 'public-preview', repository_root(ROOT) / 'dist'):
    if OUTPUT.resolve().is_relative_to(protected.resolve()):
        parser.error(f'Build refused: protected output path: {OUTPUT}')
if OUTPUT.exists() or OUTPUT.is_symlink():
    parser.error(f'Build refused: output path already exists: {OUTPUT}')
html = (ROOT / 'index.html').read_text(encoding='utf-8')
header = '<header class="floating-header">'
if html.count(header) != 1 or 'class="page-title"' in html:
    raise SystemExit('Build refused: expected preview-heading insertion point is missing or changed.')
html = html.replace(header, header + '\n      <h1 class="page-title">Trip Planner</h1>', 1)
html = html.replace('<link rel="stylesheet" href="styles.css" />', '<link rel="stylesheet" href="styles.css" /><link rel="stylesheet" href="enhancements.css" /><link rel="stylesheet" href="client-key.css" />')
html = html.replace('title="Tesseract Apps"', 'title="Open public projects"').replace('TESSERACT APPS', 'PUBLIC PROJECTS')
html = html.replace('https://0e7393a3.workshop-47y.pages.dev', '/').replace('https://d469c729.workshop-47y.pages.dev', '/field-atlas/')
html = html.replace('https://projects.metaengineershub.com/snake/', '/snake/').replace('https://projects.metaengineershub.com/tara/', '/tara/')
html = html.replace('Apps Launchpad', 'Jihad’s portfolio').replace('All registered mobile mini apps', 'Selected public projects')
menu_tail = '''        </div>\n      </div>\n    </div>\n\n    <!-- Map Canvas Viewport -->'''
menu_replacement = '''        </div>\n        <button class="switcher-row mapbox-settings-row" type="button" id="mapboxSettingsMenuBtn"><span class="item-icon">🔑</span><div><strong>Map settings</strong><small>Use or remove your own Mapbox token</small></div></button>\n      </div>\n    </div>\n\n    <!-- Map Canvas Viewport -->'''
if menu_tail not in html:
    raise SystemExit('Build refused: expected project-navigation marker is missing.')
html = html.replace(menu_tail, menu_replacement, 1)
hero_actions = '<div class="hero-actions">'
if hero_actions not in html:
    raise SystemExit('Build refused: expected itinerary header marker is missing.')
html = html.replace(hero_actions, hero_actions + '<button class="btn-pill btn-outline mapbox-inline-button" type="button" id="mapboxSettingsBtn">Map settings</button>', 1)
if '<div class="day-tabs-container">' not in html or '<!-- Timeline Section -->' not in html:
    raise SystemExit('Build refused: expected itinerary-control insertion points are missing.')
html = html.replace('<div class="day-tabs-container">', '<div id="phaseTabs" class="phase-tabs" aria-label="Trip bases"></div><div class="day-tabs-container">', 1)
html = html.replace('<!-- Timeline Section -->', '<div class="transport-row"><label for="transportMode">Travel mode</label><select id="transportMode"><option value="walking">Walk</option><option value="cycling">Bike</option><option value="driving">Car</option><option value="driving-traffic">Car with traffic</option><option value="transit">Public transport (external)</option></select></div><p id="routeStatus" class="route-status" role="status"></p><section id="packingList" class="packing-list"></section><ol id="navigationSteps"></ol><!-- Timeline Section -->', 1)
map_markup = '''<div id="map"></div><div id="mapboxTokenNotice" class="mapbox-token-notice" role="status"><strong>Map requires your own Mapbox public token.</strong><p>Map and route requests go directly from your browser to Mapbox. The token is saved only in this browser.</p><button type="button" class="btn-pill btn-accent-cyan" id="configureMapboxBtn">Configure map key</button></div><div id="mapMessage" role="status"></div><div id="controlHint" role="status"></div>'''
if '<div id="map"></div>' not in html:
    raise SystemExit('Build refused: map container is missing.')
html = html.replace('<div id="map"></div>', map_markup, 1)
modal = '''<div class="modal-overlay" id="mapboxTokenModal" role="dialog" aria-modal="true" aria-labelledby="mapboxTokenTitle"><div class="modal-dialog"><div class="modal-header"><h3 id="mapboxTokenTitle">Set up your map</h3><button class="close-btn" type="button" id="closeMapboxTokenModal" aria-label="Close map setup">×</button></div><form class="modal-form" id="mapboxTokenForm"><div class="form-group"><label for="mapboxTokenInput">Your Mapbox public token</label><input id="mapboxTokenInput" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your own public token" required></div><p class="mapbox-key-help">Use a public token from your own Mapbox account. Do not enter a secret token. It is stored in this browser’s local storage and sent directly to Mapbox when the map or routes are used. <a href="https://account.mapbox.com/access-tokens/" target="_blank" rel="noopener noreferrer">Get a token ↗</a></p><p id="mapboxTokenFeedback" role="status"></p><div class="modal-actions"><button type="button" class="btn-pill btn-outline" id="clearMapboxTokenBtn">Remove saved key</button><button type="submit" class="btn-pill btn-accent-cyan">Save in this browser</button></div></form></div></div>'''
if '<!-- Toast Notification Overlay -->' not in html:
    raise SystemExit('Build refused: modal insertion point is missing.')
html = html.replace('<!-- Toast Notification Overlay -->', modal + '\n\n    <!-- Toast Notification Overlay -->', 1)
script_marker = '<script src="app.js"></script>'
if html.count(script_marker) != 1:
    raise SystemExit('Build refused: expected exactly one app.js script insertion marker.')
html = html.replace(script_marker, script_marker + '<script src="enhancements.js"></script><script src="client-key.js"></script>', 1)
assets = {'index.html': html}
for name in ['app.js', 'styles.css', 'enhancements.js', 'enhancements.css', 'client-key.js', 'client-key.css']:
    content = (ROOT / name).read_text(encoding='utf-8').replace('__MAPBOX_TOKEN__', '')
    if name == 'styles.css':
        marker = '.brand-badge span.icon { font-size: 18px; }'
        if content.count(marker) != 1 or '.page-title' in content:
            raise SystemExit('Build refused: expected preview-heading style insertion point is missing or changed.')
        page_title = """.page-title {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

"""
        content = content.replace(marker, page_title + marker, 1)
    assets[name] = content
required = ['phaseTabs', 'transportMode', 'routeStatus', 'packingList', 'mapMessage', 'controlHint', 'navigationSteps', 'mapboxTokenNotice', 'mapboxTokenForm', 'mapboxSettingsBtn', 'mapboxSettingsMenuBtn']


class BundleElements(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: set[str] = set()
        self.scripts: list[str | None] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        element_id = attributes.get('id')
        if element_id is not None:
            self.ids.add(element_id)
        if tag == 'script':
            self.scripts.append(attributes.get('src'))


elements = BundleElements()
elements.feed(html)
for script in ('enhancements.js', 'client-key.js'):
    if elements.scripts.count(script) != 1:
        raise SystemExit(f'Build refused: expected exactly one {script} script tag.')
missing_ids = [name for name in required if name not in elements.ids]
if missing_ids:
    raise SystemExit(f'Build refused: missing required element IDs: {", ".join(missing_ids)}.')
credential_patterns = [r'\bpk\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b', r'\bsk_(?:live|test)_[A-Za-z0-9]{12,}\b', r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----']
for name, content in assets.items():
    if any(re.search(pattern, content) for pattern in credential_patterns):
        raise SystemExit(f'Build refused: possible credential in generated asset {name}.')
try:
    OUTPUT.mkdir(exist_ok=False)
except OSError as exc:
    parser.error(f'Build refused: cannot create fresh output directory {OUTPUT}: {exc}')
for name, content in assets.items():
    OUTPUT.joinpath(name).write_bytes(content.encode('utf-8'))
print('Build passed: no API keys are read or injected; the visitor supplies a public Mapbox token in browser storage.')
