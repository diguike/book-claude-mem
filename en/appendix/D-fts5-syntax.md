---
title: "Appendix D: SQLite FTS5 Syntax Quick Reference"
---

Every SQL statement and query example in this appendix was run on SQLite 3.53.2 (better-sqlite3 12.11), and the error messages are reproduced exactly.

## Creating the Table

```sql
CREATE VIRTUAL TABLE docs_fts USING fts5(
  title,                    -- indexed column
  body,                     -- indexed column
  content='docs',           -- content table (FTS5 reads the original text from here)
  content_rowid='id',       -- the content table's primary key column
  tokenize='unicode61'      -- tokenizer
);
```

## Tokenizer Options

| Tokenizer | Description | Good for |
|--------|------|------|
| `unicode61` | Splits on whitespace and punctuation (the default). A run of Chinese characters is treated as one token | English, code identifiers |
| `porter unicode61` | unicode61 + Porter stemming | English (searching "running" matches "run") |
| `trigram` | A sliding three-character window, enabling substring matching | CJK substrings of three or more characters; the index is several times larger |

### What to Do About CJK Text

Measured on SQLite 3.53.2 (Chapter 12's `npm run check:sqlite`; glosses in parentheses):

| Query | unicode61 | trigram | LIKE substring |
|------|-----------|---------|----------|
| 项目 ("project," inside 修改了项目配置, "changed the project config") | 0 | 0 | 1 |
| 连接池 ("connection pool," inside 修复连接池泄漏导致的 5xx, "fix 5xx caused by connection pool leak") | 0 | 1 | 1 |
| JWT (inside JWT 验证改为异步, "JWT verification made async") | 1 | 1 | 1 |

Two-character queries are common in Chinese, and `trigram` can't find them either. What claude-mem v13 and mini-mem do: keep `unicode61`, and when a query contains CJK characters, switch to `LIKE '%…%'` substring matching, escaping `%`, `_`, and `\` (Chapter 7). Once the data grows too large for LIKE, consider a word-segmentation extension or vector search.

## MATCH Query Syntax

### Basic Search

```sql
-- Records containing "auth"
SELECT * FROM docs_fts WHERE docs_fts MATCH 'auth';

-- Records containing both "auth" and "bug" (implicit AND)
SELECT * FROM docs_fts WHERE docs_fts MATCH 'auth bug';
```

### Phrase Search

```sql
-- The exact phrase "authentication bug" (adjacent)
SELECT * FROM docs_fts WHERE docs_fts MATCH '"authentication bug"';
```

### Prefix Search

```sql
-- Words starting with "auth"
SELECT * FROM docs_fts WHERE docs_fts MATCH 'auth*';
```

### Boolean Operators

```sql
-- AND (the default)
SELECT * FROM docs_fts WHERE docs_fts MATCH 'auth AND token';

-- OR
SELECT * FROM docs_fts WHERE docs_fts MATCH 'auth OR session';

-- NOT
SELECT * FROM docs_fts WHERE docs_fts MATCH 'auth NOT test';
```

### Column Filters

```sql
-- Search only the title column
SELECT * FROM docs_fts WHERE docs_fts MATCH 'title: timeout';

-- Search only the body column
SELECT * FROM docs_fts WHERE docs_fts MATCH 'body: "connection pool"';
```

### NEAR

```sql
-- "auth" and "token" within 5 words of each other
SELECT * FROM docs_fts WHERE docs_fts MATCH 'NEAR(auth token, 5)';
```

## Ranking

```sql
-- Sort by relevance (BM25; a smaller rank is more relevant)
SELECT *, rank FROM docs_fts WHERE docs_fts MATCH 'auth' ORDER BY rank;

-- Custom BM25 weights (title weight 2.0, body weight 1.0)
SELECT *, bm25(docs_fts, 2.0, 1.0) AS score
FROM docs_fts WHERE docs_fts MATCH 'auth'
ORDER BY score;
```

## Sync Triggers

```sql
-- Sync on insert
CREATE TRIGGER docs_fts_insert AFTER INSERT ON docs BEGIN
  INSERT INTO docs_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;

-- Sync on delete
CREATE TRIGGER docs_fts_delete AFTER DELETE ON docs BEGIN
  INSERT INTO docs_fts(docs_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
END;

-- Sync on update (delete, then insert). Fires only when an indexed column changes:
-- writes to non-indexed columns like synced_at or counters don't need an index rebuild
CREATE TRIGGER docs_fts_update AFTER UPDATE OF title, body ON docs BEGIN
  INSERT INTO docs_fts(docs_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
  INSERT INTO docs_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;
```

## Safety: Never Pass User Input to MATCH Unchanged

The argument to MATCH is a query language. `.`, `-`, `:`, `*`, quotes, and `AND / OR / NOT` all have syntactic meaning, and an ordinary project name is enough to make a query fail:

| User input | Passed straight to MATCH | After safe construction |
|---------|---------------|-----------|
| `Next.js` | `fts5: syntax error near "."` | `"Next.js"` |
| `claude-mem` | `no such column: mem` | `"claude-mem"` |
| `auth "unclosed` | `unterminated string` | `"auth" AND """unclosed"` |

Doubling double quotes isn't enough. claude-mem's `buildFTSMatchQuery()` (Chapter 7) wraps each word in its own double quotes and joins them with an `AND` added by the program, so nothing the user types can become an operator:

```typescript
function buildFtsQuery(query: string): string {
  // Drop words with no letters or digits (a lone -, &): unicode61 doesn't index them,
  // and keeping one would make the whole AND query return nothing
  const tokens = (query.match(/\S+/g) ?? []).filter(t => /[\p{L}\p{N}]/u.test(t));
  if (tokens.length === 0) return `"${query.replace(/"/g, '""')}"`;
  return tokens.map(t => `"${t.replace(/"/g, '""')}"`).join(' AND ');
}
```

If advanced users need OR, prefix, or NEAR, provide a separate "raw query" entry point and catch SQLite's syntax errors.

## Common Pitfalls

1. **External content tables don't sync themselves.** `content='docs'` only tells FTS5 where to find the original text; inserts, deletes, and updates all depend on triggers
2. **Writing the update trigger as plain `AFTER UPDATE`.** A change to any column rebuilds that row's index entry. High-frequency updates to sync markers or counters then add needless overhead. Use `AFTER UPDATE OF <indexed columns>` instead
3. **Passing user input straight to MATCH.** See the previous section
4. **CJK text not found with the default tokenizer.** See "What to Do About CJK Text"
5. **A smaller `rank` is more relevant.** BM25 scores are negative, so ascending `ORDER BY rank` puts the most relevant first

---

> From the open-source edition of *Engineering Agent Memory* by diguike.  
> Read online: [inferloop.dev](https://inferloop.dev) · Source: [github.com/diguike/book-claude-mem](https://github.com/diguike/book-claude-mem)
