# Trip Planner

Plan a trip on an open map. No account, no API key, no build step. Keep your plans in your browser, tick things off, share them with friends, or ask your own agent to draft one.

Public route: `/trip-planner/`. Canonical source: `tools/trip-planner/` in the public repository.

## What you do

- Open a plan and see the days, the stops and the map.
- Tap a stop to see it on the map. Tap Directions to open Google Maps or OpenStreetMap.
- Tick stops and packing items as you go.
- Add a stop, a day or a base. A new stop gets its photo and the day gets its temperature on its own.
- Keep as many plans as you like in My trips. Export, import or share one by link.

## What it shows

- Map, Topo and Satellite layers, 3D terrain, numbered stops and day routes. Topo is a terrain map, not weather.
- A small temperature chip on each dated day: a forecast when the date is within 13 days, otherwise the typical weather of recent years, labelled as typical. It is hidden for past days and days without a located stop.
- A photo for a stop when one is saved or a clearly matching Wikimedia photo is found. Nothing is shown when no photo matches.

## Editing

Edit mode (in the menu) shows Edit, Move, Delete and GPX controls on each stop. Manage bases lets you reorder bases, and days are renumbered from 1 while every date stays as it is. Undo covers each change.

## The preset

Sardegna is the only preset: a real summer itinerary with no personal names.

## Plan with your agent

The `skill/` folder is a playbook any agent can follow. Say "draft me a plan", the agent interviews you, researches real places and writes one trip file. Open that file in the app, or host it and open `?plan=<https url of the file>`. The app is always the same, and you can edit the result by hand.

- Chat with no files: paste `skill/SKILL.md`, then describe your trip.
- Claude Code or Codex: copy the `skill/` folder into your skills location, keeping `SKILL.md`, `reference/` and `examples/` together.
- Plugin packaging for Claude Code and Codex is planned and not published yet.

`PLAN-CONTRACT.md` and `schema/trip.schema.json` describe the trip file.

## Data sources

| Need | Service | Note |
|-|-|-|
| Map tiles, 3D buildings | OpenFreeMap | attribution shown |
| Topo | OpenTopoMap | CC-BY-SA |
| Satellite | Sentinel-2 cloudless by EOX | source zoom ends at 18, higher zooms are overzoomed |
| Terrain | AWS Terrain Tiles | |
| Place search | Nominatim | one request per second, cached |
| Routes | FOSSGIS OSRM | one request per second, cached |
| Weather, elevation | Open-Meteo | free for non-commercial use, credit shown |
| Photos | Wikipedia and Wikimedia Commons | author and licence kept with each photo |

Public servers ask for light use, so the app queues and caches requests. Weather is for one point: before any mountain hike, check the local mountain forecast.

## Settings

Menu, then Settings. Advanced lets you point the app at your own Nominatim, OSRM, Open-Meteo or Wikimedia server. Endpoints must be HTTPS, except HTTP on `localhost` or `127.0.0.1`. Credentials, query strings and fragments are refused. Settings stay in this browser as `tp-providers` and never enter an exported trip. Reset restores the public defaults.

## Layout

```
index.html           page
css/                 tokens.css (one token library), app.css
js/                  app, store, mapview, geo, gpx, util, providers, live, photos, bases (ES modules)
serve.mjs            dependency-free local static server
TESTING.md           operator checklist
schema/              trip.schema.json, validate.mjs and its test
samples/sardegna.json
skill/               planning skill for agents
```

## Run and check locally

```sh
node tools/trip-planner/serve.mjs
# Open http://127.0.0.1:8766
node --test tools/trip-planner/schema/validate.test.mjs tools/trip-planner/js/*.test.mjs
```

Serve it over HTTP. Opening `index.html` as a file will not load the modules. The server binds only to `127.0.0.1`, serves this folder whatever the working directory, and refuses paths outside it. Set `PORT` to change 8766. See [TESTING.md](TESTING.md) for the manual checklist.

## Development

Public edits follow a feature branch, a reviewed pull request, passing checks and an approved merge. Keep private notes and keys out of public source.
