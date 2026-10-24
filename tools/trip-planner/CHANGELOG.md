# Changelog

Notable changes to My Trip Planner are recorded here. This file is also the source for release notes; do not publish separate notes that contradict it.

## Unreleased

### Added

- Added a neutral first-run screen with a dismissible in-app hint, explicit Sardegna and Portugal sample choices, and direct create, agent-skill and import paths.
- Added the My Trip Planner wordmark with a map-and-route logo and a matching project favicon.
- Added portable skill installation guidance for clients with skill discovery and for text-only handoff.
- Added the canonical Agent Skill package at `.agents/skills/trip-planner/`, with `SKILL.md` and supporting references.
- Added schema-v1 day-photo source and licence URL fields for linked photo credits.
- Added the sourced, six-day Portugal sample with explicit illustrative dates, the disclaimer “Illustrative demo; not a confirmed travel plan”, and six day photos with Commons author, licence and source links. Sardegna remains the only built-in preset; both sample JSON files are downloadable from the public app route.

### Changed

- Fresh browser profiles now start with no trip loaded; existing saved trips remain untouched, and bundled examples are added only when selected.
- Consolidated header actions into Menu, with This trip and App groups. Settings remains available without an active trip, opens separately on Agent skill each time, and returns focus to Menu on close.
- Removed the Weather settings section; automatic stop weather and Services provider endpoints remain available.
- Added canonical GitHub skill/install links, the real-date requirement and clearly labelled illustrative-demo exception, and JSON import steps in Settings.
- Made the skill and its README portable, removed app layout instructions, kept provenance in metadata, and corrected GPX import documentation to describe a separate hike trip.
- Reordered the visitor README around local use and JSON import, with local storage, online-service and backup guidance.
- Fixed SVG circle namespaces, restored visible accessible description expansion, narrowed obsolete-tip filtering to its exact diagnostic, and improved compact text contrast and touch targets.
- Replaced the personal Sardegna note with a generic sample disclaimer, preserving its dates and photos.
- Updated CI to run the current Node tests instead of the deleted bundle test.
- Renamed the displayed app and skill to My Trip Planner, kept the header fixed with a subtle tinted background and shadow, and moved the linked `© 2026 MetaEngineers Hub.` credit from the footer into Settings > About.
- Updated README, project rules and test guidance to distinguish the canonical skill source, installed copies and ignored trial output.
- Removed the retired `skill/` package and MCP server; `.agents/skills/trip-planner/` is now the single maintained skill source.
- Kept schema-v1 JSON as the complete trip format; GPX remains limited to route tracks and stop waypoints.

### Planned

- No additional bundled itinerary samples are planned; the repository contains the Sardegna preset and the separately imported Portugal demonstration sample.
