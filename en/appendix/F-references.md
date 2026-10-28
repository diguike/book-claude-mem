---
title: "Appendix F: References"
---

## Core Projects

### claude-mem
- **GitHub**: [github.com/thedotmack/claude-mem](https://github.com/thedotmack/claude-mem). This book's baseline is v13.35.0 (2026-10-08), Apache-2.0 (since v13.0.0; AGPL-3.0 before that)
- **Website and docs**: [claude-mem.ai](https://claude-mem.ai)
- **Interactive intro course**: [cmem.ai/learn](https://cmem.ai/learn)
- **Install**: `npx claude-mem install`
- Design docs in the source worth reading: `docs/ip-boundary.md` (the open-source boundary), `docs/server.md` (the Server runtime), `docs/native-memory-bridge.md` (the native memory bridge), `docs/native-prompt-identity.md` (turn identity), `workers/sync-hub/DEPLOY.md` (deploying the sync hub). Note that some docs, such as `docs/architecture-overview.md`, lag behind the code; trust the code

### Claude Code
- **Hooks reference**: [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks)
- **Plugins**: `claude plugin validate`, `claude --plugin-dir` (verified for this book on 2.1.296)
- **Memory**: [code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory)

### Model Context Protocol
- **Specification**: [modelcontextprotocol.io](https://modelcontextprotocol.io)
- **TypeScript SDK**: [github.com/modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk) (this book's examples use 1.32)

---

## Papers and Research

### Lost in the Middle
> Liu, N. F., et al. (2024). **Lost in the Middle: How Language Models Use Long Contexts**. *Transactions of the Association for Computational Linguistics*, 12, 157–173.

Models are more likely to miss information in the middle of a long context. Chapter 3 draws on this result when discussing context rot.

### ACT-R and the Power Law of Forgetting
> Anderson, J. R., & Schooler, L. J. (1991). **Reflections of the Environment in Memory**. *Psychological Science*, 2(6), 396–408.

How retrievable a memory is decays with time according to a power law and strengthens with each repetition. claude-mem's reinforcement ranking (`src/services/reinforcement/`) is computed from this model with a decay exponent of 0.5. Chapters 7, 10, and 20.

### The Ebbinghaus Forgetting Curve
> Ebbinghaus, H. (1885). **Über das Gedächtnis: Untersuchungen zur experimentellen Psychologie**. Leipzig: Duncker & Humblot.

Chapter 20 compares an exponential-decay retention score with ACT-R's power-law decay.

### BM25 Ranking
> Robertson, S., & Zaragoza, H. (2009). **The Probabilistic Relevance Framework: BM25 and Beyond**. *Foundations and Trends in Information Retrieval*, 3(4), 333–389.

SQLite FTS5's `rank` is based on BM25. Chapter 7 and Appendix D.

### Retrieval-Augmented Generation (RAG)
> Lewis, P., et al. (2020). **Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks**. *NeurIPS 2020*.

Chapters 1 and 8 compare progressive disclosure with traditional RAG.

---

## Open-Source Projects

### Comparable Agent Memory Systems (Chapter 15)

| Project | Summary | Where |
|------|------|------|
| **Mem0** | Multi-level memory architecture, with user / session / agent levels | mem0.ai |
| **Zep / Graphiti** | Temporal knowledge graph | getzep.com |
| **Letta (formerly MemGPT)** | OS-style virtual context management; the agent reads and writes its own memory | letta.com |
| **Cognee** | Knowledge-graph-enhanced memory | cognee.ai |
| **LangGraph** | Short-term state + a long-term Store | langchain-ai.github.io/langgraph |

### Infrastructure

| Project | How this book uses it |
|------|------|
| **bun:sqlite / better-sqlite3** | claude-mem uses the former; this book's examples use the latter (12.x, which supports Node 24) |
| **SQLite FTS5** | Full-text search, sqlite.org/fts5.html |
| **Chroma** | Vector search; claude-mem's default local embedding is all-MiniLM-L6-v2 |
| **PostgreSQL / Valkey / BullMQ** | Storage and queues for claude-mem's Server runtime (Chapter 16) |
| **pg_trgm** | Speeds up CJK substring search on Postgres (tested in Chapter 16) |
| **Cloudflare Durable Objects** | The per-user ordered log in claude-mem's sync hub (Chapter 19) |

---

## Further Reading

### Context Engineering and Agent Design
- **Building Effective Agents** (Anthropic Engineering, 2024): agent design patterns
- **Effective Context Engineering for AI Agents** (Anthropic Engineering, 2025): context rot, the "right altitude" for a system prompt, just-in-time context, and compaction / structured notes / subagents for long tasks, all discussed in Chapter 3, have counterparts in this article

### Databases
- **SQLite Is Not a Toy Database** (Anton Zhiyanov): what SQLite can and can't do in production
- **The transactional outbox pattern**: the write path of Chapter 16's Server runtime and Chapter 19's "the database is the queue" are both variants of it

### From the Same Series (in Chinese)
- The source-reading books on DeepSeek Harness and OpenClaw cover two of the hosts in Chapter 18
- *AI Agent Evals in Practice*: how to measure the effect of memory with controlled experiments (Chapter 17)

---

## Community and Feedback

This book is open source on [GitHub](https://github.com/diguike/book-claude-mem) and readable at [inferloop.dev](https://inferloop.dev), under the CC BY-NC-SA 4.0 license:

- **Errata and discussion**: open an issue or PR on GitHub
- **Reposting**: credit the source; no commercial use
- **Commercial licensing**: contact inferloop.dev

> The code examples (the `examples/` directory) are MIT-licensed and free to use in commercial projects.

---

> From the open-source edition of *Engineering Agent Memory* by diguike.  
> Read online: [inferloop.dev](https://inferloop.dev) · Source: [github.com/diguike/book-claude-mem](https://github.com/diguike/book-claude-mem)
