# Criticality

**A Context-Shedding Architecture for Autonomous Software Synthesis**

![Status: Phase 2 - TypeScript Adapter Complete](https://img.shields.io/badge/Status-Phase_2:_TypeScript_Adapter_Complete-green)
![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6)

---
...

## Development Status

The project is currently in **Phase 2: TypeScript Target Adapter**.

- [x] **Protocol State Machine**: Phase transitions and blocking states defined.
- [x] **Model Routing**: Unified interface for Claude Code and OpenCode backends.
- [x] **MCP Servers**: Artifact and Toolchain servers implemented.
- [x] **TypeScript Adapter**: AST manipulation, witness generation, and contract parsing implemented.
- [x] **Test Generation Suite**: Support for property (fast-check), behavioral, concurrent (workers), and benchmark testing.
- [x] **LLM-Based Claim Parsing**: Automated transformation of natural language claims into structured test scenarios.
- [ ] **Phase Implementation**: Ignition and Lattice phases are next.

See [ROADMAP.md](./ROADMAP.md) for the detailed development plan.

## Getting Started

### Prerequisites

- Node.js 20.x
- npm

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

- **[SPECIFICATION.md](./SPECIFICATION.md)**: The complete, authoritative protocol specification.
- **[ROADMAP.md](./ROADMAP.md)**: Implementation progress and future milestones.
- **[DECISIONS.toml](./DECISIONS.toml)**: Record of architectural decisions.

## License

MIT
