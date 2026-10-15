# Trip Planner operator checklist

Use a separate browser profile for tests. Public services can be unavailable. The itinerary must keep working when a service fails. Do not use personal information in test plans.

## Start and open the app

- [ ] 1. From the public repo root run `node tools/trip-planner/serve.mjs` with Node 18 or newer. 2. Open `http://127.0.0.1:8766`. 3. Stop with Ctrl+C when finished. Expected: the app loads without a build or keys, with a map and Sardegna itinerary. The server only binds to localhost and serves the Trip Planner folder. Set the `PORT` environment variable before starting to change the port. In Windows cmd: `set PORT=8770`, then run the same command. Do not use port 8765.
- [ ] 1. Open the browser developer console. 2. Reload. Expected: no JavaScript errors. A failed provider may leave data unavailable without breaking editing.

## Preset note

- [ ] 1. Open My trips. 2. Choose Restore Sardegna preset. 3. Read the banner under the title. Expected: `This plan was tested on a summer trip.` with no personal names, 10 days and 44 stops.

## Map layers and 3D

- [ ] 1. Press Map, Topo and Satellite in turn. 2. Zoom Satellite closely over Milan or a stop. 3. Press 3D twice, then Fit. Expected: the selected chip changes, each layer draws, 3D tilts and restores the map, Fit contains the selected day or trip. Satellite keeps drawing above source zoom 18 by overzooming. Attribution names EOX and says `Contains modified Copernicus Sentinel data 2021`.

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
