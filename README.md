# criticality.

**A Context-Shedding Architecture for Autonomous Software Synthesis**

![Status: Phase 2 - TypeScript Adapter Complete](https://img.shields.io/badge/Status-Phase_2:_TypeScript_Adapter_Complete-green)
![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6)

---

## Overview

Criticality is a 'vibe coding' protocol for autonomous software engineering that explicitly rejects conversational, stateful agent paradigms. Instead, it enforces strict **context shedding** at phase boundaries to prevent hallucination, goal drift, and entropy accumulation.

Traditional coding agents treat context as an asset, accumulating conversation history until they degrade. **Criticality treats context as a liability.**

By enforcing **Structural Criticality** (the codebase must always compile) and **Stateless Execution**, the protocol turns the compiler into a governing oracle, ensuring that the system converges on a correct solution rather than drifting into "almost working" states.

## Core Philosophy

> **Context is a liability, not an asset.**

1.  **Context Shedding**: Irreversible phase transitions annihilate conversation history. Only formal artifacts (specs, ledger, code) survive.
2.  **Structural Criticality**: From the *Lattice* phase onward, the project must strictly compile.
3.  **Statelessness**: Implementation attempts are pure functions of their inputs. We do not "debug" failed attempts; we discard them and retry with fresh context.
4.  **Compiler as Oracle**: The compiler is the ultimate source of truth, not the LLM's self-assessment.

## Protocol Phases

The software synthesis process is decomposed into six distinct phases:

1.  **Ignition (Specification)**: Transforms ambiguous user intent into a formal, immutable specification and a Decision Ledger.
2.  **Lattice (Structure)**: Generates a fully compilable project skeleton with `todo!()` bodies and type definitions.
3.  **Composition Audit (Verify)**: Static analysis and logical verification to detect contradictions before any code is written.
4.  **Injection (Implementation)**: Atomically implements function bodies in parallel, stateless threads.
5.  **Mesoscopic (Integration)**: Spec-driven property testing of module clusters to verify integration.
6.  **Mass Defect (Refinement)**: Complexity reduction and refactoring while preserving semantic behavior.

## Architecture & Tooling

### Model Context Protocol (MCP)

Criticality is built on the [Model Context Protocol](https://github.com/modelcontextprotocol/model-context-protocol), utilizing specialized servers to ground agents in reality:

-   **Artifact Server**: Manages the `DECISIONS.toml`, `SPECIFICATION.md`, and Type Witnesses. Prevents hallucination by serving as the single source of truth.
-   **Toolchain Server**: Wraps build tools (`tsc`, `cargo`, `vitest`) to provide structured, machine-readable outputs (JSON) instead of raw stdout, enabling agents to reason precisely about errors.

### Decision Ledger

An append-only, cryptographically verifiable log (`DECISIONS.toml`) that records **what** was decided, not **how** it was discussed. This allows the system to resume or fork execution without needing the original conversation history.

### Agent Swarm

The protocol utilizes a swarm of specialized sub-agents, each with restricted permissions and distinct models:

-   **Architect**: High-level reasoning (Claude Opus/Sonnet).
-   **Structurer**: Code organization and type design.
-   **Worker**: Atomic implementation (fast/cheap models like Haiku or DeepSeek).
-   **Auditor**: Adversarial verification and safety checks.

## Development Status

The project is currently in **Phase 2: TypeScript Target Adapter**.

-   [x] **Protocol State Machine**: Phase transitions and blocking states defined.
-   [x] **Model Routing**: Unified interface for Claude Code and OpenCode backends.
-   [x] **MCP Servers**: Artifact and Toolchain servers implemented.
-   [x] **TypeScript Adapter**: AST manipulation, witness generation, and contract parsing implemented.
-   [ ] **Phase Implementation**: Ignition and Lattice phases are next.

See [ROADMAP.md](./ROADMAP.md) for the detailed development plan.

## Getting Started

### Prerequisites

-   Node.js 20.x
-   npm

### Installation

```bash
git clone https://github.com/jackedney/criticality.git
cd criticality
npm install
```

### Running Tests

```bash
# Run unit and integration tests
npm test

# Run type checking
npm run typecheck

# Lint the codebase
npm run lint
```

## Documentation

-   **[SPECIFICATION.md](./SPECIFICATION.md)**: The complete, authoritative protocol specification.
-   **[ROADMAP.md](./ROADMAP.md)**: Implementation progress and future milestones.
-   **[DECISIONS.toml](./DECISIONS.toml)**: Record of architectural decisions.

## License

MIT
