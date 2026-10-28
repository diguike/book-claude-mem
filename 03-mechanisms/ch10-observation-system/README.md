---
title: "第 10 章：Observation 系统"
feishu_url: "https://fivwvysqdz.feishu.cn/wiki/InRkwRHW1i6jnakDJxZcZj8nnXb"
last_synced: "2026-10-28T15:12:12+08:00"
---

## 记忆单元：一次工具调用

claude-mem 的记忆单元不是对话消息，也不是文件变更，而是一次工具调用的输入和输出。选它的理由：

- **结构化**：每次调用都有明确的参数和结果
- **边界清楚**：一次调用就是一个完整操作
- **覆盖面全**：宿主里有意义的操作（读写文件、执行命令、搜索）几乎都通过工具完成
- **自带因果**：调用记录本身包含“做了什么”和“结果如何”

v13 在此基础上补了一类过去缺失的数据：失败的调用。Claude Code 对失败的调用（Bash 非零退出、被用户中断）发 PostToolUseFailure 事件，claude-mem 从 v13.29.0 起注册了它（第 5 章）。观察者看到的 `<outcome>` 是 `{ error, is_interrupt }`，于是“试过 A 方案、在哪一步失败、失败信息是什么”也能成为记忆。踩坑过程往往比最终的成功更值得记住。

## 从工具调用到 Observation 的流水线

一条观察的完整生命周期如图 10-1 所示。

```mermaid
flowchart LR
    A["PostToolUse / Failure<br/>写 hook-spool"] --> B["ingestObservation<br/>过滤链"]
    B -->|跳过| X[丢弃并记原因]
    B --> C["剥离标签 + 可选脱敏<br/>src/utils/tag-stripping.ts"]
    C --> D["tool_uses 旁路写入<br/>原始证据"]
    C --> E["SessionMessageBuffer<br/>内存缓冲"]
    E --> F["观察者模型<br/>（无工具权限）"]
    F --> G["解析 XML<br/>文件列表按证据校正"]
    G --> H{"content_hash<br/>同会话已存在？"}
    H -->|是| R["强化已有记录"]
    H -->|否| I[(observations)]
    I --> J["Chroma 同步<br/>context-cache 刷新<br/>SSE 广播"]
```

*图 10-1：一条 Observation 从工具调用到入库的生命周期（v13.35.0）*

下面按顺序拆开。

### 第 1 步：过滤链

`ingestObservation`（`src/services/worker/http/shared.ts` L137 起）在调用模型之前依次检查：

| 检查 | 默认行为 | 配置 |
|------|---------|------|
| claude-mem 自己的检索工具 | 跳过，避免“记住自己搜过什么”的递归 | 无 |
| 项目被排除 | 跳过 | `CLAUDE_MEM_EXCLUDED_PROJECTS`（逗号分隔的 glob） |
| 工具在跳过列表里 | 跳过 `ListMcpResourcesTool`、`SlashCommand`、`Skill`、`TodoWrite`、`AskUserQuestion` | `CLAUDE_MEM_SKIP_TOOLS` |
| Bash 命令匹配正则 | 默认不启用 | `CLAUDE_MEM_SKIP_BASH_PATTERNS`，例如 `^(ls\|cat\|pwd)\b` |
| 子代理的调用 | 默认记录 | `CLAUDE_MEM_SKIP_SUBAGENT_OBSERVATIONS`、`CLAUDE_MEM_SKIP_AGENT_TYPES` |
| 读写 session-memory 元文件 | 跳过 | 无 |
| 本轮 prompt 整个是 `<private>` | 跳过本轮所有观察 | 无 |

Hook 侧已经检查过排除项目和子代理，Worker 侧再查一次，因为进入 Worker 的路径不止 Hook 一条（transcript 监听、直接 API 调用）。这几项都发生在付费的模型调用之前，过滤掉一条，省下的就是一次请求。

### 第 2 步：剥离标签与脱敏

通过过滤后，`tool_input` 和 `tool_response` 被序列化，再经过 `stripMemoryTags()`（`src/utils/tag-stripping.ts`）。它整段删除 6 种标签及其内容：`private`、`claude-mem-context`、`system_instruction`、`system-instruction`、`persisted-output`、`system-reminder`。后几种防的是宿主或 claude-mem 自己注入的内容被再次记成记忆。

同一个函数的末尾还有一道可选的脱敏，第 7 节展开。

### 第 3 步：旁路保存原始证据

工具调用带 `tool_use_id` 时，原始输入输出写一份到 `tool_uses` 表。注释称之为“dual-write”：与内存缓冲并行，而不是替代它；写失败只记日志，不影响观察生成。这份原始数据是第 8 章 Layer 4（`get_tool_uses`）的来源。

### 第 4 步：观察者 prompt

缓冲里的消息由观察者生成器（第 6 章）取出，按 `src/sdk/prompts.ts` 的模板拼成 prompt。v13 对这个模板做过一次重要调整（v13.30.0，#4415）：所有只依赖模式（mode）的固定说明放在最前面，会话相关的内容放在后面：

```
┌─ observerInstructions(mode) ─────────────────────────┐
│ system_identity / observer_role / spatial_awareness   │  只取决于 mode，所有会话、所有用户相同
│ recording_focus / skip_guidance / 输出格式骨架         │  → provider 的 prompt cache 可以复用
└───────────────────────────────────────────────────────┘
<session_start_context>…</session_start_context>          新一代对话时才有（第 6 章“分代”）
<observed_from_primary_session>
  <user_request>…</user_request>                          本会话的用户请求
  <requested_at>2026-10-12</requested_at>
</observed_from_primary_session>
```

OpenRouter 和 cmem.ai 网关的 prompt cache 只命中逐字节相同的前缀。调整前，两个不同会话的 prompt 只有前 422 个字符相同；调整后 code 模式下共享前约 7,260 个字符。只是挪了顺序，加上 33 个模式文件里把一个“below”改成了“above”。

之后每次工具调用追加一段：

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

几个处理细节：

- **字段截断**：`<parameters>` 和 `<outcome>` 各自最多 16,000 字符（`OBS_PROMPT_FIELD_MAX_CHARS`），超出时保留开头 60% 和结尾 30%，中间替换成 `<elided chars="…" original_size_chars="…" reason="oversize" />`，并明确告诉模型不要推测被省略的部分。保留头尾是因为工具通常把路径、命令、错误头放在开头，把最终错误放在结尾。上限还会按观察者模型的窗口大小下调
- **图片剥离**：截图类工具的输出含有 base64 图片，截断后剩下的是几千个字符的 base64 而不是旁边的说明文字，而且会随对话历史反复重发。v13 按内容块的形状把图片替换成一个标记，与工具名无关（#3730）
- **只能回 XML**：模型要么输出 `<observation>` 块，要么输出 `<skip_summary reason="noise" />`。回了一段散文，会在新的一代对话里再问一次，仍然不行就丢弃这批（v13.29.0，#3624）
- **用户 prompt 搭便车**：第 5 章提到，用户 prompt 不再单独请求一次观察者，而是带在下一次观察请求里

### 第 5 步：观察者被关在笼子里

观察者是一个完整的 Claude Code 会话，默认情况下它能读写文件、执行命令。claude-mem 只希望它“看、写 XML”，别的什么都不做。`src/sdk/hardened-options.ts` 用了六层互相冗余的限制：

| 层 | 设置 | 作用 |
|----|------|------|
| 白名单 | `tools: []` | SDK 真正的限制：禁用所有内置工具 |
| 自动批准 | `allowedTools: []` | 没有任何工具被预先批准（注意它是“自动批准”列表，不是限制） |
| 黑名单 | `disallowedTools: [Bash, Read, Write, Edit, Grep, Glob, WebFetch, WebSearch, Task, NotebookEdit, AskUserQuestion, TodoWrite, SendMessage, ListAgents]` | 逐个点名拒绝 |
| 权限模式 | `permissionMode: 'dontAsk'` | 未预先批准的一律拒绝，不弹确认 |
| 兜底回调 | `canUseTool` | 拒绝每一次调用，并写一条只追加的审计记录 |
| 隔离 | `cwd` 指向专用目录、`mcpServers: {}`、`settingSources: []`、`strictMcpConfig`、`additionalDirectories: []` | 不继承用户的设置和 MCP，不能逃出目录 |

注释里写着：冗余本身就是安全属性，去掉任何一层都不应该重新打开缺口。这不是空话：v13.29.0 之前有一段时间，启动观察者的进程工厂丢掉了 `--tools ""` 参数，观察者实际加载了默认工具集，全靠黑名单挡住。现在有一个测试（`tests/security/observer-tool-enforcement.test.ts`）专门钉住最终传给 CLI 的参数。

模式文件里的 `observer_role` 也在 v13.18.1 加了两条规则：SILENT BY DESIGN（被观察的会话不能知道自己被观察，否则行为会改变，记录就失真了）和 NO CONTACT（不得联系、提醒或影响任何其他会话，只做单向记录）。黑名单里的 `SendMessage`、`ListAgents` 是这条规则在配置层的对应。

### 第 6 步：解析与校正

`src/sdk/parser.ts` 从回复里提取 `<observation>` 块。观察者模型并不总是守规矩，解析器对几类偏差做了容错：

- 标签大小写不对（本地模型常见）照样解析
- 用错了标签，下一次请求里重申一次格式
- 结构缺失但有内容的散文，抽取出标题和叙述保存下来，而不是丢掉（v13.24.9）
- concept 写成 `keyword: description` 的形式，在第一个冒号处截断。模式文件自己的示例曾经教模型这么写，而上下文过滤的 SQL 是精确匹配，这些观察因此从来不会被注入（v13.12.4）

解析完成后有一步校正（`src/services/worker/agents/ResponseProcessor.ts`）：`files_modified` 完全由这一批消息里真实发生的写操作决定（Edit、MultiEdit、Write、NotebookEdit、write_file、apply_patch），模型自己声称修改过的文件被丢弃；`files_read` 取真实读操作与模型声明的并集。改了哪些文件是可以从证据里得到的事实，不需要让模型来回忆（v13.12.2，#3180）。

### 第 7 步：入库

写入时用 `content_hash` 做会话内精确去重，重复的观察会给已有记录追加一次强化，而不是静默丢弃（第 7 章）。开启 `CLAUDE_MEM_DEDUP_ENABLED` 时还会做跨会话的标题归一去重。之后同步 Chroma、触发 context-cache 刷新、通过 SSE 推给 Viewer。

## Observation 的字段

| 字段 | 来源 | 说明 |
|------|------|------|
| `type` | 模型 | 9 种之一，决定索引里的符号（第 8 章） |
| `title` | 模型 | 一句话标题，索引里唯一显示的内容 |
| `subtitle` | 模型 | 补充标题 |
| `narrative` | 模型 | 叙述 |
| `facts` | 模型 | JSON 数组，每条一个独立事实 |
| `concepts` | 模型 | JSON 数组，7 种知识形态之一 |
| `files_read` / `files_modified` | 证据 + 模型 | 见上一节 |
| `discovery_tokens` | 系统 | 观察者生成这条观察花了多少 token，索引里 `work` 一项的来源 |
| `content_hash` | 系统 | 会话内去重 |
| `generated_by_model` | 系统 | 生成它的模型 |
| `agent_type` / `agent_id` | 系统 | 子代理产生的观察会带上 |

`observations` 表里没有 `token_estimate` 列，token 估算是渲染索引时按字符数现算的（`TokenCalculator.calculateObservationTokens`）。

type 回答“这条记录是什么性质的动作”，concept 回答“它属于哪类知识”，两者正交。concept 的 7 个取值是 how-it-works、why-it-exists、what-changed、problem-solution、gotcha、pattern、trade-off。

## 模式：同一套流水线，不同的记录标准

上面提到的 type、concept 和所有提示词片段，都来自一个“模式”文件。`plugin/modes/` 下有 35 个（另有一个供 law-study 模式使用的 `law-study-CLAUDE.md`）：

- `code.json`：默认模式，面向软件开发
- `code--zh.json`、`code--ja.json` 等 29 个语言变体：只覆盖输出语言相关的占位符和页脚，观察会用对应语言写成。中文读者可以在 `~/.claude-mem/settings.json` 里设 `"CLAUDE_MEM_MODE": "code--zh"`
- `code--chill.json`：更克制的记录标准
- `email-investigation.json`、`law-study.json`（另有 `law-study--chill.json`）、`meme-tokens.json`：非编程领域，有自己的类型和概念

模式文件决定了观察者“记什么、不记什么、怎么分类”。以 `code.json` 的 `skip_guidance` 为例，它要求跳过空的状态检查、无错误的包安装、没有后续发现的文件列表，以及在评审、重试、轮询中反复确认的同一个事实：只在第一次确认时记录（#3352）。

v13.13.1 加了一个 `/mode-creator` skill，可以通过对话为自己的领域生成一个模式。这意味着 claude-mem 的观察流水线本身是领域无关的，领域知识全部在模式文件里。

v13.13.0 新增的 `sensitive` 类型是一个例子：它标记“不算私密、但不该流进其他内容”的信息，比如内部 URL、未发布的计划、客户名称。配置了 Telegram 机器人并打开逐条观察提醒（`CLAUDE_MEM_TELEGRAM_OBSERVATION_ALERTS_ENABLED=true`，默认关闭）后，这类观察会推送通知；触发的类型由 `CLAUDE_MEM_TELEGRAM_TRIGGER_TYPES` 决定，默认值是 `security_alert,sensitive`。同一个版本还修了一个问题：模式文件里每个 type 的描述从未被注入 prompt，观察者看到的类型说明只有一段旧文字，里面写着“6 种选项”，所以 `security_alert` 和 `security_note` 从 2026 年 4 月起一直很少被产出。现在 `type_guidance` 列出了全部 9 种。

## 文件关联

`files_read` 和 `files_modified` 不只是记录，也是检索维度：

- PreToolUse 的文件上下文：读一个文件前，按路径找出相关观察，附上时间线（第 5 章、第 8 章）
- 搜索工具的 `files` 过滤，以及按文件搜索的 `/api/search/by-file`
- 目录级 CLAUDE.md 生成（可选功能 `CLAUDE_MEM_FOLDER_CLAUDEMD_ENABLED`）：为每个目录生成一份按文件分组的观察列表

SessionStart 注入时观察按天分组，不按文件路径；按文件分组的表格出现在上面第三项的目录级 CLAUDE.md 里。

## 隐私：标签在 Worker 里剥离

用户可以用 `<private>` 标签标记不想被记录的内容：

```
请帮我修改 <private>AWS_SECRET_KEY=AKIAIOSFODNN7EXAMPLE</private> 这个配置
```

剥离发生在 Worker 里，不在 Hook 层，v12.6.2 就已经如此：工具输入输出的剥离在 Worker 的 `src/services/worker/http/shared.ts`（v12.6.2 L155-158、v13.35.0 L237-240），Hook 层只剥离了 Stop 事件里的最后一条回复。v13 的 hook-spool 让这一点更明确：Hook 把原始数据写进本机磁盘上的 spool 文件，Worker 取件后才剥离。

剥离的效果是整段删除，不是替换成 `[REDACTED]`。如果一条 prompt 整个被包在 `<private>` 里，这一轮的所有观察都会跳过（`PrivacyCheckValidator`）。

这里的信任边界值得说清楚：Hook 和 Worker 是同一个用户在同一台机器上的两个进程，spool 文件和 Worker 都在用户自己的数据目录里，剥离放在 Worker 一侧并没有让数据离开这台机器。真正需要防的是数据离开本机：发给观察者模型、同步到云端、写进向量库的第三方 embedding 服务。`<private>` 内容在所有这些环节之前已经被删掉。

### 可选的自动脱敏

`<private>` 需要用户记得加。v13.29.0 增加了一个默认关闭的自动脱敏（`CLAUDE_MEM_REDACT_ENABLED=true`），在 `stripTags()` 的末尾统一执行，所有捕获路径（工具输入输出、prompt、最后一条回复、Server 运行时的事件）都经过这一处。`src/utils/redaction.ts` 内置 11 种模式：

```
aws_access_key, aws_secret_key, github_pat, openai_key, anthropic_key,
slack_token, jwt, private_key_pem, stripe_key, google_api_key, claude_mem_key
```

命中的内容替换成 `<redacted type='openai_key'/>` 这样的标记。几个设计细节：

- **失败即封闭**：单个字段超过 100 万字符时不再逐个匹配，整个字段替换成 `<redacted type='oversize'/>`，宁可丢内容也不存未经扫描的数据
- **告诉观察者**：prompt 里出现标记时，追加一句说明，要求模型把它当占位符，不要推测原值，也不要把标记抄进记忆
- **可调**：`CLAUDE_MEM_REDACT_DISABLED_BUILTINS` 关闭某些内置模式，`CLAUDE_MEM_REDACT_CUSTOM_PATTERNS` 增加自定义正则，非法正则只记警告不报错

第 17 章会把它和企业级的数据治理放在一起讨论。

## 显式记忆：save_memory

自动观察记录的是“发生了什么”。有些东西不会以工具调用的形式出现：用户的偏好、对 Agent 的纠正、一个口头达成的决定。v13.35.0 加了 `save_memory` 工具，让 Agent 主动记一条笔记：

```typescript
save_memory({ text: '这个项目的测试一律用 vitest，不要引入 jest', title: '测试框架约定', project: 'my-app' })
```

它不调用观察者模型，直接存成一条 `type` 为 `discovery`、`subtitle` 为 “Manual memory” 的观察（`src/services/memory/save-memory.ts`），挂在该项目的一个“手动会话”下。SessionStart 注入的使用说明会提醒 Agent 先用 `mem_search` 查重，再保存。

`save_memory` 调用本身也会触发 PostToolUse。`ingestObservation` 识别出这是一次显式写入后，只把原始数据记进 `tool_uses`，不再交给观察者，否则同一条笔记会被记两次。

同一条存储路径还服务于“原生记忆桥接”：Claude Code 和 Codex 都有自己的 Markdown 记忆文件，`npx claude-mem memory ingest` 可以把它们导入，配置了笔记目录监听时会持续导入，用文件指纹去重。第 20 章讨论记忆互操作时会回到这里。

## 使用信号：强化排序

第 7 章说过，带 viewed、fetched、cited 三种信号的 `observation_feedback` 表在实际运行的代码里从未存在。v13 里真正把“使用情况”变成排序依据的，是一套基于 ACT-R 的强化机制（`src/services/reinforcement/`）。

ACT-R 是认知心理学里的一个记忆模型，它认为一条记忆的可提取程度取决于它被使用的次数和每次使用距今的时间，按幂律衰减。claude-mem 把“一条观察被再次确认”当作一次使用：完全重复的观察被唯一索引吸收时，或者第 0 级去重把新观察合并进旧记录时，都会把当天的日期追加到旧记录的 `reinforcement_dates`（最多 10 个，同一天只记一次）。

SessionStart 选观察时，打分公式是：

```
score = ln(1 + age_created^(-d) + ALPHA × Σ age_reinforcement^(-d))
```

`age` 以天为单位，`d = 0.5`（`ACT_R_DECAY`），`ALPHA` 来自 `CLAUDE_MEM_REINFORCE_ALPHA`。默认 `ALPHA = 0`，等价于“取最近的 N 条”，行为和没有这套机制时完全一样。设为大于 0 的值后：

- 候选池放大到 5 倍（最多 500 条），给被强化过的老记录留出往上爬的空间
- 最新的 1/4 名额始终按时间保留（`recencyHeadSize`），保证最近的工作和最近一次摘要不会被老记录挤掉
- 其余名额按分数排序

效果是：一条三个月前写下、昨天又被确认过一次的观察，可以重新进入 SessionStart 的窗口。纯按时间排序会把这类持久有效的知识埋掉。

这份强化历史是设备本地的。云同步时 `reinforcement_dates`、`last_reinforced`、`occurrence_count` 都不传输，注释的说法是“每个副本按自己的确认来排序”（`src/services/sync/SyncApply.ts`）。第 20 章会把它和一条更简单的指数遗忘曲线放在一起比较。

---

**思考题**

1. 过滤链默认跳过 `TodoWrite`，而第 8 章的工作状态又要求 Agent 用 `work_state_write` 代替宿主的待办工具。这两个设计之间是什么关系？如果不跳过 `TodoWrite` 会发生什么？
2. `files_modified` 只信任工具证据，`files_read` 却合并了模型的声明。为什么两者区别对待？举一个模型声明有价值的读取场景。
3. 强化机制把“重复出现”当作有效性的证据。设计一个场景，让这个假设失效，并给出缓解办法。

---

> 本书开源发布于 [inferloop.dev](https://inferloop.dev)，转载请注明出处。

下一章分析 Knowledge Agent：如何从 Observation 集合中构建可对话的知识库。

---

> 本章来自《Agent Memory 工程实战》开源版 · 作者「递归客」  
> 在线阅读完整书系：[inferloop.dev](https://inferloop.dev)  
> 源码仓库：[github.com/diguike/book-claude-mem](https://github.com/diguike/book-claude-mem)
