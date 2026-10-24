# My Trip Planner

Plan a trip on an open map. No account, API key, build step or server-side agent connector is needed. Keep trips in this browser, check off stops, share them with friends, or ask your own agent to draft a trip file.

Public route: `/trip-planner/`. Canonical source: `tools/trip-planner/` in the public repository. Change history and release notes: [CHANGELOG.md](CHANGELOG.md).

## Open locally and import a trip

```sh
cd tools/trip-planner
node serve.mjs
```

Open http://127.0.0.1:8766 over HTTP; opening index.html directly cannot load the modules. Open **Menu → My trips → Import JSON or GPX**, then select a schema-v1 `.json` file. The imported trip becomes active. Use **Menu → Share and export → Download trip JSON** for a full backup.

View days and stops on the map, open directions, check off stops and packing items, and edit or rearrange bases, days and stops. Weather loads automatically for located stops in expanded dated days inside visible, expanded bases. It shows a condition glyph and Celsius low-to-high range; accessible labels and tooltips distinguish forecasts from historical typical conditions. Collapsed days request no new weather and show no summary.

The single three-dot **Menu** also opens **Settings**, even with an empty trip library. Settings starts at **Agent skill** each time, with **Services** and **About** alongside it. Services contains provider credits and optional endpoints; required attribution stays beside the map. About contains the linked © 2026 MetaEngineers Hub. credit.

Trips and settings are local to this browser, with no account or API key. Export JSON to retain your own backup. Map tiles, place search, routes, weather and photos use public online services; this is not a fully offline map. Share links contain trip data or point to a hosted JSON file, so share them deliberately.

## The shipped example

Two trip samples ship in `samples/`: `sardegna.json` is the only built-in preset, while `portugal-6-day-demo.json` is a six-day, sourced illustrative example with explicit dates and credited Commons photos on every day. Its title and note state “Illustrative demo; not a confirmed travel plan”; its dates are examples, not traveller-confirmed. Portugal is a sample to import manually, not a preset. Both files are starting points for exploration, not claims of current access or bookings. Download the [Sardegna preset JSON](https://projects.metaengineershub.com/trip-planner/samples/sardegna.json) or the [Portugal six-day demo JSON](https://projects.metaengineershub.com/trip-planner/samples/portugal-6-day-demo.json). Other trips are created or imported by the user and stay in that browser's local trip library.

## Plan with an agent

The canonical, portable Agent Skill is `.agents/skills/trip-planner/`. It contains the standard `SKILL.md` plus optional research and validation references. It describes how to research any destination, build and check a full schema-v1 trip, and use the app's supported file formats. The skill does not directly connect to or control the app.

### Install and use the skill

Copy or download the complete [canonical skill folder](https://github.com/tara-assistant/workshop-public/tree/main/tools/trip-planner/.agents/skills/trip-planner), including `references/`, into your agent's documented skills directory under the name `trip-planner`. Follow the [skill install README](.agents/skills/trip-planner/README.md). For a client without compatible skill discovery, give it `SKILL.md` directly. Refresh installed copies from this one maintained source.

Give the agent your destination, confirmed start/end dates, bases, pace, transport and interests. It must ask and wait for missing real dates before producing a trip or draft. Only an explicitly requested illustrative demo may use disclosed example dates, with all root/day dates present and both title and note clearly marking it as illustrative rather than confirmed travel. Save its validated JSON and import it using the steps above.

### Supported file formats

- **Full trip:** schema-v1 JSON (`.json`). Use this for any complete itinerary.
- **Tracks and waypoints:** GPX (`.gpx`) imports track or route points as a separate one-day hike trip. It does not attach a GPX file to an existing stop. Exports include stop waypoints and tracks already stored in trip JSON. Waypoint-only GPX cannot be imported because the importer requires track or route points. GPX is not a complete trip.
- **Share link:** `#plan=` contains compressed trip data. `?plan=` fetches a hosted JSON file. Do not publish or host a trip unless the traveller asks.
- **Print:** opens the browser print dialog. PDF is a print output, not a native trip-file format.

The app validates JSON with `schema/trip.schema.json`. `PLAN-CONTRACT.md` describes its fields. The Skill’s full procedure and validation command are in `.agents/skills/trip-planner/SKILL.md`.

## Data sources

| Need | Service | Note |
| --- | --- | --- |
| Map | MapLibre GL, OpenFreeMap, OpenStreetMap contributors | Required attribution stays beside the map |
| Satellite | Sentinel-2 cloudless by EOX | Source zoom ends at 18; higher zooms are overzoomed |
| Terrain | AWS Terrain Tiles | |
| Place search | Nominatim | One request per second, cached |
| Routes | FOSSGIS OSRM | One request per second, cached |
| Weather and elevation | Open-Meteo | Free for non-commercial use; credit shown |
| Photos | Wikipedia and Wikimedia Commons | Day-photo author, licence and source-page links appear beside the image |

Public servers ask for light use, so the app queues and caches requests. Before a mountain hike, check the local mountain forecast and current trail conditions.

## Settings and privacy

Settings > Services lists provider and licence credits and contains optional provider URLs. Endpoints must be HTTPS, except HTTP on `localhost` or `127.0.0.1`; credentials, query strings and fragments are refused. Settings stay in this browser and never enter an exported trip. The app ships with no server key and no MCP server. The project `.gitignore` keeps tests, plans, trial trips and working notes out of releases by default.

## Layout

```text
index.html                         app page
favicon.svg                       project favicon
css/                              shared tokens and app styles
js/                               app modules
serve.mjs                         dependency-free local static server
schema/                           schema-v1 and validator
samples/sardegna.json             built-in Sardegna preset
samples/portugal-6-day-demo.json  six-day illustrative Portugal example
.agents/skills/trip-planner/      canonical Agent Skill and references
AGENTS.md                         project-specific working rules
TESTING.md                        local check and review checklist
CHANGELOG.md                      update history and release notes
```

## Run and check locally

```sh
cd tools/trip-planner
node serve.mjs
# Open http://127.0.0.1:8766
node --test
```

Serve it over HTTP. Opening `index.html` as a file will not load the modules. The server binds only to `127.0.0.1`, serves this folder whatever the working directory, and refuses paths outside it. Use port 8766 for project checks. See [TESTING.md](TESTING.md) for the browser checklist.

## Updates and releases

Keep `.agents/skills/trip-planner/` as the only maintained skill source. When its procedure or references change, update this README, the package README, and `CHANGELOG.md` in the same reviewed change. Refresh any installed copies from the canonical folder, including removing obsolete reference files. Keep plans, tests, trials and reports under ignored `tests/local/` unless a separate release decision approves them. Public source changes use a feature branch and reviewed pull request; do not include credentials or private notes.
