# Trip Planner skill

Copy this entire folder to `.claude/skills/trip-planner/` in a Claude project, or `~/.claude/skills/trip-planner/` for personal use.
Keep `SKILL.md`, `reference/` and `examples/` together.
For other skill-capable agents, place the folder in their documented skills directory.
For any chat agent, paste all of `SKILL.md`, then give your travel request.
Paste the reference files too when you want the full schema table and source notes.
The core playbook includes enough schema rules to work by itself.
Import the returned JSON file into Trip Planner, or open `?plan=<percent-encoded HTTPS JSON URL>`.
The local MCP connector is optional level 2 for lookup, routing, validation and requested saves or edits.
The undated Dolomites example has conditional summer activities; recheck conditions for your dates.
Validate from `tools/trip-planner` using the Node command in `SKILL.md`; no installation step is required for that validator.
