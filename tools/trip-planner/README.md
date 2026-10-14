# Trip Planner

Plan multi-day trips on an open 3D map. No account, no API key, no build step. Edit by hand, or let your own agent plan and edit for you.

Public route: `/trip-planner/`. Canonical source: `tools/trip-planner/` in the public repository.

## What it does

- Open map with Map, Topo and Satellite layers, 3D terrain and buildings, numbered stops and day routes.
- Trip library kept in your browser: new, open, duplicate, delete, restore the Sardegna preset.
- Manual editing: add a base, a day or a stop. Find a place by name, tap the map, or type coordinates. Move stops up and down. Delete with undo.
- Weather for each day: a forecast when the date is near, otherwise the typical weather for those dates, clearly labelled.
- GPX import for hikes, with distance, climb and an elevation profile. GPX export of the whole trip.
- Share by link (the trip is packed into the link, nothing is uploaded), JSON export and import, print view.
- Checklist of visited stops and a packing list, saved in your browser.

## The preset

Sardegna is the only preset. It is a real plan, tested and done by Jihad for his summer trip. Hotels and sites are kept. Personal notes were removed.

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
| Satellite | Sentinel-2 cloudless by EOX | attribution shown |
| Terrain | AWS Terrain Tiles | |
| Place search | Nominatim | one request per second, cached |
| Routes | FOSSGIS OSRM | one request per second, cached |
| Weather, elevation | Open-Meteo | free for non-commercial use, credit shown |

Public servers ask for light use. The app queues and caches requests. Run your own servers for heavy use. Weather is for one point: before any mountain hike, check the local mountain forecast.

## Layout

```
index.html           page
css/                 tokens.css (one token library), app.css
js/                  app, store, mapview, geo, gpx, util (ES modules)
schema/              trip.schema.json, validate.mjs and its test
samples/sardegna.json
skill/               planning skill for agents
mcp/                 local MCP connector
```

## Run and check locally

```sh
cd tools/trip-planner
python -m http.server 8000        # then open http://127.0.0.1:8000
node --test schema/validate.test.mjs
node --test mcp/server.test.mjs
```

Serve it over HTTP. Opening `index.html` as a file will not load the modules.

## Development

Public edits follow a feature branch, a reviewed pull request, passing checks and an approved merge. Keep private notes and keys out of public source.
