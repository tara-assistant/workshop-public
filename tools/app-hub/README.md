# Shared App Hub

This is the canonical public App Hub and shared presentation source. It builds Jihad's public portfolio, Tara's page, and approved app routes. The same card module and styles serve the protected private hub; there is no second common UI source tree.

## Inputs

- `projects.json`: public catalog, categorized roots, and exact browser-file allowlists.
- `index.html` and `tara.html`: public portfolio templates.
- `assets/app-cards.mjs`, `app-cards.css`, `app-hub.css`, and `app-hub-nav.css`: canonical shared source.
- `tools/trip-planner/`, `diagnostics/field-atlas/`, and `games/snake/`: public app roots relative to the repository.

Trip Planner uses its reviewed visitor-key transformation. Public builders never read private catalogs or app source.

## Build and checks

From the public repository root:

```sh
node --test tools/app-hub/release-inputs.test.mjs tools/app-hub/build-pages.test.mjs
python -B tools/trip-planner/test_build_bundle.py
node tools/app-hub/build-pages.mjs
```

`build-pages.mjs` wraps the guarded content builder and emits a fresh `dist/`. The current allowlist contains 20 content files plus generated `_headers`. The final output is checked against that exact set; it is never the source checkout. The wrapper gives the four content-hashed shared assets explicit private-origin CORS, correct CSS/module MIME types, immutable caching, and nosniff headers. The manifest is served with revalidation.

To verify interface content offline:

```sh
node tools/app-hub/build.mjs --out tools/app-hub/staging/<fresh-name>
node tools/app-hub/check-public.mjs tools/app-hub/staging/<fresh-name>
```

The content checker expects the content-only 20-file candidate, not the Pages control file. It checks 320, 375, and 1280 pixel layouts, routes, accessible controls, Trip Planner dialogs, private navigation, and simulated Field Atlas map controls. Set `PLAYWRIGHT_MODULE` if needed. Offline simulation does not prove live providers, headers, login, or actual Telegram clients. Generated outputs are ignored and removed after verification.

## Private consumption and pin updates

The private repository holds minimal bootstrap/catalog/configuration/build/test glue, not copied shared UI. Its catalog and app pages stay on the protected private origin. It references reviewed shared assets by content-hashed URLs and SHA-384 integrity values.

Review source changes, build a public candidate, inspect its manifest and bytes, then deliberately update the private pins. The private builder requires exact manifest agreement and matching hashes. Never bypass the check or automatically replace pins from the network. Publish verified public asset URLs before a private consumer relies on new pins.

The Private apps link opens `https://private.projects.metaengineershub.com/`. A simulated Telegram user tap calls `WebApp.openLink()`. Neither SDK presence nor unverified launch data is authentication. Access must protect private custom, production, and preview hosts before content publication. Check module integrity support in the actual target Telegram webviews; do not silently fall back to unverified modules.

## Current hosting migration

The new `workshop-public` Pages project is connected to `workshop-public`, production branch `main`, using `build-pages.mjs` and `dist`. Deployment remains paused until checks and review pass. The custom domain remains on the legacy release until cutover. Local builds and API configuration readback are not live deployment evidence.

Public source changes use checked and reviewed pull requests followed by approved merges. Original work is copyright © 2026 Jihad Karaki; third-party notices remain separate.
