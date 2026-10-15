# Before delivery

- [ ] Parse the file as strict JSON; numeric `schema` is `1`; run `validateTrip` with the actual schema and get zero errors. If no tools are available, state self-check only in `note`.
- [ ] Run `lintTrip`, resolve warnings, and check unique trip, phase and stop ids and increasing, unique day numbers. Repeat visits need different stop ids.
- [ ] Check types, enums, character limits, array limits, real calendar dates and date order. Omit unknown optional values instead of `null`.
- [ ] Verify each place exists and its pin matches the public entrance, harbour, lift access or trailhead. Check plausible regional coordinates and lon/lat order for `center`. A nonzero pin alone is insufficient.
- [ ] Record checked source links and the actual ISO check date. Explain the scope of `verified`; label unchecked hours, prices, access and conditions explicitly.
- [ ] Check opening hours and last entry, lift or sailing times for the intended date. If dates or schedules are unknown, make dependent visits conditional and omit invented times and prices.
- [ ] Route legs with the right mode; include starting base, base transfers, returns, parking, queues and delay buffers. Label unavailable routing. Do not derive boats, lift rides or technical hikes from road routing.
- [ ] Keep driving plus activity near or below 9 hours per day. Include meals, water, shade and rest breaks. Cut stops when waits or transfers make the day too long. Treat `dwell` as a suggestion.
- [ ] Match hiking distance, climb and exposure to experience; check closures, mountain forecasts, snow and relevant avalanche advice. Include daylight, turnaround time, equipment and a lower-risk alternative. Never promise safety from a map.
- [ ] Check boat operator, harbour, schedule, last return, life jackets and weather cancellation policy. Respect park, swimming, road and seasonal restrictions.
- [ ] Label weather as `forecast` or sourced `typical`; record point, dates, fetch time, timezone, units and attribution. Explain the single-grid-point mountain limitation and link the local mountain forecast before every hike.
- [ ] Use one verified actual-place photo per stop or day when available. Every photo has an HTTPS file URL, author, licence and file-page source; respect reuse terms. Omit unverified images and paired credits.
- [ ] Remove traveller names, home addresses, private contacts, confirmation numbers and signed booking URLs. Keep author names only for photo attribution.
- [ ] Deliver the whole validated trip as raw JSON or a `.json` file. For `?plan=`, use a percent-encoded HTTPS URL returning JSON with suitable cross-origin access. For MCP edits, validate the resulting whole trip and confirm a requested save succeeded.

- [ ] For find_stop_photo results, inspect sourceUrl, verify the actual stop and license, then save one imageUrl and imageCredit with update_stop. Google Maps photos are not used because there is no keyless route.
