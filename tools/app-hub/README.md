# Shared App Hub

This is the canonical public App Hub and shared presentation source: an experiment-first workshop for Jihad Karaki and Tara, his AI assistant and collaborator. The three approved app routes appear before their combined profile, credentials, experience, and work/docs/social links. Trip Planner and Snake Arcade are working browser tools; Field Atlas is a prototype demo with synthetic readings. Catalog status “Live” means available to try, not an operational deployment claim. The same card module and styles serve the protected private hub; there is no second common UI source tree.

## Inputs

- `projects.json`: public catalog, categorized roots, and exact browser-file allowlists.
- `index.html`: shared workshop home, with one Jihad + Tara profile at `/#profile`.
- `tara.html`: compatibility redirect for `/tara/`, with script, meta refresh, and a manual link to `/#profile`.
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

`build-pages.mjs` wraps the guarded content builder and emits a fresh `dist/`. The current allowlist contains 20 content files plus generated `_headers`. The final output is checked against that exact set; it is never the source checkout. The wrapper gives only the four exact content-hashed shared assets anonymous all-origin CORS (`Access-Control-Allow-Origin: *`), correct CSS/module MIME types, immutable caching, and nosniff headers. These public assets can serve production and protected private preview hosts without sending credentials. No wildcard route, credential allowance, catalog CORS, or Access policy change is added. The manifest is served with revalidation.

To verify interface content offline:

```sh
node tools/app-hub/build.mjs --out tools/app-hub/staging/<fresh-name>
node tools/app-hub/check-public.mjs tools/app-hub/staging/<fresh-name>
```

The content checker expects the content-only 20-file candidate, not the Pages control file. It checks 320, 375, and 1280 pixel layouts, routes, accessible controls, matching cards, the shared profile, absence of private addresses/navigation in source and output, Trip Planner dialogs, and simulated Field Atlas map controls. DOM assertions require all eleven visible app/work/docs/social links to use `_blank` with `noopener noreferrer`; section anchors stay local. Ordinary and SDK-only modes also exercise tabs with no opener. The inline SVG workshop favicon decodes without adding a file to the allowlist. `/tara/` redirects with JavaScript enabled or disabled. Full-page screenshots plus 375×812 and 1280×900 home viewport screenshots are saved in a fresh temporary directory printed by the checker. Set `PLAYWRIGHT_MODULE` if needed. Offline simulation does not prove live providers, headers, login, or actual Telegram clients. Candidate and screenshot artifacts can be retained for operator review; staging is ignored.

## Private consumption and pin updates

The private repository holds minimal bootstrap/catalog/configuration/build/test glue, not copied shared UI. Its catalog and app pages stay on the protected private origin. It references reviewed shared assets by content-hashed URLs and SHA-384 integrity values.

Review source changes, build a public candidate, inspect its manifest and bytes, then deliberately update the private pins. The private builder requires exact manifest agreement and matching hashes. Never bypass the check or automatically replace pins from the network. Publish verified public asset URLs before a private consumer relies on new pins.

The public home has no private entry, address, hidden link, or conditional redirect. In a simulated Telegram launch, visible public app/work/docs/social links call `WebApp.openLink()`; section anchors remain within the workshop. Ordinary browsers and SDK-only loads use the safe anchor behavior. The public Mini App can browse this workshop, but access to the protected workshop needs a separate protected Telegram entry configured by the operator. This redesign does not inspect or change the bot's actual app/menu configuration and does not verify a real Telegram client. Neither SDK presence nor unverified launch data is authentication. Access must protect private custom, production, and preview hosts before content publication. Check module integrity support in the actual target Telegram webviews; do not silently fall back to unverified modules.

## Current hosting migration

The new `workshop-public` Pages project is connected to `tara-assistant/workshop-public`, production branch `main`, using build command `node tools/app-hub/build-pages.mjs` and output `dist`. Automatic production deployments are enabled for `main`; preview deployments remain disabled. The custom domain remains on the legacy release until the new production output is live, verified, and the domain is moved. Local builds and Pages configuration readback alone are not live-deployment evidence.

Public source changes use checked and reviewed pull requests followed by approved merges. Original work is copyright © 2026 Jihad Karaki; third-party notices remain separate.
