# Trip Planner skill

A set of instructions that lets any AI agent plan a trip and hand it back in the one JSON format the Trip Planner app opens. It works with Claude, Codex, Gemini, ChatGPT, local open-source models and anything else that can read text. No vendor, account or API key is required.

## What is in this folder

| Path | What it is | Needed? |
| --- | --- | --- |
| `SKILL.md` | The skill itself: the whole procedure plus the schema rules in one file. | Yes. This is the only required file. |
| `reference/schema-cheatsheet.md` | Full field table for the trip format. | Optional. Helps weaker models avoid format mistakes. |
| `reference/sources.md` | Where to research places, routes, weather and photos, with each source's usage rules. | Optional. Read it when you research. |
| `reference/quality-checklist.md` | A checklist to run on a finished trip before delivering it. | Optional. |
| `examples/dolomites-3-day.json` | One finished, valid trip, shown only so you can see what good output looks like. It is an example, not a template: never copy its places, text, dates or coordinates into a different trip. | Optional. |

The `reference/` files are help for the agent while it works. The `examples/` file is a sample of the result. Neither is part of the procedure.

## Use it with any agent

1. **A chat with no files** (any chatbot or local model): paste all of `SKILL.md`, then describe your trip. Paste the `reference/` files as well if the model has room.
2. **An agent that supports skills or instruction files** (Claude, Codex, and others): copy this whole folder into that tool's documented skills or instructions location, keeping `SKILL.md`, `reference/` and `examples/` together. For example `.claude/skills/trip-planner/` for Claude, or reference `SKILL.md` from `AGENTS.md` for tools that read it.
3. **As a plugin** (Claude Code, Codex): packaging is planned and not published yet.

The agent returns one `.json` file. Import it in the app, or host it at a public HTTPS address and open `<app-url>?plan=<percent-encoded-https-json-url>`.

## Check the result

Validate from `tools/trip-planner` with the Node command in `SKILL.md` (no installation step). Replace the example filename in that command with your trip file.

The example trip has summer activities that depend on conditions, so recheck anything you reuse for your own dates.
