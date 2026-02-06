# criticality.

**A Context-Shedding Architecture for Autonomous Software Synthesis**

![Status: Phase 3 - Protocol Phases Complete](https://img.shields.io/badge/Status-Phase_3:_Protocol_Phases_Complete-green)
![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6)

---

## Development Status

The project has completed **Phase 3: Protocol Phase Implementation**.

-   [x] **Protocol State Machine**: Phase transitions and blocking states defined.
-   [x] **Model Routing**: Unified interface for Claude Code and OpenCode backends.
-   [x] **MCP Servers**: Artifact and Toolchain servers implemented.
-   [x] **TypeScript Adapter**: AST manipulation, witness generation, and contract parsing implemented.
-   [x] **Test Generation Suite**: Support for property (fast-check), behavioral, concurrent (workers), and benchmark testing.
-   [x] **LLM-Based Claim Parsing**: Automated transformation of natural language claims into structured test scenarios.
-   [x] **Phase I: Ignition**: User intent parsing, spec synthesis, adversarial auditor, and claim extraction.
-   [x] **Phase II: Lattice**: Module/type/function generation, witness integration, contract attachment, compilation verification.
-   [x] **Composition Audit**: Contradiction detection, phase regression, and ledger integration.
-   [x] **Phase III: Injection**: Ralph Loop implementation with context extraction, prompt generation, test execution, escalation, and circuit breaker.
-   [x] **Phase III.5: Mesoscopic**: Cluster definition, spec-driven test generation, execution, and verdict handling.
-   [x] **Phase IV: Mass Defect**: Complexity analysis, transformation catalog, semantic verification, and iteration until convergence.
-   [ ] **Human Interface**: CLI and notification system are next.

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
