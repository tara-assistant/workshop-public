# Public Workshop

This independent repository holds approved public source. The sibling private repository has separate source and history and is not a public build dependency.

## Layout

```text
public/
├── .github/workflows/public-checks.yml
├── .node-version
├── .python-version
├── diagnostics/field-atlas/
├── games/snake/
├── tools/app-hub/
├── tools/trip-planner/
├── .gitignore
├── LICENSE
└── README.md
```

There is no projects wrapper or root generated website copy. The shared Jihad + Tara workshop home and App Hub assets live in `tools/app-hub/`. Tools and experiments come first; one combined profile, credentials, experience, and work/docs/social links follow. `/tara/` redirects to `/#profile`, including without JavaScript. Each app has one categorized source root.

## Build and checks

Use Node.js 22 and Python 3.12, matching GitHub CI. Repository-root `.node-version` and `.python-version` select these versions for Cloudflare Pages builds. The build uses Node's native fetch and modern Python path handling; do not rely on older defaults. Cloudflare documents these version files in its [build image reference](https://developers.cloudflare.com/pages/configuration/build-image/). Actual build logs must confirm the selected versions before release.

Run from this repository root:

```sh
node --test tools/app-hub/release-inputs.test.mjs tools/app-hub/build-pages.test.mjs
python -B tools/trip-planner/test_build_bundle.py
node tools/app-hub/build-pages.mjs
```

The Pages entry point builds a new `dist/` with exactly the public catalog's allowed browser files, pinned shared UI assets, and generated `_headers`. The current catalog produces 21 deployment files. It rejects existing output, links, unsafe paths, and common credential patterns. Public builds never read private source.

For offline browser checks, build a content-only candidate first:

```sh
node tools/app-hub/build.mjs --out tools/app-hub/staging/<fresh-name>
node tools/app-hub/check-public.mjs tools/app-hub/staging/<fresh-name>
```

Set `PLAYWRIGHT_MODULE` only when needed. These checks cover the exact 20-file content allowlist, shared profile/redirect, inline favicon, safe new-tab app/work/docs/social links, local section anchors, absence of private addresses/navigation, and controls at 320/375/1280 pixels. Trip Planner and Snake Arcade are working browser tools; Field Atlas remains a prototype with synthetic data. The checker saves fresh screenshots, including home views at 375×812 and 1280×900, and prints their paths. These checks do not verify live hosting headers, login, or real Telegram clients. Ignored candidates and temporary screenshots can be retained for operator review.

## Shared UI and privacy

One canonical card renderer and stylesheet set serve public and protected private views. The private repository contains only its bootstrap, catalog, configuration, builder, and checks. It consumes reviewed content-hashed public assets with SHA-384 pins and reads its own protected same-origin catalog. Public pages never contain private app metadata, hostnames, or navigation links. A protected Telegram entry must be configured separately from the public Mini App; this redesign leaves actual bot app/menu settings untouched. Simulated launches open visible public destinations through `WebApp.openLink()` and keep section anchors local.

Only the four exact pinned shared asset URLs receive `Access-Control-Allow-Origin: *`. These are public CSS/module bytes fetched without credentials, so production and protected private previews can use them without an origin-specific copy. No wildcard route, credential permission, private catalog CORS, or Access policy change is introduced. MIME types and immutable cache headers are generated. The public manifest is revalidated rather than cached indefinitely. Actual hosting headers and Telegram webview integrity compatibility still need live verification.

## Releases and hosting

Public changes follow feature branches, checked and reviewed pull requests, and approved merges. GitHub checks validate the input boundary, visitor-key transformation, headers, and complete bundle allowlist. Publishing source to a review branch is not a production deployment.

The new `workshop-public` Pages project connects to `tara-assistant/workshop-public`, production branch `main`, build command `node tools/app-hub/build-pages.mjs`, and output `dist`. Automatic deployments are paused during migration. The existing custom domain still serves the legacy `workshop` Pages release until the new output is verified and the domain is moved. The legacy project remains intact with deployment paused; it must not compete for future releases.

Move approved original public source here and remove its private copy through a reviewed private commit and push. Local deletion alone does not update the remote or erase historical commits. Do not force-push or rewrite history without explicit approval.

Public apps request visitors' own browser-safe keys and store them only in their browsers. Never bundle server keys, environment secrets, private research, or personal files.

Original work is copyright © 2026 Jihad Karaki and licensed under the MIT License in `LICENSE`. Third-party notices and terms remain separate.
