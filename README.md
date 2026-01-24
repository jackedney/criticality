# Criticality Protocol

**A Context-Shedding Architecture for Autonomous Software Synthesis**

---

## Overview

Criticality is a protocol for autonomous software engineering that explicitly rejects conversational, stateful agent paradigms. Instead, it enforces:

- **Context shedding** at phase boundaries
- **Structural criticality** (compilable from Lattice phase onward)
- **Stateless execution** within phases
- **Compiler-mediated verification** as the governing oracle

The result is a system that minimizes hallucination, goal drift, and entropy accumulation while producing working software.

## Core Insight

> Context is a liability, not an asset.

LLM reliability degrades as heterogeneous conversational context accumulates. This protocol treats forgetting as a safety mechanism.

## Protocol Phases

```
User Intent
    │
    ▼
┌──────────────────┐
│  IGNITION        │  Transform ambiguous intent into formal specification
│  (Specification) │  Model: architect_model + auditor_model
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  LATTICE         │  Generate compilable skeleton with todo!() bodies
│  (Structure)     │  Model: structurer_model
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  COMPOSITION     │  Detect logical contradictions before implementation
│  AUDIT (Verify)  │  Model: auditor_model + architect_model
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  INJECTION       │  Implement functions atomically, stateless
│  (Implementation)│  Model: worker_model → fallback_model (escalation)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  MESOSCOPIC      │  Spec-driven property testing of module clusters
│  (Integration)   │  Model: structurer_model + auditor_model
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  MASS DEFECT     │  Reduce code complexity, preserve semantics
│  (Refinement)    │  Model: worker_model + architect_model
└────────┬─────────┘
         │
         ▼
    Deliverable
```

## Key Mechanisms

### Decision Ledger

An append-only log that preserves **what** was decided (not how it was reasoned) across phase transitions. Enables resumption without context accumulation.

### Type Witnesses

Language-agnostic invariant specifications that compile to maximally expressive type encodings per target language, degrading gracefully where type systems are weaker.

### Micro-Contracts

Declarative constraints (REQUIRES, ENSURES, INVARIANT, COMPLEXITY, PURITY) attached to function signatures that guide implementation without accumulating context.

### Escalation Logic

Functions that fail implementation start with the cheapest capable model (MiniMax), escalating through Sonnet to Opus on repeated failures. Circuit breakers prevent infinite loops.

### Human Blocking

Canonical conflicts (user-confirmed decisions that contradict) halt the protocol entirely until human resolution. No guessing, no workarounds.

## Project Structure

```
criticality/
├── README.md                    # This file
├── SPECIFICATION.md             # Complete protocol specification
├── DECISIONS.toml               # Design decision ledger
├── ROADMAP.md                   # Development roadmap
├── schemas/
│   ├── spec.schema.json         # Specification artifact schema
│   ├── ledger.schema.json       # Decision ledger schema
│   ├── witness.schema.json      # Type witness schema
│   ├── interview.schema.json    # Interview state schema
│   ├── proposal.schema.json     # Spec proposal schema
│   └── question-bank.schema.json # Interview question bank schema
└── examples/
    ├── spec.example.toml        # Example specification
    ├── witness.example.toml     # Example witness definitions
    ├── interview.example.json   # Example interview state (mid-conversation)
    └── proposal.example.toml    # Example proposal for approval
```

## Documentation

- **[SPECIFICATION.md](./SPECIFICATION.md)** — Complete protocol specification
- **[DECISIONS.toml](./DECISIONS.toml)** — All design decisions with rationale
- **[ROADMAP.md](./ROADMAP.md)** — Development phases and milestones

## Status

**Phase: Design**

The protocol specification is complete. Implementation has not yet begun.

See [ROADMAP.md](./ROADMAP.md) for development plan.

## Design Principles

1. **Context as Liability** — Phase boundaries enforce irreversible context shedding
2. **Structural Criticality** — System must compile from Phase II onward
3. **Separation of Cognition and Execution** — High-level reasoning isolated from implementation
4. **Statelessness as Correctness** — Each implementation attempt is a pure function of local context
5. **Explicit Over Implicit** — All decisions captured in machine-readable artifacts

## Model Allocation

The protocol uses role-based model aliases. Specific models are configured separately.

| Role Alias | Purpose | Used In |
|------------|---------|---------|
| `architect_model` | Complex reasoning, user interaction, architecture | Ignition, Mass Defect |
| `auditor_model` | Logical consistency checking, formal reasoning | Ignition, Composition Audit, Mesoscopic |
| `structurer_model` | Code structure generation, pattern following | Lattice, Mesoscopic |
| `worker_model` | Fast, cheap implementation of straightforward functions | Injection, Mass Defect |
| `fallback_model` | Capable fallback for complex implementations | Injection (escalation) |

See `config.toml` for current model assignments.

## Implementation

The Criticality Protocol orchestrator is implemented in **TypeScript**. This choice prioritizes:

- **LLM ecosystem**: First-class SDK support from Anthropic, OpenAI, and others
- **JSON/TOML handling**: Native JSON, excellent TOML parsing
- **GUI path**: Easy integration with Electron/web-based interfaces
- **Voice compatibility**: Web Speech API for future voice agent support
- **Development velocity**: Fast iteration during the design phase

The orchestrator is I/O-bound (waiting on LLM APIs), not CPU-bound, so TypeScript's performance characteristics are well-suited.

## Target Language Support

The protocol can *generate* code in multiple languages:

| Support Tier | Languages | Witness Level |
|--------------|-----------|---------------|
| Full | Rust | distinction (compile-time) |
| Strong | TypeScript, Python, Go | distinction (branded) / runtime |
| Basic | Java, C++ | runtime (wrapper types) |

**Witness Levels** (verification strength):
- `proof` — Compile-time proof (Haskell, Rust typestate)
- `distinction` — Compile-time type distinction (branded types, newtypes)
- `runtime` — Runtime validation
- `doc` — Documentation only (fallback)

**Note**: Protocol v1 assumes single-language projects. Multi-language support is planned for Phase 7.

## Contributing

This project is in the design phase. Contributions to the specification and design decisions are welcome.

## License

TBD
