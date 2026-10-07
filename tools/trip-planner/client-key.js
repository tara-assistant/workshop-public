'use strict';
const MAPBOX_TOKEN_STORAGE_KEY = 'trip-planner-mapbox-public-token';
const mapboxKeyById = id => document.getElementById(id);
function readUserMapboxToken() {
  try { return localStorage.getItem(MAPBOX_TOKEN_STORAGE_KEY) || ''; }
  catch { return ''; }
}
function setMapboxNotice(message) {
  const notice = mapboxKeyById('mapboxTokenNotice');
  if (notice) notice.hidden = false;
  const detail = mapboxKeyById('mapboxTokenMessage');
  if (detail && message) detail.textContent = message;
}
function initMapbox() {
  const token = readUserMapboxToken();
  if (!token) {
    if (map) { map.remove(); map = null; }
    setMapboxNotice('Add your own Mapbox public token to load the map and calculate routes.');
    return;
  }
  try {
    if (!window.mapboxgl || !mapboxgl.supported()) throw new Error('Map unavailable on this device');
    if (map) { map.remove(); map = null; }
    mapboxgl.accessToken = token;
    map = new mapboxgl.Map({container:'map',style:'mapbox://styles/mapbox/dark-v11',center:activePlan.center || [9.18,45.46],zoom:activePlan.zoom || 14,pitch:0,attributionControl:true});
    const notice = mapboxKeyById('mapboxTokenNotice');
    if (notice) notice.hidden = true;
    map.on('style.load',()=>{setupMapLayers();fitDay();});
    map.on('error',()=>{const message=mapboxKeyById('mapMessage');if(message)message.textContent='Map data could not load. Check your Mapbox token or connection. Your itinerary list remains available.';});
    map.on('load',()=>{const message=mapboxKeyById('mapMessage');if(message)message.textContent='';});
  } catch {
    setMapboxNotice('The interactive map is unavailable. Check your browser and Mapbox access. Your itinerary list remains available.');
  }
}
function closeMapboxModal() {
  const modal = mapboxKeyById('mapboxTokenModal');
  if (modal) modal.classList.remove('open');
}
document.addEventListener('DOMContentLoaded',()=>{
  const modal=mapboxKeyById('mapboxTokenModal');
  const input=mapboxKeyById('mapboxTokenInput');
  const open=()=>{if(!modal)return;mapboxKeyById('appSwitcherOverlay')?.classList.remove('open');modal.classList.add('open');input?.focus();};
  ['mapboxSettingsBtn','mapboxSettingsMenuBtn','configureMapboxBtn'].forEach(id=>mapboxKeyById(id)?.addEventListener('click',open));
  mapboxKeyById('closeMapboxTokenModal')?.addEventListener('click',closeMapboxModal);
  modal?.addEventListener('click',event=>{if(event.target===modal)closeMapboxModal();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMapboxModal();});
  mapboxKeyById('mapboxTokenForm')?.addEventListener('submit',event=>{
    event.preventDefault();
    const token=input?.value.trim() || '';
    const feedback=mapboxKeyById('mapboxTokenFeedback');
    if(!token.startsWith('pk.') || token.length < 16){if(feedback)feedback.textContent='Enter your own Mapbox public token, which begins with pk. Do not use a secret token.';return;}
    try { localStorage.setItem(MAPBOX_TOKEN_STORAGE_KEY,token); }
    catch { if(feedback)feedback.textContent='Browser storage is unavailable. The key was not saved.';return; }
    if(input)input.value='';
    if(feedback)feedback.textContent='Your public token is saved in this browser only.';
    if(map){map.remove();map=null;}
    try { routeCache.clear(); } catch {}
    initMapbox();
    try { renderPlanUI(); } catch {}
    closeMapboxModal();
  });
  mapboxKeyById('clearMapboxTokenBtn')?.addEventListener('click',()=>{
    try { localStorage.removeItem(MAPBOX_TOKEN_STORAGE_KEY); } catch {}
    if(map){map.remove();map=null;}
    if(window.mapboxgl)mapboxgl.accessToken='';
    try { routeCache.clear(); } catch {}
    const input=mapboxKeyById('mapboxTokenInput');if(input)input.value='';
    const feedback=mapboxKeyById('mapboxTokenFeedback');if(feedback)feedback.textContent='The saved token was removed from this browser.';
    setMapboxNotice('Add your own Mapbox public token to load the map and calculate routes.');
    closeMapboxModal();
    try { requestDayRoute(); } catch {}
  });
  const saved=!!readUserMapboxToken();
  const notice=mapboxKeyById('mapboxTokenNotice');
  if(notice)notice.hidden=saved;
  if(!saved)setMapboxNotice('Add your own Mapbox public token to load the map and calculate routes.');
});
