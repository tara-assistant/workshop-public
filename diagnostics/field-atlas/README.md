# Field Atlas

Field Atlas is a public browser demo for railway and rotating-machine vibration telemetry. Readings, warning states, and spectra are synthetic illustrations, not real monitoring or maintenance advice. Canonical source: `diagnostics/field-atlas/` in the public Git repository.

## Map layers

- Standard: OpenStreetMap raster tiles with OSM attribution.
- Satellite: NASA GIBS daily MODIS Terra imagery, using a date three days behind UTC for processing time.
- Topographic: OpenTopoMap tiles with provider attribution.
- 3D terrain: MapLibre rendering with public AWS Terrain Tiles elevation data.

Providers receive browser tile requests for the viewed area. No application API key, server proxy, analytics, or account is used. Inspection marks stay in browser storage. Offline checks verify control behavior with a simulated map, not live tile availability.

## Build

The catalog at `tools/app-hub/projects.json` allowlists `index.html` and `app.js` for `/field-atlas/`. Use the commands in [Public App Hub](../../tools/app-hub/README.md) from the public repository root. Develop changes on a branch, review through a pull request, and merge only after checks and approval. No private checkout is used.
