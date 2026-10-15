# Trip Planner: working rules

- `skill/` is a playbook that teaches any agent to plan a trip: `SKILL.md`, optional `reference/`, one sample in `examples/`. Nothing else goes in it. No test runs, trial output or scratch files.
- One ignored scratchpad holds all local work: `tests/local/`. It is gitignored and never pushed. Layout:
  - `tests/local/scripts/` test, probe and server scripts (`_serve.py` on port 8766, `_flow.py`, `_shot.py`, `_verify.py`). Run them from `tools/trip-planner`, for example `python tests/local/scripts/_flow.py`.
  - `tests/local/patches/` one-off patch scripts. Keep each one after running it so it can be referenced later. Never delete a patch script.
  - `tests/local/evidence/` screenshots, reports and result logs.
  - `tests/local/skill-trials/` generated trial itineraries.
  - `tests/local/README.md` repeats this layout.
- Only production code, committed unit tests and docs are pushed. Do not leave scripts, screenshots or trial output at the `tools/trip-planner` root.
- Committed unit tests sit beside the code they test: `schema/validate.test.mjs`, `mcp/server.test.mjs`, `js/*.test.mjs`.
- Scratch build folders named `dist-*` at the repository root are local and ignored. Only `dist/` is produced by the real Pages build, and it is ignored too.
- The app has no API keys and no Mapbox code. Do not add either.
