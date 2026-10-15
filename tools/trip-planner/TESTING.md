# Trip Planner operator checklist

Use a separate browser profile for tests. Public services can be unavailable. The itinerary must keep working when a service fails. Do not use personal information in test plans.

## Start and open the app

- [ ] 1. From the public repo root run `node tools/trip-planner/serve.mjs` with Node 18 or newer. 2. Open `http://127.0.0.1:8766`. 3. Stop with Ctrl+C when finished. Expected: the app loads without a build or keys, with a map and Sardegna itinerary. The server only binds to localhost and serves the Trip Planner folder. Set the `PORT` environment variable before starting to change the port. In Windows cmd: `set PORT=8770`, then run the same command. Do not use port 8765.
- [ ] 1. Open the browser developer console. 2. Reload. Expected: no JavaScript errors. A failed provider may leave data unavailable without breaking editing.

## Preset note

- [ ] 1. Open My trips. 2. Choose Restore Sardegna preset. 3. Read the banner under the title. Expected: `This plan was tested on a summer trip.` with no personal names, 10 days and 44 stops.

## Map layers and 3D

- [ ] 1. Tap the layers button at the top right of the map, then press Map, Topo and Satellite in turn. 2. Zoom Satellite closely over Milan or a stop. 3. Press 3D twice, then Fit. Expected: the options stay hidden until you tap the button, the selected chip changes, each layer draws, 3D tilts and restores the map, Fit contains the selected day or trip. Satellite keeps drawing above source zoom 18 by overzooming. Attribution names EOX and says `Contains modified Copernicus Sentinel data 2021`.

## Open a day and weather strip

- [ ] 1. Open a day header. 2. Wait for weather. 3. Close and reopen it. Expected: stop cards appear immediately; the weather strip shows temperatures, rain, wind, sunrise and sunset when available. A nearby date says Forecast; other dates say Typical and explain the sample average. Cached values reappear without repeated calls. Hike days include the local mountain forecast reminder.

## Stop elevation

- [ ] 1. In Network clear the request list. 2. Open one previously closed day. 3. Wait for its elevation request. 4. Close and reopen it. 5. Export JSON. Expected: one batched elevation call per opened day (chunks of up to 100 stops), with `Elevation 412 m` style lines. There is no call for closed days and no repeat for cached points. Elevation is absent from exported stop data. Block the elevation endpoint and open another day: cards still work and no elevation line appears for failed values.

## Boat waves

- [ ] 1. Edit a day date to today or the next 13 days. 2. Add or edit a stop to type Boat. 3. Open that day and inspect Network. Expected: a marine request uses the first boat stop, `daily=wave_height_max`, the day as both start and end date, and `timezone=auto`. When available the weather strip says `Waves up to X m`. 4. Move the date beyond that window. Expected: no wave request or wave label; typical weather remains available. A failed marine response must not remove ordinary weather.

## Tick and progress

- [ ] 1. Tick a stop. 2. Read the hero progress. 3. Reload and reopen the day. 4. Untick it. Expected: visited styling and the count update and persist; packing checks remain separate.

## Add stop by search

- [ ] 1. Open a day and press Add stop. 2. Type a place and press Search. 3. Choose a result. 4. Save stop. Expected: name and coordinates populate, the new stop and pin appear, and typing alone makes no search request.

## Add stop by map tap

- [ ] 1. Press Add stop, then Pick on map. 2. Tap an unoccupied point on the map. 3. Enter a name and save. Expected: the dialog reopens with the tapped coordinates and the saved stop appears at that point.

## Edit

- [ ] 1. Press Edit on a stop. 2. Change its name, time, notes and type. 3. Save. 4. Reopen Edit. Expected: the card, map label and saved fields match. Text such as `<b>example</b>` displays as text and does not become HTML.

## Up and Down

- [ ] 1. On a middle stop press Up, then Down. 2. Try the first stop's Up and last stop's Down. Expected: order and map numbering change and restore; boundary buttons are disabled.

## Drag reorder

- [ ] 1. Press and hold the dotted handle on a stop. 2. Drag above another stop or below the last stop in the same day. 3. Release. 4. Repeat on a touch device, including dragging near the bottom edge to scroll. Expected: an insertion marker appears, stops shift to the new order, map numbering updates, and other days keep their order. Cancel a pointer gesture: order remains unchanged. Up and Down remain available for keyboard use.

## Undo

- [ ] 1. Move or delete a stop. 2. Press Undo in the top bar or toast. Expected: the previous order or deleted stop returns, including map pins and numbering.

## Delete a stop

- [ ] 1. Delete a test stop. 2. Reload. Expected: it remains absent and progress totals adjust. Use a fresh deletion followed by Undo to verify restoration.

## New trip

- [ ] 1. Open My trips, then New trip. 2. Supply title, destination and first date. 3. Create. Expected: the new trip is active, its empty first day is editable, and the earlier trip remains in the library.

## Duplicate trip

- [ ] 1. Open My trips. 2. Duplicate a trip. 3. Open the copy and edit it. Expected: the copy has its own id and the original is unchanged.

## Delete trip

- [ ] 1. Delete a test trip from My trips. 2. Close the dialog. 3. Use the toast Undo. Expected: the trip disappears, then returns. Deleting the last trip leaves a usable empty state.

## Reset Sardegna

- [ ] 1. Change a Sardegna stop and tick another. 2. Choose Restore Sardegna preset in My trips. Expected: the original 10 days and 44 stops return with clean ticks and the anonymous banner. Other trips remain saved.

## Import JSON

- [ ] 1. Import a valid schema v1 JSON file through My trips. 2. Import one with a nonnumeric latitude. Expected: the valid trip opens and unknown fields survive; the invalid file shows a field error and does not replace the current trip.

## Import GPX with elevation profile

- [ ] 1. Import a GPX track with several points and `ele` values. 2. Open the created day. Expected: a hike stop, track on the map, distance, climb, descent and elevation profile appear. GPX without elevations still imports with a clear no elevation data label.

## Export JSON and GPX

- [ ] 1. Open Share & export and download each format. 2. Import each downloaded file. Expected: JSON preserves trip content and schema 1; GPX preserves coordinates and supplied track elevations. Settings, GPS and fetched stop elevations are absent from JSON.

## Share link round trip

- [ ] 1. Copy share link. 2. Open it in a separate browser profile. Expected: the same trip opens from `#plan=`, without an upload. Long trips may show a link length warning.

## Open an HTTPS plan file

- [ ] 1. Host a valid test trip JSON at an HTTPS URL with CORS allowing the app. 2. Open `http://127.0.0.1:8766/?plan=https://your-host.example/trip.json`, replacing the example. Expected: the validated trip opens. 3. Try an HTTP URL or invalid JSON. Expected: a clear notice and the existing trip remains usable.

## Print

- [ ] 1. Choose Print under Share & export. 2. Inspect preview, then cancel. Expected: all itinerary days are expanded, the map and editing controls are hidden, and content fits the printable width.

## GPS

- [ ] 1. Reload and confirm there is no permission prompt. 2. Press My location and allow location. Expected: a blue dot appears if the position falls inside the current map view; the camera stays fixed and no GPS coordinates enter provider requests or trip data. Pan manually if needed. 3. Press again. Expected: tracking and the dot stop. 4. Start again and hide the page. Expected: tracking stops and does not resume automatically. 5. Deny permission, or disable location on the device. Expected: a clear denied or unavailable message and the chip resets.

## Settings providers

- [ ] 1. Open Share & export > Settings. 2. Enter your own Nominatim search, OSRM car, foot and bike endpoints and Open-Meteo weather endpoints. 3. Save and reload. Expected: values persist as `tp-providers` and subsequent requests use them. Endpoints must implement the matching public API.
- [ ] 1. Try `http://example.com/search`, credentials, a query string or a fragment. 2. Save. Expected: an error, with no saved changes. HTTPS and HTTP on `localhost` or `127.0.0.1` pass validation. 3. Press Reset to defaults. Expected: public endpoints return immediately and after reload, and the localStorage key is removed.

## Phone widths

- [ ] 1. At 320 px and then 375 px viewport width, open days, Settings, the library and the stop editor. 2. Scroll each dialog to its buttons. 3. Repeat at 1280 px. Expected: no horizontal overflow, clipped controls or unreachable buttons; map chips wrap and the itinerary remains readable.

## Keyboard use

- [ ] 1. Use Tab and Shift+Tab through map controls, day headers and stop controls. 2. Use Enter or Space to open, tick, edit and move stops. 3. Press Escape in dialogs. Expected: visible focus, labelled controls, working Up and Down fallback, reachable save buttons, and dialogs close with focus restored.

## MCP connector live link

- [ ] 1. Follow [mcp/README.md](mcp/README.md) to configure your agent client to launch `node tools/trip-planner/mcp/server.mjs --dir C:/absolute/path/to/trips` from the public repo root, or use absolute paths in client configuration. Keep test trip storage inside this app folder if testing within the current workspace constraints. Set `TRIP_MCP_PORT` to 4789 (the default). Keep the client and connector running. 2. In the app open Share & export, under Connect your own agent enter `http://127.0.0.1:4789` and press Connect. Expected: Connected status and saved trips load. The app's connection controls are in this menu.
- [ ] 1. Ask the connected agent to save a valid test trip using `save_trip`, then change a stop using `update_stop`. 2. Watch the app. Expected: the trip and update appear without reloading, with an Updated from your agent message. 3. Stop the connector. Expected: a connection lost message and the local itinerary still works. Use the local app URL if hosted HTTPS browser policy blocks local HTTP.

## Automated checks

- [ ] 1. From `tools/trip-planner` run `node --test schema/validate.test.mjs`, `node --test mcp/server.test.mjs` and `node --test js/providers.test.mjs`. Expected: all tests pass. 2. With the local server on 8766 run `python _flow.py` and `python _shot.py` if the ignored local scratch scripts are present. Expected: all flow checks PASS, zero console errors and zero overflow at 320, 375 and 1280 px.

## Round two: one phone and desktop pass

Start from this folder with `python _serve.py` at `http://127.0.0.1:8766`. Use a separate test profile. Read each row from left to right: action, then expected result. Rows wrap on a phone. Repeat the layout rows at 320x640, 375x812, 768x1024 and 1280x900. Screenshots and local scripts belong only in ignored folders. Close the browser and stop the local server after testing.

- [ ] **Pinned shell** | Open a day and scroll the list to its end, then back. | Title, progress, filters and map stay pinned. The body never scrolls. On desktop only the left list scrolls and the right map fills the screen. No card paints behind or over the map.
- [ ] **List selection** | Select a map pin for a stop far down the trip. | Its day opens and only the inner list scrolls to the card. Keyboard focus remains usable. At 375x812 and 1280x900 assert document.scrollingElement.scrollHeight <= innerHeight and compare map bounds before and after list scrolling.
- [ ] **Hide map** | On a phone press the handle under the map (Hide map), then Show map. Reload after hiding. | The map folds away and the list grows to fill the space. Show map brings it back at 30 percent of the screen height. The choice is remembered. Desktop has no handle and keeps the full height map.
- [ ] **Packing chips** | Open a day with packing, tick a chip, reload and reopen. | Checkbox and label share a horizontal pill, pills wrap, checked text is struck through, and the check survives reload.
- [ ] **Footer** | Scroll to the end of the list. | It reads © 2026 MetaEngineers Hub. All rights reserved., links to metaengineershub.com and to the source code on GitHub, and has no personal name. A small note links to MapLibre and OpenStreetMap contributors. It scrolls with the list.
- [ ] **Reset** | Open a day, pan away, rotate and tilt, then press Reset map view in the bottom-right control stack. Repeat with no focused day. | SVG button has that accessible name, a 44 px target, fits the day or all visible stops, and sets pitch and bearing to 0. The 3D chip resets.
- [ ] **Selection label and credits** | Choose Show, then This map, for La Cinta Beach or another long stop name at each width. Tap the small i at the bottom left of the map. | The stop name appears as a pill inside the top left of the map, nothing sits below the map, and the credits open inside the map over the corner. Nothing covers the scale, the zoom buttons or the options button.
- [ ] **Find a photo** | Edit a named stop with coordinates, press Find a photo, inspect Photo source, choose a thumbnail, save, reload and reopen. | Up to four candidates appear with author and license, one image and its credit save in imageUrl and imageCredit, and only one photo appears on the card. The source confirms the actual place. No Google photos are requested.
- [ ] **Paste and failure** | Paste an HTTPS image URL and credit, save, then try photo search with Wikimedia unavailable. Change stop coordinates during a search. | Manual image and credit persist. Search failure leaves editing usable with a quiet message. Old results cannot select a photo for changed coordinates. Missing photo credits or unsafe candidate URLs are omitted.
- [ ] **Show and Directions** | On a stop card press Show, then Directions. Open Settings, choose OpenStreetMap, Google Maps, then Both, saving each time. | Only two buttons appear per stop. Show offers This map, OpenStreetMap and Google Maps. Directions offers OpenStreetMap and Google Maps. With a single choice in Settings the button opens that map directly. A menu closes after a choice or when you tap elsewhere. The choice persists in tp-maps-links. Links are plain URLs with coordinates and the day travel mode.
- [ ] **Live conditions** | Load a dated trip, read the strip, then press More. | Current temperature, description, wind, current-hour rain chance and relevant day temperatures are present when available. Details show the full text and Updated HH:MM. Trip location uses the first stop of the relevant day, never device GPS.
- [ ] **Countdown and day jump** | Use dates before and during the trip, then tap the live strip. | It says X days to go or Day N of M, today, and opens today or the next day and scrolls the inner list only. After the trip ends it shows no countdown, only the weather. Missing dates say Add trip dates.
- [ ] **Forecast honesty** | Move the relevant date beyond 13 days ahead. | Strip and details say Typical for these dates, not a forecast. Archive requests use past years. No current conditions are presented as the future forecast.
- [ ] **Refresh and offline** | Leave the visible page open for 10 minutes, hide it, then return after 10 minutes. Block weather requests after a successful load. | Visible data refreshes using cached adapters. No refresh runs while hidden. Returning refreshes stale data. Failed refresh keeps saved values with an offline label and editing remains usable. A fresh offline page shows unavailable data without breaking the app.
- [ ] **MCP photo tool** | List the tools, call find_stop_photo with name, lat and lon, then update_stop with one candidate's imageUrl and imageCredit. Repeat photo discovery in offline mode. | 13 tools, discovery changes no trip file, update_stop saves a schema v1 trip, offline discovery returns an error while trip storage works.
- [ ] **Keyboard and touch** | Tab through title strip, filters, map options, list, packing and dialogs. Open and close dialogs with Enter and Escape. | Focus is visible, order follows the workspace, map and list actions have 44 px targets (36 px for the filter chips and live strip on a phone), and dialog actions are reachable at every width. The long Sardegna title wraps to two lines on a 320 px phone and is not cut with dots.
- [ ] **Automated evidence** | Run `node --test schema/validate.test.mjs mcp/server.test.mjs js/providers.test.mjs js/photos.test.mjs js/util.test.mjs js/live.test.mjs`, `python _flow.py`, `python _shot.py`, and `git diff --check`. | All pass. Browser scripts report zero console errors and zero horizontal overflow at 320, 375, 768 and 1280. Screenshots stay ignored. Review added lines for Unicode long dashes and secret or keyed service additions. Leave real source changes uncommitted and do not push.

The local browser scripts use fixed weather, routing and photo replies for repeatable UI checks; MapLibre, basemap, terrain and raster tiles remain real requests. Live service availability is a separate smoke check. A failed public service must leave the itinerary usable. The screenshot report records console errors without filtering them.
