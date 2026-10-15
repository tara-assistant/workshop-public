# Trip Planner: test checklist

Start the server from `tools/trip-planner` with `node serve.mjs` (or `python tests/local/scripts/_serve.py`), then open http://127.0.0.1:8766/index.html. Use a separate browser profile. Read each row left to right: action, then expected result. Repeat the layout rows at 320x640, 375x812, 768x1024 and 1280x900. Close the browser and stop the server after testing.

## Automated checks

- [ ] From `tools/trip-planner` run `node --test schema/validate.test.mjs js/*.test.mjs`. Expected: all pass.
- [ ] With the local server on 8766 run `python tests/local/scripts/_flow.py` and `python tests/local/scripts/_shot.py` from the ignored scratchpad. Expected: every flow check PASS, zero console errors and zero horizontal overflow at 320, 375, 768 and 1280.
- [ ] Run `git diff --check`. Review added lines for long dashes and for keys or keyed services.

## First look

- [ ] **Open the app** | Load the page. | Sardegna opens. Header shows the title, dates and progress, and one menu button. A row of base pills sits under it. A small map sits above a flat list of days. No live weather strip, no plan note, no progress bar.
- [ ] **Map** | Tap the map or its chevron, then again. Press the layers button. | The map grows and shrinks and the choice is remembered. Only the layers button shows on the map. Map, Topo, Satellite, 3D, zoom, North, Reset and My location are inside it. Controls are small and never cover the stop list.
- [ ] **Day** | Open a day. | Date, title and stop count show, with a temperature chip at the right when there is a forecast or typical value. A day photo shows when the day has one.
- [ ] **Stop row** | Look at a stop with and without a photo. | A photo shows as a rounded thumbnail. No photo shows a tinted type icon, never an empty box. Rows are flat with thin dividers and a short description.
- [ ] **Select** | Tap a stop. | It is highlighted on the map and the map opens if it was folded.
- [ ] **Directions** | Tap Directions on a stop. | A small menu offers Google Maps and OpenStreetMap, every time. Each opens a plain link with the coordinates and the day travel mode in a new tab. There is no Show button.
- [ ] **Tick** | Tick a stop and a packing item, then reload. | Both ticks stay. The progress count in the header changes.

## Weather and photos

- [ ] **Temperature chip** | Open a day within 13 days, one far away, and one in the past. | Near: forecast numbers. Far: typical numbers labelled typical. Past or no located stop: no chip at all, never an empty one. The longer text with rain, wind and sun times appears only in the opened day.
- [ ] **Auto photo and weather** | Add a stop with a well known name and coordinates. | The stop saves at once. Its photo appears after a moment only when the title clearly matches the name. A merely nearby photo is not used. If lookups fail, nothing breaks.
- [ ] **Manual photo** | Edit a stop, open Advanced, press Find a photo. | Up to four candidates with author and licence. Choosing one and saving keeps the photo and its credit.

## Editing

- [ ] **Edit mode** | Menu, Edit mode on. Then off. | On: Edit, Move up, Move down, Delete and GPX (hikes) show on stops, and Edit day on day headers. Off: none of these show. The choice is remembered.
- [ ] **Add stop** | Press Add stop at the bottom. | The stop dialog opens for the open day. Coordinates and image URL are under Advanced. Save is the main button.
- [ ] **Add a base** | Menu, Add a base. | The new base appears at the end of the base pills.
- [ ] **Manage bases** | Menu, Manage bases, move a base up. Reload. Press Undo. | Whole bases move and days are renumbered from 1. Dates do not change. Ticked packing items follow their days. Undo restores the old order and ticks.

## Trips and sharing

- [ ] **My trips** | New trip, open, duplicate, delete, restore the Sardegna preset. | Each works and the active trip persists.
- [ ] **Share and export** | Copy a share link and open it in a new profile. Export JSON and GPX, import the JSON. | The trip opens from the link, exports are valid, and the import creates a trip.
- [ ] **Bad file** | Import a JSON file with a text latitude. | A short error names the path. No trip is created.
- [ ] **Open by link** | Open `?plan=<https url of a trip file>`. | The file is checked against the schema first, then opens.

## Settings and footer

- [ ] **Settings** | Menu, Settings. | Provider URLs are inside a collapsed Advanced section. There is no maps links setting and no connector panel.
- [ ] **Footer** | Scroll to the end of the list. | One line: © 2026 MetaEngineers Hub, linked to the repository, and an About link that lists the data credits. No personal name.

## Phone and keyboard

- [ ] **Sizes** | Check at 320, 375, 768 and 1280. | The title wraps to two lines and is never cut with dots. Nothing overflows sideways. Tap targets are at least 44 px high except the small map controls. Desktop shows the list on the left (432 px) and the map filling the rest.
- [ ] **Keyboard** | Tab through the menu, base pills, map button, list and dialogs. Open and close dialogs with Enter and Escape. | Focus is visible and in a sensible order. Every dialog action is reachable.

## Failure

- [ ] **Offline** | Block the weather and photo hosts after a successful load, then reload offline. | Saved plans still open and can be edited. Missing weather and photos are simply absent.

The local scripts use fixed weather, routing and photo replies for repeatable checks. Map tiles and the map library are real requests. Live service availability is a separate smoke check.
