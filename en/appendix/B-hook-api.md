---
title: "Appendix B: Claude Code Hook API Quick Reference"
---

This appendix collects the hook interfaces you'll use when writing a memory plugin. They were verified on Claude Code 2.1.296, and claude-mem's configuration is as of v13.35.0. For the full specification, see the official docs at [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks).

## Events

| Event | When it fires | Main stdin fields | Common output | How claude-mem uses it |
|------|---------|---------------|---------|------------------|
| Setup | At Claude Code startup, before the session | Common fields | None | Dependency self-repair (300 s) |
| SessionStart | Session start; `source` is `startup` / `resume` / `clear` / `compact` | `source` | `additionalContext` injects context | One async hook starts the worker, one sync hook injects; nothing injected on `resume` |
| UserPromptSubmit | The user submits a prompt | `prompt` | Exit code 2 discards the prompt | Registers this turn's prompt (15 s) |
| PreToolUse | Before a tool call | `tool_name`, `tool_input`, `tool_use_id` | `additionalContext`; `permissionDecision: 'deny'` | File context and the File Read Gate (15 s) |
| PostToolUse | After a successful tool call | The above + `tool_response` | None | Writes the spool, `async` (120 s) |
| PostToolUseFailure | After a failed tool call | The above + `error`, `is_interrupt` | None | Same as PostToolUse |
| Stop | The turn's reply ends | Common fields | Exit code 2 makes the agent keep working | Triggers a summary, `async` |
| SessionEnd | The session closes | `reason` | None | Writes one end entry, `async`; the host gives only about 1.5 s |

Common fields: `session_id`, `cwd`, `transcript_path`, `hook_event_name`; when a subagent triggers the hook, also `agent_id` and `agent_type`.

## hooks.json

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "shell": "bash",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/save-hook.js\"",
            "timeout": 120,
            "async": true
          }
        ]
      }
    ]
  }
}
```

| Field | Description |
|------|------|
| `matcher` | `"*"` matches everything; `"Read\|Edit"` for several values; regexes work, e.g. `^Bash$`, `^mcp__.+__memory_search$`; for SessionStart it matches `source` |
| `timeout` | In seconds; the host kills the process when it expires |
| `async` | When `true`, the host doesn't wait for a return and the command finishes in the background; only synchronous hooks' output is used by the host |
| `shell` | Set to `bash` so PATH and variable expansion behave consistently |

`${CLAUDE_PLUGIN_ROOT}` is injected by the host and points to the plugin directory. The path may contain spaces, so always wrap it in double quotes. `claude plugin validate <path>` checks for problems like this, and `claude --plugin-dir <path>` loads a local plugin without installing it.

## stdout

```jsonc
// Do nothing
{ "continue": true, "suppressOutput": true }

// SessionStart / PreToolUse: attach context
{ "hookSpecificOutput": { "hookEventName": "SessionStart", "additionalContext": "..." } }

// PreToolUse: deny this call; the reason is passed to the model
{ "hookSpecificOutput": { "hookEventName": "PreToolUse",
                          "permissionDecision": "deny",
                          "permissionDecisionReason": "..." } }

// Any event: a one-line notice for the user, kept out of the model's context
{ "systemMessage": "..." }
```

**Injection limit**: when `additionalContext` exceeds 10,000 characters, the host replaces the whole thing with a preview. The model receives nothing, yet the hook still shows success. Measure the length before injecting (Chapter 8).

## Exit Codes

| Exit code | What the host does |
|------|---------|
| 0 | Success; parses stdout |
| 2 | Blocks: UserPromptSubmit discards the prompt, PreToolUse denies the call, Stop makes the agent continue; stderr is passed to the model |
| Anything else | Non-blocking error; stderr is shown to the user and the session continues |

A memory plugin's errors shouldn't affect the session. claude-mem exits 0 on every path: every command ends with an `|| exit 0` wrapper, hooks buffer stderr internally, and only after failures reach a threshold (`CLAUDE_MEM_HOOK_FAIL_LOUD_THRESHOLD`, default 3) does it notify the user through `systemMessage`. v12 once used exit code 2 to report internal errors, and the host dropped users' prompts as a result (Chapter 5).

## Performance

Measured on an Intel Xeon 8255C (4 cores), Node 24.14, Bun 1.3.11 (Chapter 5):

| Scenario | Time |
|------|------|
| `node`, empty run | 82–89 ms |
| `bun`, empty run | 12–15 ms |
| claude-mem bundle (3.37 MB), no-op | 466–480 ms |
| One observation, run directly by bun | 501–554 ms |
| One observation, through node's bun-runner | 591–639 ms |

Every millisecond of a synchronous hook is added directly to the user's wait. Make every event that can be async async (PostToolUse, Stop, SessionEnd). For those that must be synchronous (SessionStart injection, PreToolUse), read only local files where possible and avoid network requests.

## Debugging

- Point `CLAUDE_CONFIG_DIR` at an empty directory to isolate your local Claude Code settings. If your local settings disable a plugin, its hooks exit immediately and any measurement is meaningless
- Run a hook by hand: `echo '{"session_id":"t","cwd":"/tmp","hook_event_name":"PostToolUse","tool_name":"Read"}' | node save-hook.js`
- Chapter 5's `examples/ch05-hook-playground` is a minimal host that runs hooks by the rules above, so you can watch sync / async, deny, and exit-code behavior offline

---

> From the open-source edition of *Engineering Agent Memory* by diguike.  
> Read online: [inferloop.dev](https://inferloop.dev) · Source: [github.com/diguike/book-claude-mem](https://github.com/diguike/book-claude-mem)
