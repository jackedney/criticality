# Criticality

```text
 1  ▄▀▀▀ █▀▀▄ ▀█▀ ▀█▀ ▀█▀ ▄▀▀▀ ▄▀▀▄ █    ▀█▀ ▀█▀ █  █
 2  █    █▄▄▀  █   █   █  █    █▄▄█ █     █   █  ▀▄▄▀
 3  ▀▄▄▄ █  █ ▄█▄  █  ▄█▄ ▀▄▄▄ █  █ █▄▄▄ ▄█▄  █    █   ●
```

> autonomous software synthesis through context-shedding

```text
                    ┌─────────────────────────────────────────┐
                    │                                         │
  intent ──────────>│  Ignition -> Lattice -> Composition   │──────────> code
                    │    Audit -> Injection -> Mesoscopic      │
                    │         -> Mass Defect                  │
                    │         Decision Ledger ◀───────┘       │
                    │                                         │
                    └─────────────────────────────────────────┘
```

## status

```text
phase 4.1, 4.3: CLI interface & web dashboard ........... complete
phase 4.2: notification system .......................... partial
```

## quickstart

```bash
git clone https://github.com/jackedney/criticality.git
cd criticality
npm install
npm test
```

## architecture

```text
src/
├── interview/        # Ignition: specification interrogation
├── lattice/          # Lattice: structure-first diffusion
├── composition-audit/# Composition Audit: contradiction detection
├── injection/        # Injection: atomic stateless implementation
├── mesoscopic/       # Mesoscopic: integration verification
├── mass-defect/      # Mass Defect: complexity reduction
├── adapters/         # language-specific implementations
├── protocol/         # state machine & orchestration
├── router/           # model routing & cost optimization
└── servers/          # MCP artifact & toolchain servers
```

## docs

- [SPECIFICATION.md](./SPECIFICATION.md) — protocol spec
- [ROADMAP.md](./ROADMAP.md) — implementation progress
- [DECISIONS.toml](./DECISIONS.toml) — architectural decisions

## license

MIT
