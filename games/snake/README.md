# Snake

A responsive browser game for phone and PC. Canonical source: `games/snake/` in the public Git repository. Public route: `/snake/`.

## Controls

Use arrow keys or WASD on PC, direction buttons or board swipes on mobile. Space pauses or resumes. Fullscreen is supported where allowed by the browser. The game pauses when hidden.

The board adjusts to viewport dimensions and mobile safe areas. The game supports replay, optional device vibration, and a local high score under `snake-best`. No account or API key is required.

## Build and workflow

The catalog at `tools/app-hub/projects.json` allowlists `index.html`, `styles.css`, and `game.js`. Use [Public App Hub](../../tools/app-hub/README.md) for build and checks. There is no private source dependency. Develop on a branch, review through a pull request, and merge only after checks and approval.

## History

- 2026-08-25: Phone and PC support confirmed.
- 2026-08-31: Added neon arcade styling, responsive sizing, fullscreen, visibility pause, touch controls, vibration, and replay.
- 2026-09-23: Classified as a completed public project; public source retained.
