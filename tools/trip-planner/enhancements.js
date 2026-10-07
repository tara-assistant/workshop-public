'use strict';
// Shared UI and map use one saved plan model. No user text becomes HTML.
const demoSource = 'https://karakijihad.github.io/sardegna/';
const sardegnaSample = {
  id: 'sardegna-showcase', title: 'Sardegna: coastal discovery', region: 'Sardegna, Italy',
  category: 'Archived trip sample', desc: 'Three selected days from your June 2026 guide, not the complete trip. Historical notes and suggested visit times must be rechecked before travel.',
  duration: '3 selected days', center: [9.66, 40.1], zoom: 9, source: demoSource,
  phases: [{id: 1, title: 'Ogliastra'}, {id: 2, title: 'Transfer north'}],
  days: [{id: 1, phase: 1, title: 'Arrival and sunset', mode: 'driving', tips: 'Keep arrival evening flexible.', packing: ['Hotel check-in details', 'Comfortable shoes']},
    {id: 2, phase: 1, title: 'Coastal hike', mode: 'walking', tips: 'Short introductory section only. The full Selvaggio Blu is a technical expedition, not a casual walk. Check access and trail conditions.', packing: ['Water and sun protection', 'Proper hiking shoes', 'Check trail access']},
    {id: 3, phase: 2, title: 'Transfer to Budoni', mode: 'driving', tips: 'Allow time for check-out, parking, and a lunch break.', packing: ['Check-out complete', 'Fuel and parking plan']}],
  stops: [
    {id:'s1', day:1, name:'Hotel Orri', type:'sight', time:'16:00', lng:9.6663, lat:39.9252, dwell:30, why:'A base for exploring the east coast.', tips:'Drop bags and check arrival arrangements.', links:[{label:'Hotel website', url:'https://www.hotelorri.it/'}]},
    {id:'s2', day:1, name:'Rocce Rosse, Arbatax', type:'gem', time:'17:00', lng:9.7095, lat:39.9392, dwell:45, why:'Red coastal rocks in warm evening light.', tips:'Wear suitable shoes; avoid exposed edges.'},
    {id:'s3', day:1, name:'Santa Maria Navarrese', type:'dining', time:'18:30', lng:9.6862, lat:39.9883, dwell:60, why:'Harbor village and a relaxed evening stop.', tips:'Optional if you are tired after arrival.', food:'Ask for local culurgiones.'},
    {id:'s4', day:2, name:'Pedra Longa', type:'gem', time:'08:00', lng:9.7071, lat:40.0277, dwell:60, why:'Dramatic limestone sea stack and coastal views.', tips:'Start early; check weather and access.'},
    {id:'s5', day:2, name:'Coastal trail departure', type:'hike', time:'09:30', lng:9.7054, lat:40.0281, dwell:120, why:'An introductory coastal walk, subject to local advice.', tips:'Turn back before technical terrain. No complete hiking route is verified here.', links:[{label:'Trail reference', url:'https://www.komoot.com/highlight/280266'}]},
    {id:'s6', day:3, name:'Gairo Vecchio', type:'gem', time:'07:30', lng:9.4989, lat:39.8481, dwell:60, why:'Historic abandoned village on the transfer day.', tips:'Check safe public access to ruins.'},
    {id:'s7', day:3, name:'Castello della Fava, Posada', type:'sight', time:'10:30', lng:9.7239, lat:40.6381, dwell:60, why:'Hilltop castle and village views.', tips:'Check current opening hours and entry price.'},
    {id:'s8', day:3, name:'Budoni arrival', type:'sight', time:'14:00', lng:9.691, lat:40.7396, dwell:30, why:'The next base on your original itinerary.', tips:'Confirm accommodation separately.'}
  ]
};
if (!Array.isArray(plans) || !plans.length) plans = structuredClone(PRESET_PLANS);
if (!plans.some(p => p.id === sardegnaSample.id)) plans.push(sardegnaSample);
for (const p of plans) {
  p.days ||= [{id:1, phase:1, title:'Day trip', mode: p.category === 'Mountain Hike' ? 'walking' : 'walking', packing:['Water', 'Comfortable shoes']}];
  p.phases ||= [{id:1, title:p.region}];
  p.stops.forEach(s => { s.day ||= 1; s.dwell ||= 45; });
}
activePlan = plans.find(p => p.id === activePlan?.id) || plans[0];
let activeDay = 1, activePhase = 'all', travelMode = 'walking', gpsWatch = null, gpsMarker = null;
let gpsPosition = null, routeController = null, routeVersion = 0, routeData = null;
const routeCache = new Map();
const node = (tag, text, className) => { const el = document.createElement(tag); if (text != null) el.textContent = text; if(className) el.className = className; return el; };
const byId = id => document.getElementById(id);
const safeURL = value => { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : null; } catch { return null; } };
const dayInfo = () => activePlan.days.find(d => d.id === activeDay) || activePlan.days[0];
const dayStops = () => activePlan.stops.filter(s => s.day === activeDay);
const shownStops = () => dayStops().filter(s => activeFilter === 'all' || s.type === activeFilter);
function showStatus(text) { if(byId('routeStatus')) byId('routeStatus').textContent = text; }
function persist() { savePlans(); }
function refreshProgress() {
  const stops = dayStops(), done = stops.filter(s => s.visited).length;
  byId('progressBarFill').style.width = (stops.length ? done / stops.length * 100 : 0) + '%';
  byId('progressLabel').textContent = `${done} of ${stops.length} stops visited`;
  byId('handleTitle').textContent = activePlan.title;
  byId('handleMeta').textContent = `Day ${activeDay} · ${done}/${stops.length} visited`;
  byId('mapSheetPeekText').textContent = `Day ${activeDay} · ${stops.length} stops`;
  document.querySelectorAll('.mapbox-custom-pin').forEach(pin => { const stop = activePlan.stops.find(s=>s.id===pin.dataset.id); pin.classList.toggle('visited', !!stop?.visited); });
}
function toggleVisited(stop) { stop.visited = !stop.visited; persist(); renderStopsFeed(); refreshProgress(); }
function fitDay() {
  if (!map || !dayStops().length) return;
  const coords = dayStops().map(s=>[s.lng,s.lat]);
  const bounds = coords.reduce((b,c)=>b.extend(c),new mapboxgl.LngLatBounds(coords[0],coords[0]));
  const mobile = innerWidth <= 768;
  const covered = mobile ? byId('itineraryPanel').getBoundingClientRect().height : 0;
  const padding = {top:90,right:70,left:35,bottom:Math.min(covered+25,innerHeight*0.55)};
  map.fitBounds(bounds,{padding,maxZoom:15,duration:300});
}
renderPlanUI = function() {
  if(!activePlan.days.some(d=>d.id===activeDay)) activeDay=activePlan.days[0].id;
  travelMode = dayInfo().mode || 'walking';
  byId('planBadge').textContent=activePlan.category;
  byId('planRegion').textContent=activePlan.region;
  byId('planHeading').textContent=activePlan.title;
  byId('planSummary').textContent=activePlan.desc;
  byId('statStops').textContent=dayStops().length;
  byId('statDist').textContent='Routing…';
  byId('statDuration').textContent=activePlan.duration || 'Flexible';
  byId('timelineHeaderTitle').textContent=`DAY ${activeDay} · ${dayInfo().title}`;
  byId('timelineCount').textContent=dayStops().length+' stops';
  byId('transportMode').value=travelMode;
  const phases=byId('phaseTabs'); phases.replaceChildren();
  const all=node('button','All bases','day-tab'+(activePhase==='all'?' active':''));
  all.onclick=()=>{activePhase='all';renderPlanUI();};phases.append(all);
  activePlan.phases.forEach(p=>{const b=node('button',p.title,'day-tab'+(activePhase===p.id?' active':'')); b.onclick=()=>{activePhase=p.id;activeDay=activePlan.days.find(d=>d.phase===p.id)?.id || activeDay;renderPlanUI();};phases.append(b);});
  const tabs=byId('dayTabsCarousel'); tabs.replaceChildren();
  activePlan.days.filter(d=>activePhase==='all'||d.phase===activePhase).forEach(d=>{const b=node('button',`Day ${d.id}: ${d.title}`,'day-tab'+(d.id===activeDay?' active':''));b.onclick=()=>{activeDay=d.id;selectedStop=null;renderPlanUI();};tabs.append(b);});
  const packing=byId('packingList');packing.replaceChildren(node('strong','Before you go'));
  packing.append(node('p',dayInfo().tips || 'Opening hours, weather, and visit times need checking before departure.','stop-tips'));
  dayInfo().packed ||= {};
  (dayInfo().packing||[]).forEach((text,index)=>{const label=node('label',null,'packing-item');const box=node('input');box.type='checkbox';box.checked=!!dayInfo().packed[index];box.onchange=()=>{dayInfo().packed[index]=box.checked;persist();};label.append(box,node('span',text));packing.append(label);});
  renderStopsFeed();refreshProgress();renderMapMarkers();fitDay();requestDayRoute();
};
renderStopsFeed = function() {
  const feed=byId('stopsFeed');feed.replaceChildren();
  if(!shownStops().length) feed.append(node('p','No stops in this view. Try All or add a stop.','stop-tips'));
  shownStops().forEach(stop=>{
    const index=dayStops().indexOf(stop);
    if(index>0){const connector=node('div',null,'journey-connector'); connector.dataset.leg=index-1;
      connector.append(node('span',`Leg ${index}: route pending`));feed.append(connector);}
    const card=node('article',null,'stop-card'+(stop.visited?' is-visited':'')+(selectedStop?.id===stop.id?' active':''));card.dataset.id=stop.id;
    const body=node('div',null,'stop-card-body');const title=node('div',null,'stop-title-line');
    const check=node('button','✓','stop-check-btn');check.setAttribute('aria-label',`Mark ${stop.name} visited`);check.setAttribute('aria-pressed',!!stop.visited);check.onclick=()=>toggleVisited(stop);
    title.append(check,node('strong',`${index+1}. ${stop.name}`,'stop-name'));body.append(title);
    body.append(node('span',`${stop.time || 'Flexible'} · Suggested stay ${stop.dwell} min`,'stop-time'));
    body.append(node('p',stop.why || stop.tips || 'Your own saved stop.','stop-why-box'));
    if(stop.tips)body.append(node('p',stop.tips,'stop-tips-box'));
    if(stop.food)body.append(node('p','Local food: '+stop.food,'stop-food-box'));
    const actions=node('div',null,'stop-links-row');
    const focus=node('button','Show on map','stop-pill-link');focus.onclick=()=>selectStop(stop);actions.append(focus);
    const navigate=node('button','From my location','stop-pill-link');navigate.onclick=()=>navigateTo(stop);actions.append(navigate);
    const external=node('a','Maps directions','stop-pill-link');external.href=`https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}&travelmode=${travelMode==='driving-traffic'?'driving':travelMode==='cycling'?'bicycling':travelMode==='transit'?'transit':travelMode}`;external.target='_blank';external.rel='noopener noreferrer';actions.append(external);
    (stop.links||[]).forEach(link=>{const url=safeURL(link.url);if(url){const a=node('a',link.label || 'Source','stop-pill-link');a.href=url;a.target='_blank';a.rel='noopener noreferrer';actions.append(a);}});
    if(activePlan.source){const a=node('a','Original trip notes','stop-pill-link');a.href=activePlan.source;a.target='_blank';a.rel='noopener noreferrer';actions.append(a);}
    body.append(actions);card.append(body);feed.append(card);
  });
  updateLegLabels();
};
function updateLegLabels() {
  document.querySelectorAll('[data-leg]').forEach(el=>{const leg=routeData?.legs[Number(el.dataset.leg)];el.textContent=leg ? `${Math.ceil(leg.duration/60)} min · ${(leg.distance/1000).toFixed(1)} km · ${travelMode}` : (travelMode==='transit'?'Transit times not connected. Use Maps directions.':'Travel time unavailable until route loads.');});
}
renderMapMarkers = function() {
  currentMarkers.forEach(m=>m.remove());currentMarkers=[];
  if(!map || !map.getSource('route'))return;
  shownStops().forEach(stop=>{
    const pin=node('button',String(dayStops().indexOf(stop)+1),'mapbox-custom-pin pin-'+stop.type+(stop.visited?' visited':''));pin.dataset.id=stop.id;pin.setAttribute('aria-label',stop.name);
    pin.onclick=()=>{selectStop(stop);const box=node('div',null,'pin-detail');box.append(node('strong',stop.name));
      const done=node('button',stop.visited?'Mark not visited':'Mark visited');done.onclick=()=>{toggleVisited(stop);popup.remove();};
      const nav=node('button','Navigate here');nav.onclick=()=>{navigateTo(stop);popup.remove();};box.append(done,nav);
      const popup=new mapboxgl.Popup({offset:24}).setLngLat([stop.lng,stop.lat]).setDOMContent(box).addTo(map);};
    currentMarkers.push(new mapboxgl.Marker({element:pin}).setLngLat([stop.lng,stop.lat]).addTo(map));
  });
};
selectStop = function(stop) {
  selectedStop=stop;
  document.querySelectorAll('.stop-card').forEach(card=>card.classList.toggle('active',card.dataset.id===stop.id));
  if(map){const mobile=innerWidth<=768;map.flyTo({center:[stop.lng,stop.lat],zoom:16,pitch:is3DPitch?60:0,offset:mobile?[0,-innerHeight*0.18]:[0,0],duration:500});}
};
setupMapLayers = function() {
  if(!map)return;
  if(map.getSource('composite')&&!map.getLayer('3d-buildings')){
    const label=map.getStyle().layers.find(l=>l.type==='symbol'&&l.layout?.['text-field'])?.id;
    map.addLayer({id:'3d-buildings',source:'composite','source-layer':'building',type:'fill-extrusion',minzoom:14,filter:['==','extrude','true'],paint:{'fill-extrusion-color':'#577477','fill-extrusion-height':['get','height'],'fill-extrusion-base':['get','min_height'],'fill-extrusion-opacity':0.65}},label);
  }
  if(!map.getSource('route'))map.addSource('route',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  if(!map.getLayer('route-line'))map.addLayer({id:'route-line',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#e07a5f','line-width':5}});
  if(routeData)map.getSource('route').setData({type:'Feature',properties:{},geometry:routeData.geometry});
  renderMapMarkers();
};
initMapbox = function() {
  try {
    if(!window.mapboxgl || !mapboxgl.supported())throw Error('Map unavailable on this device');
    mapboxgl.accessToken='__MAPBOX_TOKEN__';
    map=new mapboxgl.Map({container:'map',style:'mapbox://styles/mapbox/dark-v11',center:activePlan.center||[9.18,45.46],zoom:14,pitch:0,attributionControl:true});
    map.on('style.load',()=>{setupMapLayers();fitDay();});
    map.on('error',()=>{byId('mapMessage').textContent='Some map data could not load. Check connection or Mapbox access. Your list still works.';});
    map.on('load',()=>{byId('mapMessage').textContent='';});
  } catch { byId('mapMessage').textContent='Interactive map unavailable. Your saved itinerary and links still work.'; }
};
async function fetchRoute(coords,mode,signal) {
  const key=mode+'|'+coords.map(c=>c.join(',')).join(';');
  if(routeCache.has(key))return routeCache.get(key);
  const response=await fetch(`https://api.mapbox.com/directions/v5/mapbox/${mode}/${coords.map(c=>c.join(',')).join(';')}?geometries=geojson&overview=full&steps=true&access_token=${encodeURIComponent(mapboxgl.accessToken)}`,{signal});
  if(!response.ok)throw Error('Route unavailable');
  const data=await response.json();if(data.code!=='Ok'||!data.routes?.[0])throw Error('No route found');
  routeCache.set(key,data.routes[0]);return data.routes[0];
}
async function requestDayRoute() {
  const version=++routeVersion;routeController?.abort();routeController=new AbortController();routeData=null;
  map?.getSource('route')?.setData({type:'FeatureCollection',features:[]});
  const stops=dayStops();updateLegLabels();
  if(travelMode==='transit'){showStatus('Public transport is not supported by Mapbox. Use each stop’s Maps directions; no transit times are guessed.');byId('statDist').textContent='Not available';return;}
  if(stops.length<2){showStatus('Add a second stop to calculate a route.');byId('statDist').textContent='No route';return;}
  if(!map){showStatus('Routing unavailable without the map service.');return;}
  if(stops.length>25){showStatus('Route limit: split this day into fewer than 26 stops.');return;}
  showStatus('Calculating real travel times…');
  try{const route=await fetchRoute(stops.map(s=>[s.lng,s.lat]),travelMode,routeController.signal);
    if(version!==routeVersion)return;routeData=route;
    map.getSource('route')?.setData({type:'Feature',properties:{},geometry:route.geometry});
    byId('statDist').textContent=(route.distance/1000).toFixed(1)+' km';
    const visits=stops.reduce((sum,s)=>sum+s.dwell,0);showStatus(`Travel: ${Math.ceil(route.duration/60)} min. Suggested visits: ${visits} min. Hours, parking and breaks are not included.`);updateLegLabels();
  }catch(error){if(version!==routeVersion||error.name==='AbortError')return;showStatus('No verified route available. Use Maps directions or choose a different mode. No straight-line route is presented as navigable.');byId('statDist').textContent='Unavailable';updateLegLabels();}
}
function stopTracking() { if(gpsWatch!==null)navigator.geolocation.clearWatch(gpsWatch);gpsWatch=null;byId('locateBtn').textContent='📍';byId('locateBtn').setAttribute('aria-pressed','false');showStatus('Location tracking stopped.'); }
function trackLocation() {
  if(gpsWatch!==null){stopTracking();return;}
  if(!navigator.geolocation){showStatus('Location is not supported here.');return;}
  showStatus('Requesting location permission. Tap Location again to stop.');
  gpsWatch=navigator.geolocation.watchPosition(position=>{
    gpsPosition=[position.coords.longitude,position.coords.latitude];
    if(map){if(!gpsMarker)gpsMarker=new mapboxgl.Marker({color:'#3b82f6'}).setLngLat(gpsPosition).addTo(map);else gpsMarker.setLngLat(gpsPosition);map.easeTo({center:gpsPosition,duration:500});}
    byId('locateBtn').textContent='■';byId('locateBtn').setAttribute('aria-pressed','true');showStatus(`Location on, accuracy about ${Math.round(position.coords.accuracy)} m. Tap Location to stop.`);
  },()=>{stopTracking();showStatus('Location unavailable or permission denied. You can still use saved stops and Maps links.');},{enableHighAccuracy:true,timeout:15000,maximumAge:5000});
}
async function navigateTo(stop) {
  if(!gpsPosition){showStatus('Turn on Location first, then choose From my location. Your position is shared with Mapbox only when you request directions.');return;}
  if(travelMode==='transit'){showStatus('Use the Maps directions link for public transport.');return;}
  try{const route=await fetchRoute([gpsPosition,[stop.lng,stop.lat]],travelMode);map?.getSource('route')?.setData({type:'Feature',properties:{},geometry:route.geometry});
    const steps=byId('navigationSteps');steps.replaceChildren(node('strong',`To ${stop.name}: ${Math.ceil(route.duration/60)} min`));route.legs.flatMap(l=>l.steps||[]).forEach(s=>steps.append(node('li',s.maneuver.instruction)));
    showStatus('Directions shown from your last location. Not a background turn-by-turn navigation service.');
  }catch{showStatus('Directions unavailable. Try the Maps directions link.');}
}
document.addEventListener('DOMContentLoaded',()=>{
  byId('transportMode').onchange=e=>{travelMode=e.target.value;dayInfo().mode=travelMode;persist();renderStopsFeed();requestDayRoute();};
  byId('locateBtn').onclick=trackLocation;document.addEventListener('visibilitychange',()=>{if(document.hidden&&gpsWatch!==null)stopTracking();});window.addEventListener('pagehide',()=>{if(gpsWatch!==null)stopTracking();});
  byId('resetCheckboxesBtn').onclick=()=>{if(confirm('Clear visited stops for this day only?')){dayStops().forEach(s=>s.visited=false);persist();renderStopsFeed();refreshProgress();}};
  byId('fitRouteBtn').addEventListener('click',fitDay);
  byId('tripSelect').addEventListener('change',()=>{activePhase='all';activeDay=activePlan.days[0].id;renderPlanUI();});
  document.querySelectorAll('#filterChips button').forEach(b=>b.addEventListener('click',refreshProgress));
  byId('addStopForm').addEventListener('submit',e=>{
    e.preventDefault();e.stopImmediatePropagation();
    const lat=Number(byId('inputStopLat').value),lng=Number(byId('inputStopLng').value);
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>85||Math.abs(lng)>180){showStatus('Enter valid coordinates: latitude within 85 degrees and longitude within 180.');return;}
    const stop={id:'stop-'+crypto.randomUUID(),name:byId('inputStopName').value.trim(),type:byId('inputStopType').value,time:byId('inputStopTime').value,day:activeDay,lat,lng,dwell:45,why:byId('inputStopWhy').value,tips:byId('inputStopTips').value,food:byId('inputStopFood').value};
    activePlan.stops.push(stop);persist();renderPlanUI();byId('addStopModal').classList.remove('open');e.target.reset();
  },true);
  byId('newPlanForm').addEventListener('submit',()=>{activePlan.days=[{id:1,phase:1,title:'Your day',mode:'walking',packing:[]}];activePlan.phases=[{id:1,title:activePlan.region}];activeDay=1;activePhase='all';persist();renderPlanUI();});
  byId('resetDefaultsBtn').addEventListener('click',()=>{if(!activePlan.days){plans.forEach(p=>{p.days=[{id:1,phase:1,title:'Day trip',mode:'walking',packing:[]}];p.phases=[{id:1,title:p.region}];p.stops.forEach(s=>{s.day=1;s.dwell=45;});});activeDay=1;activePhase='all';renderPlanUI();}});
  byId('beamToTaraBtn').textContent='Export trip JSON';
  byId('beamToTaraBtn').addEventListener('click',e=>{e.stopImmediatePropagation();const url=URL.createObjectURL(new Blob([JSON.stringify(activePlan,null,2)],{type:'application/json'}));const a=node('a');a.href=url;a.download='trip.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},true);
  const hints={styleDarkBtn:'Street map: streets and buildings',styleSatBtn:'Satellite: aerial imagery with labels',styleOutdoorsBtn:'Trails: outdoor and contour map',pitchToggleBtn:'3D: toggle camera tilt',fitRouteBtn:'Fit: show all stops for this day',locateBtn:'Location: tap to start or stop GPS'};
  Object.entries(hints).forEach(([id,hint])=>{const b=byId(id);b.setAttribute('aria-label',hint);b.dataset.hint=hint;b.addEventListener('click',()=>{byId('controlHint').textContent=hint;});});
  updateTripDropdown();renderPlanUI();
});
