# Trip Planner

Canonical public source: `tools/trip-planner/` in the public Git repository. There is no private development copy. Public route: `/trip-planner/`.

This browser app organizes sourced stops into multi-day plans, visit and preparation checks, route choices, and practical travel notes. The public bundle uses visitor-supplied Mapbox public tokens stored only in that visitor's browser. Requests go directly to Mapbox; no repository key is read or injected.

## Build and checks

Run from the public repository root:

```sh
python -B tools/trip-planner/test_build_bundle.py
node tools/app-hub/build.mjs --out tools/app-hub/staging/<fresh-name>
node tools/app-hub/check-public.mjs tools/app-hub/staging/<fresh-name>
```

The App Hub calls `build_bundle.py`, verifies the seven browser files, and combines them with the portfolio and other apps. Do not deploy the raw source in place of this transformation. The builder refuses existing output and protects legacy preview and distribution paths.

Windows may skip five symlink tests when symlink privileges are unavailable. Offline browser checks verify layout and dialogs but do not verify Mapbox network behavior.

## Development

Public edits follow a feature branch, reviewed pull request, passing checks, and approved merge. Keep one canonical source here. Private notes and secrets must not enter public source or output.
