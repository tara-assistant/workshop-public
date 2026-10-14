# Schema v1 field table

Authority: `schema/trip.schema.json`, checked 2026-10-14. `validateTrip(trip, schema)` returns an array of errors. `lintTrip(trip)` returns warnings for repeated day numbers, repeated stop ids and 0,0 pins. Check unique phase ids separately. Unknown fields are accepted by the validator, but these documented fields are the portable contract.

`*` means required. All other fields may be omitted, not set to `null`. Length limits are characters. Prefer HTTPS even though the schema accepts HTTP. Dates are real calendar dates in `YYYY-MM-DD` form.

| Object | Fields | Type and allowed values |
| --- | --- | --- |
| Trip | `schema`* | Constant integer `1` |
| Trip | `id`*, `title`* | Nonempty strings; max 80, 160 |
| Trip | `destination`, `summary`, `note` | Strings; max 160, 1200, 400 |
| Trip | `startDate`, `endDate` | ISO date strings; order and consistency checked manually |
| Trip | `center` | Exactly `[lon, lat]`; numbers in [-180, 180] and [-85, 85] |
| Trip | `zoom` | Number from 1 to 18 |
| Trip | `coverImage` | URL string; no paired credit field, so omit in this skill |
| Trip | `theme` | Object with optional `hero` color and `phases` color array, at most 12 |
| Trip | `phases`* | Array of 1 to 40 phase objects |
| Phase | `id`*, `title`* | Nonempty strings; title max 120 |
| Phase | `subtitle` | String, max 240; use for overnight base |
| Phase | `colorKey` | Integer from 1 to 12 |
| Phase | `days`* | Array of day objects, at most 60; populate at least one useful day |
| Day | `dayNumber`*, `title`* | Integer >= 1; nonempty string, max 160 |
| Day | `date` | ISO date string |
| Day | `mode` | `walking`, `cycling`, `driving`; describe boats and lifts in tips |
| Day | `stops`* | Array of stop objects, at most 60; populate useful stops |
| Day | `photoUrl`, `photoCredit` | URL string; credit string max 200, author and licence |
| Day | `tips`, `packing` | Arrays of strings; each max 600, 160 respectively |
| Day | `food` | String, max 600 |
| Day | `bookings` | Array of booking objects |
| Day | `weather` | Weather object |
| Stop | `id`*, `name`* | Nonempty strings; name max 160 |
| Stop | `lat`*, `lon`* | Numbers; [-85, 85], [-180, 180] respectively |
| Stop | `type` | `sight`, `gem`, `hike`, `dining`, `cafe`, `swim`, `boat`, `lodging`, `transport` |
| Stop | `time`, `dwell` | String max 40; suggested minutes, integer from 0 to 1440 |
| Stop | `desc` | String, max 1200; include verification limits |
| Stop | `tags` | Array of strings, each max 40 |
| Stop | `links` | Array of link objects |
| Stop | `imageUrl`, `imageCredit` | URL string; credit string max 200, author and licence |
| Stop | `track` | Array, max 20000 points; each an array of 2 or 3 numbers. Schema does not specify coordinate order, units or CRS. Omit unless producer and app conventions are confirmed; never infer a trail from routing |
| Stop | `source`, `verified` | String max 400; ISO date of actual check |
| Stop | `visited` | Boolean; omit or use `false` for a new plan |
| Link | `url`* | URL string |
| Link | `kind`, `label` | `map`, `book`, `hike`, `web`, `social`; string max 80 |
| Booking | `label`*, `url` | String max 200; optional URL string. No confirmation numbers |
| Weather | `kind` | `forecast`, `typical` |
| Weather | `fetchedAt`, `sunrise`, `sunset` | Strings; use ISO timestamp and local ISO times with timezone noted in tips |
| Weather | `tMax`, `tMin`, `rainChance`, `windMax` | Numbers; skill convention: Celsius, Celsius, percent 0 to 100, km/h >= 0. Schema does not enforce units or probability bounds |
| Shared | URL | String starting `http://` or `https://`, max 2000. Skill photos must use HTTPS |
| Shared | Color | String matching `#RRGGBB`, hex digits only |

The schema allows empty day and stop arrays, empty booking labels and optional weather fields. A useful itinerary should avoid empty days, empty labels and weather without a stated kind or source. No native fields exist for route legs, difficulty, elevation gain, opening hours, admission prices or weather provenance. Put sourced details in `desc`, `source`, `links` and `tips`, within their limits. A `verified` date certifies only the checks described alongside it.
