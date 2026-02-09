# Criticality Protocol - Development Roadmap

**Version**: 0.2.0
**Last Updated**: 2026-02-06

---

## Current Status: Phase 3 Complete

Phase 0 (Design), Phase 1 (Core Infrastructure), Phase 2 (TypeScript Adapter), and Phase 3 (Protocol Phase Implementation) are complete. The codebase includes:
- Full configuration system with TOML parsing and environment overrides
- Append-only decision ledger with dependency tracking and cascade invalidation
- Protocol state machine with blocking, persistence, and checkpoint/resume
- Model router with Claude Code and OpenCode clients, retry logic, and context budgeting
- MCP servers for artifacts and toolchain
- Agent skills registry and subagent swarm access policies
- Complete TypeScript adapter with AST manipulation, compiler integration, witness generation, and contract parsing
- Comprehensive property, behavioral, concurrent, and benchmark test generators
- LLM-based claim parsing for structured test scenario generation
- **Phase I (Ignition)**: User intent parsing, spec synthesis prompts, adversarial auditor, and claim extraction
- **Phase II (Lattice)**: Module/type/function signature generation, witness integration, contract attachment, compilation verification loop
- **Composition Audit**: Contradiction detection prompts, report parsing, phase regression, ledger integration
- **Phase III (Injection)**: Ralph Loop with context extraction, minimal prompt generation, AST injection, test execution, escalation logic, circuit breaker, security scanning
- **Phase III.5 (Mesoscopic)**: Cluster definition, spec-driven test generation, cluster execution, verdict handling
- **Phase IV (Mass Defect)**: Complexity analysis with ESLint integration, TOML-based transformation catalog (14 patterns), transformation application via LLM, semantic verification per risk level, iteration until convergence

---

## Phase 0: Design Completion

### Completed

- [x] Core protocol architecture defined
- [x] Phase definitions and transitions specified
- [x] Decision Ledger structure designed
- [x] Type witness cross-language approach designed
- [x] Micro-contract grammar defined
- [x] Escalation logic specified
- [x] Human intervention/blocking behavior defined
- [x] Property test synthesis pipeline designed
- [x] Model allocation strategy defined
- [x] Living specification document created
- [x] Decision ledger initialized
- [x] Finalize orchestrator state machine specification
- [x] Define Mass Defect transformation catalog
- [x] Specify model routing cost optimization rules
- [x] Design telemetry and observability approach
- [x] Define success metrics and benchmarks

---

## Phase 1: Core Infrastructure

**Goal**: Build the orchestrator skeleton and basic phase transitions.

### Milestones

#### 1.1 Project Scaffolding
- [x] Initialize TypeScript project with strict mode
- [x] Set up CI/CD pipeline
- [x] Configure linting (ESLint) and formatting (Prettier)
- [x] Set up testing infrastructure (Vitest for unit/integration, fast-check for property)
- [x] Create documentation generation (TypeDoc)

#### 1.2 Configuration System
- [x] Implement `criticality.toml` parser
- [x] Implement `spec.toml` parser
- [x] Create configuration validation
- [x] Support environment variable overrides

#### 1.3 Decision Ledger
- [x] Implement append operations
- [x] Implement override/invalidate operations
- [x] Implement cascade (dependency tracking)
- [x] Implement serialization/deserialization
- [x] Add ledger query interface

#### 1.4 Protocol State Machine
- [x] Define `ProtocolState` enum
- [x] Implement phase transitions
- [x] Implement blocking state
- [x] Implement state persistence
- [x] Add checkpoint/resume capability

#### 1.5 Model Router
- [x] Define `ModelRouter` trait
- [x] Implement Anthropic client (Claude)
- [x] Implement Groq client (Kimi K2)
- [x] Implement Cerebras client (MiniMax)
- [x] Add request/response logging
- [x] Implement retry logic with backoff

#### 1.6 Tooling & Agents
- [x] Implement `criticality-artifact-server` (MCP)
- [x] Implement `criticality-toolchain-server` (MCP)
- [x] Define Agent Skills & Permissions registry
- [x] Configure Subagent Swarm access policies

---

## Phase 2: TypeScript Target Adapter (First Target)

**Goal**: Full protocol support for TypeScript as the first target language (also serves as reference implementation).

### Milestones

#### 2.1 AST Operations
- [x] Integrate `ts-morph` for AST manipulation
- [x] Implement function body injection
- [x] Implement `throw new Error('TODO')` detection
- [x] Implement signature extraction
- [x] Implement type extraction

#### 2.2 Compiler Integration
- [x] Implement `tsc` wrapper
- [x] Parse compiler errors into structured format
- [x] Extract type information from errors
- [x] Implement `vitest` test runner wrapper
- [x] Parse test results

#### 2.3 Type Witness Generator
- [x] Implement branded type witness generation
- [x] Generate validation factory functions
- [x] Generate runtime assertions
- [x] Generate fast-check Arbitrary instances

#### 2.4 Micro-Contract Parser
- [x] Parse contract JSDoc comments
- [x] Extract @requires/@ensures/etc tags
- [x] Validate contract syntax
- [x] Generate contract objects for prompts

#### 2.5 Property Test Generator
- [x] Implement claim parser (LLM-based)
- [x] Generate fast-check tests for invariant claims
- [x] Generate integration tests for behavioral claims
- [x] Generate concurrent tests with workers
- [x] Generate benchmark tests

---

## Phase 3: Phase Implementation

**Goal**: Implement all protocol phases (using TypeScript adapter as reference).

### Milestones

#### 3.1 Phase I: Ignition
- [x] Implement user intent parser
- [x] Implement spec synthesis prompt
- [x] Implement adversarial auditor integration
- [x] Implement spec artifact generator
- [x] Implement claim extraction

#### 3.2 Phase II: Lattice
- [x] Implement module structure generator
- [x] Implement type definition generator
- [x] Implement function signature generator
- [x] Implement witness generation integration
- [x] Implement contract attachment
- [x] Implement compilation verification loop

#### 3.3 Composition Audit
- [x] Implement contradiction detection prompts
- [x] Parse contradiction reports
- [x] Implement phase regression on contradiction
- [x] Add contradiction to ledger

#### 3.4 Phase III: Injection
- [x] Implement Ralph Loop
- [x] Implement context extraction
- [x] Implement minimal prompt generation
- [x] Implement AST injection
- [x] Implement test execution per function
- [x] Implement escalation logic
- [x] Implement circuit breaker
- [x] Implement security scanner

#### 3.5 Phase III.5: Mesoscopic
- [x] Implement cluster definition
- [x] Implement spec-driven test generation
- [x] Implement cluster execution
- [x] Implement cluster verdict handling
- [x] Implement re-injection on failure

#### 3.6 Phase IV: Mass Defect
- [x] Integrate complexity analysis tools (ESLint + custom heuristics)
- [x] Implement transformation catalog (TOML-based with 14 patterns)
- [x] Implement transformation application (LLM-powered refactoring)
- [x] Implement semantic verification (risk-based test execution)
- [x] Implement iteration until convergence
- [x] Implement reporting and module exports
- [x] Add Mass Defect configuration to criticality.toml schema
- [x] Integrate Mass Defect phase into protocol orchestrator

---

## Phase 4: Human Interface

**Goal**: Robust human interaction for blocking states.

### Milestones

#### 4.1 CLI Interface
- [ ] Implement blocking query display
- [ ] Implement option selection
- [ ] Implement clarification input
- [ ] Implement status display
- [ ] Implement resume command

#### 4.2 Notification System
- [ ] Implement notification trait
- [x] Add webhook integration
- [ ] Add Slack integration (deferred to future phase)
- [ ] Add email integration (deferred to future phase)
- [ ] Implement reminder scheduling

#### 4.3 Web Dashboard (Optional)
- [ ] Design dashboard UI
- [ ] Implement protocol state visualization
- [ ] Implement ledger browser
- [ ] Implement blocking query UI
- [ ] Implement real-time updates

---

## Phase 5: Additional Target Language Support

**Goal**: Extend protocol to generate Rust, Python, and Go code.

### Milestones

#### 5.1 Rust Adapter
- [ ] Create Rust AST helper binary (using `syn`/`quote`)
- [ ] Implement `cargo check` integration
- [ ] Implement `cargo test` integration
- [ ] Implement newtype witness generator
- [ ] Implement proptest property test generator

#### 5.2 Python Adapter
- [ ] Integrate ast module or libcst (via Python subprocess)
- [ ] Implement mypy integration
- [ ] Implement pytest integration
- [ ] Implement NewType witness generator
- [ ] Implement hypothesis property test generator

#### 5.3 Go Adapter
- [ ] Create Go AST helper (using go/ast)
- [ ] Implement go build integration
- [ ] Implement go test integration
- [ ] Implement type definition witness generator
- [ ] Implement gopter property test generator

---

## Phase 6: Production Hardening

**Goal**: Make the protocol production-ready.

### Milestones

#### 6.1 Reliability
- [ ] Comprehensive error handling
- [ ] Graceful degradation on model failures
- [ ] Automatic retry with exponential backoff
- [ ] State recovery from crashes

#### 6.2 Observability
- [ ] Structured logging
- [ ] Metrics collection (Prometheus)
- [ ] Distributed tracing
- [ ] Cost tracking per run

#### 6.3 Security
- [ ] Secrets management
- [ ] API key rotation
- [ ] Audit logging
- [ ] Sandboxed code execution

#### 6.4 Performance
- [ ] Parallel injection execution
- [ ] Caching of model responses (where safe)
- [ ] Incremental compilation support
- [ ] Memory optimization for large codebases

---

## Phase 7: Advanced Features

**Goal**: Extend protocol capabilities.

### Milestones

#### 7.1 Incremental Updates
- [ ] Detect spec changes
- [ ] Identify affected phases
- [ ] Preserve unaffected artifacts
- [ ] Targeted re-execution

#### 7.2 Multi-Language Projects
- [ ] Cross-language type mapping
- [ ] Unified spec for polyglot projects
- [ ] FFI interface generation

#### 7.3 IDE Integration
- [ ] VS Code extension
- [ ] Real-time Lattice visualization
- [ ] Contract editing
- [ ] Inline witness inspection

#### 7.4 Formal Verification
- [ ] Integration with formal verification tools per target language
- [ ] Property extraction for formal tools
- [ ] Proof obligation generation

---

## Success Metrics

### Protocol Correctness
- All generated code compiles (100% from Phase II onward)
- All generated tests pass after Injection (target: 95%+)
- No security vulnerabilities in generated code

### Efficiency
- Average cost per 1000 LOC generated
- Average time per 1000 LOC generated
- Escalation rate (target: <10% to Sonnet, <1% to Opus)

### Reliability
- Mean time between failures
- Recovery success rate
- Human intervention frequency

### Quality
- Cyclomatic complexity of generated code (target: <10 per function)
- Test coverage of generated code (target: >80%)
- Maintainability index

---

## Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Model API changes | High | Medium | Abstract model interface, version pinning |
| Model capability regression | High | Low | Benchmark suite, fallback strategies |
| Cost overruns | Medium | Medium | Cost tracking, budget limits, model selection optimization |
| Context window limits | Medium | Medium | Aggressive context minimization, chunking strategies |
| New language adoption | Low | High | Plugin architecture, language adapter abstraction |
| Spec language insufficient | Medium | Medium | Extensible spec format, versioning |

---

## Contributing

See CONTRIBUTING.md (to be created) for guidelines on:
- Code style
- Testing requirements
- Documentation standards
- Pull request process
