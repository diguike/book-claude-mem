---
title: "附录 D：SQLite FTS5 语法速查"
feishu_url: "https://fivwvysqdz.feishu.cn/wiki/UMVTw2zvVidw9ukUJVmcIrVunqc"
last_synced: "2026-10-13T11:44:11+08:00"
---

本附录的 SQL 和查询示例都在 SQLite 3.53.2（better-sqlite3 12.11）上实跑过，报错信息照录。

## 建表

```sql
CREATE VIRTUAL TABLE docs_fts USING fts5(
  title,                    -- 索引列
  body,                     -- 索引列
  content='docs',           -- 内容表（FTS5 从此表同步数据）
  content_rowid='id',       -- 内容表的主键列
  tokenize='unicode61'      -- 分词器
);
```

## 分词器选项

| 分词器 | 说明 | 适用 |
|--------|------|------|
| `unicode61` | 按空白和标点切词（默认）。连续的汉字会被当成一个 token | 英文、代码标识符 |
| `porter unicode61` | unicode61 + Porter 词干提取 | 英文（搜索 "running" 匹配 "run"） |
| `trigram` | 三字符滑动窗口，可做子串匹配 | 3 个字以上的中日韩子串；索引会大好几倍 |

### 中文怎么办

SQLite 3.53.2 上的实测（第 12 章 `npm run check:sqlite`）：

| 查询 | unicode61 | trigram | LIKE 子串 |
|------|-----------|---------|----------|
| 项目（在“修改了项目配置”里） | 0 | 0 | 1 |
| 连接池（在“修复连接池泄漏导致的 5xx”里） | 0 | 1 | 1 |
| JWT（在“JWT 验证改为异步”里） | 1 | 1 | 1 |

两个字的中文查询很常见，`trigram` 也搜不到。claude-mem v13 和 mini-mem 的做法是：保留 `unicode61`，查询里含中日韩文字时改用 `LIKE '%…%'` 子串匹配，并转义 `%`、`_`、`\`（第 7 章）。数据量大到 LIKE 扛不住时，再考虑接入分词扩展或向量检索。

## MATCH 查询语法

### 基本搜索

```sql
-- 包含 "auth" 的记录
SELECT * FROM docs_fts WHERE docs_fts MATCH 'auth';

-- 包含 "auth" 和 "bug" 的记录（隐式 AND）
SELECT * FROM docs_fts WHERE docs_fts MATCH 'auth bug';
```

### 短语搜索

```sql
-- 精确短语 "authentication bug"（连续出现）
SELECT * FROM docs_fts WHERE docs_fts MATCH '"authentication bug"';
```

### 前缀搜索

```sql
-- 以 "auth" 开头的词
SELECT * FROM docs_fts WHERE docs_fts MATCH 'auth*';
```

### 布尔操作

```sql
-- AND（默认）
SELECT * FROM docs_fts WHERE docs_fts MATCH 'auth AND token';

-- OR
SELECT * FROM docs_fts WHERE docs_fts MATCH 'auth OR session';

-- NOT
SELECT * FROM docs_fts WHERE docs_fts MATCH 'auth NOT test';
```

### 列限定

```sql
-- 只搜索 title 列
SELECT * FROM docs_fts WHERE docs_fts MATCH 'title: timeout';

-- 只搜索 body 列
SELECT * FROM docs_fts WHERE docs_fts MATCH 'body: "connection pool"';
```

### NEAR 操作

```sql
-- "auth" 和 "token" 在 5 个词以内
SELECT * FROM docs_fts WHERE docs_fts MATCH 'NEAR(auth token, 5)';
```

## 排序

```sql
-- 按相关度排序（BM25 算法，rank 越小越相关）
SELECT *, rank FROM docs_fts WHERE docs_fts MATCH 'auth' ORDER BY rank;

-- 自定义 BM25 权重（title 权重 2.0，body 权重 1.0）
SELECT *, bm25(docs_fts, 2.0, 1.0) AS score
FROM docs_fts WHERE docs_fts MATCH 'auth'
ORDER BY score;
```

## 同步触发器

```sql
-- 插入时同步
CREATE TRIGGER docs_fts_insert AFTER INSERT ON docs BEGIN
  INSERT INTO docs_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;

-- 删除时同步
CREATE TRIGGER docs_fts_delete AFTER DELETE ON docs BEGIN
  INSERT INTO docs_fts(docs_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
END;

-- 更新时同步（先删后插）。只在索引列变化时触发：
-- 写 synced_at、计数器这类非索引列时不必重建索引
CREATE TRIGGER docs_fts_update AFTER UPDATE OF title, body ON docs BEGIN
  INSERT INTO docs_fts(docs_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
  INSERT INTO docs_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;
```

## 安全：不要把用户输入原样交给 MATCH

MATCH 的参数是一门查询语言。`.`、`-`、`:`、`*`、引号、`AND / OR / NOT` 都有语法含义，普通的项目名就能让查询报错：

| 用户输入 | 原样交给 MATCH | 安全构造后 |
|---------|---------------|-----------|
| `Next.js` | `fts5: syntax error near "."` | `"Next.js"` |
| `claude-mem` | `no such column: mem` | `"claude-mem"` |
| `auth "unclosed` | `unterminated string` | `"auth" AND """unclosed"` |

只把双引号翻倍是不够的。claude-mem 的 `buildFTSMatchQuery()`（第 7 章）把每个词单独包进双引号，再用程序拼接的 `AND` 连起来，用户的输入里写不出任何操作符：

```typescript
function buildFtsQuery(query: string): string {
  // 没有字母或数字的词（单独的 -、&）丢掉：unicode61 不为它们建索引，留着会让整个 AND 查询为空
  const tokens = (query.match(/\S+/g) ?? []).filter(t => /[\p{L}\p{N}]/u.test(t));
  if (tokens.length === 0) return `"${query.replace(/"/g, '""')}"`;
  return tokens.map(t => `"${t.replace(/"/g, '""')}"`).join(' AND ');
}
```

需要给高级用户开放 OR、前缀、NEAR 时，单独做一个“原始查询”入口，并捕获 SQLite 的语法错误。

## 常见陷阱

1. **外部内容表不会自动同步**：`content='docs'` 只告诉 FTS5 去哪里取原文，增删改都要靠触发器
2. **更新触发器写成 `AFTER UPDATE`**：哪一列变化都会重建这一行的索引。写同步标记、计数器的高频更新会带来不必要的开销，改用 `AFTER UPDATE OF <索引列>`
3. **用户输入直接进 MATCH**：见上一节
4. **中文用默认分词器搜不到**：见“中文怎么办”
5. **`rank` 越小越相关**：BM25 分数是负数，`ORDER BY rank` 升序才是最相关的在前

> 本书开源发布于 [inferloop.dev](https://inferloop.dev)，转载请注明出处。

---

> 本附录来自《Agent Memory 工程实战》开源版 · 作者「递归客」  
> 在线阅读完整书系：[inferloop.dev](https://inferloop.dev)  
> 源码仓库：[github.com/diguike/book-claude-mem](https://github.com/diguike/book-claude-mem)
