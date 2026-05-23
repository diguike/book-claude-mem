---
title: "第 10 章：Observation 系统"
feishu_url: "https://fivwvysqdz.feishu.cn/wiki/InRkwRHW1i6jnakDJxZcZj8nnXb"
last_synced: "2026-05-05T16:52:35Z"
---

## 什么值得记：Tool Usage 作为观察单元

claude-mem 的记忆单元不是"对话消息"也不是"文件变更"，而是 **Tool Usage**——每次工具调用的输入和输出。

为什么选择 Tool Usage？
- **结构化**：每次工具调用有明确的输入（参数）和输出（结果），比自由文本更容易处理
- **原子性**：一次工具调用是一个完整的操作单元，有清晰的边界
- **全覆盖**：Claude Code 的所有有意义操作（读文件、写文件、执行命令、搜索）都通过工具完成
- **可追溯**：工具调用记录天然包含"做了什么"和"结果是什么"

一次 Edit 工具调用的原始数据示例：

```json
{
  "tool_name": "Edit",
  "tool_input": {
    "file_path": "/src/services/auth.ts",
    "old_string": "const token = jwt.sign(payload, secret);",
    "new_string": "const token = await jwt.sign(payload, secret, { expiresIn: '1h' });"
  },
  "tool_response": {
    "success": true,
    "linesChanged": 1
  }
}
```

这段原始数据包含了：修改了什么文件、原来是什么代码、改成了什么代码、是否成功。足够 AI 从中提取有意义的 Observation。

## AI 压缩流水线

原始 Tool Usage 到结构化 Observation 的转换，由 Worker 内部的 Claude Agent SDK 完成。流水线分四步：

### Step 1：消息积累

Worker 不是每收到一条 Tool Usage 就立即处理，而是等待一个 session 的多条消息积累后批量处理。这提高了上下文完整度——AI 可以看到一连串操作的完整意图，而非孤立的单条操作。

### Step 2：Prompt 构造

将积累的 Tool Usage 序列化为 Prompt，发送给 Claude Agent SDK：

```
你是一个 Observation 提取器。分析以下工具使用记录，提取有价值的观察。

工具记录：
1. Read src/services/auth.ts（查看认证模块）
2. Edit src/services/auth.ts（将同步 jwt.sign 改为异步）
3. Bash: npm test（测试通过）

请提取结构化观察，包含：
- type: 分类标签
- title: 10字以内的标题
- narrative: 简要叙述
- facts: 关键事实列表
- files_read / files_modified: 文件列表
- concepts: 概念标签
```

### Step 3：响应解析

SDK Agent 返回结构化的 XML 或 JSON 响应：

```xml
<observation>
  <type>change</type>
  <title>JWT 签名改为异步并增加过期时间</title>
  <narrative>将 auth 模块中的 jwt.sign 调用改为异步方式，同时添加了 1 小时的过期时间配置。这修复了在高并发场景下同步签名阻塞事件循环的问题。</narrative>
  <facts>
    <fact>jwt.sign 改为 await jwt.sign()，避免阻塞事件循环</fact>
    <fact>添加 expiresIn: '1h' 过期配置</fact>
  </facts>
  <files_modified>src/services/auth.ts</files_modified>
  <concepts>jwt, authentication, async, performance</concepts>
</observation>
```

### Step 4：存储与同步

解析成功后：
1. 计算 content_hash，检查 30 秒去重窗口
2. INSERT INTO observations
3. 同步 Embedding 到 ChromaDB
4. 通过 SSE 广播到 Viewer UI
5. 清除对应的 pending_messages

## Observation 结构

一条完整的 Observation 包含以下字段：

| 字段 | 类型 | 用途 |
|------|------|------|
| `type` | string | 分类标签，决定图标和优先级 |
| `title` | string | 10 字内的语义压缩标题 |
| `narrative` | string | 50-200 字的详细叙述 |
| `facts` | string[] | 关键事实的列表（每条 1 句话） |
| `files_read` | string[] | 读取的文件路径 |
| `files_modified` | string[] | 修改的文件路径 |
| `concepts` | string[] | 概念标签（用于语义关联） |
| `content_hash` | string | SHA256[:16] 去重哈希 |
| `token_estimate` | number | 预估 Token 数 |

**type 的完整取值**：

| type | 含义 | 图标 |
|------|------|------|
| session-request | 用户原始目标 | 🎯 |
| gotcha | 关键陷阱/边界条件 | 🔴 |
| problem-solution | Bug 修复 | 🟡 |
| how-it-works | 技术原理 | 🔵 |
| what-changed | 代码变更 | 🟢 |
| discovery | 学习洞察 | 🟣 |
| why-it-exists | 设计理由 | 🟠 |
| decision | 架构决策 | 🟤 |
| trade-off | 有意折中 | ⚖️ |

## 文件关联与空间分组

Observation 中的 `files_read` 和 `files_modified` 字段不仅是记录，更是索引维度。Context Injection 时，Observation 按文件路径分组展示：

```markdown
**src/services/auth.ts**
| ID | Time | T | Title | Tokens |
|----|------|---|-------|--------|
| #1237 | 3:15 PM | 🟢 | JWT 验证改为异步 | ~155 |
| #1238 | 3:20 PM | 🔴 | secret 不能为 undefined | ~80 |
```

分组策略：
- 只有 `files_modified` 中的文件才会作为分组依据
- 如果一条 Observation 修改了多个文件，会出现在多个分组中
- 没有关联文件的 Observation 归入 "General" 分组
- 当 Agent 正在编辑某个文件时，同文件的历史 Observation 自然成为最相关的上下文

## 隐私控制：`<private>` 标签的边缘处理

用户可以用 `<private>` 标签标记不想被记录的内容：

```
请帮我修改 <private>AWS_SECRET_KEY=AKIAIOSFODNN7EXAMPLE</private> 这个配置
```

标签剥离发生在 Hook 层（`src/utils/tag-stripping.ts`），**在数据到达 Worker 之前**：

```typescript
// src/utils/tag-stripping.ts（简化）
export function stripPrivateTags(text: string): string {
  // 替换 <private>...</private> 为 [REDACTED]
  return text.replace(/<private>[\s\S]*?<\/private>/gi, '[REDACTED]');
}
```

为什么在 Hook 层而不是 Worker 层？

- **最小权限原则**：敏感数据根本不应该通过网络传输到 Worker
- **防止意外泄露**：即使 Worker 有 Bug，也不可能存储被标记的内容
- **边缘处理**：在数据进入系统的第一个接触点就剥离

## 反馈信号：observation_feedback 的用途

`observation_feedback` 表记录哪些 Observation 被实际使用：

```sql
CREATE TABLE observation_feedback (
  id INTEGER PRIMARY KEY,
  observation_id INTEGER NOT NULL,
  signal_type TEXT NOT NULL,  -- viewed / fetched / cited
  created_at_epoch INTEGER
);
```

三种信号类型：
- `viewed`：出现在索引中（Agent 看到了标题）
- `fetched`：Agent 通过 get_observations 获取了详情
- `cited`：Agent 在回答中引用了这条 Observation

这些信号的用途：
1. **搜索排序优化**：被频繁 fetch 的 Observation 在搜索结果中排名更高
2. **清理决策**：长期未被 viewed/fetched 的 Observation 可以在存储清理时优先淘汰
3. **质量评估**：如果 AI 生成的 Observation 从未被 fetch，说明标题质量可能有问题

---

**思考题**

1. 什么样的工具调用"不值得"记录为 Observation？设计一个过滤规则，包含至少 3 个维度（如调用频率、信息增量、可复用性）。
2. `viewed → fetched → cited` 三级信号中，`cited` 最有价值但也最难采集（需要分析 Agent 输出文本）。设计一个可靠的 `cited` 信号检测方案。
3. 如果两条 Observation 的内容有 80% 重叠但时间跨度达 3 天（超出去重窗口），应该合并还是保留两条？设计一个"语义去重"策略。

---

> 本书开源发布于 [inferloop.dev](https://inferloop.dev)，转载请注明出处。

下一章分析 Knowledge Agent——如何从 Observation 集合中构建可查询的知识库。

---

> 本章来自《Agent Memory 工程实战》开源版 · 作者「递归客」  
> 在线阅读完整书系：[inferloop.dev](https://inferloop.dev)  
> 源码仓库：[github.com/diguike/book-claude-mem](https://github.com/diguike/book-claude-mem)
