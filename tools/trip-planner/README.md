# Trip Planner

Plan multi-day trips on an open 3D map. No account, no API key, no build step. Edit by hand, or let your own agent plan and edit for you.

Public route: `/trip-planner/`. Canonical source: `tools/trip-planner/` in the public repository.

## What it does

- Open map with Map, Topo and Satellite layers, 3D terrain and buildings, numbered stops and day routes.
- Trip library kept in your browser: new, open, duplicate, delete, restore the Sardegna preset.
- Manual editing: add a base, a day or a stop. Find a place by name, tap the map, or type coordinates. Drag the visible handle to reorder stops within a day, or use Up and Down. Delete and reorder with undo.
- Weather for opened days: a forecast when the date is near, otherwise the typical weather for those dates, clearly labelled. Boat days show maximum wave height where marine forecasts are available, today through 13 days ahead.
- Stop elevations in metres, loaded in batches when a day opens. Elevation and waves stay in runtime caches and are omitted if unavailable.
- My location starts GPS only when pressed. A blue dot marks the location without moving the map camera. Press again or hide the page to stop. GPS coordinates stay on your device.
- Settings for your own search, car, foot, bike and weather providers, saved in this browser with a reset to public defaults.
- GPX import for hikes, with distance, climb and an elevation profile. GPX export of the whole trip.
- Share by link (the trip is packed into the link, nothing is uploaded), JSON export and import, print view.
- Checklist of visited stops and a packing list, saved in your browser.

## The preset

Sardegna is the only preset. It is a real, tested summer itinerary. Its banner contains no personal names. Hotels and sites are kept. Personal notes were removed.

## Open a trip by link

`?plan=https://example.com/trip.json` opens a trip file. The file is checked against the schema first. Text is never inserted as HTML and links are limited to http and https.

## Connect an agent

Three levels. Each works without the next.

1. **Skill** (`skill/`). A playbook any agent can follow to plan a trip and write a valid trip file. Works in Claude skills, or pasted into any chat. Hand the result to the app as a file or a `?plan=` link.
2. **Local connector** (`mcp/`). A small MCP server on your machine. Your agent reads and edits trips live and the page reloads. See `mcp/README.md`.
3. **Trip file** (`schema/trip.schema.json`, `PLAN-CONTRACT.md`). The format both of the above produce.

## Data sources and limits

| Need | Service | Note |
|-|-|-|
| Map tiles, 3D buildings | OpenFreeMap | attribution shown |
| Topo | OpenTopoMap | CC-BY-SA |
| Satellite | Sentinel-2 cloudless by EOX | Contains modified Copernicus Sentinel data 2021; source zoom ends at 18 and overzooms above it |
| Terrain | AWS Terrain Tiles | |
| Place search | Nominatim | one request per second, cached |
| Routes | FOSSGIS OSRM | one request per second, cached |
| Weather, elevation | Open-Meteo | free for non-commercial use, credit shown |

Public servers ask for light use. The app queues and caches requests. Run your own servers for heavy use. Weather is for one point: before any mountain hike, check the local mountain forecast.

Satellite tiles were checked over Milan on 2026-10-15: zooms 10, 12, 14 and 18 returned valid 256 px JPEGs; zooms 19 and 20 returned 404. The source maximum is 18 so MapLibre overzooms above that limit.

## Provider settings

Open **Share & export > Settings** to point the app at your own Nominatim, OSRM or Open-Meteo server. Enter complete endpoints, for example `https://example.com/search`, `https://example.com/route/v1/driving` or `http://localhost:8080/v1/forecast`. OSRM has separate car, foot and bike fields. Weather has forecast, history, elevation and marine fields so each service can be hosted separately.

Only HTTPS is accepted, except HTTP on `localhost` or `127.0.0.1`. Credentials, query strings and fragments are refused. The settings live in localStorage as `tp-providers`, load at startup and never become part of an exported trip. **Reset to defaults** removes the saved settings and restores public providers. Your chosen providers receive search text and itinerary coordinates when used. GPS coordinates are never used for these requests.

## Layout

```
index.html           page
css/                 tokens.css (one token library), app.css
js/                  app, store, mapview, geo, gpx, util, providers (ES modules)
serve.mjs            dependency-free local static server
TESTING.md           operator checklist
schema/              trip.schema.json, validate.mjs and its test
samples/sardegna.json
skill/               planning skill for agents
mcp/                 local MCP connector
```

## Run and check locally

```sh
node tools/trip-planner/serve.mjs
# Open http://127.0.0.1:8766
node --test tools/trip-planner/schema/validate.test.mjs
node --test tools/trip-planner/mcp/server.test.mjs
node --test tools/trip-planner/js/providers.test.mjs
```

Serve it over HTTP. Opening `index.html` as a file will not load the modules.
The server binds only to `127.0.0.1`. Set `PORT` to change 8766. It serves this folder regardless of the working directory and refuses paths outside it. See [TESTING.md](TESTING.md) for the full manual checklist and local connector instructions.

## Development

Public edits follow a feature branch, a reviewed pull request, passing checks and an approved merge. Keep private notes and keys out of public source.
