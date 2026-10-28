---
title: "Appendix A: A Map of the claude-mem Source"
---

A quick reference to file paths, organized by module, based on v13.35.0. Every path in these tables has been checked against that version's source tree. The right-hand column gives the chapters that cover each file most.

## Entry Points and Configuration

| File | Purpose | Chapters |
|------|------|------|
| `plugin/hooks/hooks.json` | Hook registration for Claude Code (8 events) | 5 |
| `plugin/hooks/codex-hooks.json` | Hook registration for Codex CLI | 18 |
| `plugin/.mcp.json` | MCP server registration | 9 |
| `plugin/.claude-plugin/plugin.json` | Plugin metadata | 12 |
| `src/shared/SettingsDefaultsManager.ts` | Every `CLAUDE_MEM_*` setting and its default | 2 |
| `src/shared/paths.ts` | Paths for the data directory, database, and so on | 2 |
| `transcript-watch.example.json` | Example transcript schemas for Codex and DSH | 18 |
| `docker-compose.yml` | Deployment stack for the Server runtime | 16 |
| `docs/ip-boundary.md` | The line between open source and areas reserved for the commercial edition | 17 |

## The Hook Command Layer

| File | Purpose | Chapters |
|------|------|------|
| `src/cli/hook-command.ts` | Single hook entry point: buffers stderr, always exits 0 | 4, 5 |
| `src/shared/hook-io.ts` | Hook discipline for stdout, stderr, and exit codes | 5 |
| `src/shared/hook-constants.ts` | Timeout and exit-code constants | 5 |
| `src/cli/types.ts` | The `NormalizedHookInput` structure | 18 |
| `src/cli/adapters/` | 7 platform adapters (claude-code, codex, cursor, kimi, windsurf, antigravity-cli, raw) | 18 |
| `src/cli/handlers/index.ts` | Registry of the 9 handlers | 4 |
| `src/cli/handlers/context.ts` | SessionStart: reads context-cache and injects it | 5, 8 |
| `src/cli/handlers/session-init.ts` | UserPromptSubmit: registers this turn's prompt | 5 |
| `src/cli/handlers/observation.ts` | PostToolUse: writes the spool and returns immediately | 5 |
| `src/cli/handlers/file-context.ts` | PreToolUse: file context and the File Read Gate | 5, 8 |
| `src/cli/handlers/memory-search.ts` | Adds claude-mem results when the host searches its native memory | 20 |
| `src/cli/handlers/summarize.ts`, `session-end.ts` | Stop / SessionEnd wrap-up | 5 |

## The Handoff Layer

| File | Purpose | Chapters |
|------|------|------|
| `src/shared/hook-spool.ts` | Hook side: one file per event, written atomically | 4, 6 |
| `src/services/worker/hook-spool-drain.ts` | Worker-side pickup; exactly-once handoff via `hook_spool_consumed` | 6 |
| `src/shared/context-cache.ts` | Cache of pre-rendered startup context | 4, 8 |

## The Worker

| File | Purpose | Chapters |
|------|------|------|
| `src/services/worker-service.ts` | Worker entry point and CLI dispatch | 6 |
| `src/services/worker-shutdown.ts` | `runShutdownSequence`: hard deadline and successor process | 6 |
| `src/services/infrastructure/GracefulShutdown.ts` | Six-step graceful shutdown | 6 |
| `src/services/infrastructure/ProcessManager.ts` | Starting and stopping processes | 6 |
| `src/shared/worker-spawn-gate.ts` | `spawn.lock`, preventing duplicate launches | 6 |
| `src/services/server/init-phase.ts` | Startup phases for `/api/ready` | 6 |
| `src/services/worker/http/middleware.ts` | Host check (DNS rebinding), CORS, restrictions on where deletes may come from | 6, 17 |
| `src/services/worker/http/shared.ts` | Entry checks: privacy-tag stripping, project exclusion, and more | 10, 17 |
| `src/services/worker/SessionManager.ts` | Session lifecycle | 6 |
| `src/services/worker/SessionMessageBuffer.ts` | In-memory buffer (replaces v12's persistent queue) | 6 |
| `src/services/worker/agents/ResponseProcessor.ts` | Processing and storing the observer's output | 10 |
| `src/shared/observer-recycle.ts` | Generational recycling of the observer session | 6 |

## The Observer

| File | Purpose | Chapters |
|------|------|------|
| `src/sdk/prompts.ts` | Observer prompts (with a cache-friendly prefix) | 10 |
| `src/sdk/hardened-options.ts` | The observer's six layers of restriction | 10, 17 |
| `src/sdk/parser.ts` | Observation XML parsing and error tolerance | 10 |
| `src/utils/tag-stripping.ts` | Stripping `<private>` and other tags | 10 |
| `src/utils/redaction.ts` | Automatic redaction (11 built-in rules) | 17 |

## Storage and Search

| File | Purpose | Chapters |
|------|------|------|
| `src/services/sqlite/SessionStore.ts` | Table creation, migrations, writes, dedup, and reinforcement | 7 |
| `src/services/sqlite/SessionSearch.ts` | FTS5 search | 7 |
| `src/services/sqlite/tool-uses.ts` | The `tool_uses` raw-evidence table | 8, 10 |
| `src/services/worker/DatabaseManager.ts` | Database and Chroma collection management | 7 |
| `src/services/worker/SearchManager.ts` | Search entry point | 7, 9 |
| `src/services/worker/search/SearchOrchestrator.ts` | Routing: Chroma first, SQLite to fill gaps | 7 |
| `src/services/sync/ChromaSync.ts` | Vector sync | 7 |
| `src/services/reinforcement/` | ACT-R reinforcement history and ranking | 7, 10, 20 |

## Context and MCP

| File | Purpose | Chapters |
|------|------|------|
| `src/services/context/ContextBuilder.ts` | Assembles startup context | 8 |
| `src/services/context/ContextBudget.ts` | The 10,000-character budget and trimming order | 8 |
| `src/servers/mcp-server.ts` | MCP server (24 tools) | 9 |
| `src/servers/mcp-tool-visibility.ts` | Hides tools per runtime | 9 |
| `src/services/worker/knowledge/` | Knowledge Agent: corpus building, prime, query | 11 |

## The Server Runtime

| File | Purpose | Chapters |
|------|------|------|
| `src/storage/postgres/schema.ts` | Postgres tables and composite foreign keys | 16 |
| `src/server/routes/v1/ServerV1PostgresRoutes.ts` | `/v1/*` routes, retry and cancel, deletion | 16, 17 |
| `src/server/services/IngestEventsService.ts` | Transactional outbox | 16 |
| `src/server/jobs/job-id.ts`, `ServerJobQueue.ts` | Deterministic job IDs, BullMQ settings | 16 |
| `src/server/generation/ProviderObservationGenerator.ts` | Generation worker: `lockOutbox`, tenant recheck | 16 |
| `src/server/middleware/postgres-auth.ts`, `rate-limit.ts` | API key authentication, rate limits, and quotas | 16, 17 |
| `src/services/hooks/runtime-selector.ts`, `server-client.ts` | How hooks choose a runtime, and fallback rules | 16 |

## Multiple Hosts and Sync

| File | Purpose | Chapters |
|------|------|------|
| `src/services/transcripts/` | Declarative transcript watcher | 18 |
| `src/integrations/opencode-plugin/`, `pi-extension/`, `dsh-plugin/` | Native plugins | 18 |
| `openclaw/src/index.ts` | OpenClaw plugin | 18 |
| `src/services/sync/CloudSync.ts` | Cloud sync push | 19 |
| `src/services/sync/SyncApply.ts`, `SyncClient.ts` | Cloud sync pull and apply | 19 |
| `src/services/sync/CanonicalContent.ts` | Canonical JSON and stable document IDs | 19 |
| `workers/sync-hub/src/do/SyncHub.ts` | The hub: one ordered log per user | 19 |
| `src/services/telemetry/scrub.ts` | Telemetry property allowlist | 17 |

## Skills

There are 22 skills under `plugin/skills/`. Those directly about memory are `mem-search`, `knowledge-agent`, `learn-codebase`, `smart-explore`, `timeline-report`, `weekly-digests`, `cloud-sync`, and `mode-creator`. `make-plan`, `do`, `handoff`, `standup`, and others are workflow skills built on top of memory. Chapter 2 introduces them grouped by purpose.

## Quick Reading Paths

The write path:

```text
hooks.json → hook-command.ts → handlers/observation.ts → shared/hook-spool.ts
  → worker/hook-spool-drain.ts → SessionMessageBuffer.ts → sdk/prompts.ts
  → agents/ResponseProcessor.ts → sqlite/SessionStore.ts
```

The read path:

```text
handlers/context.ts → shared/context-cache.ts → context/ContextBuilder.ts → ContextBudget.ts
servers/mcp-server.ts (mem_search) → worker/SearchManager.ts → search/SearchOrchestrator.ts
```

---

> From the open-source edition of *Engineering Agent Memory* by diguike.  
> Read online: [inferloop.dev](https://inferloop.dev) · Source: [github.com/diguike/book-claude-mem](https://github.com/diguike/book-claude-mem)
