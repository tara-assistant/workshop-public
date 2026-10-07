'use strict';

const PRESET_PLANS = [
  {
    id: 'milan-highlights',
    title: 'Milano 1-Day Highlights',
    region: 'Milan, Italy',
    category: 'City Day Trip',
    desc: 'Gothic cathedral spires, grand Galleria, Brera arts district, and evening canal-side dining.',
    duration: 'Full Day (8 hrs)',
    dist: '6.2 km',
    center: [9.1885, 45.4665],
    zoom: 14,
    stops: [
      {
        id: 'm1',
        name: 'Duomo di Milano',
        type: 'sight',
        time: '09:00 AM',
        walkTime: 'Start',
        lng: 9.1900,
        lat: 45.4642,
        image: 'https://images.unsplash.com/photo-1513581166391-887a96ddeafd?auto=format&fit=crop&w=800&q=80',
        tips: 'Book rooftop elevator tickets ahead. Marvel at 3,400 statues and panoramic Alpine vistas.'
      },
      {
        id: 'm2',
        name: 'Galleria Vittorio Emanuele II',
        type: 'sight',
        time: '10:45 AM',
        walkTime: '🚶 4 min walk (250m)',
        lng: 9.1903,
        lat: 45.4658,
        image: 'https://images.unsplash.com/photo-1543429776-2782fc8e1acd?auto=format&fit=crop&w=800&q=80',
        tips: 'Grand 19th-century glass arcade. Stop at Camparino in Galleria for classic espresso.'
      },
      {
        id: 'm3',
        name: 'Pinacoteca di Brera & Arts Walk',
        type: 'cafe',
        time: '12:30 PM',
        walkTime: '🚶 10 min walk (750m)',
        lng: 9.1878,
        lat: 45.4719,
        image: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=800&q=80',
        tips: 'Cobblestone pedestrian alleys, courtyard botanic gardens, and artisan cafes.'
      },
      {
        id: 'm4',
        name: 'Castello Sforzesco & Sempione',
        type: 'sight',
        time: '03:00 PM',
        walkTime: '🚶 12 min walk (900m)',
        lng: 9.1793,
        lat: 45.4705,
        image: 'https://images.unsplash.com/photo-1520175480921-4edfa2983e0f?auto=format&fit=crop&w=800&q=80',
        tips: 'Renaissance fortress grounds and peaceful stroll through the grand tree-lined Parco Sempione.'
      },
      {
        id: 'm5',
        name: 'Navigli Canals Aperitivo',
        type: 'dining',
        time: '06:30 PM',
        walkTime: '🚶 24 min walk (2.1 km)',
        lng: 9.1764,
        lat: 45.4512,
        image: 'https://images.unsplash.com/photo-1579705745811-a32bef7856a3?auto=format&fit=crop&w=800&q=80',
        tips: 'Vibrant sunset canal atmosphere; order risotto al salto with a crisp Negroni Sbagliato.'
      }
    ]
  },
  {
    id: 'cinque-terre-trail',
    title: 'Cinque Terre Trail: Monterosso to Vernazza',
    region: 'Liguria, Italy',
    category: 'Mountain Hike',
    desc: 'Cliffside coastal trail overlooking the Mediterranean, terraced olive groves, and harbor villages.',
    duration: 'Half Day (3.5 hrs)',
    dist: '4.8 km',
    center: [9.6700, 44.1400],
    zoom: 13.5,
    stops: [
      {
        id: 'c1',
        name: 'Monterosso Old Town Trailhead',
        type: 'hike',
        time: '08:30 AM',
        walkTime: 'Trailhead',
        lng: 9.6548,
        lat: 44.1465,
        image: 'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=800&q=80',
        tips: 'Stone staircase departure from historic village. Early departure avoids midday sun.'
      },
      {
        id: 'c2',
        name: 'Punta Mesco Coastal Panorama',
        type: 'hike',
        time: '10:00 AM',
        walkTime: '🥾 55 min ascent (1.8 km)',
        lng: 9.6640,
        lat: 44.1410,
        image: 'https://images.unsplash.com/photo-1528728329032-2972f65dfb3f?auto=format&fit=crop&w=800&q=80',
        tips: 'Panoramic vista across the entire Cinque Terre gulf; dramatic rocky cliffs.'
      },
      {
        id: 'c3',
        name: 'Vernazza Harbor Descent',
        type: 'sight',
        time: '11:45 AM',
        walkTime: '🥾 45 min descent (1.6 km)',
        lng: 9.6830,
        lat: 44.1352,
        image: 'https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=800&q=80',
        tips: 'Postcard view descending above the colorful Doria castle and medieval harbor piazza.'
      },
      {
        id: 'c4',
        name: 'Marina Dining & Pesto Trofie',
        type: 'dining',
        time: '01:00 PM',
        walkTime: '🚶 3 min walk (120m)',
        lng: 9.6835,
        lat: 44.1348,
        image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80',
        tips: 'Traditional fresh handmade Ligurian trofie al pesto and crisp Cinque Terre DOC white wine.'
      }
    ]
  },
  {
    id: 'torino-heritage',
    title: 'Torino Heritage & Food Walk',
    region: 'Turin, Italy',
    category: 'Cultural Site',
    desc: 'Baroque royal palaces, monumental piazzas, cinematic towers, and historic chocolate cafes.',
    duration: 'Full Day (7 hrs)',
    dist: '5.1 km',
    center: [7.6860, 45.0700],
    zoom: 14,
    stops: [
      {
        id: 't1',
        name: 'Piazza San Carlo & Caffe Torino',
        type: 'cafe',
        time: '09:30 AM',
        walkTime: 'Start',
        lng: 7.6826,
        lat: 45.0678,
        image: 'https://images.unsplash.com/photo-1559925393-8be0ec4767c8?auto=format&fit=crop&w=800&q=80',
        tips: 'Taste historic Bicerin (layered hot espresso, melted bittersweet chocolate, and cold milk foam).'
      },
      {
        id: 't2',
        name: 'Palazzo Reale & Royal Gardens',
        type: 'sight',
        time: '11:00 AM',
        walkTime: '🚶 7 min walk (550m)',
        lng: 7.6865,
        lat: 45.0728,
        image: 'https://images.unsplash.com/photo-1582560475093-ba66accbc424?auto=format&fit=crop&w=800&q=80',
        tips: 'House of Savoy royal apartments, opulent gallery of mirrors, and historic armory.'
      },
      {
        id: 't3',
        name: 'Mole Antonelliana & Cinema Museum',
        type: 'sight',
        time: '02:30 PM',
        walkTime: '🚶 11 min walk (850m)',
        lng: 7.6931,
        lat: 45.0689,
        image: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=800&q=80',
        tips: 'Transparent elevator rides through the cavernous interior up to the 85m observation deck.'
      },
      {
        id: 't4',
        name: 'Quadrilatero Romano Trattoria',
        type: 'dining',
        time: '07:30 PM',
        walkTime: '🚶 14 min walk (1.1 km)',
        lng: 7.6800,
        lat: 45.0740,
        image: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80',
        tips: 'Piedmontese agnolotti del plin with roast gravy and Barolo braised beef.'
      }
    ]
  }
];

// Storage & State
const STORAGE_KEY = 'tesseract_trip_planner_v3';
let plans = [];
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  plans = saved ? JSON.parse(saved) : JSON.parse(JSON.stringify(PRESET_PLANS));
} catch (e) {
  plans = JSON.parse(JSON.stringify(PRESET_PLANS));
}

let activePlan = plans[0];
let activeFilter = 'all';
let selectedStop = null;
let map = null;
let currentMarkers = [];
let isSatellite = false;
let is3DPitch = false;

// Telegram WebApp SDK Integration
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  if (tg.setHeaderColor) tg.setHeaderColor('#121c27');
  if (tg.setBackgroundColor) tg.setBackgroundColor('#090e15');
}

function triggerHaptic(type = 'light') {
  if (tg?.HapticFeedback) {
    if (type === 'medium') tg.HapticFeedback.impactOccurred('medium');
    else if (type === 'notification') tg.HapticFeedback.notificationOccurred('success');
    else tg.HapticFeedback.impactOccurred('light');
  }
}

function savePlans() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  } catch (e) {
    console.error('Storage save error:', e);
  }
}

// Mapbox GL JS Initialization
function initMapbox() {
  mapboxgl.accessToken = '__MAPBOX_TOKEN__';

  map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: activePlan.center || [9.1885, 45.4665],
    zoom: activePlan.zoom || 14,
    pitch: 35,
    bearing: 10,
    attributionControl: false
  });

  map.on('error', (e) => {
    console.warn('Mapbox map error:', e);
  });

  map.on('load', () => {
    setupMapLayers();
  });

  map.on('style.load', () => {
    setupMapLayers();
  });
}

function setupMapLayers() {
  if (!map) return;
  try {
    const layers = map.getStyle().layers || [];
    const labelLayerId = layers.find(l => l.type === 'symbol' && l.layout && l.layout['text-field'])?.id;

    if (!map.getLayer('3d-buildings')) {
      map.addLayer(
        {
          id: '3d-buildings',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', 'extrude', 'true'],
          type: 'fill-extrusion',
          minzoom: 14,
          paint: {
            'fill-extrusion-color': '#16202c',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'min_height'],
            'fill-extrusion-opacity': 0.8
          }
        },
        labelLayerId
      );
    }

    if (!map.getSource('route')) {
      map.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } }
      });
    }

    if (!map.getLayer('route-line-casing')) {
      map.addLayer({
        id: 'route-line-casing',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#090e15',
          'line-width': 7,
          'line-opacity': 0.8
        }
      });
    }

    if (!map.getLayer('route-line')) {
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#e07a5f',
          'line-width': 4,
          'line-opacity': 0.95,
          'line-dasharray': [3, 2]
        }
      });
    }

    renderMapMarkers();
  } catch (err) {
    console.warn('Layer setup notice:', err);
  }
}


function renderPlanUI() {
  document.getElementById('planBadge').textContent = activePlan.category;
  document.getElementById('planRegion').textContent = activePlan.region;
  document.getElementById('planHeading').textContent = activePlan.title;
  document.getElementById('planSummary').textContent = activePlan.desc;
  document.getElementById('statStops').textContent = activePlan.stops.length;
  document.getElementById('statDist').textContent = activePlan.dist || `${(activePlan.stops.length * 1.2).toFixed(1)} km`;
  document.getElementById('statDuration').textContent = activePlan.duration || 'Flexible';

  renderStopsFeed();
  if (map && map.isStyleLoaded()) {
    renderMapMarkers();
  }
}

function renderStopsFeed() {
  const feed = document.getElementById('stopsFeed');
  feed.innerHTML = '';

  const filtered = activePlan.stops.filter(s => activeFilter === 'all' || s.type === activeFilter);

  if (filtered.length === 0) {
    feed.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-secondary); font-size: 13px;">No stops match this category filter.</div>';
    return;
  }

  filtered.forEach((stop, idx) => {
    // Add walking connector badge if not first stop
    if (idx > 0 && stop.walkTime && stop.walkTime !== 'Start') {
      const connector = document.createElement('div');
      connector.className = 'journey-connector';
      connector.innerHTML = `<span class="line"></span><span>${stop.walkTime}</span><span class="line"></span>`;
      feed.appendChild(connector);
    }

    const card = document.createElement('div');
    card.className = 'stop-card' + (selectedStop?.id === stop.id ? ' active' : '');
    card.dataset.id = stop.id;

    card.innerHTML = `
      <div class="stop-card-hero" style="background-image: url('${stop.image}');">
        <div class="hero-gradient"></div>
        <div class="stop-number">${idx + 1}</div>
        <div class="stop-type-pill">${(stop.type || 'sight').toUpperCase()}</div>
      </div>
      <div class="stop-card-body">
        <div class="stop-title-line">
          <span class="stop-name">${stop.name}</span>
          <span class="stop-time">${stop.time || ''}</span>
        </div>
        <p class="stop-tips">${stop.tips || ''}</p>
      </div>
    `;

    card.addEventListener('click', () => {
      triggerHaptic('light');
      selectStop(stop);
    });

    feed.appendChild(card);
  });
}

function renderMapMarkers() {
  currentMarkers.forEach(m => m.remove());
  currentMarkers = [];

  if (!map || !map.getSource('route')) return;

  const filtered = activePlan.stops.filter(s => activeFilter === 'all' || s.type === activeFilter);
  const coords = activePlan.stops.map(s => [s.lng, s.lat]);

  // Update route polyline
  map.getSource('route').setData({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords }
  });

  // Add custom Mapbox 3D pins
  filtered.forEach((stop, idx) => {
    const el = document.createElement('div');
    el.className = `mapbox-custom-pin pin-${stop.type || 'sight'}`;
    el.innerText = `${idx + 1}`;

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerHaptic('medium');
      selectStop(stop);
    });

    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat([stop.lng, stop.lat])
      .addTo(map);

    currentMarkers.push(marker);
  });

  if (coords.length > 0) {
    const bounds = coords.reduce((b, coord) => b.extend(coord), new mapboxgl.LngLatBounds(coords[0], coords[0]));
    map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 800 });
  }
}

function selectStop(stop) {
  selectedStop = stop;

  // Highlight card in feed and scroll into view smoothly
  document.querySelectorAll('.stop-card').forEach(c => {
    const isTarget = c.dataset.id === stop.id;
    c.classList.toggle('active', isTarget);
    if (isTarget && window.innerWidth <= 768) {
      c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });

  // Fly to stop with 3D camera angle
  if (map) {
    map.flyTo({
      center: [stop.lng, stop.lat],
      zoom: 16.5,
      pitch: is3DPitch ? 60 : 45,
      bearing: 15,
      duration: 1000
    });
  }
}

function updateTripDropdown() {
  const select = document.getElementById('tripSelect');
  select.innerHTML = '';
  plans.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.title} (${p.region})`;
    if (p.id === activePlan.id) opt.selected = true;
    select.appendChild(opt);
  });
}

// Event Bindings
document.addEventListener('DOMContentLoaded', () => {
  initMapbox();
  updateTripDropdown();
  renderPlanUI();

  // Trip selection dropdown
  const tripSelect = document.getElementById('tripSelect');
  if (tripSelect) {
    tripSelect.addEventListener('change', (e) => {
      triggerHaptic('light');
      const found = plans.find(p => p.id === e.target.value);
      if (found) {
        activePlan = found;
        selectedStop = null;
        renderPlanUI();
      }
    });
  }

  // App Switcher Dropdown Toggle
  const switcher = document.getElementById('appSwitcherOverlay');
  const appSwitcherBtn = document.getElementById('appSwitcherBtn');
  const closeSwitcherBtn = document.getElementById('closeSwitcherBtn');
  const openTripPlanner = document.getElementById('openTripPlanner');
  if (appSwitcherBtn && switcher) {
    appSwitcherBtn.addEventListener('click', () => {
      triggerHaptic('light');
      switcher.classList.add('open');
    });
  }
  if (closeSwitcherBtn && switcher) {
    closeSwitcherBtn.addEventListener('click', () => switcher.classList.remove('open'));
  }
  if (openTripPlanner && switcher) {
    openTripPlanner.addEventListener('click', () => switcher.classList.remove('open'));
  }

  // Category Filter Chips
  document.querySelectorAll('#filterChips .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      triggerHaptic('light');
      document.querySelectorAll('#filterChips .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.type;
      renderStopsFeed();
      renderMapMarkers();
    });
  });

  // Map Controls: Styles (Dark, Satellite, Outdoors)
  const styleDarkBtn = document.getElementById('styleDarkBtn');
  const styleSatBtn = document.getElementById('styleSatBtn');
  const styleOutdoorsBtn = document.getElementById('styleOutdoorsBtn');

  function setActiveStyleBtn(activeBtn) {
    [styleDarkBtn, styleSatBtn, styleOutdoorsBtn].forEach(b => {
      if (b) b.classList.remove('active');
    });
    if (activeBtn) activeBtn.classList.add('active');
  }

  if (styleDarkBtn) {
    styleDarkBtn.addEventListener('click', () => {
      triggerHaptic('light');
      setActiveStyleBtn(styleDarkBtn);
      if (map) map.setStyle('mapbox://styles/mapbox/dark-v11');
    });
  }
  if (styleSatBtn) {
    styleSatBtn.addEventListener('click', () => {
      triggerHaptic('light');
      setActiveStyleBtn(styleSatBtn);
      if (map) map.setStyle('mapbox://styles/mapbox/satellite-streets-v12');
    });
  }
  if (styleOutdoorsBtn) {
    styleOutdoorsBtn.addEventListener('click', () => {
      triggerHaptic('light');
      setActiveStyleBtn(styleOutdoorsBtn);
      if (map) map.setStyle('mapbox://styles/mapbox/outdoors-v12');
    });
  }

  // Map Controls: 3D Pitch Toggle
  const pitchToggleBtn = document.getElementById('pitchToggleBtn');
  if (pitchToggleBtn) {
    pitchToggleBtn.addEventListener('click', () => {
      triggerHaptic('light');
      is3DPitch = !is3DPitch;
      pitchToggleBtn.classList.toggle('active', is3DPitch);
      if (map) map.easeTo({ pitch: is3DPitch ? 60 : 0, duration: 600 });
    });
  }

  // Map Controls: Center / Fit Route
  const fitRouteBtn = document.getElementById('fitRouteBtn');
  if (fitRouteBtn) {
    fitRouteBtn.addEventListener('click', () => {
      triggerHaptic('light');
      renderMapMarkers();
    });
  }

  // Delete Entire Plan
  const deletePlanBtn = document.getElementById('deletePlanBtn');
  if (deletePlanBtn) {
    deletePlanBtn.addEventListener('click', () => {
      if (plans.length <= 1) {
        alert('You must keep at least one trip plan.');
        return;
      }
      if (confirm(`Delete plan "${activePlan.title}"?`)) {
        triggerHaptic('medium');
        plans = plans.filter(p => p.id !== activePlan.id);
        activePlan = plans[0];
        savePlans();
        updateTripDropdown();
        renderPlanUI();
      }
    });
  }

  // Reset to Defaults
  const resetDefaultsBtn = document.getElementById('resetDefaultsBtn');
  if (resetDefaultsBtn) {
    resetDefaultsBtn.addEventListener('click', () => {
      if (confirm('Reset default trip itineraries?')) {
        plans = JSON.parse(JSON.stringify(PRESET_PLANS));
        activePlan = plans[0];
        savePlans();
        updateTripDropdown();
        renderPlanUI();
      }
    });
  }

  // New Plan Modal
  const newPlanModal = document.getElementById('newPlanModal');
  const newPlanBtn = document.getElementById('newPlanBtn');
  const closeNewPlanBtn = document.getElementById('closeNewPlanBtn');
  const cancelPlanBtn = document.getElementById('cancelPlanBtn');
  const newPlanForm = document.getElementById('newPlanForm');

  if (newPlanBtn && newPlanModal) {
    newPlanBtn.addEventListener('click', () => {
      triggerHaptic('light');
      newPlanModal.classList.add('open');
    });
  }
  if (closeNewPlanBtn && newPlanModal) {
    closeNewPlanBtn.addEventListener('click', () => newPlanModal.classList.remove('open'));
  }
  if (cancelPlanBtn && newPlanModal) {
    cancelPlanBtn.addEventListener('click', () => newPlanModal.classList.remove('open'));
  }
  if (newPlanForm && newPlanModal) {
    newPlanForm.addEventListener('submit', (e) => {
      e.preventDefault();
      triggerHaptic('notification');
      const newPlan = {
        id: 'plan-' + Date.now(),
        title: document.getElementById('inputPlanTitle').value.trim(),
        region: document.getElementById('inputPlanRegion').value.trim(),
        category: document.getElementById('inputPlanCategory').value,
        desc: document.getElementById('inputPlanDesc').value.trim() || 'Custom travel itinerary.',
        duration: 'Flexible',
        dist: '0 km',
        stops: []
      };
      plans.unshift(newPlan);
      activePlan = newPlan;
      savePlans();
      updateTripDropdown();
      renderPlanUI();
      newPlanModal.classList.remove('open');
      e.target.reset();
    });
  }

  // Add Stop Modal
  const addStopModal = document.getElementById('addStopModal');
  const addStopBtn = document.getElementById('addStopBtn');
  const closeAddStopBtn = document.getElementById('closeAddStopBtn');
  const cancelStopBtn = document.getElementById('cancelStopBtn');
  const addStopForm = document.getElementById('addStopForm');

  if (addStopBtn && addStopModal) {
    addStopBtn.addEventListener('click', () => {
      triggerHaptic('light');
      addStopModal.classList.add('open');
    });
  }
  if (closeAddStopBtn && addStopModal) {
    closeAddStopBtn.addEventListener('click', () => addStopModal.classList.remove('open'));
  }
  if (cancelStopBtn && addStopModal) {
    cancelStopBtn.addEventListener('click', () => addStopModal.classList.remove('open'));
  }
  if (addStopForm && addStopModal) {
    addStopForm.addEventListener('submit', (e) => {
      e.preventDefault();
      triggerHaptic('notification');
      const newStop = {
        id: 'stop-' + Date.now(),
        name: document.getElementById('inputStopName').value.trim(),
        type: document.getElementById('inputStopType').value,
        time: document.getElementById('inputStopTime').value.trim(),
        walkTime: '🚶 Scheduled stop',
        lat: parseFloat(document.getElementById('inputStopLat').value),
        lng: parseFloat(document.getElementById('inputStopLng').value),
        image: document.getElementById('inputStopImage').value.trim() || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=800&q=80',
        tips: document.getElementById('inputStopDesc').value.trim() || 'Destination highlights and tips.'
      };
      activePlan.stops.push(newStop);
      savePlans();
      renderPlanUI();
      addStopModal.classList.remove('open');
      e.target.reset();
      selectStop(newStop);
    });
  }

  // Beam Plan to Tara
  const beamToTaraBtn = document.getElementById('beamToTaraBtn');
  if (beamToTaraBtn) {
    beamToTaraBtn.addEventListener('click', () => {
      triggerHaptic('notification');
      const payload = {
        event: 'trip_plan_selected',
        plan_id: activePlan.id,
        title: activePlan.title,
        region: activePlan.region,
        category: activePlan.category,
        stops_count: activePlan.stops.length,
        stops: activePlan.stops.map(s => ({ name: s.name, type: s.type, time: s.time }))
      };

      if (tg && tg.sendData) {
        tg.sendData(JSON.stringify(payload));
      } else {
        alert(`Plan beamed to Tara: "${activePlan.title}" with ${activePlan.stops.length} stops.`);
      }
    });
  }

  // Tri-State Bottom Sheet (Mobile)
  const sheet = document.getElementById('itineraryPanel');
  const handle = document.getElementById('sheetHandle');
  const stateToggleBtn = document.getElementById('sheetStateToggle');
  const mapPeekBtn = document.getElementById('mapSheetPeekBtn');
  let currentSheetState = 'half'; // 'peek', 'half', 'full'

  function setSheetState(state) {
    if (!sheet) return;
    currentSheetState = state;
    sheet.classList.remove('is-peek', 'is-half', 'is-full');
    sheet.classList.add('is-' + state);
    sheet.style.height = '';

    if (stateToggleBtn) {
      if (state === 'peek') stateToggleBtn.textContent = '⤢ Expand';
      else if (state === 'full') stateToggleBtn.textContent = '⤓ Half';
      else stateToggleBtn.textContent = '⤢ View List';
    }

    if (mapPeekBtn) {
      mapPeekBtn.style.display = (state === 'peek') ? 'inline-flex' : 'none';
    }

    setTimeout(() => {
      if (map) map.resize();
    }, 320);
  }

  // Toggle on button click
  if (stateToggleBtn) {
    stateToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerHaptic('light');
      if (currentSheetState === 'peek') setSheetState('half');
      else if (currentSheetState === 'half') setSheetState('full');
      else setSheetState('half');
    });
  }

  // Toggle on map peek button click
  if (mapPeekBtn) {
    mapPeekBtn.addEventListener('click', () => {
      triggerHaptic('light');
      setSheetState('half');
    });
  }

  // Tap & swipe gesture on drag handle only
  if (handle) {
    let startY = 0;
    let startTime = 0;

    handle.addEventListener('click', (e) => {
      if (e.target === stateToggleBtn || stateToggleBtn?.contains(e.target)) return;
      triggerHaptic('light');
      if (currentSheetState === 'peek') setSheetState('half');
      else if (currentSheetState === 'half') setSheetState('full');
      else setSheetState('half');
    });

    handle.addEventListener('touchstart', (e) => {
      startY = e.touches[0].clientY;
      startTime = Date.now();
    }, { passive: true });

    handle.addEventListener('touchend', (e) => {
      const endY = e.changedTouches[0].clientY;
      const deltaY = startY - endY;
      const deltaTime = Date.now() - startTime;

      if (Math.abs(deltaY) > 30) {
        triggerHaptic('light');
        if (deltaY > 0) {
          // Swiped UP
          if (currentSheetState === 'peek') setSheetState('half');
          else if (currentSheetState === 'half') setSheetState('full');
        } else {
          // Swiped DOWN
          if (currentSheetState === 'full') setSheetState('half');
          else if (currentSheetState === 'half') setSheetState('peek');
        }
      }
    }, { passive: true });
  }

  setSheetState('half');
});
