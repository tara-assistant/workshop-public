// MapLibre map. Keyless: OpenFreeMap vector tiles, OpenTopoMap and EOX Sentinel-2 rasters, AWS terrain.
import { h } from './util.js';
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

const RASTERS = {
  topo: {
    tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://b.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://c.tile.opentopomap.org/{z}/{x}/{y}.png'],
    tileSize: 256, maxzoom: 17,
    attribution: '© <a href="https://opentopomap.org/">OpenTopoMap</a> (CC-BY-SA), © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  },
  sat: {
    tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg'],
    tileSize: 256, maxzoom: 18,
    attribution: '<a href="https://s2maps.eu">Sentinel-2 cloudless</a> by EOX IT Services GmbH. Contains modified Copernicus Sentinel data 2021'
  }
};

const DEM = {
  type: 'raster-dem',
  tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  tileSize: 256, maxzoom: 15, encoding: 'terrarium',
  attribution: 'Elevation: <a href="https://registry.opendata.aws/terrain-tiles/">AWS Terrain Tiles</a>'
};

const EMPTY = { type: 'FeatureCollection', features: [] };

export class MapView {
  constructor(container, handlers = {}) {
    this.container = container;
    this.handlers = handlers;
    this.markers = new Map();
    this.items = [];
    this.lines = [];
    this.route = null;
    this.mode = 'map';
    this.is3D = false;
    this.loaded = false;
    this.selectedId = null;
    this.errorShown = false;
  }

  start() {
    if (!window.maplibregl) {
      this.handlers.onNotice?.('The map library did not load. Your itinerary still works.');
      return false;
    }
    const map = new maplibregl.Map({
      container: this.container, style: STYLE_URL, center: [9.2, 39.8], zoom: 6,
      attributionControl: false, maxPitch: 75, dragRotate: true
    });
    this.map = map;
    const reset = {
      onAdd: () => {
        const group = h('div', { class: 'maplibregl-ctrl maplibregl-ctrl-group' });
        const button = h('button', { type: 'button', 'aria-label': 'Reset map view', title: 'Reset map view', onClick: () => this.handlers.onReset?.() });
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '22');
        svg.setAttribute('height', '22');
        svg.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS(svg.namespaceURI, 'path');
        path.setAttribute('d', 'M4 10a8 8 0 1 1 1 7M4 4v6h6');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'currentColor');
        path.setAttribute('stroke-width', '2');
        svg.append(path); button.append(svg); group.append(button);
        return group;
      },
      onRemove: () => {}
    };
    map.addControl(reset, 'bottom-right');
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: false }));
    const attribution = this.container.querySelector('.maplibregl-ctrl-attrib');
    attribution.id = 'mapAttribution';
    attribution.hidden = true;
    const credits = h('button', { type: 'button', class: 'map-attribution', 'aria-label': 'Map attribution', 'aria-controls': 'mapAttribution', 'aria-expanded': false, text: 'ⓘ', onClick: () => {
      attribution.hidden = !attribution.hidden;
      credits.setAttribute('aria-expanded', String(!attribution.hidden));
    } });
    document.querySelector('.map-edge')?.prepend(credits);
    document.querySelector('.map-edge')?.append(attribution);
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    map.on('load', () => this._onLoad());
    map.on('error', (event) => {
      const status = event?.error?.status;
      if (status >= 400 && !this.errorShown) {
        this.errorShown = true;
        this.handlers.onNotice?.('Some map tiles did not load. Try another map layer. Your itinerary still works.');
      }
    });
    map.on('click', (event) => this.handlers.onMapClick?.(event.lngLat));
    this.resizeObserver = new ResizeObserver(() => map.resize());
    this.resizeObserver.observe(this.container);
    return true;
  }

  _onLoad() {
    const map = this.map;
    const layers = map.getStyle().layers;
    this.vectorIds = layers.filter((l) => l.type !== 'symbol').map((l) => l.id);
    this.symbolIds = layers.filter((l) => l.type === 'symbol').map((l) => l.id);
    const first = layers[0].id;
    for (const [id, cfg] of Object.entries(RASTERS)) {
      map.addSource('r-' + id, { type: 'raster', ...cfg });
      map.addLayer({ id: 'r-' + id, type: 'raster', source: 'r-' + id, layout: { visibility: 'none' } }, first);
    }
    map.addSource('dem', DEM);
    map.addSource('order', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'order-casing', type: 'line', source: 'order', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 0.8 } });
    map.addLayer({ id: 'order-line', type: 'line', source: 'order', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-dasharray': [2, 2] } });
    map.addSource('route', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.9 } });
    map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 4.5 } });
    map.addSource('track', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'track-casing', type: 'line', source: 'track', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 7 } });
    map.addLayer({ id: 'track-line', type: 'line', source: 'track', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#c2410c', 'line-width': 3.5 } });
    this.loaded = true;
    this.setLocation(this.location);
    this._applyMode();
    this._applyData();
    this.fit(false);
    this.handlers.onReady?.();
  }

  setMode(mode) {
    this.mode = mode;
    if (this.loaded) this._applyMode();
  }

  _applyMode() {
    const map = this.map;
    const vis = (id, on) => map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    const raster = this.mode === 'topo' ? 'r-topo' : this.mode === 'sat' ? 'r-sat' : null;
    vis('r-topo', raster === 'r-topo');
    vis('r-sat', raster === 'r-sat');
    this.vectorIds.forEach((id) => vis(id, !raster));
    this.symbolIds.forEach((id) => vis(id, this.mode !== 'topo'));
  }

  set3D(on) {
    this.is3D = on;
    if (!this.loaded) return;
    const map = this.map;
    map.setTerrain(on ? { source: 'dem', exaggeration: 1.3 } : null);
    map.easeTo({ pitch: on ? 62 : 0, bearing: on ? map.getBearing() : 0, duration: 700 });
  }

  setData({ items, lines }) {
    this.items = items;
    this.lines = lines;
    if (this.loaded) this._applyData();
  }

  _applyData() {
    const map = this.map;
    for (const marker of this.markers.values()) marker.remove();
    this.markers.clear();
    for (const item of this.items) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'pin' + (item.visited ? ' visited' : '') + (item.id === this.selectedId ? ' selected' : '');
      el.style.setProperty('--c', item.color);
      el.textContent = String(item.n);
      el.setAttribute('aria-label', `${item.n}. ${item.name}`);
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        this.handlers.onSelectStop?.(item.id);
      });
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([item.lon, item.lat]).addTo(map);
      this.markers.set(item.id, marker);
    }
    map.getSource('order').setData({
      type: 'FeatureCollection',
      features: this.lines.map((l) => ({ type: 'Feature', properties: { color: l.color }, geometry: { type: 'LineString', coordinates: l.coords } }))
    });
  }

  setRoutes(routes) {
    this.route = routes;
    if (!this.loaded) return;
    this.map.getSource('route').setData({
      type: 'FeatureCollection',
      features: (routes || []).map((r) => ({ type: 'Feature', properties: { color: r.color }, geometry: { type: 'LineString', coordinates: r.coords } }))
    });
  }

  setTracks(tracks) {
    this.tracks = tracks;
    if (!this.loaded) return;
    this.map.getSource('track').setData({
      type: 'FeatureCollection',
      features: (tracks || []).map((coords) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords.map((c) => [c[0], c[1]]) } }))
    });
  }

  markVisited(id, visited) {
    this.markers.get(id)?.getElement().classList.toggle('visited', !!visited);
    const item = this.items.find((i) => i.id === id);
    if (item) item.visited = !!visited;
  }

  select(id, { fly = true } = {}) {
    if (this.selectedId) this.markers.get(this.selectedId)?.getElement().classList.remove('selected');
    this.selectedId = id;
    const marker = this.markers.get(id);
    if (!marker) return;
    marker.getElement().classList.add('selected');
    if (fly && this.loaded) {
      const ll = marker.getLngLat();
      this.map.flyTo({ center: [ll.lng, ll.lat], zoom: Math.max(this.map.getZoom(), 13), duration: 700, essential: true });
    }
  }

  reset(ids) {
    this.set3D(false);
    if (!this.loaded) return;
    this.map.jumpTo({ bearing: 0, pitch: 0 });
    if (ids?.length && this.items.some((item) => ids.includes(item.id))) this.fitItems(ids);
    else this.fit();
  }

  fit(animate = true) {
    if (!this.loaded) return;
    const points = this.items.map((i) => [i.lon, i.lat]);
    for (const r of this.route || []) points.push(...r.coords);
    if (!points.length) return;
    const bounds = points.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(points[0], points[0]));
    const pad = Math.min(48, Math.floor(Math.min(this.container.clientWidth, this.container.clientHeight) / 6));
    this.map.fitBounds(bounds, { padding: pad, maxZoom: 14, duration: animate ? 700 : 0 });
  }

  fitItems(ids) {
    if (!this.loaded) return;
    const pts = this.items.filter((i) => ids.includes(i.id)).map((i) => [i.lon, i.lat]);
    if (!pts.length) return;
    const b = pts.reduce((bb, q) => bb.extend(q), new maplibregl.LngLatBounds(pts[0], pts[0]));
    this.map.fitBounds(b, { padding: 48, maxZoom: 14, duration: 700 });
  }

  flyTo(lon, lat, zoom = 14) {
    if (this.loaded) this.map.flyTo({ center: [lon, lat], zoom, duration: 700 });
  }

  resize() {
    this.map?.resize();
  }

  setLocation(coords) {
    this.location = coords;
    this.locationMarker?.remove();
    this.locationMarker = null;
    if (!coords || !this.loaded) return;
    // Keep the camera fixed so GPS coordinates never trigger location-based tile requests.
    this.locationMarker = new maplibregl.Marker({ element: h('div', { class: 'gps-dot', role: 'img', 'aria-label': 'Your location' }), anchor: 'center' }).setLngLat(coords).addTo(this.map);
  }
}
