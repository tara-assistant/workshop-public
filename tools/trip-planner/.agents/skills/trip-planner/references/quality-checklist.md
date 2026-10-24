# Before delivery

- [ ] Parse the file as strict JSON; numeric `schema` is `1`; run `validateTrip` with the actual schema and get zero errors. If no tools are available, state self-check only in `note`.
- [ ] Run `lintTrip`, resolve warnings, and check unique trip, phase and stop ids and increasing, unique day numbers. Repeat visits need different stop ids.
- [ ] Check types, enums, character limits, array limits, root start/end dates, every day date and date order. Require confirmed real dates except for an explicitly requested illustrative demo with disclosed example dates and clear title/note labels. Omit unknown optional values instead of `null`.
- [ ] Verify each place exists and its pin matches the public entrance, harbour, lift access or trailhead. Check plausible regional coordinates and lon/lat order for `center`. A nonzero pin alone is insufficient.
- [ ] Keep all checked source links, actual ISO check dates and research provenance in source/links metadata, outside traveller prose. Explain the scope of `verified`; label unchecked hours, prices, access and conditions explicitly.
- [ ] Check opening hours and last entry, lift or sailing times for the intended date. If dates or schedules are unknown, make dependent visits conditional and omit invented times and prices.
- [ ] Route legs with the right mode; include starting base, base transfers, returns, parking, queues and delay buffers. Label unavailable routing. Do not derive boats, lift rides or technical hikes from road routing.
- [ ] Keep driving plus activity near or below 9 hours per day. Include meals, water, shade and rest breaks. Cut stops when waits or transfers make the day too long. Treat `dwell` as a suggestion.
- [ ] Match hiking distance, climb and exposure to experience; check closures, mountain forecasts, snow and relevant avalanche advice. Include daylight, turnaround time, equipment and a lower-risk alternative. Never promise safety from a map.
- [ ] Check boat operator, harbour, schedule, last return, life jackets and weather cancellation policy. Respect park, swimming, road and seasonal restrictions.
- [ ] Label weather as `forecast` or sourced `typical`; record point, dates, fetch time, timezone, units and attribution. Keep point/retrieval provenance in source/links metadata; give concise actionable advice to check the local mountain forecast before hiking.
- [ ] Use a verified actual-place photo only when available. For each day photo, verify an HTTPS image URL, author, licence, Commons source page and exact licence page, then fill `photoUrl`, `photoCredit`, `photoSourceUrl` and `photoLicenseUrl`. For a stop image, use `imageUrl`/`imageCredit` and include source and licence pages in `links`. Respect reuse terms; omit unverified images.
- [ ] Remove traveller names, home addresses, private contacts, confirmation numbers and signed booking URLs. Keep author names only for photo attribution.
- [ ] Deliver the whole validated trip as raw JSON or a `.json` file. For `?plan=`, use a percent-encoded HTTPS URL returning JSON with suitable cross-origin access.

- [ ] Before using a photo, open its Commons file page and verify the exact place, author and licence. For a day photo, fill both linked URL fields; for a stop image, add source and licence pages as links. Do not use Pexels or Google Maps user photos.
