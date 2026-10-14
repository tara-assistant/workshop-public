// Shared app-row renderer for the public portfolio and the private hub.
// It never touches the DOM at import time, so the public builder imports it for
// server-side rendering and a browser imports the same bytes to render a catalog.
// Every value is length-bounded and escaped; the live link must be a same-site route
// and the optional source link must point into the public workshop repository.

export const MAX_CARDS = 24;
const limits = { title: 80, description: 280, status: 24, category: 60, icon: 4, privacy: 280 };
const routePattern = /^\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/;
const repoPattern = /^https:\/\/github\.com\/tara-assistant\/workshop-public\/tree\/main\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
const knownKeys = new Set([...Object.keys(limits), 'href', 'repo']);

export const escapeHtml = value => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function safeHref(href) {
  if (typeof href !== 'string' || !routePattern.test(href)) throw new TypeError('An app card link must be a same-site route such as /name/.');
  return href;
}

export function safeRepo(repo) {
  if (typeof repo !== 'string' || repo.length > 200 || !repoPattern.test(repo)) throw new TypeError('An app source link must point into the public workshop repository.');
  return repo;
}

function field(item, key, required) {
  const value = item[key];
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > limits[key] || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new TypeError(`App card field "${key}" is missing, empty, too long, or contains control characters.`);
  }
  return escapeHtml(value);
}

export function cardHtml(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !knownKeys.has(key))) {
    throw new TypeError('An app card must be an object with known fields only.');
  }
  const title = field(item, 'title', true);
  const href = escapeHtml(safeHref(item.href));
  const repo = item.repo === undefined ? '' : escapeHtml(safeRepo(item.repo));
  const category = field(item, 'category', false);
  const privacy = field(item, 'privacy', false);
  return [
    '<article class="project-card">',
    `  <span class="project-icon" aria-hidden="true">${field(item, 'icon', false) || '◈'}</span>`,
    '  <div class="project-body">',
    `    <div class="project-meta"><h3>${title}</h3><span class="project-status">${field(item, 'status', true)}</span>${category ? `<span class="project-category">${category}</span>` : ''}</div>`,
    `    <p class="project-desc">${field(item, 'description', true)}</p>`,
    privacy ? `    <p class="privacy"><strong>Privacy:</strong> ${privacy}</p>` : '',
    '  </div>',
    '  <div class="project-actions">',
    `    <a class="btn-live" aria-label="Open ${title} live" href="${href}" target="_blank" rel="noopener noreferrer">Live <span aria-hidden="true">↗</span></a>`,
    repo ? `    <a class="btn-repo" aria-label="${title} source code on GitHub" href="${repo}" target="_blank" rel="noopener noreferrer">Repo</a>` : '',
    '  </div>',
    '</article>'
  ].filter(Boolean).join('\n');
}

export function cardsHtml(items) {
  if (!Array.isArray(items) || !items.length || items.length > MAX_CARDS) throw new TypeError(`An app catalog needs 1 to ${MAX_CARDS} cards.`);
  return items.map(cardHtml).join('\n');
}

// All or nothing: one invalid card renders no cards, so a tampered catalog never half-renders.
export function renderCards(container, items) {
  const markup = cardsHtml(items);
  container.innerHTML = markup;
  return items.length;
}
