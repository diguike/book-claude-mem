---
title: "Engineering Agent Memory: From the claude-mem Source Code to an Enterprise Memory Platform"
---

# Engineering Agent Memory

**From the claude-mem source code to an enterprise memory platform**

> Read online · [inferloop.dev/claude-mem](https://inferloop.dev/claude-mem)  
> Chinese edition · [README in the repository root](../README.md)

> **Author**: diguike | **Community**: [inferloop.dev](https://inferloop.dev) | **License**: CC BY-NC-SA 4.0 (text), MIT (code)

A close reading of the [claude-mem](https://github.com/thedotmack/claude-mem) source as of v13.35.0 (October 2026), and a practical guide to designing and building memory for coding agents. The book covers hooks, the worker service, storage, progressive disclosure and MCP search, then has you build a small memory plugin from scratch, and ends with claude-mem's newer Server runtime, multi-host adapters, and cross-device sync. New to agent memory? The interactive course at [cmem.ai/learn](https://cmem.ai/learn) is a good warm-up.

This is a translation of the Chinese original. The runnable examples in `examples/` are shared by both editions, so their code comments and some console output are in Chinese; commands, identifiers, and file names are the same.

## Who It's For

- Engineers with two or more years of frontend or full-stack experience who know TypeScript and Node.js
- Developers interested in AI agents who want to understand how memory systems are designed
- Engineers who want to move from calling LLM APIs to understanding agent infrastructure
- Tech leads planning a memory platform for their organization's agents

## What You'll Learn

- How Claude Code's plugin system and hooks work
- The core problems of agent memory: what to remember, how to store it, and how to use it
- Context engineering: managing an LLM's context window as an engineering resource
- Progressive disclosure as a design principle
- MCP (Model Context Protocol) in practice
- Hybrid search with SQLite and Chroma, and the pitfalls of searching CJK text
- Building a small memory plugin (mini-mem) from scratch
- claude-mem's Server runtime: a multi-tenant memory service on Postgres and BullMQ
- An adapter layer that connects one memory store to 17 agent hosts
- Cross-device sync: exactly-once push and pull, with the database as the queue

## Quick Start

```bash
# Build mini-mem along with Chapter 13
cd examples/ch13-mini-mem
npm install && npm run build
npm run test:save    # simulate a tool call
npm run test:context # see the injected index
```

Chapter examples that call a model read a `.env` file (each directory has a `.env.example`). Any OpenAI-compatible endpoint works where the examples allow one.

## Contents

- [Preface](00-preface/README.md)

**Part I: Foundations: Why Agents Need Memory**

- [Chapter 1: The Agent Memory Problem](01-cognition/ch01-problem-domain/README.md)
- [Chapter 2: Meet claude-mem: What It Does and How to Start](01-cognition/ch02-claude-mem-intro/README.md)
- [Chapter 3: Context Engineering Basics](01-cognition/ch03-context-engineering/README.md)

**Part II: Architecture: claude-mem from End to End**

- [Chapter 4: System Architecture Overview](02-architecture/ch04-system-overview/README.md)
- [Chapter 5: The Hook-Driven Lifecycle](02-architecture/ch05-hook-lifecycle/README.md)
- [Chapter 6: The Worker Service: An Asynchronous Processing Engine](02-architecture/ch06-worker-service/README.md)
- [Chapter 7: Storage Layer Design](02-architecture/ch07-storage/README.md)

**Part III: Mechanisms: What to Remember and How to Retrieve It**

- [Chapter 8: Progressive Disclosure](03-mechanisms/ch08-progressive-disclosure/README.md)
- [Chapter 9: The MCP Search Architecture](03-mechanisms/ch09-mcp-search/README.md)
- [Chapter 10: The Observation System](03-mechanisms/ch10-observation-system/README.md)
- [Chapter 11: The Knowledge Agent: Building Knowledge Bases](03-mechanisms/ch11-knowledge-agent/README.md)

**Part IV: Hands-On: Building a Memory Plugin from Scratch**

- [Chapter 12: Setting Up a Development Environment](04-practice/ch12-dev-setup/README.md)
- [Chapter 13: Building a Mini Memory Plugin (mini-mem)](04-practice/ch13-mini-mem/README.md)
- [Chapter 14: Advanced Extensions](04-practice/ch14-extensions/README.md)

**Part V: Beyond the Plugin: Platforms, Multiple Hosts, and the Frontier**

- [Chapter 15: A Survey of Agent Memory Solutions](05-enterprise/ch15-industry-survey/README.md)
- [Chapter 16: From Plugin to Platform: The claude-mem Server Runtime](05-enterprise/ch16-platform-upgrade/README.md)
- [Chapter 17: Enterprise Features: What the Open-Source Edition Provides and What You Must Add](05-enterprise/ch17-enterprise-features/README.md)
- [Chapter 18: One Memory, Many Hosts](05-enterprise/ch18-multi-host/README.md)
- [Chapter 19: Cross-Device Sync: The Database Is the Queue](05-enterprise/ch19-cloud-sync/README.md)
- [Chapter 20: The Frontier](05-enterprise/ch20-frontier/README.md)

**Appendices**

- [Appendix A: A Map of the claude-mem Source](appendix/A-source-map.md)
- [Appendix B: Claude Code Hook API Quick Reference](appendix/B-hook-api.md)
- [Appendix C: MCP Protocol Essentials](appendix/C-mcp-protocol.md)
- [Appendix D: SQLite FTS5 Syntax Quick Reference](appendix/D-fts5-syntax.md)
- [Appendix E: mini-mem Source Listing](appendix/E-mini-mem-listing.md)
- [Appendix F: References](appendix/F-references.md)

## The Project This Book Follows

- Source baseline: claude-mem v13.35.0 (released 2026-10-08, Apache-2.0; licensed AGPL-3.0 before v13.0.0)
- Website: https://claude-mem.ai
- GitHub: https://github.com/thedotmack/claude-mem

## Community

- **Discussion and errata**: [inferloop.dev](https://inferloop.dev), or open an issue on GitHub
- **mini-mem extensions**: share yours with the community

## License

The text is published under **CC BY-NC-SA 4.0**, and the code examples under **MIT**.

- Personal reposts: credit the source and link back to [inferloop.dev](https://inferloop.dev)
- Commercial use: contact the author for permission
- Not allowed: redistributing with the copyright notice removed
