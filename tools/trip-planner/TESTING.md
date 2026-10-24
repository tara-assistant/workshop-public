# My Trip Planner: test checklist

**Maintainer-only browser checks:** The scripts, mockups, screenshots and trial files under ignored `tests/local/` are not included in a public checkout. The repository Node tests and app server are tracked; the browser automation and live-photo checks below require the local maintainer harness.

Start the tracked server from `tools/trip-planner` with `node serve.mjs`, then open http://127.0.0.1:8766/index.html. Use a separate browser profile. Read each row left to right: action, then expected result. Repeat the layout rows at 320x640, 375x812, 768x1024 and 1280x900. For ordinary testing, close the browser and stop the server afterward. When preparing hands-on review, leave port 8766 running and open the local app.

## Automated checks

- [ ] From `tools/trip-planner` run `node --test`. Expected: schema and module tests pass, both bundled samples validate, and each Portugal day has complete Wikimedia photo attribution.
- [ ] **Maintainers with the ignored local harness:** the existing `_flow.py` and `_shot.py` suites predate the current Menu subpage redesign. Inspect their selectors and keep any browser checks in disposable Playwright contexts; never clear or reuse the operator's saved-trip profile.
- [ ] **Maintainers with the ignored local harness:** run `python tests/local/scripts/_verify_sardegna_photos.py` to verify all 12 Commons photos and their author, licence and source links. The older `_shot.py` suite has not been adapted or run for this menu change; review its selectors before using it. Checklist entries are instructions, not claims that a check ran.
- [ ] Run `git diff --check`. Review added lines for long dashes and for keys or keyed services.
- [ ] Check the canonical Agent Skill path and its `name`/directory match; verify local trials remain ignored, exactly the Sardegna preset and Portugal demo ship, and Portugal has root/day dates, its exact illustrative disclaimer, and one verified photo with author, licence and Commons source on every day. Confirm the public bundle exposes both sample JSON download routes.

## First look

- [ ] **Open the app** | Load the page. | The My Trip Planner wordmark and map-route logo remain above the active trip title. The header stays fixed and clearly separated while the page scrolls. Sardegna opens with the first day expanded. Header shows labeled trip stats, one three-dot Menu control, with Settings inside its App group. Trip progress is above the workspace and above the mobile map. Soft, colored base cards retain explicit Add a base and per-day Add stop actions and Add day beside each base heading.
- [ ] **Brand and favicon** | Check the header logo, page title and browser tab icon. | The My Trip Planner name is legible at 320 px and the project favicon shows the matching map-and-route mark.
- [ ] **Map** | Press Map controls and select each map style. Select a stop on a phone. | Illustrated Standard and Satellite controls are available; Topo and map expand/collapse controls are absent. Selecting a stop does not resize the fixed mobile map. Controls remain reachable with required attribution visible. Beside the map, Standard and Satellite are explained; 3D is terrain relief, not a weather or trail-safety check.
- [ ] **Day** | Open a day. | Date, title and stop count show; weather appears under each located stop only when the day is expanded. Collapsed days show no weather summary and request no new weather. A day photo shows its author, linked licence and Commons source page beside it.
- [ ] **Stop row** | Look at a stop with and without a photo. | Soft, clearly separated stop cards show useful type icons and a short description. A missing photo does not leave an empty box.
- [ ] **Select** | Tap a stop on a phone. | It is highlighted on the map, and the map keeps the same fixed size.
- [ ] **Directions** | Tap Navigate on a stop. | A small menu offers Google Maps and OpenStreetMap, every time. Each opens a plain link with the coordinates and the day travel mode in a new tab. There is no Show button.
- [ ] **Tick** | Tick a stop and a packing item, then reload. | Both ticks stay. The labeled trip progress row updates.

## Weather and photos

- [ ] **Per-stop weather** | Open a day within 13 days, one in the past, and one far ahead. | Near: Forecast. Past and far: Typical with sampled historical years. Each located dated stop shows only a condition glyph and a Celsius low-to-high range; accessible labels and concise tooltips identify Forecast or Historical typical weather and the day date. Undated, unlocated or failed results are hidden. Expanded days request each located stop; collapsed days and collapsed or filtered-out bases request no new weather. Allow an already in-flight request to finish, then verify no additional requests start. Typical weather can issue up to five archive requests per stop, so check requested coordinates rather than a fixed in-flight count. Change a stop location or date and verify matching requests/results; no background timer polls.
- [ ] **Auto photo and weather** | Add a stop with a well known name and coordinates. | The stop saves at once. Its photo appears after a moment only when the title clearly matches the name. A merely nearby photo is not used. If lookups fail, nothing breaks.
- [ ] **Manual photo** | Edit a stop, open Advanced, press Find a photo. | Up to four candidates with author and licence. Choosing one and saving keeps the photo and its credit.

## Editing

- [ ] **Always-on editing** | Open a day and inspect a stop, then reload. | Day and stop edit, move and delete controls are available without a mode switch. Checklist ticks remain separate and persist after reload.
- [ ] **Add stop** | Press Add stop in the relevant day header. | The stop dialog targets that day. Use Add day beside the base heading for an empty base. Coordinates and image URL are under Advanced. Save is the main button.
- [ ] **Bases** | Collapse and reopen a colored base card. | Its days hide and return without changing other bases or the map.
- [ ] **Add a base** | Menu, Add a base. | The Menu action appends a base. It appears as its own colored, collapsible section.
- [ ] **Manage bases** | Menu, Manage bases, move a base up. Reload. Press Undo. | Whole bases move and days are renumbered from 1. Dates do not change. Ticked packing items follow their days. Undo restores the old order and ticks.

## Trips and sharing

- [ ] **My trips** | New trip, open, duplicate, delete, restore the Sardegna preset. | Each works and the active trip persists.
- [ ] **Share and export** | Copy a share link and open it in a new profile. Export JSON and GPX, import each. Validate and import an existing generated skill trial, then edit it by hand. Test print and hosted JSON import as well. | The trip opens from the link, exports are valid, and the import creates a trip.
- [ ] **Bad file** | Import a JSON file with a text latitude. | A short error names the path. No trip is created.
- [ ] **Open by link** | Open `?plan=<https url of a trip file>`. | The file is checked against the schema first, then opens.

## Settings and About

- [ ] **Settings** | Open Menu → Settings by pointer and keyboard, visit Services, close with Escape, then reopen. Repeat after deleting all trips in an isolated profile. | Only Menu is visible in the header. Menu has This trip and App groups; Settings is always enabled under App. Opening Settings closes Menu and selects Agent skill every time. Escape returns focus to Menu. Agent skill, Services and About are ordinary keyboard-reachable section buttons with aria-pressed state; there is no Weather section. Wide screens have a navigation rail; narrow screens have reachable wrapping buttons. Services retains Forecast, Archive and Marine provider URLs. The Agent skill section links to the canonical GitHub SKILL.md and install README, explains real dates and the explicitly requested labelled illustrative-demo exception, and lists JSON import steps.
- [ ] **Descriptions and SVG** | Use Enter/Space on a long stop name twice. | aria-controls identifies its description; aria-expanded follows a visible two-line collapse/full expansion. Directions circles are real SVG elements. Stop selection still works.
- [ ] **GPX** | Import a small GPX with track points, export it, and inspect the current trip. | A separate one-day hike trip is created; track and waypoint data export. No stop attachment or replacement control appears. JSON preserves the full trip, dates and credits.
- [ ] **Tip filtering** | Import a trip with the exact obsolete no-date research diagnostic and an unrelated Map data tip. | Only the exact obsolete diagnostic is hidden; both stored strings and the unrelated tip remain intact.

- [ ] **Credits** | Check the footer, Settings > About and Services, and the map. | No footer is present. Settings > About shows exactly “© 2026 MetaEngineers Hub.”, with MetaEngineers Hub linking to this repository. Detailed service credits are in Settings > Services. Required map attribution remains visible beside the map, and each day photo has author, licence and source links beside it.

## Phone and keyboard

- [ ] **Sizes** | Check at 320, 375, 768 and 1280. | Nothing overflows sideways. Touch targets are at least 44 px. The header stays at the top with a visible shadow or border while scrolling. Desktop shows balanced equal-height itinerary/map panels with a visible itinerary scrollbar. Mobile uses whole-page scrolling and one fixed map size; selecting a stop does not change its height. Focus indicators and reduced-motion support remain.
- [ ] **Keyboard** | Tab through the menu, base pills, map button, list and dialogs. Open and close dialogs with Enter and Escape. | Focus is visible and in a sensible order. Every dialog action is reachable.

## Failure

- [ ] **Offline** | Block the weather and photo hosts after a successful load, then reload offline. | Saved plans still open and can be edited. Missing weather and photos are simply absent.

The flow tests use deterministic weather, routing and automatic-photo replies. The screenshot suite and dedicated photo verifier load the Sardegna sample's real Wikimedia Commons images. Map tiles and the map library are real requests. Live service availability is a separate smoke check.
