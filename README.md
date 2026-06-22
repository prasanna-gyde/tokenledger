# TokenLedger

Track token usage by developer-labeled work segment across AI coding agents.

TokenLedger wraps your AI coding agent (Claude Code in this release) and answers the
question session-level totals can't: **where did the tokens go inside this session?**

## Why

A long coding session is really many tasks back to back: `add feature`, `write tests`,
`refactor parser`, `update deps`. Session-level usage is too coarse to tell you which of
those actually burned the tokens. TokenLedger lets you label segments as you work and
reports exact token usage and estimated cost per segment.

It also separates raw **token volume** from **fresh** tokens and real **cost**. With
prompt caching a segment can touch a huge amount of context (high volume) while costing
almost nothing, because cache reads are about 10x cheaper than fresh input. TokenLedger
makes that legible instead of alarming.

## Install

```bash
npm install -g tokenledger
```

Requires **Node.js 18+**. Check yours with `node -v`; if it is older, install a current
version (for example `nvm install 20 && nvm use 20`).

Local development:

```bash
npm install
npm run build
npm link
```

## Setup

One time per project, enable the in-terminal commands:

```bash
tokenledger init
```

This installs a Claude Code `UserPromptSubmit` hook in `.claude/settings.local.json`
(gitignored).

## Use

Launch your agent through TokenLedger (agent flags pass through):

```bash
tokenledger claude
tokenledger claude --dangerously-skip-permissions
```

Mark segments by typing **in the same Claude terminal** (no slash). Starting a new
segment auto-closes the previous one.

```text
tl start write tests
tl usage
tl end
tl summary
```

## Example output

`tl summary` (or `tokenledger last`) prints:

```text
TokenLedger summary

Session total: 194K volume | 15K fresh | $0.20 (exact tokens, estimated cost)
Input: 4K | Output: 1K | Cache read: 179K | Cache write: 9K

Segments:
1. refactor parser
   71K volume | 14K fresh | $0.12 | 1m 44s | cache-heavy
   Input: 4K | Output: 579 | Cache read: 57K | Cache write: 9K
2. write tests
   123K volume | 1K fresh | $0.08 | 43s | cache-heavy
   Input: 10 | Output: 637 | Cache read: 122K | Cache write: 425

Token insight:
"write tests" accounted for 64% of token volume, mostly from cache read.

Cost insight:
"refactor parser" was the most expensive segment at $0.12.
```

Note how `write tests` has the **most volume** (123K) but the **least cost** ($0.08): it
mostly replayed cached context. Volume and cost are reported as separate concepts, never
conflated.

At segment end you also get an immediate readout:

```text
✓ Segment ended: write tests  cache-heavy
(captured by TokenLedger)
Token volume: 123K
Fresh tokens: 1K
Estimated cost: $0.08
Duration: 43s
```

## What the numbers mean

| Term             | Definition                                                   |
| ---------------- | ------------------------------------------------------------ |
| **Token volume** | input + output + cache read + cache write (everything)       |
| **Fresh tokens** | input + output + cache write (excludes reused cache reads)   |
| **Cost**         | estimated USD spend, from per-model pricing                  |
| **Cache-heavy**  | cache reads are more than 70% of a segment's token volume    |

Insights are split deliberately: a **token insight** ranks by volume, a **cost insight**
ranks by spend. They can name different segments, which is the point.

## Claude hook note

When you type a `tl` command, Claude Code shows `UserPromptSubmit operation blocked by
hook` above TokenLedger's output. That is expected and benign: it means the command was
**captured by TokenLedger and not sent to Claude** (0 tokens). TokenLedger cannot
suppress that line, because it is Claude Code's own UI for any intercepted prompt.

## Commands

```bash
tokenledger init      # enable the in-terminal hook for this project
tokenledger claude    # launch Claude Code with tracking
tokenledger last      # most recent session summary
tokenledger today     # today's totals (volume | fresh | cost) across sessions
tokenledger uninstall # remove the in-terminal hook from this project
```

## How it works

- **Exact tokens.** Claude Code writes a per-session JSONL transcript with exact `usage`
  per assistant message. TokenLedger reads it and attributes usage to segments by
  timestamp. Token counts are exact; only cost is estimated.
- **Segments are time-ranges.** Starting a new segment auto-closes the previous one.
  Usage before the first segment, or between segments, goes to `Unsegmented`.
- **In-terminal control via a hook.** `tl ...` commands are caught by a Claude Code
  `UserPromptSubmit` hook that runs `tokenledger hook`, applies the command, and blocks
  the prompt so it never reaches the model.
- **Single-segment sessions stay honest.** Comparative language ("highest", "most
  expensive", "% of session") is only used with two or more segments.

## Limitations

- **Claude Code only in this release.** Agent-specific logic is isolated in adapters
  (`src/adapters`); Codex and OpenCode are stubbed for a future release.
- **Cost is estimated.** Token counts are exact; cost comes from per-model rates in
  `src/core/cost.ts`. Unknown models report "cost unavailable" rather than guessing.
- **Requires Claude Code local usage data.** TokenLedger reads the local session
  transcript, so usage is attributed only when that data is present.

## Development

```bash
npm test          # run the unit tests (vitest)
npm run build     # compile TypeScript to dist/
```
