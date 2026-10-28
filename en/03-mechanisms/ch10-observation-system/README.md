---
title: "Chapter 10: The Observation System"
---

## The Unit of Memory: One Tool Call

claude-mem's unit of memory is the input and output of one tool call, rather than a chat message or a file change. Why that unit:

- **Structured**: every call has well-defined parameters and a result
- **Clear boundaries**: one call is one complete operation
- **Broad coverage**: nearly everything meaningful a host does (reading and writing files, running commands, searching) goes through a tool
- **Cause and effect built in**: the call record itself contains what was done and how it turned out

v13 adds a kind of data that used to be missing: failed calls. For failed calls (Bash exiting non-zero, interruption by the user), Claude Code sends a PostToolUseFailure event, and claude-mem has registered for it since v13.29.0 (Chapter 5). The `<outcome>` the observer sees is `{ error, is_interrupt }`, so "tried approach A, it failed at this step, with this error message" can become memory too. How you got stuck is often more useful to remember than how you eventually succeeded.

## The Pipeline from Tool Call to Observation

Figure 10-1 shows the full lifecycle of one observation.

```mermaid
flowchart LR
    A["PostToolUse / Failure<br/>write hook-spool"] --> B["ingestObservation<br/>filter chain"]
    B -->|skip| X[Discard and log the reason]
    B --> C["Strip tags + optional redaction<br/>src/utils/tag-stripping.ts"]
    C --> D["Side write to tool_uses<br/>raw evidence"]
    C --> E["SessionMessageBuffer<br/>in-memory buffer"]
    E --> F["Observer model<br/>(no tool permissions)"]
    F --> G["Parse XML<br/>correct file lists from evidence"]
    G --> H{"content_hash<br/>already in this session?"}
    H -->|Yes| R["Reinforce the existing record"]
    H -->|No| I[(observations)]
    I --> J["Chroma sync<br/>context-cache refresh<br/>SSE broadcast"]
```

*Figure 10-1: The lifecycle of an observation from tool call to storage (v13.35.0)*

The sections below take it step by step.

### Step 1: The Filter Chain

Before calling the model, `ingestObservation` (`src/services/worker/http/shared.ts`, from L137) checks, in order:

| Check | Default behavior | Setting |
|------|---------|------|
| claude-mem's own retrieval tools | Skip, to avoid the recursion of "remembering what it searched for" | none |
| Project is excluded | Skip | `CLAUDE_MEM_EXCLUDED_PROJECTS` (comma-separated globs) |
| Tool is on the skip list | Skip `ListMcpResourcesTool`, `SlashCommand`, `Skill`, `TodoWrite`, `AskUserQuestion` | `CLAUDE_MEM_SKIP_TOOLS` |
| Bash command matches a regex | Not enabled by default | `CLAUDE_MEM_SKIP_BASH_PATTERNS`, e.g. `^(ls\|cat\|pwd)\b` |
| Call made by a subagent | Recorded by default | `CLAUDE_MEM_SKIP_SUBAGENT_OBSERVATIONS`, `CLAUDE_MEM_SKIP_AGENT_TYPES` |
| Reads or writes of session-memory meta files | Skip | none |
| This turn's prompt is entirely `<private>` | Skip every observation this turn | none |

The hook side has already checked excluded projects and subagents. The worker checks again because hooks aren't the only way into the worker (transcript watching and direct API calls are others). All of these checks happen before the paid model call, so every observation filtered out saves a request.

### Step 2: Tag Stripping and Redaction

Once an event passes the filters, `tool_input` and `tool_response` are serialized and run through `stripMemoryTags()` (`src/utils/tag-stripping.ts`). It removes six tags along with their content: `private`, `claude-mem-context`, `system_instruction`, `system-instruction`, `persisted-output`, and `system-reminder`. The later ones prevent content injected by the host or by claude-mem itself from being recorded as memory a second time.

At the end of the same function there's an optional redaction pass, covered later in this chapter.

### Step 3: Saving Raw Evidence on the Side

When a tool call has a `tool_use_id`, its raw input and output are also written to the `tool_uses` table. The comments call this a "dual-write": it runs alongside the in-memory buffer rather than replacing it, and a failed write is only logged, without affecting observation generation. This raw data is the source for Chapter 8's Layer 4 (`get_tool_uses`).

### Step 4: The Observer Prompt

Messages in the buffer are taken out by the observer generator (Chapter 6) and assembled into a prompt using the templates in `src/sdk/prompts.ts`. v13 made one important change to the template (v13.30.0, #4415): everything fixed that depends only on the mode goes first, and session-specific content comes after:

```
┌─ observerInstructions(mode) ────────────────────────┐
│ system_identity / observer_role / spatial_awareness │  depends only on mode; identical for every session and user
│ recording_focus / skip_guidance / output format     │  → the provider's prompt cache can reuse it
└─────────────────────────────────────────────────────┘
<session_start_context>…</session_start_context>          only present in a new generation (Chapter 6, "Generations")
<observed_from_primary_session>
  <user_request>…</user_request>                          this session's user request
  <requested_at>2026-10-12</requested_at>
</observed_from_primary_session>
```

The prompt caches at OpenRouter and the cmem.ai gateway only hit on byte-identical prefixes. Before the change, prompts from two different sessions shared only their first 422 characters. After it, they share about the first 7,260 characters in code mode. All it took was reordering, plus changing one "below" to "above" in 33 mode files.

After that, each tool call appends a block:

```xml
<observed_from_primary_session>
  <what_happened>Edit</what_happened>
  <occurred_at>2026-10-12T07:45:01.000Z</occurred_at>
  <working_directory>/path/to/project</working_directory>
  <parameters>{ "file_path": "src/services/auth.ts", ... }</parameters>
  <outcome>{ "success": true }</outcome>
</observed_from_primary_session>

Return either one or more <observation>...</observation> blocks, or <skip_summary reason="noise" /> if this tool use should be skipped.
...
Never reply with an empty response, or with prose such as "Skipping" ...
```

A few details of how this is handled:

- **Field truncation.** `<parameters>` and `<outcome>` are each capped at 16,000 characters (`OBS_PROMPT_FIELD_MAX_CHARS`). Beyond that, the first 60% and the last 30% are kept, and the middle is replaced by `<elided chars="…" original_size_chars="…" reason="oversize" />`, with an explicit instruction not to guess at the missing part. Head and tail are kept because tools usually put paths, commands, and error headers at the start and the final error at the end. The cap is also lowered for observer models with smaller windows
- **Image stripping.** Output from screenshot tools contains base64 images. After truncation, what's left would be a few thousand characters of base64 instead of the caption next to it, and it would be resent over and over with the conversation history. v13 replaces images with a marker based on the shape of the content block, regardless of the tool's name (#3730)
- **XML only.** The model must output either `<observation>` blocks or `<skip_summary reason="noise" />`. If it replies with prose, it's asked again in a new generation of the conversation, and if that still fails, the batch is dropped (v13.29.0, #3624)
- **The user's prompt rides along.** As Chapter 5 mentioned, the user's prompt no longer triggers its own observer request; it's sent along with the next observation request

### Step 5: The Observer Is Kept in a Cage

The observer is a full Claude Code session, which by default can read and write files and run commands. claude-mem wants it to read and write XML and do nothing else. `src/sdk/hardened-options.ts` uses six overlapping layers of restriction:

| Layer | Setting | Effect |
|----|------|------|
| Allowlist | `tools: []` | The SDK's real restriction: disables every built-in tool |
| Auto-approval | `allowedTools: []` | No tool is pre-approved (note this is the "auto-approve" list, not a restriction) |
| Denylist | `disallowedTools: [Bash, Read, Write, Edit, Grep, Glob, WebFetch, WebSearch, Task, NotebookEdit, AskUserQuestion, TodoWrite, SendMessage, ListAgents]` | Refuses each one by name |
| Permission mode | `permissionMode: 'dontAsk'` | Anything not pre-approved is refused, with no prompt |
| Fallback callback | `canUseTool` | Refuses every call and writes an append-only audit record |
| Isolation | `cwd` pointed at a dedicated directory, `mcpServers: {}`, `settingSources: []`, `strictMcpConfig`, `additionalDirectories: []` | Inherits none of the user's settings or MCP servers, and can't escape its directory |

The comments say the redundancy is itself a security property, and removing any one layer must not reopen a gap. This has already happened. For a period before v13.29.0, the process factory that started the observer dropped the `--tools ""` argument, so the observer actually loaded the default tool set, and only the denylist held it back. There's now a test (`tests/security/observer-tool-enforcement.test.ts`) that pins down the exact arguments finally passed to the CLI.

The `observer_role` in the mode files also gained two rules in v13.18.1: SILENT BY DESIGN (the observed session must not know it's being observed, or its behavior changes and the record is distorted) and NO CONTACT (it must never contact, nudge, or influence any other session; recording is one-way only). `SendMessage` and `ListAgents` in the denylist are the configuration-level counterpart of that rule.

### Step 6: Parsing and Correction

`src/sdk/parser.ts` extracts `<observation>` blocks from the reply. The observer model doesn't always follow the rules, so the parser tolerates several kinds of deviation:

- Wrong tag case (common with local models) is parsed anyway
- If the wrong tag was used, the format is restated in the next request
- Prose that has content but no structure gets a title and narrative extracted and saved, rather than being discarded (v13.24.9)
- Concepts written as `keyword: description` are cut off at the first colon. The mode file's own example once taught the model to write them this way, while the SQL for context filtering does an exact match, so those observations were never injected (v13.12.4)

After parsing comes a correction step (`src/services/worker/agents/ResponseProcessor.ts`). `files_modified` is determined entirely by the write operations that actually happened in this batch of messages (Edit, MultiEdit, Write, NotebookEdit, write_file, apply_patch); any files the model claims to have modified are discarded. `files_read` is the union of the actual read operations and what the model declared. Which files changed is a fact you can get from the evidence; there's no need to ask the model to remember it (v13.12.2, #3180).

### Step 7: Storage

On write, `content_hash` provides exact dedup within a session, and a duplicate adds a reinforcement to the existing record instead of being dropped silently (Chapter 7). With `CLAUDE_MEM_DEDUP_ENABLED` on, there's also normalized-title dedup across sessions. After that come the Chroma sync, a context-cache refresh, and an SSE push to the Viewer.

## The Fields of an Observation

| Field | Source | Notes |
|------|------|------|
| `type` | Model | One of nine; determines the symbol in the index (Chapter 8) |
| `title` | Model | One-line title; the only thing shown in the index |
| `subtitle` | Model | Secondary title |
| `narrative` | Model | Narrative |
| `facts` | Model | JSON array, one standalone fact per entry |
| `concepts` | Model | JSON array of the seven kinds of knowledge |
| `files_read` / `files_modified` | Evidence + model | See the previous section |
| `discovery_tokens` | System | Tokens the observer spent producing this observation; the source of `work` in the index |
| `content_hash` | System | Dedup within a session |
| `generated_by_model` | System | The model that produced it |
| `agent_type` / `agent_id` | System | Present on observations produced by subagents |

The `observations` table has no `token_estimate` column; token estimates are computed from character counts when the index is rendered (`TokenCalculator.calculateObservationTokens`).

Type answers "what kind of action is this record about," concept answers "what kind of knowledge is it," and the two are independent. The seven concept values are how-it-works, why-it-exists, what-changed, problem-solution, gotcha, pattern, and trade-off.

## Modes: One Pipeline, Different Recording Standards

The types, concepts, and every prompt fragment mentioned above come from a "mode" file. There are 35 under `plugin/modes/` (plus a CLAUDE.md for the law-study mode):

- `code.json`: the default mode, for software development
- 29 language variants such as `code--zh.json` and `code--ja.json`: they override only the placeholders and footer related to output language, so observations are written in that language. For example, `"CLAUDE_MEM_MODE": "code--zh"` in `~/.claude-mem/settings.json` makes the observer write in Chinese
- `code--chill.json`: a more restrained recording standard
- `email-investigation.json`, `law-study.json` (plus `law-study--chill.json`), `meme-tokens.json`: non-programming domains with their own types and concepts

The mode file decides what the observer records, what it skips, and how it classifies things. Take `code.json`'s `skip_guidance` as an example. It asks the observer to skip empty status checks, package installs with no errors, file listings with no follow-up discovery, and the same fact confirmed repeatedly during reviews, retries, or polling: record it only the first time it's confirmed (#3352).

v13.13.1 added a `/mode-creator` skill that generates a mode for your own domain through conversation. That means claude-mem's observation pipeline is itself domain-independent; all the domain knowledge is in the mode file.

The `sensitive` type added in v13.13.0 is one example. It marks information that "isn't secret but shouldn't flow into other content," such as internal URLs, unreleased plans, and customer names. If you've configured the Telegram bot and turned on per-observation alerts (`CLAUDE_MEM_TELEGRAM_OBSERVATION_ALERTS_ENABLED=true`, off by default), observations of this type trigger a notification. Which types trigger it is set by `CLAUDE_MEM_TELEGRAM_TRIGGER_TYPES`, which defaults to `security_alert,sensitive`. The same release fixed a problem: the per-type descriptions in the mode file had never been injected into the prompt. The only type guidance the observer saw was an old passage that said "six options," so `security_alert` and `security_note` had rarely been produced since April 2026. `type_guidance` now lists all nine.

## File Associations

`files_read` and `files_modified` aren't just records; they're also a search dimension:

- PreToolUse file context: before a file is read, find related observations by path and attach a timeline (Chapters 5 and 8)
- The `files` filter in search tools, and `/api/search/by-file` for searching by file
- Per-directory CLAUDE.md generation (the optional feature `CLAUDE_MEM_FOLDER_CLAUDEMD_ENABLED`): produces a list of observations grouped by file for each directory

SessionStart injection groups observations by day, not by file. The table grouped by file appears in the per-directory CLAUDE.md, the third item above.

## Privacy: Tags Are Stripped in the Worker

Users can mark content they don't want recorded with the `<private>` tag:

```
Please update this config: <private>AWS_SECRET_KEY=AKIAIOSFODNN7EXAMPLE</private>
```

Stripping is sometimes described as happening in the hook layer, before data reaches the worker. The source shows it doesn't, and didn't even in v12.6.2. Tool input and output are stripped in the worker, in `src/services/worker/http/shared.ts` (v12.6.2 L155-158, v13.35.0 L237-240); the hook layer only stripped the last reply in the Stop event. v13's hook-spool makes this even more explicit: the hook writes the raw data into a spool file on the local disk, and the worker strips it after picking it up.

Stripping removes the whole span; it doesn't replace it with `[REDACTED]`. If an entire prompt is wrapped in `<private>`, every observation for that turn is skipped (`PrivacyCheckValidator`).

The trust boundary here is worth spelling out. The hook and the worker are two processes belonging to the same user on the same machine, and both the spool file and the worker live in the user's own data directory. Stripping in the worker doesn't let data leave the machine. What actually needs guarding is data leaving the machine: being sent to the observer model, synced to the cloud, or sent to a third-party embedding service for the vector store. `<private>` content has already been removed before any of those steps.

### Optional Automatic Redaction

`<private>` only works if the user remembers to add it. v13.29.0 added automatic redaction, off by default (`CLAUDE_MEM_REDACT_ENABLED=true`). It runs at the end of `stripTags()`, which every capture path goes through (tool input and output, prompts, the last reply, and Server runtime events). `src/utils/redaction.ts` has 11 built-in patterns:

```
aws_access_key, aws_secret_key, github_pat, openai_key, anthropic_key,
slack_token, jwt, private_key_pem, stripe_key, google_api_key, claude_mem_key
```

Matches are replaced with markers like `<redacted type='openai_key'/>`. A few design details:

- **Fail closed.** If a single field is over a million characters, it stops matching pattern by pattern and replaces the entire field with `<redacted type='oversize'/>`. Losing content is preferred to storing data that wasn't scanned
- **Tell the observer.** When markers appear in the prompt, a note is appended asking the model to treat them as placeholders, not to guess the original values, and not to copy the markers into memory
- **Configurable.** `CLAUDE_MEM_REDACT_DISABLED_BUILTINS` turns off specific built-in patterns, and `CLAUDE_MEM_REDACT_CUSTOM_PATTERNS` adds custom regexes. An invalid regex only logs a warning; it doesn't raise an error

Chapter 17 discusses this alongside enterprise data governance.

## Explicit Memory: save_memory

Automatic observation records what happened. Some things never show up as a tool call: the user's preferences, a correction to the agent, a decision reached in conversation. v13.35.0 added the `save_memory` tool so the agent can write a note on purpose:

```typescript
save_memory({ text: 'This project uses vitest for all tests; do not add jest', title: 'Test framework convention', project: 'my-app' })
```

It doesn't call the observer model. It stores the note directly as an observation with `type` `discovery` and `subtitle` "Manual memory" (`src/services/memory/save-memory.ts`), under a "manual session" for that project. The usage instructions injected at SessionStart remind the agent to check for duplicates with `mem_search` first, then save.

The `save_memory` call itself also triggers PostToolUse. When `ingestObservation` recognizes it as an explicit write, it records only the raw data into `tool_uses` and doesn't pass it to the observer; otherwise the same note would be recorded twice.

The same storage path also serves the "native memory bridge." Claude Code and Codex both have their own Markdown memory files. `npx claude-mem memory ingest` imports them, and if a notes directory is being watched, it keeps importing, deduplicating by file fingerprint. Chapter 20 comes back to this when discussing memory interoperability.

## Usage Signals: Reinforcement Ranking

As Chapter 7 explained, the `observation_feedback` table with its viewed, fetched, and cited signals never existed in the code that actually runs. What really turns usage into a ranking signal in v13 is a reinforcement mechanism based on ACT-R (`src/services/reinforcement/`).

ACT-R is a model of memory from cognitive psychology. It holds that how retrievable a memory is depends on how many times it has been used and how long ago each use was, decaying by a power law. claude-mem treats "an observation is confirmed again" as a use. When an exact duplicate observation is absorbed by the unique index, or when Level 0 dedup merges a new observation into an old record, the current date is appended to the old record's `reinforcement_dates` (at most 10, one per day).

When SessionStart chooses observations, the scoring formula is:

```
score = ln(1 + age_created^(-d) + ALPHA × Σ age_reinforcement^(-d))
```

`age` is in days, `d = 0.5` (`ACT_R_DECAY`), and `ALPHA` comes from `CLAUDE_MEM_REINFORCE_ALPHA`. The default `ALPHA = 0` is equivalent to "take the most recent N," and behaves exactly as if the mechanism didn't exist. Set it above 0 and:

- The candidate pool grows to 5× (up to 500), leaving room for reinforced older records to climb
- The newest quarter of the slots is always kept by time (`recencyHeadSize`), so recent work and the latest summary can't be pushed out by old records
- The remaining slots are ranked by score

The effect: an observation written three months ago and confirmed again yesterday can get back into the startup index. Sorting purely by time would bury this kind of durable knowledge.

The reinforcement history is local to each device. Cloud sync doesn't transmit `reinforcement_dates`, `last_reinforced`, or `occurrence_count`; the comment explains that "each replica ranks by its own confirmations" (`src/services/sync/SyncApply.ts`). Chapter 20 compares this with a simpler exponential forgetting curve.

---

**Questions to consider**

1. The filter chain skips `TodoWrite` by default, while Chapter 8's work state asks the agent to use `work_state_write` in place of the host's to-do tool. How are these two designs related? What would happen if `TodoWrite` weren't skipped?
2. `files_modified` trusts only tool evidence, but `files_read` merges in the model's claims. Why treat them differently? Give a read scenario where the model's claim is valuable.
3. The reinforcement mechanism treats repetition as evidence of validity. Describe a scenario where that assumption breaks, and suggest a mitigation.

---

The next chapter looks at the Knowledge Agent: how to build a knowledge base you can talk to out of a set of observations.

---

> From the open-source edition of *Engineering Agent Memory* by diguike.  
> Read online: [inferloop.dev](https://inferloop.dev) · Source: [github.com/diguike/book-claude-mem](https://github.com/diguike/book-claude-mem)
