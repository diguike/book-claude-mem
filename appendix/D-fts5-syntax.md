---
title: "附录 D：SQLite FTS5 语法速查"
feishu_url: "https://fivwvysqdz.feishu.cn/wiki/UMVTw2zvVidw9ukUJVmcIrVunqc"
last_synced: "2026-05-05T16:52:35Z"
---

# 附录 D：SQLite FTS5 语法速查

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
| `unicode61` | Unicode 词边界分词（默认） | 英文、标点分隔的文本 |
| `porter unicode61` | unicode61 + Porter 词干提取 | 英文（搜索 "running" 匹配 "run"） |
| `trigram` | 三字符滑动窗口 | 中文、日文等无空格语言 |

中文推荐：`tokenize='trigram'`（牺牲精度换召回率）或自定义分词器。

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

-- 更新时同步（先删后插）
CREATE TRIGGER docs_fts_update AFTER UPDATE ON docs BEGIN
  INSERT INTO docs_fts(docs_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
  INSERT INTO docs_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;
```

## 安全：转义用户输入

```typescript
function escapeFTS5(query: string): string {
  // 1. 转义双引号
  let escaped = query.replace(/"/g, '""');
  // 2. 如果需要精确短语，用双引号包裹
  // 3. 如果接受分词搜索，直接传入（FTS5 会按空格分词）
  return escaped;
}
```

## 常见陷阱

1. **FTS5 表不支持 UPDATE**：只能通过 'delete' + INSERT 模拟
2. **content= 同步不是自动的**：必须手动建触发器
3. **MATCH 不能用在 WHERE 的子查询中**：必须直接对 FTS 表使用
4. **中文分词效果差**：unicode61 按 Unicode 词边界分，中文每个字可能被当作独立 token

> 本书开源发布于 [inferloop.dev](https://inferloop.dev)，转载请注明出处。
