---
title: "Chapter 17: Enterprise Features: What the Open-Source Edition Provides and What You Must Add"
---

When you try to roll agent memory out across a company, the first thing that stops you usually isn't technology. It's the security review. The questions are much the same everywhere: Will data leave the company? Will secrets get recorded? Who can see whose memory? Can it be deleted completely? Who looked at what, and when?

claude-mem is open core. `docs/ip-boundary.md` draws the line clearly: the core memory engine, the Server, the CLI, the MCP tools, and the host adapters are open source under Apache-2.0. A dozen or so items are reserved for the commercial edition, including team/organization memory sync, an admin console, SSO/SAML/SCIM, enterprise RBAC, an audit-log UI, and a DLP policy engine.

This chapter goes through the review questions in order. The first four sections cover what the open-source edition already provides, with conclusions drawn from the v13.35.0 source and from testing. The last three cover reserved areas and describe how to build those features yourself on top of the open-source edition. That part is design, and it's labeled as such.

## Where Does the Data Go?

Start by drawing the boundary. Figure 17-1 shows where claude-mem's data flows under the default configuration:

```mermaid
graph LR
    subgraph local["Developer's machine"]
        H["Hook process"] --> W["Worker :37700+uid%100<br/>listens only on 127.0.0.1"]
        W --> DB[("~/.claude-mem/claude-mem.db<br/>SQLite")]
        W --> C[("Chroma<br/>local process")]
    end
    W -->|"① tool inputs and outputs<br/>observer prompts"| P["Model provider<br/>claude / gemini / openrouter /<br/>openai-compatible / codex"]
    W -.->|"② anonymous events<br/>allowlist-filtered"| T["PostHog telemetry<br/>on by default"]
    W -.->|"③ copies of observations<br/>off by default"| S["sync.cmem.ai<br/>cloud sync hub"]
```

*Figure 17-1: The three data flows that leave the machine under the default configuration*

**① Observer calls** are the biggest flow. The input and output of every tool call (each field truncated to 16,000 characters, Chapter 10) is sent to the model provider to generate observations. That means the source code you read and the output of the commands you run all pass through the provider. To keep this flow inside the company network, switch the provider to `openai-compatible` and point it at a model deployed internally.

**② Telemetry** is on by default and goes to PostHog. Properties pass through an allowlist filter (`src/services/telemetry/scrub.ts`): only explicitly listed keys get through, and paths, prompts, project names, and model output aren't on the list. Error stacks go through a separate "keep, then scrub" filter (`error-scrub.ts`) that removes home directories, absolute paths, URL query strings, email addresses, and tokens of various kinds, and caps the length. There are three ways to turn it off, in descending priority: the environment variable `DO_NOT_TRACK=1`, the environment variable `CLAUDE_MEM_TELEMETRY=0`, or `npx claude-mem telemetry disable`, which writes it into the settings.

**③ Cloud sync** is off by default (`CLAUDE_MEM_CLOUD_SYNC_HUB_URL` is empty). Chapter 19 covers it in detail.

Beyond these three flows, three switches decide what never enters the system at all:

| Mechanism | Effect | Where it applies |
|---|---|---|
| `CLAUDE_MEM_EXCLUDED_PROJECTS` | Comma-separated globs; matching projects aren't recorded at all and get no startup injection | Worker side, checked on both the capture and injection paths |
| `<private>…</private>` | Enclosed content is removed entirely; if the whole prompt is enclosed, no observations are generated for that turn | Worker side, before storage and before anything is sent to the observer |
| Skip lists | `CLAUDE_MEM_SKIP_TOOLS` and others; see Chapter 10 | Worker side |

## Will Secrets Get Recorded?

A developer running `cat .env` in a session, or pasting a curl command with a token in it, happens every day. claude-mem's automatic redaction (`src/utils/redaction.ts`) replaces those strings before they're stored. It is **off by default**; turn it on with `CLAUDE_MEM_REDACT_ENABLED=true`.

### Rules and Replacement

There are 11 built-in rules:

| Rule | Matches |
|---|---|
| `aws_access_key` | `AKIA` plus 16 characters |
| `aws_secret_key` | 40 characters after `AWS_SECRET_ACCESS_KEY=` or `:` |
| `github_pat` | `ghp_ / gho_ / ghr_ / ghs_` plus 36 characters, or `github_pat_` plus 82 |
| `openai_key` | Starts with `sk-` (excluding `sk-ant-`) |
| `anthropic_key` | Starts with `sk-ant-` |
| `slack_token` | `xoxb- / xoxa- / xoxp- / xoxr- / xoxs-` |
| `jwt` | Three-part `eyJ….eyJ….…` |
| `private_key_pem` | A whole PEM private key block |
| `stripe_key` | `sk_ / pk_ / rk_` plus `live_ / test_` |
| `google_api_key` | `AIza` plus 35 characters |
| `claude_mem_key` | claude-mem's own `cmem_` server keys and `cm_pro_` keys |

The matched span is replaced entirely with a typed marker, `<redacted type='openai_key'/>`, rather than the common "keep a few characters at each end." Partial masking looks friendly, but the leaked prefix and suffix are enough to help someone narrow things down, and sometimes enough to identify exactly which key it was. The typed marker has another use: when the observer sees one, a note is appended to the prompt telling it that a secret used to be there, not to guess at the original value, and not to copy the marker into the observation. The note is appended only when a marker actually appears in the content, so when nothing matched, the prompt gets no extra tokens.

### Three Fail-Closed Details

Redaction is a feature where missing once is a disaster, so several details lean toward deleting too much:

- **Oversized fields are replaced wholesale.** When a single field exceeds 1M characters (UTF-16 code units), it's not scanned by regex at all; it's replaced with `<redacted type='oversize'/>`. That bounds the regex work and guarantees a large unscanned field is never stored as is
- **No cap on the number of matches.** If a field contains a hundred secrets, all hundred are replaced
- **Redaction stays on when the settings file is corrupted.** If `settings.json` fails to parse, every setting falls back to its default, and redaction's default is off. `getRedactionConfig()` handles this case explicitly: if the last successfully loaded configuration had redaction on, or the raw text of the corrupted file contains `"CLAUDE_MEM_REDACT_ENABLED": "true"`, it keeps redacting with the previous configuration or the built-in rules and logs a warning

Redaction runs in the worker's tag-stripping step, which every piece of captured content passes through before storage. The Server runtime does the same for raw event payloads (`redactJsonStrings()` walks every string in the object), but it uses the server process's configuration; a comment in the code leaves "per-tenant configuration for multi-tenant deployments" as a to-do.

### Blind Spots in the Built-in Rules

Running `demo:redact` in `examples/ch17-enterprise-features` puts a few samples through the same rules, ported over. (The example prints in Chinese; the `#` comments are translations.)

```text
[shell 风格 AWS 密钥] 命中 {"aws_access_key":1,"aws_secret_key":1}    # shell-style AWS keys: matched
  export AWS_ACCESS_KEY_ID=<redacted type='aws_access_key'/>
  export AWS_SECRET_ACCESS_KEY=<redacted type='aws_secret_key'/>

[JSON 风格 AWS 密钥] 命中 {}    # JSON-style AWS key: no match
  {"AWS_SECRET_ACCESS_KEY": "aaaaaaaaaaaaaaaaaaaaBBBBBBBBBBBBBBBBBBBB"}

[claude-mem 只读 key（POST /v1/keys 签发）] 命中 {}    # claude-mem read-only key (issued by POST /v1/keys): no match
  curl -H "Authorization: Bearer cm_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" .../v1/mcp

[中文个人信息] 命中 {}    # Chinese personal data: no match
  用户 张三，手机 13812345678，身份证 110101199003071234，反馈登录超时    # User Zhang San, mobile ..., national ID ..., reports a login timeout
```

The JSON-style miss is a known limitation that the source comments admit to. The lookbehind in `aws_secret_key` requires `=` or `:` immediately after the key name, and the JSON form `"KEY": "val"` has a quote in between, so it doesn't match. The second miss is an oversight in claude-mem itself. The `claude_mem_key` rule only recognizes the `cmem_` and `cm_pro_` prefixes, but read-only keys issued by the Server's `POST /v1/keys` start with `cm_` (Chapter 16), so pasting one of those into a session doesn't get it redacted. The third shows that the built-in rules cover developer secrets only, not personal information.

Both kinds of blind spot are fixed with custom rules. `CLAUDE_MEM_REDACT_CUSTOM_PATTERNS` takes a JSON array of entries with `name` and `regex` (as a string, compiled with the `g` flag). Custom rules run before the built-in ones. A rule for US Social Security numbers, for example:

```json
[
  { "name": "us_ssn", "regex": "(?<![\\d-])\\d{3}-\\d{2}-\\d{4}(?![\\d-])" }
]
```

Run through the ported `redactSensitive()` on "Customer Jane Doe, SSN 123-45-6789, order 2026-10-12-0042," it replaces the SSN with `<redacted type='us_ssn'/>` and leaves the date-shaped order number alone. The demo's own custom rules cover the Chinese sample, mobile numbers and national ID numbers:

```json
[
  { "name": "cn_mobile",  "regex": "(?<!\\d)1[3-9]\\d{9}(?!\\d)" },
  { "name": "cn_id_card", "regex": "(?<!\\d)[1-9]\\d{5}(?:19|20)\\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01])\\d{3}[\\dXx](?!\\d)" }
]
```

```text
命中 {"cn_mobile":1,"cn_id_card":1}    # matched
用户 张三，手机 <redacted type='cn_mobile'/>，身份证 <redacted type='cn_id_card'/>，反馈登录超时    # User Zhang San, mobile <redacted>, national ID <redacted>, reports a login timeout
```

The `(?<!\d)` and `(?!\d)` on either side keep the rule from carving 11 digits out of a longer number (an order number, a timestamp) and mistaking it for a phone number. The SSN rule above uses the same trick, with hyphens added to the lookarounds. If a regex is malformed, that rule is skipped with a warning; it doesn't disable redaction as a whole. Before going live, run with `CLAUDE_MEM_REDACT_LOG_MATCHES=true` for a while and watch what matches. The `cm_` prefix gap above can be closed with `{"name": "cmem_read_key", "regex": "\\bcm_[0-9a-f]{48}\\b"}`.

Regex redaction only catches secrets with a fixed shape. Passwords inside database connection strings, session cookies for internal systems, and customer lists don't have a fixed shape. Recognizing them takes DLP-level detection, which is a reserved area.

## Can the System Itself Be Trusted?

The memory system is itself an attack surface. It can read everything in a session, and it writes content into the startup context of every future session.

**The observer can't act.** Chapter 10 described the observer's six layers of restriction: `tools: []`, `allowedTools: []`, an explicit `disallowedTools` list, `permissionMode: 'dontAsk'`, a `canUseTool` that refuses everything and writes an audit record, and a working directory confined to a dedicated directory. In the words of the source comment, "the redundancy is itself a security property": if any layer stops working in some future SDK version, the others still hold.

**The observer flags security events.** The observation types include `security_alert` (⚠), `security_note` (⚷), and `sensitive` (⊘). With `CLAUDE_MEM_TELEGRAM_OBSERVATION_ALERTS_ENABLED` on, these observations can be pushed to Telegram. Which types trigger it is set by `CLAUDE_MEM_TELEGRAM_TRIGGER_TYPES`, default `security_alert,sensitive`.

**The local API defends against the browser.** The worker listens only on 127.0.0.1 by default, but that doesn't stop DNS rebinding: a malicious web page resolves its own domain to 127.0.0.1, and the browser then sends same-origin requests to the local worker. The `Host` header the browser sends is still that domain, so the worker checks `Host` (`src/services/worker/http/middleware.ts`). IP addresses, `localhost`, `*.localhost`, `host.docker.internal`, and configured hostnames are allowed; any other domain gets a 403. Cross-origin reads are allowed only for `http://localhost:*` and `http://127.0.0.1:*`; other origins must be listed in `CLAUDE_MEM_ALLOWED_ORIGINS`. Deletion is stricter: a DELETE carrying an `Origin` header is accepted only from the Viewer's own page. The comment explains why: deletion generates sync tombstones, and a local dev-server page shouldn't be able to wipe memory on every device.

**Local credentials get tight permissions.** `settings.json` may hold a provider's API key and the Server key, so it's written with file mode 0600 (`src/shared/settings-document.ts`).

**Recalled content is treated as data.** When step 3 of `mem_search` returns observation details, the response explicitly tells the model to treat record contents as data, not instructions (Chapter 9). Observations come from files and web pages read in past sessions, which may contain instructions aimed at the agent. That framing is the last line of defense against injection.

## Can It Be Deleted Completely?

### Deletion Endpoints in the Two Runtimes

| Runtime | Endpoint | Behavior |
|---|---|---|
| worker | `DELETE /api/observation/:id`, plus `/api/summary/:id` and `/api/prompt/:id` | Deletes rows produced on this machine. With cloud sync on, it also records a deletion tombstone; if sync state is unavailable, it refuses the deletion (503) so copies on other devices don't become orphans |
| server | `DELETE /v1/memories/:id` | Deletes one observation, with source links deleted by cascade; writes an `observation.deleted` audit entry |
| server | `DELETE /v1/projects/:projectId/memory` | In one transaction, deletes all of a project's observations, raw events, sessions, and generation jobs, keeping the project itself; returns per-table deletion counts and writes a `project.memory_purged` audit entry |

A comment in the project-purge implementation is worth reading. `ensureProjectAllowed()` only checked the key's own optional project scope, so a team-level key could originally request a purge for any `projectId`. A cross-team request returned 200 with all-zero counts, reporting an unauthorized operation as a success. The current code first confirms that the project belongs to the caller's team and returns 404 if it doesn't. In a multi-tenant system, "the operation succeeded but did nothing" and "the operation was refused" must be distinguishable, or the audit trail can't be trusted.

With cloud sync on in the worker runtime, deletion doesn't happen only on the local machine. As Figure 17-2 shows, a deletion has to become a tombstone and travel through the hub to other devices (details in Chapter 19):

```mermaid
sequenceDiagram
    participant V as Viewer page
    participant W as Laptop worker
    participant H as sync hub
    participant D as Desktop worker
    V->>W: 1. DELETE /api/observation/42<br/>(only from the Viewer's own page)
    W->>W: 2. Check: produced on this machine? sync identity available?
    W->>W: 3. One transaction: delete the row + record a tombstone (version +1)
    W->>H: 4. Push the tombstone
    H-->>W: 5. ack; the tombstone is stamped
    D->>H: 6. Pull
    H-->>D: 7. Tombstone operation
    D->>D: 8. Version is newer than local; delete the copy
```

*Figure 17-2: How a deletion reaches other devices when cloud sync is on*

### What Deletion Doesn't Reach

The deletion endpoints cover only the main tables. These need separate handling:

- **Knowledge-base snapshots.** Chapter 11's corpora are JSON files holding snapshots of observation content. After an original observation is deleted, built corpora still contain it; you need to rebuild or delete the corresponding `.corpus.json`
- **Audit logs.** The Server's `observation.read` audit entries record the raw text of search queries (`details.query`). Deleting observations doesn't delete audit entries, so what users searched for stays in `audit_log`
- **The provider side.** Content sent to the model provider is retained according to the provider's own data policy, outside claude-mem's control
- **Other devices.** The worker runtime only allows deleting rows produced on the local machine (`origin_device_id IS NULL`). Observations synced from other devices must be deleted on the device they came from, and the deletion then propagates through sync (Chapter 19)

### Retention Periods

Neither runtime expires data automatically. Teams that need "delete automatically after N days" can do it with a scheduled job. For the Server runtime, write the SQL directly; scope it by `(project_id, team_id)` just as the deletion endpoints do, and add an audit entry yourself:

```sql
-- Delete observations older than 180 days (source links are deleted by FK cascade)
WITH purged AS (
  DELETE FROM observations
  WHERE team_id = $1 AND project_id = $2
    AND created_at < now() - interval '180 days'
  RETURNING id
)
INSERT INTO audit_log (id, team_id, project_id, actor_id, action, resource_type, resource_id, details)
SELECT gen_random_uuid(), $1, $2, 'system:retention', 'project.retention_purged', 'project', $2,
       jsonb_build_object('observations', count(*), 'olderThanDays', 180)
FROM purged;
```

This SQL has been run successfully against claude-mem's Postgres schema. Cutting off strictly by age will delete decision observations that remain valid for a long time. In the worker runtime's SQLite, the ACT-R reinforcement described in Chapters 7 and 10 records the dates an observation was reconfirmed (`reinforcement_dates`), so a local retention policy can delete only rows that are old and haven't been reconfirmed recently. The Server's `observations` table has no such column. Either treat rows differently by the `kind` column (the observation type, for example keeping `decision`), or add a similar signal first.

## Team Memory and Permissions (Reserved Area, Build-Your-Own Design)

The open-source Server has teams and projects, and a `team_members(team_id, user_id, role)` table with roles `owner / admin / member / viewer` (`src/storage/postgres/teams.ts`). But the table is created and never wired up. No route reads it; authentication looks only at the API key, and each key is bound to one team, optionally one project, and a set of scopes. That can already express a simple form of team memory: everyone's hooks write to the same project with their own keys, and `POST /v1/keys` issues read-only keys to people who only need search.

Going further requires two more layers.

**Translating roles into keys.** The identity system (SSO) decides what role a person has and writes it into `team_members`. When a key is issued, the role is translated into scopes, a range, and a lifetime. `demo:rbac` uses the four role values from `team_members`: viewer and member get only project-level keys, admin gets a team-level read/write key, and owner additionally gets `memories:admin`. Using claude-mem's real scope-check semantics (every scope must match; only `*` is a wildcard), `demo:rbac` works out which endpoints each role can call (接口 in the header means "endpoint"; the last row reads "GET /v1/jobs sees the whole team"):

```text
接口                                  viewer  member  admin   owner
POST /v1/search                     Y       Y       Y       Y
POST /v1/events                     -       Y       Y       Y
DELETE /v1/memories/:id             -       Y       Y       Y
DELETE /v1/projects/:id/memory      -       Y       Y       Y
GET /v1/jobs?include=payload        -       -       -       Y
GET /v1/jobs 看到全团队                  -       -       Y       Y
```

The table exposes a gap in the open-source scope model: deletion and writing share `memories:write`, so any member who can write can also purge an entire project. For a role that can write but not delete, either block it per route at a gateway, or add a `memories:delete` scope to claude-mem. Also, `memories:admin` doesn't imply read or write, so an owner's key needs all three scopes granted.

**Layering personal and team memory.** One possible design is a four-level model (personal / project / team / organization) in which the number of people referencing a personal observation decided whether it was promoted to team knowledge. Of claude-mem's existing signals, two can be used directly: `occurrence_count`, incremented when dedup merges (the same fact observed several times), and ACT-R reinforcement dates. The signal "how many different people used it" isn't recorded by the worker runtime (calls to claude-mem's own retrieval tools are skipped and never reach `tool_uses`). The Server runtime could count it from `observation.read` audit entries, but those record what a search returned, not which entry the model ended up using. With signals this imprecise, keep a human approval step in the promotion mechanism: automatic rules only nominate, and the project owner approves.

## Audit Logs (Reserved Area, Build-Your-Own Design)

The Server's `audit_log` already covers writes, generation, reads, deletions, and operator actions, and every row carries `team_id / project_id / api_key_id / actor_id / request_id` (the "Auditing" section of Chapter 16). What the commercial edition reserves is the audit-log UI. If you build on the open-source edition, there's one more thing worth adding besides a query interface: tamper evidence.

`audit_log` is an ordinary table. Anyone with write access can change historical rows, and there's no way to tell afterward. A hash chain is the cheapest fix: each row stores the hash of the previous row, so changing any row makes verification fail from that row on. `demo:audit` shows what it can and can't catch (the `#` comments are translations):

```text
=== 有人改掉了第 4 行，想掩盖清空项目的操作 ===    # someone edits row 4 to hide a project purge
校验：第 4 行起不一致    # verify: mismatch from row 4 on

=== 连哈希一起重算第 4 行 ===    # recompute row 4 along with its hash
校验：全部一致  ← 链尾被整体重写时，单靠哈希链发现不了    # verify: all consistent; a rewritten tail can't be caught by the chain alone
```

In the demo, row 4 is the last row, so recomputing its hash leaves the chain consistent. Whenever the tail of the chain is rewritten, a hash chain alone can't catch it. So a hash chain needs an external anchor: periodically write the hash of the latest row somewhere the attacker can't reach, such as another database, an immutable object-storage bucket, or a ticketing system, and compare against it during verification.

## Measurement: Is the Memory Actually Being Used? (Build-Your-Own Design)

Eventually the organization will ask about return on investment. Three kinds of data are directly available:

| Data | Source | Questions it answers |
|---|---|---|
| Usage | The Server's `usage_events`, `GET /v1/usage` (requires `CLAUDE_MEM_USAGE_METERING=1`) | How much each team wrote, read, and spent in tokens each month |
| Read records | `observation.read` in the Server's audit log, with the raw query and the number of results | Who is searching for what, and which queries always come back empty |
| Repeated observations | `occurrence_count`, `reinforcement_dates` | Which facts keep coming up and are worth turning into documentation or rules |

Zero-result queries are the most actionable item. When the same question is searched again and again and nothing is found, either the memory was never recorded or retrieval didn't recall it (the Server's CJK search problem from Chapter 16 would show up this way).

Whether memory improves the quality of the agent's work is something logs can't answer. That takes a controlled experiment: run the same batch of tasks with memory on and off, and compare success rates and token consumption. That's an agent-evaluation exercise, not something the memory system can measure about itself.

## Running the Examples

```bash
cd examples/ch17-enterprise-features
npm install
npm run demo:redact   # claude-mem's 11 rules, ported; shows the blind spots and custom rules
npm run demo:rbac     # role → scopes → callable endpoints
npm run demo:audit    # a hash-chained audit log and its limits
```

`src/redaction.ts` matches claude-mem's implementation rule for rule and exports only functions, so you can import it into your own tests to verify custom rules (the demo is in `redaction-demo.ts`). The other two scripts are the design examples from this chapter's "Team Memory and Permissions" and "Audit Logs" sections.

---

**Questions to consider**

1. The section on secrets argued that partial masking (keeping a few characters at each end) leaks information. But operators investigating an incident often need to know which key leaked. With whole-span replacement, how would you let operators identify the specific key without storing the key itself?
2. `observation.read` audit entries record the raw text of searches. From a privacy standpoint, does that protect users or expose them? If a user exercises the right to deletion, should the query text in the audit log be deleted too?
3. "Team Memory and Permissions" recommends keeping human approval in the promotion mechanism. With a 50-person team producing thousands of observations a day, human approval becomes a bottleneck. What automatic signals would you use to narrow the candidates to ten or fewer a day?

---

The next chapter moves beyond a single host: how claude-mem connects to Codex, Cursor, OpenCode, and a dozen other agents at once, turning their events into one kind of memory.

---

> From the open-source edition of *Engineering Agent Memory* by diguike.  
> Read online: [inferloop.dev](https://inferloop.dev) · Source: [github.com/diguike/book-claude-mem](https://github.com/diguike/book-claude-mem)
