# TokenLedger

Track token usage by developer-labeled work segment across AI coding agents.

TokenLedger wraps your AI coding agent (Claude Code in this release) and answers the
question session-level totals can't: **where did the tokens go inside this session?**
You mark work segments — `learn arbr`, `fix tests`, `refactor` — and TokenLedger
reports exact token usage and estimated cost per segment, separating raw **token
volume** from **fresh** tokens and real **cost**.

This distinction matters: with prompt caching, a segment can touch a huge amount of
context (high volume) while costing almost nothing (cache reads are ~10x cheaper than
fresh input). TokenLedger makes that legible instead of alarming.

## Example

After a short session with two labeled segments, `tl summary` (or `tokenledger last`)
prints:

```text
TokenLedger summary

Session total: 194K volume | 15K fresh | $0.20 (exact tokens, estimated cost)
Input: 4K | Output: 1K | Cache read: 179K | Cache write: 9K

Segments:
1. learn arbr
   71K volume | 14K fresh | $0.12 | 1m 44s | cache-heavy
   Input: 4K | Output: 579 | Cache read: 57K | Cache write: 9K
2. npm package
   123K volume | 1K fresh | $0.08 | 43s | cache-heavy
   Input: 10 | Output: 637 | Cache read: 122K | Cache write: 425

Token insight:
"npm package" accounted for 64% of token volume, mostly from cache read.

Cost insight:
"learn arbr" was the most expensive segment at $0.12.

Trail note:
"npm package" had the highest token burn rate at 172K tokens/min, mostly from cache reads.
```

Note how `npm package` has the **most volume** (123K) but the **least cost** ($0.08) —
it mostly replayed cached context. Token volume and cost are reported as separate
concepts, never conflated.

## Install

```bash
npm install -g tokenledger
```

Local development:

```bash
npm install
npm run build
npm link
```

## Usage

One-time per project, enable in-terminal commands:

```bash
tokenledger init
```

This installs a Claude Code `UserPromptSubmit` hook in `.claude/settings.local.json`
(gitignored). Then launch Claude (agent flags pass through):

```bash
tokenledger claude
tokenledger claude --dangerously-skip-permissions
```

Mark segments by typing **in the same Claude terminal** (no slash — these are
intercepted by the hook, never sent to the model, and cost zero tokens):

```text
tl start learn arbr
tl usage
tl end
tl summary
```

Starting a new segment auto-closes the previous one. At segment end you get an
immediate readout:

```text
✓ Segment ended: npm package  cache-heavy
(captured by TokenLedger)
Token volume: 123K
Fresh tokens: 1K
Estimated cost: $0.08
Duration: 43s
```

> **About the "operation blocked by hook" line.** When you type a `tl` command,
> Claude Code shows `UserPromptSubmit operation blocked by hook` above TokenLedger's
> output. That is expected and benign: it simply means the command was **captured by
> TokenLedger and not sent to Claude** (0 tokens). TokenLedger cannot suppress that line
> — it is Claude Code's own UI for any intercepted prompt.

Review past usage:

```bash
tokenledger last     # most recent session summary
tokenledger today    # today's totals (volume | fresh | cost) across sessions
tokenledger uninstall # remove the in-terminal hook from this project
```

## Terminology

| Term             | Definition                                                   |
| ---------------- | ------------------------------------------------------------ |
| **Token volume** | input + output + cache read + cache write (everything)       |
| **Fresh tokens** | input + output + cache write (excludes reused cache reads)   |
| **Cost**         | estimated USD spend, from per-model pricing                  |
| **Cache-heavy**  | cache reads are more than 70% of a segment's token volume    |

Insights are split deliberately: a **token insight** ranks by volume, a **cost
insight** ranks by spend. They can name different segments — that is the point.

## How it works

- **Exact tokens.** Claude Code writes a per-session JSONL transcript with exact
  `usage` per assistant message. TokenLedger reads it and attributes usage to
  segments by timestamp. Token counts are exact; only cost is estimated.
- **Segments are time-ranges.** Starting a new segment auto-closes the previous
  one. Usage before the first segment, or between segments, goes to `Unsegmented`.
- **In-terminal control via a hook.** `tl ...` commands are caught by a Claude Code
  `UserPromptSubmit` hook that runs `tokenledger hook`, applies the command, and
  blocks the prompt so it never reaches the model (hence the "blocked by hook" line).
- **Single-segment sessions stay honest.** Comparative language ("highest", "most
  expensive", "% of session") is only used with two or more segments; a lone segment
  gets a plain descriptive note.
- **File-based coordination.** Session state lives under `~/.tokenledger/sessions/`;
  the running process and the hook coordinate through `~/.tokenledger/active.json`.
- **Multi-agent ready.** Agent-specific logic is isolated in adapters
  (`src/adapters`). Codex and OpenCode are stubbed for a future release.

## Development

```bash
npm test          # run the unit tests (vitest)
npm run build     # compile TypeScript to dist/
```

Cost rates live in one place: `src/core/cost.ts`. Unknown models report
"cost unavailable" rather than guessing.
