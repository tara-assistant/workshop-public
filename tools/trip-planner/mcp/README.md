# Trip Planner local MCP connector

Use your own agent to read and edit schema v1 trip JSON files on your machine. Requires Node.js 18 or newer. There are no npm dependencies, API keys or `.env` files to load.

From `tools/trip-planner`, run:

```sh
node mcp/server.mjs --dir /absolute/path/to/trips
```

Without `--dir`, the folder is `TRIP_DIR` if set, otherwise `./trips` in the process working directory. The server creates that folder if needed. `--dir` takes priority over `TRIP_DIR`. Use an absolute directory in client config because clients may start in different working directories.

Each file is `<id>.json`. Trip ids allow 1 to 80 lowercase letters, digits, hyphens and underscores. The JSON id must match the filename. Saves validate the full trip with `schema/validate.mjs`, then write a temporary file and rename it. Invalid saves return the complete error list and keep the existing file. Unknown fields survive saves and edits. Concurrent tool edits to one trip run in order. External editors do not share that lock, so avoid editing the same file in two writers at once. Linked files are refused.

## Client config

Replace `/absolute/path/to/trip-planner` and `/absolute/path/to/trips` below. On Windows, forward slashes work, for example `C:/Projects/trip-planner/mcp/server.mjs` and `C:/Trips`. If Node is not on the client's PATH, use its absolute executable path.

Claude Desktop, in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "trip-planner": {
      "command": "node",
      "args": ["/absolute/path/to/trip-planner/mcp/server.mjs", "--dir", "/absolute/path/to/trips"],
      "env": { "TRIP_MCP_PORT": "4789" }
    }
  }
}
```

Codex CLI, in `~/.codex/config.toml`:

```toml
[mcp_servers.trip-planner]
command = "node"
args = ["/absolute/path/to/trip-planner/mcp/server.mjs", "--dir", "/absolute/path/to/trips"]

[mcp_servers.trip-planner.env]
TRIP_MCP_PORT = "4789"
```

The config follows the [official Codex MCP documentation](https://developers.openai.com/codex/mcp/). Restart the client after changing its config.

A generic stdio MCP client spawns the same command and arguments, with piped stdin and stdout:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/trip-planner/mcp/server.mjs", "--dir", "/absolute/path/to/trips"],
  "env": { "TRIP_MCP_PORT": "4789" },
  "transport": "stdio"
}
```

This is a launch specification, not a universal config file format. Exchange JSON-RPC 2.0 objects, one per line. Send `initialize`, then `notifications/initialized`. The server supports `tools/list`, `tools/call` and `ping`. It echoes a valid date string protocol version from the client, otherwise uses `2025-06-18`. Notifications have no response. Stdout contains only protocol messages; logs go to stderr.

## Connect the web app

Keep the agent client and its connector running. In the web app, open **Settings**, choose **Connect local agent**, and enter `http://127.0.0.1:4789`. The browser integration uses the read endpoints below to poll for updates or subscribe to events. These controls require the web app's local connector UI; this folder supplies the server only.

| HTTP request | Response |
| --- | --- |
| `GET /health` | `{ "ok": true, "service": "TripPlannerMCP", "version": "1.0.0" }` |
| `GET /trips` | Array of ids, titles, dates and `updatedAt` file times |
| `GET /trips/<id>` | Complete trip JSON |
| `GET /events` | Server-sent `message` events with `{ "id": "...", "updatedAt": "..." }` |

File changes from tools and external editors produce debounced events. Deletions also produce an event; a later GET returns 404. Poll `/trips` and then fetch the selected trip when its `updatedAt` changes. SSE clients receive heartbeats. Invalid JSON files are skipped in the list and logged to stderr, and reading them returns an error.

Set `TRIP_MCP_PORT` to a different port if 4789 is busy. `TRIP_MCP_PORT=0` disables HTTP. A busy port is reported on stderr and leaves stdio tools working. Only one connector should own a given port.

## Tools

| Tool | Arguments and action |
| --- | --- |
| `list_trips` | No arguments. List saved trips. |
| `get_trip` | `id`. Read a trip. |
| `validate_trip` | `trip`. Return `{valid, errors, warnings}` without saving. |
| `save_trip` | `trip`. Validate and save, returning `{trip, warnings}`. |
| `delete_trip` | `id`. Delete the file. |
| `add_stop` | `tripId`, `dayNumber`, `stop`, optional `index`. Insert at a zero based index or append. |
| `update_stop` | `tripId`, `stopId`, `patch`. Merge top level fields; replace nested objects and arrays. |
| `remove_stop` | `tripId`, `stopId`. Remove one stop. |
| `add_day` | `tripId`, `phaseId`, `day`. Append a day to a phase. |
| `search_place` | `query`, optional `limit` from 1 to 10, default 5. Search Nominatim. |
| `route_between` | `points` as `[[lon,lat],...]`, `mode` as `walking`, `cycling` or `driving`. Request an OSRM route. |
| `get_weather` | `lat`, `lon`, optional `date` in `YYYY-MM-DD`. Return forecast or typical weather. |

Every tool description repeats these rules: coordinates are the real public entrance or trailhead. Never invent places or coordinates; verify with `search_place`. Boat transfers and technical hikes are never inferred from road routing. Mountain forecast is one grid point. Images must be real photos of the actual place with credit. No personal data in trip files. These are instructions for the agent; JSON validation cannot prove access, photo authenticity or absence of personal data.

Stop ids and day numbers can be duplicated in existing trips, which the validator reports as warnings. Tools refuse edits with an ambiguous target. Fix duplicates with a full trip save. Failed edits leave the file untouched.

## Network services

Search uses [Nominatim](https://operations.osmfoundation.org/policies/nominatim/), with a queue capped at one request per second. Results are cached in memory for 24 hours, up to 100 queries, and identical pending searches share one request. Search coordinates may be the place center; verify the public entrance yourself. Place results include OpenStreetMap source links and credit.

Routing uses `https://router.project-osrm.org`, also queued at one request per second. Results include distances in meters, durations in seconds and GeoJSON. The [OSRM profile is fixed by the server's prepared data](https://project-osrm.org/docs/v5.24.0/api/#general-options); a mode in a URL does not guarantee a matching route. The connector checks step modes and refuses mismatches or ferry steps instead of relabeling a car route as a walk or cycle. This endpoint may therefore refuse walking or cycling. Road routes cannot supply boat transfers or technical hiking tracks.

Weather uses [Open-Meteo forecast](https://open-meteo.com/en/docs) for today through 13 days ahead, based on today's UTC date. Other dates use the [archive](https://open-meteo.com/en/docs/historical-weather-api) for up to three same-date samples in years before both the requested year and current year. February 29 uses leap years only. Typical values are sample means, not forecasts or a long term climate normal. Typical `rainChance` is the percentage of sampled days with at least 0.1 mm rain. Results carry `kind: "forecast"` or `kind: "typical"`, sources, sample dates and warnings for unavailable samples. Mountain weather is one grid point, not conditions across an entire hike.

All requests use `User-Agent: TripPlannerMCP/1.0 (local)` and a 15 second timeout. There are no automatic retries. Service errors become MCP tool errors. Set `TRIP_MCP_OFFLINE=1` to disable all three network tools. It does not disable trip storage or local HTTP.

## Security

HTTP binds only to `127.0.0.1` and cannot edit files. CORS echoes only `http://localhost:<port>`, `http://127.0.0.1:<port>` or `https://projects.metaengineershub.com`. Other origins receive no allow-origin header. Allowed origins can make GET preflight requests, including private network preflight. Use a local browser tab if your browser blocks a hosted HTTPS page from reading local HTTP.

There is no authentication or TLS. Other processes on your machine can read HTTP; trusted MCP clients can edit and delete files. CORS controls browser access, not local process access. Do not expose the port through a proxy or tunnel. Put only trip plans in this folder, with no personal data. Search text and coordinates go to public services when network tools are used. No trip JSON is uploaded by the connector.

## Tests

From `tools/trip-planner`:

```sh
node --test mcp/server.test.mjs
```

Tests use offline child servers, localhost HTTP and mocked service responses. Temporary trip folders are created inside `mcp/` and removed after each test. No public network calls are made.
