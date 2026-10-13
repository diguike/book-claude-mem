---
title: "第 17 章：企业级特性：开源版给了什么，还要补什么"
feishu_url: "https://fivwvysqdz.feishu.cn/wiki/JMDrwKDImiUyOLkfAvlcNltGnkc"
last_synced: "2026-10-13T11:43:38+08:00"
---

把 Agent Memory 推进一家公司，最先拦住你的通常不是技术，是安全评审。评审会问的问题大同小异：数据会离开公司吗，密钥会不会被记下来，谁能看到谁的记忆，能不能删干净，谁在什么时候看过什么。

claude-mem 是 open-core 结构。`docs/ip-boundary.md` 把边界写得很清楚：核心记忆引擎、Server、CLI、MCP 工具、各宿主适配器以 Apache-2.0 开源；团队/组织记忆同步、管理后台、SSO/SAML/SCIM、企业级 RBAC、审计日志界面、DLP 策略引擎等十几项保留给商业版。

本章按评审问题的顺序走一遍：前四节是开源版已经提供的能力，结论来自 v13.35.0 源码和实测；后三节是保留区域，给出在开源版之上自建的做法，这部分是设计，会明确标出来。

## 数据会去哪里

先画清楚边界。默认配置下，claude-mem 的数据流向如图 17-1 所示：

```mermaid
graph LR
    subgraph local["开发者本机"]
        H["Hook 进程"] --> W["Worker :37700+uid%100<br/>只监听 127.0.0.1"]
        W --> DB[("~/.claude-mem/claude-mem.db<br/>SQLite")]
        W --> C[("Chroma<br/>本机进程")]
    end
    W -->|"① 工具输入输出<br/>观察者 prompt"| P["模型 provider<br/>claude / gemini / openrouter /<br/>openai-compatible / codex"]
    W -.->|"② 匿名事件<br/>白名单过滤"| T["PostHog 遥测<br/>默认开启"]
    W -.->|"③ 观察副本<br/>默认关闭"| S["sync.cmem.ai<br/>云同步 hub"]
```

*图 17-1：默认配置下离开本机的三条数据流*

**① 观察者调用**是最大的一条。每次工具调用的输入和输出（单字段截断到 16,000 字符，第 10 章）都会发给模型 provider 生成观察。这意味着你读过的源码、跑过的命令输出，都会经过 provider。要让这条流留在公司网络里，可以把 provider 换成 `openai-compatible`，指向内部部署的模型。

**② 遥测**默认开启，发往 PostHog。属性走白名单过滤（`src/services/telemetry/scrub.ts`）：只有显式列出的键能通过，路径、prompt、项目名、模型输出都不在名单里。错误堆栈走另一个“先保留再脱敏”的过滤器（`error-scrub.ts`），去掉家目录、绝对路径、URL 查询串、邮箱和各类令牌，并限制长度。关闭方式有三种，优先级从高到低：环境变量 `DO_NOT_TRACK=1`，环境变量 `CLAUDE_MEM_TELEMETRY=0`，或者 `npx claude-mem telemetry disable` 写入配置。

**③ 云同步**默认关闭（`CLAUDE_MEM_CLOUD_SYNC_HUB_URL` 为空），第 19 章专门讲。

在这三条流之外，还有三个开关决定“哪些内容根本不进入系统”：

| 机制 | 作用 | 生效位置 |
|---|---|---|
| `CLAUDE_MEM_EXCLUDED_PROJECTS` | 逗号分隔的 glob，匹配的项目整个不记录，开场也不注入 | Worker 侧，采集和注入两条路径都检查 |
| `<private>…</private>` | 包住的内容整段删除；整条 prompt 都被包住时，这一轮不生成观察 | Worker 侧，入库和发给观察者之前 |
| 跳过列表 | `CLAUDE_MEM_SKIP_TOOLS` 等，见第 10 章 | Worker 侧 |

## 密钥会不会被记下来

开发者在会话里 `cat .env`、贴一段带 token 的 curl，是每天都会发生的事。claude-mem 的自动脱敏（`src/utils/redaction.ts`）在入库之前把这些串替换掉。它**默认关闭**，用 `CLAUDE_MEM_REDACT_ENABLED=true` 打开。

### 规则与替换方式

内置 11 条规则：

| 规则名 | 匹配 |
|---|---|
| `aws_access_key` | `AKIA` 加 16 位 |
| `aws_secret_key` | `AWS_SECRET_ACCESS_KEY=` 或 `:` 之后的 40 位 |
| `github_pat` | `ghp_ / gho_ / ghr_ / ghs_` 加 36 位，或 `github_pat_` 加 82 位 |
| `openai_key` | `sk-` 开头（排除 `sk-ant-`） |
| `anthropic_key` | `sk-ant-` 开头 |
| `slack_token` | `xoxb- / xoxa- / xoxp- / xoxr- / xoxs-` |
| `jwt` | 三段式 `eyJ….eyJ….…` |
| `private_key_pem` | 整段 PEM 私钥 |
| `stripe_key` | `sk_ / pk_ / rk_` 加 `live_ / test_` |
| `google_api_key` | `AIza` 加 35 位 |
| `claude_mem_key` | claude-mem 自己的 `cmem_` 服务端 Key 和 `cm_pro_` Key |

命中的部分整段替换成带类型的标记 `<redacted type='openai_key'/>`，而不是常见的“保留前后几位”。部分遮盖看起来友好，但泄露的前后缀足以帮人缩小范围，有时还能直接认出是哪一把钥匙。带类型的标记另有一个用处：观察者看到标记时，提示词里会追加一句说明，告诉它这里原来是一个密钥、不要猜测原值，也不要把标记抄进观察里。这段说明只在内容里真的出现标记时才追加，没命中时 prompt 不多花一个 token。

### 三个 fail closed 的细节

脱敏是“漏一次就出事”的功能，几处细节都偏向宁可多删：

- **超长字段整体替换**。单字段超过 1M 字符（UTF-16 码元）时，不做正则扫描，直接换成 `<redacted type='oversize'/>`。限制正则的工作量，同时保证不会把一个没扫描过的大字段原样存下来
- **没有命中次数上限**。一个字段里有一百个密钥，一百个都替换
- **配置文件损坏时保持开启**。`settings.json` 解析失败时，所有配置都会回落到默认值，而脱敏的默认值是关闭。`getRedactionConfig()` 专门处理了这种情况：只要上一次成功加载的配置开着脱敏，或者损坏文件的原文里能看到 `"CLAUDE_MEM_REDACT_ENABLED": "true"`，就继续按原配置或内置规则脱敏，并记一条警告

脱敏在 Worker 的标签剥离环节执行，这是所有采集内容入库前的必经点。Server 运行时对原始事件 payload 也做同样的处理（`redactJsonStrings()` 递归处理对象里的每个字符串），但用的是服务进程的配置，代码注释里留着“多租户部署的租户级配置”待办。

### 内置规则的盲区

运行 `examples/ch17-enterprise-features` 的 `demo:redact`，用移植过来的同一套规则跑几段样本：

```text
[shell 风格 AWS 密钥] 命中 {"aws_access_key":1,"aws_secret_key":1}
  export AWS_ACCESS_KEY_ID=<redacted type='aws_access_key'/>
  export AWS_SECRET_ACCESS_KEY=<redacted type='aws_secret_key'/>

[JSON 风格 AWS 密钥] 命中 {}
  {"AWS_SECRET_ACCESS_KEY": "aaaaaaaaaaaaaaaaaaaaBBBBBBBBBBBBBBBBBBBB"}

[claude-mem 只读 key（POST /v1/keys 签发）] 命中 {}
  curl -H "Authorization: Bearer cm_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" .../v1/mcp

[中文个人信息] 命中 {}
  用户 张三，手机 13812345678，身份证 110101199003071234，反馈登录超时
```

第一段是源码注释里自己承认的已知限制：`aws_secret_key` 的后行断言要求键名后面紧跟 `=` 或 `:`，JSON 写法 `"KEY": "val"` 中间隔着一个引号，匹配不上。第二段是 claude-mem 自己的疏漏：`claude_mem_key` 规则只认 `cmem_` 和 `cm_pro_` 两种前缀，而 Server 的 `POST /v1/keys` 签发的只读 Key 以 `cm_` 开头（第 16 章），这种 Key 贴进会话里不会被脱敏。第三段说明内置规则只管开发者密钥，不管个人信息。

两类盲区都用自定义规则补。`CLAUDE_MEM_REDACT_CUSTOM_PATTERNS` 接受一个 JSON 数组，每项是 `name` 和 `regex`（字符串形式，以 `g` 标志编译），自定义规则在内置规则之前执行：

```json
[
  { "name": "cn_mobile",  "regex": "(?<!\\d)1[3-9]\\d{9}(?!\\d)" },
  { "name": "cn_id_card", "regex": "(?<!\\d)[1-9]\\d{5}(?:19|20)\\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01])\\d{3}[\\dXx](?!\\d)" }
]
```

```text
命中 {"cn_mobile":1,"cn_id_card":1}
用户 张三，手机 <redacted type='cn_mobile'/>，身份证 <redacted type='cn_id_card'/>，反馈登录超时
```

前后的 `(?<!\d)` 和 `(?!\d)` 防止从更长的数字串（订单号、时间戳）里截出 11 位误判成手机号。正则写错时该条规则会被跳过并记警告，不会让脱敏整体失效；上线前用 `CLAUDE_MEM_REDACT_LOG_MATCHES=true` 观察一段时间的命中情况。上面的 `cm_` 前缀也可以用一条 `{"name": "cmem_read_key", "regex": "\\bcm_[0-9a-f]{48}\\b"}` 补上。

正则脱敏只能拦“形态固定”的秘密。数据库连接串里的口令、内部系统的会话 cookie、客户名单，这些形态不固定的内容需要 DLP 级别的识别，属于保留区域。

## 系统自身是否可信

记忆系统本身也是攻击面：它能读到会话里的一切，还会把内容写进以后每次会话的开场上下文。

**观察者不能动手。** 第 10 章讲过观察者的六层收紧：`tools: []`、`allowedTools: []`、显式的 `disallowedTools` 列表、`permissionMode: 'dontAsk'`、`canUseTool` 一律拒绝并写审计、工作目录限定在专用目录。源码注释的原话是“冗余本身就是安全属性”：任何一层在未来的 SDK 版本里失效，其余几层仍然挡着。

**观察者会标记安全事件。** 观察类型里有 `security_alert`（⚠）、`security_note`（⚷）和 `sensitive`（⊘）。打开 `CLAUDE_MEM_TELEGRAM_OBSERVATION_ALERTS_ENABLED` 后，这几类观察可以推送到 Telegram，触发类型由 `CLAUDE_MEM_TELEGRAM_TRIGGER_TYPES` 控制，默认 `security_alert,sensitive`。

**本机接口防浏览器。** Worker 默认只监听 127.0.0.1，但这挡不住 DNS rebinding：恶意网页把自己的域名解析到 127.0.0.1，浏览器就会把同源请求发到本机 Worker。浏览器发出的 `Host` 头仍然是那个域名，所以 Worker 检查 `Host`（`src/services/worker/http/middleware.ts`）：IP 地址、`localhost`、`*.localhost`、`host.docker.internal` 以及配置过的主机名放行，其他域名一律 403。跨域读取只对 `http://localhost:*` 和 `http://127.0.0.1:*` 放行，其他来源要写进 `CLAUDE_MEM_ALLOWED_ORIGINS`。删除更严：带 `Origin` 头的 DELETE 只接受 Viewer 自己的页面。理由写在注释里：删除会生成同步墓碑，一个本机的开发服务器页面不应该有能力删掉所有设备上的记忆。

**本机凭证收紧权限。** `settings.json` 里可能有 provider 的 API Key 和 Server 的 Key，写入时文件权限设为 0600（`src/shared/settings-document.ts`）。

**召回的内容按数据对待。** `mem_search` 第三步返回观察详情时，响应里明确要求模型把记录内容当作数据而不是指令（第 9 章）。观察来自过去会话里读到的文件和网页，其中可能夹带针对 Agent 的指令，这句框定是防注入的最后一层。

## 能不能删干净

### 两种运行时的删除接口

| 运行时 | 接口 | 行为 |
|---|---|---|
| worker | `DELETE /api/observation/:id`，以及 `/api/summary/:id`、`/api/prompt/:id` | 删除本机产生的行；开了云同步时同时记删除墓碑，同步状态不可用时拒绝删除（返回 503），避免其他设备上的副本变成孤儿 |
| server | `DELETE /v1/memories/:id` | 删一条观察，来源关联级联删除，写 `observation.deleted` 审计 |
| server | `DELETE /v1/projects/:projectId/memory` | 一个事务里删除项目的全部观察、原始事件、会话和生成任务，保留项目本身；返回各表删除行数，写 `project.memory_purged` 审计 |

项目清空接口的实现里有一段注释值得一读：`ensureProjectAllowed()` 只检查 Key 自带的可选项目范围，团队级 Key 原本可以对任意 `projectId` 发起清空，跨团队的请求会返回 200 和全零计数，把一次越权操作报告成成功。现在的代码先确认项目属于调用方团队，不属于就返回 404。多租户系统里，“操作成功但什么也没做”和“操作被拒绝”必须能区分开，否则审计记录就不可信。

开了云同步的 worker 运行时，删除不只发生在本机。如图 17-2 所示，一次删除要变成一条墓碑，经过 hub 传到其他设备（细节见第 19 章）：

```mermaid
sequenceDiagram
    participant V as Viewer 页面
    participant W as 笔记本 Worker
    participant H as sync hub
    participant D as 台式机 Worker
    V->>W: 1. DELETE /api/observation/42<br/>（只接受 Viewer 自己的页面）
    W->>W: 2. 检查：本机产生的行？同步身份可用？
    W->>W: 3. 一个事务：删行 + 记墓碑（版本 +1）
    W->>H: 4. 推送墓碑
    H-->>W: 5. ack，墓碑盖戳
    D->>H: 6. 拉取
    H-->>D: 7. 墓碑操作
    D->>D: 8. 版本高于本地，删除副本
```

*图 17-2：开启云同步时，一次删除如何传到其他设备*

### 删不到的地方

删除接口只管主表。以下几处需要另外处理：

- **知识库快照**。第 11 章的 Corpus 是 JSON 文件，存的是观察内容的快照。原观察删除后，已构建的 Corpus 里仍然有它，要 rebuild 或删除对应的 `.corpus.json`
- **审计日志**。Server 的 `observation.read` 审计会记下搜索的查询原文（`details.query`）。删除观察不会删审计，用户搜过什么仍然留在 `audit_log` 里
- **provider 侧**。发给模型 provider 的内容按 provider 自己的数据政策保留，不在 claude-mem 的控制范围内
- **其他设备**。worker 运行时只允许删除本机产生的行（`origin_device_id IS NULL`），从其他设备同步来的观察要在来源设备上删，再通过同步传播（第 19 章）

### 保留期限

两种运行时都没有自动过期。需要“超过 N 天自动删除”的团队，可以用定时任务实现。Server 运行时直接写 SQL；注意要和删除接口一样按 `(project_id, team_id)` 限定范围，并且自己补一条审计：

```sql
-- 删除 180 天前的观察（来源关联随外键级联删除）
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

上面这段 SQL 已在 claude-mem 的 Postgres schema 上实跑通过。按时间一刀切会误删长期有效的决策类观察。worker 运行时的 SQLite 里，第 7 章介绍的 ACT-R 强化记录了观察被反复确认的日期（`reinforcement_dates`），本地的保留策略可以只删“老而且最近没有被再次确认”的行；Server 的 `observations` 表没有这一列，要么按 `kind` 列（观察类型，例如保留 `decision`）区别对待，要么先补上类似的信号。

## 团队记忆与权限（保留区域，自建设计）

开源版的 Server 有团队和项目，也有一张 `team_members(team_id, user_id, role)` 表，角色取 `owner / admin / member / viewer`（`src/storage/postgres/teams.ts`）。但这张表只建了、没接线：没有任何路由读它，鉴权唯一看的是 API Key，每个 Key 绑定一个团队、可选的一个项目和一组作用域。这已经能表达一种朴素的团队记忆：全队的 Hook 用各自的 Key 往同一个项目写，再用 `POST /v1/keys` 签发只读 Key 分给只需要检索的人。

再往上走，需要补的是两层东西。

**角色到 Key 的翻译。** 身份系统（SSO）决定一个人是什么角色，写进 `team_members`；签发 Key 时再把角色翻译成作用域、范围和有效期。`demo:rbac` 沿用 `team_members` 的四个角色值：viewer 和 member 只拿项目级 Key，admin 拿团队级读写 Key，owner 另加 `memories:admin`。`demo:rbac` 按 claude-mem 真实的作用域检查语义（逐项命中，只有 `*` 通配）算出了每个角色能调用的接口：

```text
接口                                  viewer  member  admin   owner
POST /v1/search                     Y       Y       Y       Y
POST /v1/events                     -       Y       Y       Y
DELETE /v1/memories/:id             -       Y       Y       Y
DELETE /v1/projects/:id/memory      -       Y       Y       Y
GET /v1/jobs?include=payload        -       -       -       Y
GET /v1/jobs 看到全团队                  -       -       Y       Y
```

表里暴露了开源版作用域模型的一个缺口：删除和写入共用 `memories:write`，能写入的成员也能清空整个项目。需要“能写不能删”的角色，要么在网关层按路由再拦一道，要么给 claude-mem 加一个 `memories:delete` 作用域。另外，`memories:admin` 不隐含读写，owner 的 Key 要同时授予三个作用域。

**个人记忆与团队记忆的分层。** 第一版设计过一个四层模型（个人 / 项目 / 团队 / 组织），用“被多少人引用”决定一条个人观察是否上升为团队知识。对照 claude-mem 现有的信号，能直接用上的有两个：去重合并时累加的 `occurrence_count`（同一事实被多次观察到），以及 ACT-R 的强化日期。“被多少不同的人用过”这个信号，worker 运行时没有记录（claude-mem 自己的检索工具调用会被跳过，不进 `tool_uses`），Server 运行时可以从 `observation.read` 审计里统计，但审计记的是“这次搜索返回了哪些”，不是“模型最终用了哪条”。在信号不够准的情况下，上升机制建议保留人工确认环节：自动规则只负责提名，由项目负责人批准。

## 审计日志（保留区域，自建设计）

Server 的 `audit_log` 已经覆盖了写入、生成、读取、删除和运维操作，每行带 `team_id / project_id / api_key_id / actor_id / request_id`（第 16 章“审计”一节）。商业版保留的是“审计日志界面”。在开源版上自建时，除了查询界面，还值得补一件事：防篡改。

`audit_log` 是一张普通表，有写权限的人可以改历史行，事后无从察觉。哈希链是成本最低的补法：每一行存上一行的哈希，改动任何一行，从这一行起的校验全部失败。`demo:audit` 演示了它能做到和做不到的事：

```text
=== 有人改掉了第 4 行，想掩盖清空项目的操作 ===
校验：第 4 行起不一致

=== 连哈希一起重算第 4 行 ===
校验：全部一致  ← 链尾被整体重写时，单靠哈希链发现不了
```

改的是最后一行时，攻击者可以连同哈希一起重算。所以哈希链必须配一个外部锚点：定期把最新一行的哈希写到攻击者够不着的地方，比如另一个库、对象存储的不可变桶，或者工单系统，校验时比对。

## 度量：记忆有没有被用上（自建设计）

企业最终会问投入产出。能直接拿到的数据有三类：

| 数据 | 来源 | 能回答的问题 |
|---|---|---|
| 用量 | Server 的 `usage_events`，`GET /v1/usage`（需 `CLAUDE_MEM_USAGE_METERING=1`） | 每个团队每月写了多少、读了多少、花了多少 token |
| 读取记录 | Server 审计里的 `observation.read`，带查询原文和返回条数 | 谁在查什么，哪些查询总是零结果 |
| 重复观察 | `occurrence_count`、`reinforcement_dates` | 哪些事实被反复遇到，值得沉淀成文档或规则 |

“零结果查询”是最有行动价值的一项：同一个问题被反复搜索却找不到，要么是记忆没记下来，要么是检索没召回（第 16 章讲到的 Server 中文检索问题就会表现为这一类）。

“记忆是否提升了 Agent 的任务完成质量”这个问题，日志回答不了，需要对照实验：同一批任务，开和关记忆各跑一遍，比较成功率和 token 消耗。这属于 Agent 评测的范畴，方法见本系列的《AI Agent 评测工程实战》。

## 运行示例

```bash
cd examples/ch17-enterprise-features
npm install
npm run demo:redact   # 移植 claude-mem 的 11 条规则，演示盲区和自定义规则
npm run demo:rbac     # 角色 → 作用域 → 可调用接口
npm run demo:audit    # 哈希链审计与它的边界
```

`src/redaction.ts` 与 claude-mem 的实现逐条一致，只导出函数，可以直接 import 进自己的测试里验证自定义规则（演示在 `redaction-demo.ts`）；另外两个脚本是本章“团队记忆与权限”和“审计日志”两节的设计示例。

---

**思考题**

1. “密钥会不会被记下来”一节说部分遮盖（保留前后几位）会泄露信息。但运维排查时常常需要知道“是哪一把钥匙泄露了”。在整段替换的前提下，你会怎么让运维人员定位到具体的密钥，又不把密钥本身存下来？
2. `observation.read` 审计记录了搜索的原文。从隐私角度看，这是在保护用户还是在暴露用户？如果用户行使删除权，审计里的查询原文要不要一起删？
3. “团队记忆与权限”一节建议上升机制保留人工批准。如果团队有 50 人、每天产生几千条观察，人工批准会成为瓶颈。你会用什么自动信号把候选压缩到每天十条以内？

---

> 本书开源发布于 [inferloop.dev](https://inferloop.dev)，转载请注明出处。

下一章离开单个宿主：claude-mem 怎么同时接入 Codex、Cursor、OpenCode 等十几种 Agent，把它们的事件统一成同一种记忆。

---

> 本章来自《Agent Memory 工程实战》开源版 · 作者「递归客」  
> 在线阅读完整书系：[inferloop.dev](https://inferloop.dev)  
> 源码仓库：[github.com/diguike/book-claude-mem](https://github.com/diguike/book-claude-mem)
