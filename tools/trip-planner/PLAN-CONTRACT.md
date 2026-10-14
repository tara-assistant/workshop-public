# Trip file contract, schema 1

One JSON file describes a trip. The machine-readable rules are in `schema/trip.schema.json`; `schema/validate.mjs` checks a file against them. This page says what the rules mean.

## Shape

```
Trip
  schema: 1                 required, the number 1
  id, title                 required
  destination, summary, note, startDate, endDate (YYYY-MM-DD)
  center [lng, lat], zoom   optional map start
  theme { hero, phases[] }  optional colours as #rrggbb
  coverImage                optional https url
  phases[]                  required, one per base
    id, title, subtitle, colorKey
    days[]
      dayNumber, title      required, dayNumber unique in the trip
      date, mode (walking | cycling | driving), photoUrl, photoCredit
      stops[]
        id, name, lat, lon  required, id unique in the trip
        type, time, dwell (minutes), desc, tags[]
        links[{ kind, label, url }]
        imageUrl, imageCredit
        track [[lng, lat, ele?], ...]   GPX line
        source, verified (YYYY-MM-DD), visited
      tips[], food, bookings[{ label, url }], packing[]
      weather { kind: forecast | typical, ... }
```

Stop types: sight, gem, hike, dining, cafe, swim, boat, lodging, transport.
Link kinds: map, book, hike, web, social.

## Rules

- `lat` and `lon` are the real public entrance, harbour or trailhead, checked on a map. Never guessed.
- Weekdays are not stored. The app works them out from `date`.
- `dwell` is a suggested stay, not a promise.
- Boat transfers and technical hikes are never inferred from road routing. The app draws no road route over a boat leg.
- Photos must show the actual place and come from a source that allows reuse. Fill `imageCredit` or `photoCredit` with author and licence. If you cannot verify a photo, leave it out.
- No personal names, home addresses or booking confirmation numbers in a trip file.
- Unknown fields are kept, so a newer agent's extra data survives an older viewer.
- Links must be http or https.

## Checking a file

```sh
node --input-type=module -e "import {validateTrip,formatErrors} from './schema/validate.mjs'; import fs from 'fs'; const s=JSON.parse(fs.readFileSync('schema/trip.schema.json')); const t=JSON.parse(fs.readFileSync(process.argv[1])); const e=validateTrip(t,s); console.log(e.length?formatErrors(e):'valid')" trip.json
```

Run it from `tools/trip-planner`.
