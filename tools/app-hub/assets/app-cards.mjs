// Shared app-card renderer for the public portfolio and the private hub.
// It never touches the DOM at import time, so the public builder imports it for
// server-side rendering and a browser imports the same bytes to render a catalog.
// Every value is length-bounded and escaped; links must be same-site routes.

export const MAX_CARDS = 24;
const limits = { title: 80, description: 280, status: 24, category: 60, icon: 4, privacy: 280 };
const routePattern = /^\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/;
const knownKeys = new Set([...Object.keys(limits), 'href']);

export const escapeHtml = value => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function safeHref(href) {
  if (typeof href !== 'string' || !routePattern.test(href)) throw new TypeError('An app card link must be a same-site route such as /name/.');
  return href;
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
  const category = field(item, 'category', false);
  const privacy = field(item, 'privacy', false);
  return [
    '<article class="project-card">',
    `  <div class="project-top"><span class="project-icon" aria-hidden="true">${field(item, 'icon', false) || '◈'}</span><span class="project-status">${field(item, 'status', true)}</span></div>`,
    `  <h3>${title}</h3>${category ? `<span class="project-category">${category}</span>` : ''}`,
    `  <p class="project-desc">${field(item, 'description', true)}</p>`,
    privacy ? `  <div class="privacy"><strong>Privacy:</strong> ${privacy}</div>` : '',
    `  <a class="project-link" aria-label="Open project: ${title}" href="${href}">Open project <span aria-hidden="true">↗</span></a>`,
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
