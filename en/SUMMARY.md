---
title: Contents
---

# Engineering Agent Memory: Contents

> Source baseline: claude-mem v13.35.0 (released 2026-10-08)

## Preface

- [Preface](00-preface/README.md)

## Part I: Foundations: Why Agents Need Memory

### [Chapter 1: The Agent Memory Problem](01-cognition/ch01-problem-domain/README.md)
- A Five-Minute Experiment: Feel the Problem First
- The Goldfish Problem
- What Broken Context Costs
- Three Questions Every Memory System Must Answer
- Existing Approaches
- claude-mem's Design: Observe → Compress → Inject
- Companion code: `examples/ch01-memory-comparison/`

### [Chapter 2: Meet claude-mem: What It Does and How to Start](01-cognition/ch02-claude-mem-intro/README.md)
- What claude-mem Is
- Six Core Capabilities
- Installation and Configuration
- Everyday Scenarios
- The Viewer UI
- Skills
- Tuning
- Companion code: `examples/ch02-quick-start/`

### [Chapter 3: Context Engineering Basics](01-cognition/ch03-context-engineering/README.md)
- The Token Budget Is an Attention Budget
- Context Rot and Signal-to-Noise
- The Right Altitude for a System Prompt
- Just-in-Time Context vs. Pre-Inference Retrieval
- Three Techniques for Long Tasks
- A Stable Prefix: Prompt Caching Is Context Engineering Too
- Summary
- Companion code: `examples/ch03-context-engineering/`

## Part II: Architecture: claude-mem from End to End

### [Chapter 4: System Architecture Overview](02-architecture/ch04-system-overview/README.md)
- A Route Through the Source
- Four Layers and Two Handoffs
- Eight Hooks in One Session
- The Full Data Path
- Why Hooks Instead of Middleware
- Graceful Degradation: Broken Memory Must Not Break the IDE
- Companion code: `examples/ch04-architecture-demo/`

### [Chapter 5: The Hook-Driven Lifecycle](02-architecture/ch05-hook-lifecycle/README.md)
- How Claude Code Hooks Work
- Hook I/O Discipline
- Setup: Self-Repair When Dependencies Are Missing
- SessionStart: Two Hooks, One Async and One Sync
- UserPromptSubmit: Registering This Turn's Prompt
- PostToolUse and PostToolUseFailure: Write to Disk and Return
- PreToolUse: File Context and the File Read Gate
- Stop and SessionEnd: No Waiting at the End Either
- Hook Performance
- Companion code: `examples/ch05-hook-playground/`

### [Chapter 6: The Worker Service: An Asynchronous Processing Engine](02-architecture/ch06-worker-service/README.md)
- Why a Background Worker
- The HTTP Layer: Routes Grouped by Caller
- Pickup: hook-spool's Exactly-Once Handoff
- The In-Memory Buffer: Why the Persistent Queue Went Away
- The Observer Generator
- Two Session IDs
- Process Management: Trust the Port and the Health Check
- Graceful Shutdown: Six Steps and a Hard Deadline
- Companion code: `examples/ch06-worker-queue/`

### [Chapter 7: Storage Layer Design](02-architecture/ch07-storage/README.md)
- SQLite: From 6 Tables to 21
- PRAGMAs and Concurrency
- FTS5 Full-Text Search
- Chroma Vector Storage
- Search Routing: Chroma First, SQLite Fills the Gaps
- Deduplication: Duplicates Become Evidence Instead of Being Dropped
- Companion code: `examples/ch07-storage-layer/`

## Part III: Mechanisms: What to Remember and How to Retrieve It

### [Chapter 8: Progressive Disclosure](03-mechanisms/ch08-progressive-disclosure/README.md)
- The Idea: Let the Agent Decide What to Look At
- Five Layers in One Session
- Layer 0: Work State Comes Before Memory
- Layer 1: The Startup Index
- Layers 2 and 3: A Three-Step Search That's Enforced
- Layer 4: Raw Evidence
- Progressive Disclosure for Reading Code: The File Read Gate
- Types and Concepts: Two Independent Dimensions
- Compared with Traditional RAG
- Companion code: `examples/ch08-progressive-disclosure/`

### [Chapter 9: The MCP Search Architecture](03-mechanisms/ch09-mcp-search/README.md)
- MCP (Model Context Protocol) Basics
- The Tool List: From 4 to 19
- From `__IMPORTANT` to `important_workflow`
- Read-Only Declarations and Plan Mode
- A Runtime-Aware Tool List
- Schemas: From "As Small as Possible" to "Say It Clearly"
- Implementing the MCP Server
- Injection Defenses in the Query Layer
- Companion code: `examples/ch09-mcp-server/`

### [Chapter 10: The Observation System](03-mechanisms/ch10-observation-system/README.md)
- The Unit of Memory: One Tool Call
- The Pipeline from Tool Call to Observation
- The Fields of an Observation
- Modes: One Pipeline, Different Recording Standards
- File Associations
- Privacy: Tags Are Stripped in the Worker
- Explicit Memory: save_memory
- Usage Signals: Reinforcement Ranking
- Companion code: `examples/ch10-observation-pipeline/`

### [Chapter 11: The Knowledge Agent: Building Knowledge Bases](03-mechanisms/ch11-knowledge-agent/README.md)
- From Observations to a Corpus
- A Corpus Is a JSON File
- Build → Prime → Query
- Filtering and Focus
- Maintenance: Rebuild and Reprime
- How the Knowledge Agent and mem_search Divide the Work
- Companion code: `examples/ch11-knowledge-agent/`

## Part IV: Hands-On: Building a Memory Plugin from Scratch

### [Chapter 12: Setting Up a Development Environment](04-practice/ch12-dev-setup/README.md)
- Claude Code Plugin Basics
- Debugging Hooks
- Developing an MCP Server Locally
- SQLite Tooling
- Companion Code
- Companion code: `examples/ch12-dev-setup/`

### [Chapter 13: Building a Mini Memory Plugin (mini-mem)](04-practice/ch13-mini-mem/README.md)
- Planning: The MVP Scope
- The Hook Layer
- The Storage Layer
- MCP Search
- Testing and Debugging
- Troubleshooting
- Companion code: `examples/ch13-mini-mem/`

### [Chapter 14: Advanced Extensions](04-practice/ch14-extensions/README.md)
- The Big Picture
- Go Asynchronous First
- Adding AI Compression
- A Timeline View
- Integrating Vector Search
- The Viewer UI: A Live Dashboard
- Identifying Projects
- Companion code: `examples/ch14-extensions/`

## Part V: Beyond the Plugin: Platforms, Multiple Hosts, and the Frontier

### [Chapter 15: A Survey of Agent Memory Solutions](05-enterprise/ch15-industry-survey/README.md)
- OpenAI Memory / ChatGPT Memory
- LangChain / LangGraph Memory
- Mem0: An Open-Source Memory Layer
- Zep: A Long-Term Memory Service
- MemGPT / Letta: OS-Style Memory Management
- Cognee: A Memory Engine Built on a Knowledge Graph
- Memory Built into the Host: Claude Code and Codex
- Quick Try: Five Minutes with Each
- Side-by-Side Comparison and Takeaways
- Companion code: `examples/ch15-industry-survey/`

### [Chapter 16: From Plugin to Platform: The claude-mem Server Runtime](05-enterprise/ch16-platform-upgrade/README.md)
- Two Runtimes
- The Journey of One Event
- Tenant Isolation Lives in the Schema
- Authentication, Scopes, and Quotas
- What Happens When Things Fail
- Search: tsvector, and an Embedding Column Not Yet Used
- Migrating from Worker to Server
- Compared with the Obvious Design
- Running the Example
- Companion code: `examples/ch16-platform-arch/`

### [Chapter 17: Enterprise Features: What the Open-Source Edition Provides and What You Must Add](05-enterprise/ch17-enterprise-features/README.md)
- Where Does the Data Go?
- Will Secrets Get Recorded?
- Can the System Itself Be Trusted?
- Can It Be Deleted Completely?
- Team Memory and Permissions (Reserved Area, Build-Your-Own Design)
- Audit Logs (Reserved Area, Build-Your-Own Design)
- Measurement: Is the Memory Actually Being Used? (Build-Your-Own Design)
- Running the Examples
- Companion code: `examples/ch17-enterprise-features/`

### [Chapter 18: One Memory, Many Hosts](05-enterprise/ch18-multi-host/README.md)
- Three Ways In
- Hook Adapters: Translating Different stdin into One Structure
- Declarative Transcripts: Describing a Log Format in Configuration
- Native Plugins
- The Single-Writer Rule
- Identity: Use the Session and Prompt IDs the Host Gives You
- A Checklist for Connecting a New Host
- Running the Example
- Companion code: `examples/ch18-multi-host/`

### [Chapter 19: Cross-Device Sync: The Database Is the Queue](05-enterprise/ch19-cloud-sync/README.md)
- The Overall Structure
- Push: The Database Is the Queue
- Pull: Apply the Data and the Cursor in One Transaction
- What Doesn't Sync
- Deletion and Tombstones
- Compared with Chapter 16's Server Runtime
- Running the Example
- Companion code: `examples/ch19-cloud-sync/`

### [Chapter 20: The Frontier](05-enterprise/ch20-frontier/README.md)
- Interoperability: No Standard, but De Facto Interfaces
- Forgetting: From a Retention Score to ACT-R
- Multiple Agents: Observing Subagents
- Multimodality: Keep Images Out First
- Memory-Driven Self-Improvement
- Companion code: `examples/ch20-frontier/`

## Appendices

- [Appendix A: A Map of the claude-mem Source](appendix/A-source-map.md)
- [Appendix B: Claude Code Hook API Quick Reference](appendix/B-hook-api.md)
- [Appendix C: MCP Protocol Essentials](appendix/C-mcp-protocol.md)
- [Appendix D: SQLite FTS5 Syntax Quick Reference](appendix/D-fts5-syntax.md)
- [Appendix E: mini-mem Source Listing](appendix/E-mini-mem-listing.md)
- [Appendix F: References](appendix/F-references.md)
