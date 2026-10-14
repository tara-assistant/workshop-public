# Trip Planner: working rules

- `skill/` is a playbook that teaches any agent to plan a trip: `SKILL.md`, optional `reference/`, one sample in `examples/`. Nothing else goes in it. No test runs, trial output or scratch files.
- Local-only testing lives in `tests/local/` (for example `tests/local/skill-trials/`). It is gitignored and never pushed. Scratch scripts, servers and screenshots start with an underscore and are also ignored.
- Committed unit tests sit beside the code they test: `schema/validate.test.mjs`, `mcp/server.test.mjs`.
- Scratch build folders named `dist-*` at the repository root are local and ignored. Only `dist/` is produced by the real Pages build, and it is ignored too.
- The app has no API keys and no Mapbox code. Do not add either.
