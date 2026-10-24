# My Trip Planner Agent Skill

A portable Agent Skill for researching and building sourced trips for My Trip Planner. The canonical package is `.agents/skills/trip-planner/`; its `SKILL.md` name and parent directory match the Agent Skills specification. The skill works as a package of instructions and references. It does not connect to or control the app, and the agent’s access to web research, files and validation tools depends on the client.

## Formats

- **JSON (`.json`)** is the complete itinerary format, schema v1. It carries the trip title and destination, bases, days, stops, source links, photos and credits, weather, packing and bookings. Use it for every full trip.
- **GPX (`.gpx`)** is limited to track and waypoint data, not a complete itinerary. The app imports track points as a separate one-day hike trip; it does not attach a GPX file to an existing stop. GPX exports also include the trip's stop waypoints. Use a separate GPX only for a real, verified track supplied or requested by the traveller.
- **Share links** are not files. `#plan=` contains compressed trip data; `?plan=` opens a hosted JSON URL. Do not host or share trips without the traveller’s request.
- **Print** opens the browser print dialog. The traveller may save a PDF, but the app does not import or export CSV, KML or PDF trip files.

Two trip samples ship in the My Trip Planner source, outside this standalone skill package: the [Sardegna preset](https://github.com/tara-assistant/workshop-public/blob/main/tools/trip-planner/samples/sardegna.json) and the [Portugal six-day illustrative demo](https://github.com/tara-assistant/workshop-public/blob/main/tools/trip-planner/samples/portugal-6-day-demo.json). Portugal's dates are examples only, and both its title and note say “Illustrative demo; not a confirmed travel plan”. Neither file is a template; do not copy its places, dates, coordinates or personal context into another trip. Keep generated files outside the installed skill package.

## Package contents

| Path | Purpose | Required |
| --- | --- | --- |
| `SKILL.md` | Procedure, format rules, evidence and safety requirements, schema-v1 contract and validation command. | Yes |
| `references/schema-cheatsheet.md` | Schema-v1 field table. | Optional |
| `references/sources.md` | Primary research sources and use rules. | Optional |
| `references/quality-checklist.md` | Final itinerary review checklist. | Optional |

Keep the `references/` directory beside `SKILL.md` when installing the full package. References use paths relative to this skill folder.

## Install and use

Download or copy this complete folder, including `references/`, into your agent client's documented skill directory as `trip-planner/`. Keep `SKILL.md` and the folder name aligned. Installation and discovery depend on the client; check its documentation and explicitly ask it to use the skill. For clients without skill discovery, provide `SKILL.md` directly, plus references when needed. No repository checkout is required to follow the self-contained schema contract; full validation uses the app schema when available.

Canonical source: [skill folder on GitHub](https://github.com/tara-assistant/workshop-public/tree/main/tools/trip-planner/.agents/skills/trip-planner). Maintain changes there and refresh installed copies from it; installed copies are not separate maintained sources.

To update an installed copy, replace its contents with the current canonical package and remove files that are no longer present. Do not edit separate copies as if they were source.

## Workflow

1. Tell the agent the destination, dates, starting point, overnight bases, pace, transport, interests, must-dos, fitness/accessibility needs and budget. The agent asks only for missing details. Real trips and drafts require traveller-confirmed startDate/endDate and a date for every day. Ask for missing dates and wait. Only when explicitly asked for an illustrative demo may you use example dates: agree them with the requester or clearly disclose the chosen dates, include all root and day dates, and mark both title and note as "Illustrative demo; not a confirmed travel plan". This exception never applies to an ordinary trip request; never substitute research dates.
2. The agent researches the trip, checks source links and coordinates, then returns one complete schema-v1 JSON file. It may return a separate GPX only for a verified track you supplied or requested.
3. Open Menu → My trips → Import JSON or GPX and choose the JSON file. A GPX import creates a separate hike trip, not an attachment to the current trip. Export JSON to back up or transfer the full trip; GPX contains waypoints and tracks only.
4. Optionally share a compressed app link or a hosted JSON URL if you asked for it. A shared link exposes the trip to whoever receives it.

For a chat without file support, save the returned raw JSON as a `.json` file. When working in the My Trip Planner repository, run the validation command in `SKILL.md` from `tools/trip-planner`. Sardegna is the only built-in preset; Portugal is a separate sample file to import manually.
