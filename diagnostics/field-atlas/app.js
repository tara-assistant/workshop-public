'use strict';
let map = null;
const tg = window.Telegram?.WebApp;
const inTelegram = !!tg?.initData;
if (inTelegram) {
  tg.ready(); tg.expand();
  if (tg.isVersionAtLeast('6.1')) { tg.setHeaderColor('#f7f4eb'); tg.setBackgroundColor('#f7f4eb'); }
  if (tg.isVersionAtLeast('8.0')) tg.disableVerticalSwipes();
  tg.onEvent('viewportChanged', () => map?.resize());
}
const haptic = () => { if (inTelegram && tg?.isVersionAtLeast('6.1')) tg.HapticFeedback.impactOccurred('light'); };
const dateForSatellite = new Date();
dateForSatellite.setUTCDate(dateForSatellite.getUTCDate() - 3);
const nasaImageDate = dateForSatellite.toISOString().slice(0,10);
const satelliteDateLabel = document.querySelector('#satelliteDate');
if (satelliteDateLabel) satelliteDateLabel.textContent = nasaImageDate;
const assets = [
  {id:'torino',name:'Torino',lat:45.0703,lng:7.6667,status:'normal',type:'Demo trackside vibration sensor',rms:'1.24',peak:'0.78',temp:'34',amp:25},
  {id:'milano',name:'Milano',lat:45.4854,lng:9.2045,status:'warning',type:'Demo depot bearing test stand',rms:'3.88',peak:'2.14',temp:'61',amp:67},
  {id:'bologna',name:'Bologna',lat:44.5058,lng:11.343,status:'normal',type:'Demo junction monitoring station',rms:'1.45',peak:'0.92',temp:'37',amp:29},
  {id:'firenze',name:'Firenze',lat:43.7766,lng:11.277,status:'normal',type:'Demo tunnel ventilation motor',rms:'1.68',peak:'1.05',temp:'39',amp:34},
  {id:'roma',name:'Roma',lat:41.9014,lng:12.5008,status:'warning',type:'Demo switch actuator test rig',rms:'3.42',peak:'1.89',temp:'56',amp:59},
  {id:'napoli',name:'Napoli',lat:40.8522,lng:14.2722,status:'normal',type:'Demo terminal pump monitor',rms:'1.31',peak:'0.84',temp:'33',amp:26}
];
let filter = 'all';
let selected = assets[1];
let basemap = 'osm';
let terrainEnabled = false;
const inspected = new Set();
try { JSON.parse(localStorage.getItem('field-atlas-inspected') || '[]').forEach(id => inspected.add(id)); } catch {}
const notice = document.querySelector('#mapNotice');
const features = list => ({type:'FeatureCollection',features:list.map(asset => ({type:'Feature',id:asset.id,geometry:{type:'Point',coordinates:[asset.lng,asset.lat]},properties:{id:asset.id,name:asset.name,status:asset.status}}))});
function visibleAssets() { return assets.filter(asset => filter === 'all' || asset.status === filter); }
function fit() { if (map?.isStyleLoaded()) map.fitBounds([[6.4,40.5],[14.8,46.0]],{padding:36,duration:0}); }
function select(asset, move = true) {
  const previous = selected;
  selected = asset;
  document.querySelector('#name').textContent = asset.name;
  document.querySelector('#description').textContent = asset.type;
  const status = document.querySelector('#status');
  status.className = 'status' + (asset.status === 'warning' ? ' warning' : '');
  status.textContent = asset.status === 'warning' ? 'Synthetic alert · demo only' : 'Synthetic healthy sample';
  ['rms','peak','temp'].forEach(key => document.querySelector('#'+key).textContent = asset[key]);
  let path = '';
  for (let i=0;i<=100;i++) {
    const baseline = 5 + Math.abs(Math.sin(i * 2.4)) * 4;
    const peak = asset.amp * Math.exp(-1 * ((i-28)/2.2)**2) + asset.amp * .6 * Math.exp(-1 * ((i-57)/3)**2) + asset.amp * .3 * Math.exp(-1 * ((i-81)/2)**2);
    path += (i ? 'L' : 'M') + (i*3) + ',' + (78-baseline-peak);
  }
  document.querySelector('#spectrum').setAttribute('d',path);
  document.querySelector('#spectrum').setAttribute('stroke',asset.status === 'warning' ? '#a44c21' : '#286f51');
  const done = inspected.has(asset.id);
  document.querySelector('#inspect').textContent = done ? 'Inspected ✓ · undo' : 'Mark inspected on this device';
  document.querySelector('#inspection').textContent = done ? 'Marked inspected locally. This is only a demo checklist, not a maintenance clearance.' : asset.status === 'warning' ? 'Illustrative elevated reading. Compare the sample with neighbouring assets; no real fault diagnosis is implied.' : 'This synthetic sample has lower amplitude than the warning examples. No real health conclusion is implied.';
  document.querySelectorAll('.node').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.id === asset.id)));
  if (map?.isStyleLoaded() && map.getSource('asset-points')) {
    if (previous && previous.id !== asset.id) map.setFeatureState({source:'asset-points',id:previous.id},{selected:false});
    map.setFeatureState({source:'asset-points',id:asset.id},{selected:true});
  }
  if (move && map?.isStyleLoaded()) map.easeTo({center:[asset.lng,asset.lat],zoom:7.2,duration:350});
  haptic();
}
function renderNodes() {
  const container = document.querySelector('#nodes');
  container.replaceChildren();
  visibleAssets().forEach(asset => {
    const button = document.createElement('button'); button.className = 'node'; button.dataset.id = asset.id;
    button.setAttribute('aria-pressed',String(selected.id === asset.id));
    const name = document.createElement('b'); name.textContent = asset.name;
    const state = document.createElement('span'); state.textContent = inspected.has(asset.id) ? 'Inspected ✓' : asset.status === 'warning' ? 'Needs a look' : 'Healthy sample';
    button.append(name,state); button.onclick = () => select(asset);
    container.append(button);
  });
}
function updateMapAssets() {
  if (!map?.isStyleLoaded() || !map.getSource('asset-points')) return;
  const active = visibleAssets();
  map.getSource('asset-points').setData(features(active));
  map.getSource('corridor').setData({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'LineString',coordinates:active.map(a=>[a.lng,a.lat])},properties:{}}]});
}
function setupMap() {
  if (!window.maplibregl) { notice.style.display='block'; notice.textContent='Map library unavailable. You can still browse the synthetic asset readings below.'; return; }
  map = new maplibregl.Map({container:'map',center:[11.1,43.1],zoom:5.8,pitch:0,bearing:0,attributionControl:false,style:{version:8,sources:{
    osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,maxzoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'},
    satellite:{type:'raster',tiles:[`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${nasaImageDate}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`],tileSize:256,maxzoom:9,attribution:`Imagery: <a href="https://www.earthdata.nasa.gov/technology/global-imagery-browse-services-gibs">NASA GIBS · MODIS Terra Corrected Reflectance · ${nasaImageDate}</a>`},
    topo:{type:'raster',tiles:['https://a.tile.opentopomap.org/{z}/{x}/{y}.png','https://b.tile.opentopomap.org/{z}/{x}/{y}.png','https://c.tile.opentopomap.org/{z}/{x}/{y}.png'],tileSize:256,maxzoom:17,attribution:'© <a href="https://opentopomap.org/">OpenTopoMap</a> · © OpenStreetMap contributors'},
    elevation:{type:'raster-dem',tiles:['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],tileSize:256,maxzoom:15,encoding:'terrarium',attribution:'Elevation © <a href="https://registry.opendata.aws/terrain-tiles/">AWS Terrain Tiles</a>'},
    'asset-points':{type:'geojson',data:features(assets),promoteId:'id'},
    corridor:{type:'geojson',data:{type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'LineString',coordinates:assets.map(a=>[a.lng,a.lat])},properties:{}}]}}
  },layers:[
    {id:'osm-base',type:'raster',source:'osm',layout:{visibility:'visible'},paint:{'raster-opacity':1}},
    {id:'satellite-base',type:'raster',source:'satellite',layout:{visibility:'none'},paint:{'raster-opacity':1}},
    {id:'topo-base',type:'raster',source:'topo',layout:{visibility:'none'},paint:{'raster-opacity':1}},
    {id:'corridor-line',type:'line',source:'corridor',paint:{'line-color':'#286f51','line-width':2,'line-dasharray':[2,2],'line-opacity':.8}},
    {id:'asset-points',type:'circle',source:'asset-points',paint:{'circle-radius':['case',['boolean',['feature-state','selected'],false],9,7],'circle-color':['match',['get','status'],'warning','#a44c21','#286f51'],'circle-stroke-color':'#fffefa','circle-stroke-width':2}}
  ]}});
  map.addControl(new maplibregl.NavigationControl({showCompass:true}), 'bottom-right');
  map.addControl(new maplibregl.AttributionControl({compact:true}));
  map.on('load',()=>{fit();updateMapAssets();select(selected,false);renderNodes();});
  map.on('click','asset-points',event=>{const id=event.features?.[0]?.properties?.id;const asset=assets.find(item=>item.id===id);if(asset)select(asset);});
  map.on('mouseenter','asset-points',()=>map.getCanvas().style.cursor='pointer');
  map.on('mouseleave','asset-points',()=>map.getCanvas().style.cursor='');
  map.on('error',event=>{if(event?.error?.status>=400){notice.style.display='block';notice.textContent='A map provider did not load one or more tiles. Try another map layer; the demo readings remain available.';}});
  window.addEventListener('resize',()=>map?.resize());
}
function chooseBasemap(id) {
  if (!map?.isStyleLoaded()) { notice.style.display='block'; notice.textContent='The map is still loading. Try this layer again in a moment.'; return; }
  basemap = id;
  for (const [key,layer] of Object.entries({'osm':'osm-base','satellite':'satellite-base','topo':'topo-base'})) map.setLayoutProperty(layer,'visibility',key===id?'visible':'none');
  document.querySelectorAll('[data-basemap]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.basemap===id)));
  if (notice.textContent.startsWith('A map provider')) notice.style.display='none';
}
function toggleTerrain() {
  if (!map?.isStyleLoaded()) { notice.style.display='block'; notice.textContent='The map is still loading. Try 3D terrain again in a moment.'; return; }
  terrainEnabled=!terrainEnabled;
  if (terrainEnabled) {
    map.setTerrain({source:'elevation',exaggeration:1.25});
    map.easeTo({pitch:58,bearing:-15,duration:500});
  } else {
    map.setTerrain(null);
    map.easeTo({pitch:0,bearing:0,duration:500});
  }
  document.querySelector('#terrainToggle').setAttribute('aria-pressed',String(terrainEnabled));
  haptic();
}

renderNodes();
setupMap();
select(selected,false);
document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{
  filter=button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
  const next = filter !== 'all' && selected.status !== filter ? assets.find(asset => asset.status === filter) : selected;
  updateMapAssets(); select(next,false); renderNodes();
});
document.querySelectorAll('[data-basemap]').forEach(button=>button.onclick=()=>chooseBasemap(button.dataset.basemap));
document.querySelector('#terrainToggle').onclick=toggleTerrain;
document.querySelector('#inspect').onclick=()=>{if(inspected.has(selected.id)) inspected.delete(selected.id); else inspected.add(selected.id);try{localStorage.setItem('field-atlas-inspected',JSON.stringify([...inspected]));}catch{}renderNodes();select(selected,false);};
document.querySelector('#reset').onclick=()=>{fit();haptic();};
window.__demo={assets,select,filter:()=>filter,map,chooseBasemap,toggleTerrain};
