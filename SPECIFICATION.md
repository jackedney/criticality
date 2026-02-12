# Criticality Protocol Specification

## A Context-Shedding Architecture for Autonomous Software Synthesis

**Version**: 0.1.0-draft
**Status**: Design Phase Complete
**Last Updated**: 2025-01-24

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Design Principles](#2-design-principles)
3. [Architecture Overview](#3-architecture-overview)
4. [Phase Definitions](#4-phase-definitions)
   - [Ignition](#ignition-specification-interrogation)
   - [Lattice](#lattice-structure-first-diffusion)
   - [Composition Audit](#composition-audit-pre-injection-verification)
   - [Injection](#injection-atomic-stateless-implementation)
   - [Mesoscopic](#mesoscopic-verification)
   - [Mass Defect](#mass-defect-beta-reduction--distillation)
5. [Cross-Cutting Concerns](#5-cross-cutting-concerns)
   - [Decision Ledger](#51-decision-ledger)
   - [Type Witnesses](#52-type-witnesses-cross-language)
   - [Micro-Contracts](#53-micro-contracts)
   - [Escalation Logic](#54-escalation-logic)
   - [Human Intervention & Blocking](#55-human-intervention--blocking)
6. [Property Test Synthesis](#6-property-test-synthesis)
7. [Model Allocation](#7-model-allocation)
8. [Tooling & Agent Architecture](#8-tooling--agent-architecture)
9. [Orchestrator Specification](#9-orchestrator-specification)
10. [Language Support Matrix](#10-language-support-matrix)
11. [Open Questions & Future Work](#11-open-questions--future-work)
12. [Appendices](#12-appendices)

---

## 1. Executive Summary

The Criticality Protocol (also known as the Atomic Reduction Protocol) defines a state-transition-based architecture for autonomous software engineering systems. It explicitly rejects conversational, stateful agent paradigms in favor of:

- **Enforced context annihilation** at phase boundaries
- **Stateless execution** within phases
- **Compiler-mediated verification** as the governing oracle
- **Irreversible phase transitions** that prevent entropy accumulation

The protocol decomposes software synthesis into six phases: Ignition, Lattice, Composition Audit, Injection, Mesoscopic, and Mass Defect. Each phase has narrowly scoped responsibilities, strict input/output artifacts, and purpose-built language model assignments. Phases are referenced by semantic name only (not numbered).

### Key Invariant

From Lattice phase onward, the system must remain **structurally critical** (compilable). This constraint elevates the compiler from a debugging aid to a governing oracle that bounds the search space.

### Core Insight

Context is a liability, not an asset. LLM reliability degrades as heterogeneous conversational context accumulates. The protocol treats forgetting as a safety mechanism.

---

## 2. Design Principles

### 2.1 Context as a Liability

Large Language Models degrade in reliability as heterogeneous conversational context accumulates. The protocol treats context as a **consumable resource** rather than a persistent asset. Phase boundaries enforce **irreversible context shedding**, ensuring that no reasoning traces, failed attempts, or discarded assumptions propagate forward.

**Definition**: Context shedding ("shedContext") means archiving context to disk while removing it from active LLM memory. The data is preserved for audit but isolated from active processing.

**Implication**: Each phase receives only structured artifacts, never conversation history.

### 2.2 Structural Criticality

From Lattice phase onward, the system must remain compilable. This invariant:

- Constrains the search space for subsequent phases
- Provides immediate feedback on structural errors
- Enables incremental progress verification
- Prevents "almost working" states that accumulate technical debt

**Implication**: Every code modification must pass `cargo check` (or equivalent) before being accepted.

### 2.3 Separation of Cognition and Execution

High-level reasoning (architecture, specification, refactoring) is isolated from low-level execution (function implementation). This separation enables:

- Optimal model selection per task type
- Cost optimization (expensive models for design, cheap models for implementation)
- Clearer failure attribution

**Implication**: Different models are assigned to different phases based on minimum capability required.

### 2.4 Statelessness as Correctness

All code generation in the Injection phase is performed as a pure function of local context. No memory of prior failures or successes is retained within the phase.

**Implication**: If a function fails to implement, we start fresh rather than debugging the failure.

### 2.5 Explicit Over Implicit

All decisions, constraints, and assumptions must be captured in machine-readable artifacts. Nothing lives only in conversation.

**Implication**: The Decision Ledger captures all validated decisions for future reference.

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CRITICALITY PROTOCOL                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐                                                        │
│  │   USER INTENT    │                                                        │
│  └────────┬─────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  ┌──────────────────┐     ┌─────────────────┐                               │
│  │  IGNITION         │     │  Decision       │                               │
│  │  (Specification) │────▶│  Ledger         │◀─── Persists across phases    │
│  │                  │     │  (append-only)  │                               │
│  └────────┬─────────┘     └─────────────────┘                               │
│           │                        ▲                                         │
│           │ spec.toml              │ decisions                               │
│           ▼                        │                                         │
│  ┌──────────────────┐              │                                         │
│  │  LATTICE         │              │                                         │
│  │  (Structure)     │──────────────┤                                         │
│  │                  │              │                                         │
│  └────────┬─────────┘              │                                         │
│           │                        │                                         │
│           │ skeleton + witnesses   │                                         │
│           ▼                        │                                         │
│  ┌──────────────────┐              │                                         │
│  │  COMPOSITION     │              │                                         │
│  │  AUDIT           │──────────────┤                                         │
│  │  (Verification)  │              │                                         │
│  └────────┬─────────┘              │                                         │
│           │                        │                                         │
│           │ validated structure    │                                         │
│           ▼                        │                                         │
│  ┌──────────────────┐              │                                         │
│  │  INJECTION       │              │                                         │
│  │  (Implementation)│──────────────┤                                         │
│  │                  │              │                                         │
│  └────────┬─────────┘              │                                         │
│           │                        │                                         │
│           │ implemented code       │                                         │
│           ▼                        │                                         │
│  ┌──────────────────┐              │                                         │
│  │  MESOSCOPIC      │              │                                         │
│  │  (Integration)   │──────────────┤                                         │
│  │                  │              │                                         │
│  └────────┬─────────┘              │                                         │
│           │                        │                                         │
│           │ verified code          │                                         │
│           ▼                        │                                         │
│  ┌──────────────────┐              │                                         │
│  │  MASS DEFECT    │              │                                         │
│  │  (Refinement)    │──────────────┘                                         │
│  │                  │                                                        │
│  └────────┬─────────┘                                                        │
│           │                                                                  │
│           │ final artifact                                                   │
│           ▼                                                                  │
│  ┌──────────────────┐                                                        │
│  │  DELIVERABLE     │                                                        │
│  └──────────────────┘                                                        │
│                                                                              │
│  ════════════════════════════════════════════════════════════════════════   │
│                                                                              │
│  ORCHESTRATOR (Deterministic, No Reasoning)                                  │
│  • Phase transitions        • Context destruction                            │
│  • AST parsing/mutation     • Compiler/test execution                        │
│  • Model routing            • Escalation logic                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase Transition Rules

| From | To | Condition | Artifacts Passed |
|------|----|-----------|------------------|
| Ignition | Lattice | Spec artifact finalized | `spec.toml` |
| Lattice | Composition Audit | Skeleton compiles | Lattice code, witnesses, contracts |
| Composition Audit | Injection | No contradictions found | Validated structure |
| Injection | Mesoscopic | All `todo!()` replaced | Implemented code |
| Mesoscopic | Mass Defect | All clusters pass | Verified code |
| Mass Defect | Complete | Metrics satisfied | Final artifact |

### Failure Transitions

| Phase | Failure Type | Target Phase |
|-------|--------------|--------------|
| Composition Audit | Contradiction found | Ignition (with contradiction report) |
| Injection | Circuit breaker (>20% escalation) | Lattice (structural defect) |
| Mesoscopic | Cluster failure | Injection (re-inject cluster) |
| Any | Canonical conflict | BLOCKED (human intervention) |

---

## 4. Phase Definitions

### Ignition (Specification Interrogation)

#### Objective

Transform ambiguous user intent into a complete, internally consistent, and machine-readable specification artifact through a structured interview process.

#### Key Principle: User-Controlled Depth

The interview has a core structure but allows the user to delegate to the Architect at any point. At delegation points, the user can say "that's enough detail, proceed with your best judgment" and the Architect takes over for remaining decisions.

#### Interview Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                    IGNITION INTERVIEW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PHASE 1: DISCOVERY (Required)                                  │
│  ├── Problem & Users                                            │
│  ├── Success Criteria                                           │
│  └── Core Features (MVP)                                        │
│                                                                 │
│  PHASE 2: ARCHITECTURE (Required)                               │
│  ├── Language & Platform                                        │
│  ├── External Integrations                                      │
│  └── Feature Classification (Core / Foundational / Bolt-on)    │
│                                                                 │
│  PHASE 3: CONSTRAINTS (Optional Depth)                          │
│  ├── Performance Requirements                                   │
│  ├── Security Requirements                                      │
│  ├── Compliance / Regulatory                                    │
│  └── [User can delegate remainder to Architect]                 │
│                                                                 │
│  PHASE 4: DESIGN PREFERENCES (Optional Depth)                   │
│  ├── Error Handling Philosophy                                  │
│  ├── Logging & Observability                                    │
│  ├── Testing Strategy                                           │
│  ├── API Style (REST/GraphQL/gRPC)                              │
│  ├── State Management                                           │
│  └── [User can delegate remainder to Architect]                 │
│                                                                 │
│  PHASE 5: SYNTHESIS                                             │
│  ├── Architect produces proposal                                │
│  ├── Auditor challenges                                         │
│  └── Present to user                                            │
│                                                                 │
│  PHASE 6: APPROVAL                                              │
│  ├── Approve → Lattice                                          │
│  ├── Revise → Return to relevant phase                          │
│  └── Reject → Clear and restart                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Feature Classification

Features are explicitly classified during the interview:

| Category | Definition | Example | Lattice Impact |
|----------|------------|---------|----------------|
| **Core** | MVP functionality, must ship | User login, basic CRUD | Full implementation |
| **Foundational** | Not in MVP but affects architecture | Multi-tenancy, i18n, plugin system | Skeleton/extension points in Lattice |
| **Bolt-on** | Can add without touching core | Dark mode, export to CSV | Not in Lattice |

The interview explicitly surfaces this classification:

> "You mentioned multi-tenancy as a future feature. This will affect database schema, auth, and API design. Should we architect for it now (foundational) or treat it as a future refactor (bolt-on)?"

#### Delegation Points

At the end of each optional phase, the user is offered delegation:

```
Interview Agent: "We've covered the core constraints. I can continue with
detailed design preferences (error handling, logging, testing, API style),
or I can proceed with sensible defaults based on your requirements so far.
Which would you prefer?"

Options:
- [Continue] — Ask me about design preferences
- [Delegate] — Use your judgment for the rest
- [Delegate with notes] — Use your judgment, but here are some preferences: ___
```

When user delegates, the Architect records this in the Decision Ledger:

```toml
[decisions.design_delegation_001]
id = "design_delegation_001"
timestamp = "2025-01-24T10:15:00Z"
category = "architectural"
constraint = "Design preferences delegated to Architect judgment"
source = "user_explicit"
confidence = "canonical"
phase = "ignition"
user_notes = "Just make sure errors are user-friendly, not stack traces"
```

#### Interview State Persistence

Interview state is fully persisted, allowing resume from any point:

```
~/.criticality/projects/<project>/
├── interview/
│   ├── state.json              # Current interview state
│   ├── transcript.jsonl        # All turns (append-only)
│   └── proposals/
│       ├── v1.toml             # First synthesis attempt
│       ├── v1_feedback.json    # User's revision request
│       ├── v2.toml             # Revised proposal
│       └── v2_approved.json    # Approval record
```

#### Resume Behavior

On app reopen with in-progress interview, the system:

1. Loads persisted state
2. Generates summary from `extracted_requirements`
3. Presents summary to user for confirmation
4. Resumes from exact position (phase + question)

```
┌─────────────────────────────────────────────────────────────────┐
│  RESUMING INTERVIEW: payment-processor                          │
├─────────────────────────────────────────────────────────────────┤
│  Last session: 2025-01-23 at 14:32                              │
│                                                                 │
│  Completed phases:                                              │
│  ✓ Discovery                                                    │
│  ✓ Architecture                                                 │
│                                                                 │
│  Current phase: Constraints                                     │
│  Last question: "What are your performance requirements?"       │
│                                                                 │
│  Here's what I understand so far:                               │
│  • Building a payment processor for B2B fintech                │
│  • Core: accounts, transfers, balance queries                   │
│  • Foundational: multi-currency (affects data model)            │
│  • Language: Rust                                               │
│                                                                 │
│  Is this still correct?                                         │
│  [Yes, continue] [No, let me correct something]                │
└─────────────────────────────────────────────────────────────────┘
```

#### Proposal & Approval

After synthesis, user receives a structured proposal for approval:

```
┌──────────────────┐
│ Proposal Shown   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐      ┌─────────────────────────────┐
│ User Response    │──────▶ APPROVE                     │
└────────┬─────────┘      │ → Proceed to Lattice        │
         │                └─────────────────────────────┘
         │
         ├───────────────▶ REVISE (with feedback)
         │                │ → Return to relevant phase
         │                │ → Preserve approved sections
         │                └─────────────────────────────┘
         │
         └───────────────▶ REJECT (start over)
                          │ → Clear state
                          │ → Begin new interview
                          └─────────────────────────────┘
```

Proposal versions are preserved for audit trail (`v1.toml`, `v2.toml`, etc.).

#### Voice Agent Compatibility

The interview structure is designed for future voice integration:

- **Turn-based**: Clear question → response → acknowledgment cycles
- **Summarizing**: "So far I understand X, Y, Z. Is that correct?"
- **Recoverable**: Can jump back to any stage without losing context
- **Transcript-based**: Voice transcription feeds same structured format

The underlying data structure is identical for text and voice—only the interface differs.

#### Inputs

- User intent (natural language, via interview)
- Decision Ledger (if resuming from failure)
- Domain context (optional)

#### Outputs

- `spec.toml` — Immutable specification artifact
- `proposal.toml` — Approved proposal (versioned)
- Interview transcript (for audit)
- Updated Decision Ledger

#### Spec Artifact Schema

```toml
[meta]
version = "1.0.0"
created = "2025-01-23T10:00:00Z"
domain = "fintech"

[system]
name = "payment-processor"
description = "Real-time payment processing system"

[boundaries]
external_systems = ["bank-api", "fraud-detection", "notification-service"]
trust_boundaries = ["user-input", "external-api-responses"]

[data_models]
[data_models.Account]
fields = [
    { name = "id", type = "UUID", constraints = ["unique", "immutable"] },
    { name = "balance", type = "Decimal", constraints = ["non_negative"] },
    { name = "status", type = "AccountStatus", constraints = [] },
]

[data_models.Transaction]
fields = [
    { name = "id", type = "UUID", constraints = ["unique", "immutable"] },
    { name = "from_account", type = "AccountId", constraints = [] },
    { name = "to_account", type = "AccountId", constraints = [] },
    { name = "amount", type = "Decimal", constraints = ["positive"] },
    { name = "status", type = "TransactionStatus", constraints = [] },
]

[interfaces]
[interfaces.PaymentService]
methods = [
    { name = "transfer", params = ["from: AccountId", "to: AccountId", "amount: Decimal"], returns = "Result<TransactionId, PaymentError>" },
    { name = "get_balance", params = ["account: AccountId"], returns = "Result<Decimal, AccountError>" },
]

[constraints]
functional = [
    "Account balance never goes negative",
    "Sum of all account balances equals total system balance",
    "Completed transactions are immutable",
]
non_functional = [
    "Transfer completes in < 100ms p99",
    "System handles 10,000 TPS",
]
security = [
    "All inputs validated at boundary",
    "No PII in logs",
]

[claims]
# Testable claims extracted for property testing
[claims.balance_001]
text = "Account balance never goes negative"
type = "invariant"
testable = true

[claims.balance_002]
text = "Sum of all transactions equals final balance"
type = "invariant"
testable = true

[claims.transfer_001]
text = "Successful transfer decrements source and increments destination by same amount"
type = "behavioral"
testable = true
```

#### Model Assignment

| Role | Model Alias | Rationale |
|------|-------------|-----------|
| Primary Architect | architect_model | Complex reasoning, user interaction |
| Adversarial Auditor | auditor_model | Fast, strong logical consistency checking |

#### Context Shedding

Upon spec finalization:
- All conversation history is discarded
- Only `spec.toml` and Decision Ledger entries persist
- No reasoning traces propagate to Lattice

---

### Lattice (Structure-First Diffusion)

#### Objective

Generate a complete, compilable structural skeleton of the system without implementation logic.

#### Definition of the Lattice

The Lattice includes:
- Module hierarchy
- Structs, enums, traits/interfaces
- Function signatures with `todo!()` bodies
- Type witnesses encoding invariants
- Micro-contracts as documentation

The Lattice **excludes**:
- Any runtime logic
- Any I/O operations
- Any allocation beyond structure

#### Invariant

The Lattice must pass structural verification (`cargo check`, `tsc`, `mypy`, etc.). Runtime execution is undefined but structural correctness is mandatory.

**TypeScript Configuration**: TypeScript targets require `"strict": true` in tsconfig.json. This is the compilation oracle configuration for all TypeScript projects.

#### Inputs

- `spec.toml` from Ignition
- Decision Ledger
- Language target specification

#### Outputs

- Complete source tree with skeleton code
- Type witness definitions
- Micro-contracts attached to all `todo!()` sites
- Witness verification tier report

#### Mechanism

1. Parse spec for types, interfaces, constraints
2. Generate module structure
3. Generate type definitions with witnesses
4. Generate function signatures with contracts
5. Run compiler verification
6. Repair structural errors until compilable
7. Sanitize via AST inspection (no logic leakage)

#### Example Output (Rust)

```rust
// src/domain/account.rs

/// INVARIANT: balance >= 0 (witnessed by NonNegativeDecimal type)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Account {
    id: AccountId,
    balance: NonNegativeDecimal,
    status: AccountStatus,
}

impl Account {
    /// REQUIRES: initial_balance >= 0
    /// ENSURES: new account with given balance
    /// ENSURES: status == Active
    pub fn new(id: AccountId, initial_balance: NonNegativeDecimal) -> Self {
        todo!()
    }

    /// REQUIRES: amount > 0
    /// ENSURES: self.balance += amount
    /// COMPLEXITY: O(1)
    /// PURITY: writes
    pub fn deposit(&mut self, amount: PositiveDecimal) {
        todo!()
    }

    /// REQUIRES: amount > 0
    /// REQUIRES: self.balance >= amount
    /// ENSURES: self.balance -= amount
    /// ENSURES: result == old(self.balance) - amount
    /// COMPLEXITY: O(1)
    /// PURITY: writes
    pub fn withdraw(&mut self, amount: PositiveDecimal) -> Result<NonNegativeDecimal, InsufficientFunds> {
        todo!()
    }

    /// ENSURES: result == self.balance
    /// COMPLEXITY: O(1)
    /// PURITY: pure
    pub fn balance(&self) -> NonNegativeDecimal {
        todo!()
    }
}
```

#### Model Assignment

| Role | Model Alias | Rationale |
|------|-------------|-----------|
| Structural Engineer | structurer_model | Fast, good at following patterns |

---

### Composition Audit (Pre-Injection Verification)

#### Objective

Detect logical contradictions and impossible compositions **before** wasting compute on implementation.

#### Position in Pipeline

After Lattice, before Injection. This is a **reasoning task**, not an execution task.

#### Inputs

- Spec constraints (from `spec.toml`)
- Function contracts (from Lattice)
- Type witnesses (from Lattice)

**NOT Inputs**:
- Implementation bodies (none exist yet)
- Previous reasoning traces

#### Contradiction Types

| Type | Description | Example |
|------|-------------|---------|
| Temporal | Timing requirements that cannot all be satisfied | "Sessions expire after 30min" + "Operations can take 2hrs" + "Operations require active session" |
| Resource | Conflicting resource requirements | "Function A requires exclusive lock" + "Function B requires same lock" + "A and B must run concurrently" |
| Invariant | Invariants that cannot all hold | "Balance >= 0" + "Withdrawals can exceed balance" |
| Precondition Gap | Preconditions that can never be satisfied | "rollback requires empty queue" + no function can empty queue |
| Postcondition Conflict | Postconditions that contradict when composed | "Function A ensures X > 0" + "Function B ensures X < 0" + "A then B must succeed" |

#### Output Format

```yaml
contradictions_found:
  - id: "TEMPORAL_001"
    severity: "critical"
    involved:
      - constraint: "User sessions expire after 30 minutes of inactivity"
      - constraint: "Long-running operations can take up to 2 hours"
      - constraint: "All operations require an active session"
      - contract: "operations::get_result requires active session"
    analysis: |
      A long-running operation can take 2 hours, but the session expires
      after 30 minutes. When the user tries to get_result after the
      operation completes, their session may have expired.
    minimal_scenario:
      - "User starts session at T=0"
      - "User starts 2-hour operation at T=5min"
      - "User goes idle"
      - "Session expires at T=35min"
      - "Operation completes at T=125min"
      - "User cannot retrieve result (no active session)"
    suggested_resolution_options:
      - "Long-running operations keep session alive"
      - "Results can be retrieved with re-authentication"
      - "Session timeout extended during active operations"

  - id: "PRECONDITION_001"
    severity: "warning"
    involved:
      - contract: "ledger::rollback requires empty pending_transactions"
      - contract: "transaction::start adds to pending_transactions"
      - contract: "transaction::commit removes from pending_transactions"
    analysis: |
      If a transaction is started but crashes before commit,
      pending_transactions is non-empty. There is no contract that
      can clear pending_transactions without completing the transaction.
    minimal_scenario:
      - "transaction::start('tx1')"
      - "System crashes"
      - "On restart, pending_transactions = ['tx1']"
      - "ledger::rollback fails precondition"
    suggested_resolution_options:
      - "Add transaction::abort function"
      - "Auto-abort on timeout"
      - "Relax rollback precondition"
```

#### Handling

- **Contradictions found**: Return to Ignition with contradiction report
- **No contradictions**: Proceed to Injection

#### Model Assignment

| Role | Model Alias | Rationale |
|------|-------------|-----------|
| Temporal/Invariant Auditor | auditor_model | Strong formal logic |
| Full Audit | auditor_model + architect_model | Cross-verification |

---

### Injection (Atomic Stateless Implementation)

#### Objective

Populate the Lattice with functional code while preventing context drift and hallucination loops.

#### The Ralph Loop

Each function is implemented independently using **only**:
- Its signature
- Its micro-contracts
- Required type definitions
- Type witness definitions

**NOT**:
- Prior implementation attempts
- Other functions' implementations
- Reasoning about failures

#### Mechanism

```
for each function with todo!():
    1. Extract local context (signature, contracts, types)
    2. Prompt model with minimal context
    3. Receive implementation
    4. Inject via AST mutation
    5. Run cargo check
    6. Run unit tests for this function
    7. Accept or discard atomically
    8. If discard: increment failure counter, retry with fresh context
    9. If failure threshold exceeded: escalate to next model
    10. If all models fail: circuit break
```

#### Context Isolation

Each implementation attempt receives:

```
FUNCTION: binary_search
SIGNATURE: fn binary_search(haystack: &SortedVec<i32>, needle: i32) -> Option<usize>

CONTRACTS:
  REQUIRES: haystack is sorted ascending (witnessed by SortedVec type)
  REQUIRES: haystack.len() > 0
  ENSURES: result.is_some() implies haystack[result.unwrap()] == needle
  ENSURES: result.is_none() implies !haystack.contains(&needle)
  COMPLEXITY: O(log n) where n = haystack.len()
  PURITY: pure

TYPE DEFINITIONS:
  struct SortedVec<T>(Vec<T>);
  // INVARIANT: elements are sorted ascending

  impl<T> SortedVec<T> {
      fn as_slice(&self) -> &[T];
      fn len(&self) -> usize;
      fn is_empty(&self) -> bool;
  }

IMPLEMENT THE FUNCTION. Output only the function body.
```

#### Model Assignment & Escalation

| Role | Model Alias | Rationale |
|------|-------------|-----------|
| Primary Worker | worker_model | Fast, cheap, sufficient for most functions |
| Fallback 1 | structurer_model | More capable, handles complex cases |
| Fallback 2 | architect_model | Maximum capability |

#### Injection Order

Functions are injected in **topological order** based on the call graph:
1. Leaf functions (no dependencies) are injected first
2. Functions that depend only on already-injected functions are injected next
3. Cycles are handled by injecting all cycle members as a batch

This ensures tests can run in isolation as each function is injected.

See [Section 5.4: Escalation Logic](#54-escalation-logic) for detailed escalation rules.

#### Circuit Breaker

The circuit breaker uses a **hybrid approach**: break if (all tiers exhausted) OR (max attempts exceeded), whichever comes first. This provides safety bounds while ensuring capable models get a chance.

If any of these conditions are met, halt Injection and return to Lattice with a structural defect report:

- Single function fails across all model tiers (must include at least one architect_model attempt)
- Max attempts per function exceeded (default: 8)
- >20% of functions in a module escalate
- >10% of all functions fail

---

### Mesoscopic (Verification)

#### Objective

Detect non-local errors that span multiple functions or modules through **spec-driven** property testing.

#### Key Principle

The verifier tests **spec compliance**, not **implementation correctness**. It receives:
- Original spec artifact (claims)
- Public interfaces (signatures + contracts)
- **NOT** implementation bodies

#### Scope

- Concurrency invariants
- Protocol state machines
- Cross-module interactions
- Integration scenarios

#### Cluster Definition

Modules are grouped into testable clusters based on spec relationships:

```yaml
clusters:
  - name: authentication
    modules: [auth, jwt, session]
    claims: [auth_001, auth_002, auth_003, auth_004]

  - name: accounting
    modules: [account, transaction, ledger]
    claims: [balance_001, balance_002, balance_003]

  - name: auth_accounting_integration
    modules: [auth, account, transaction]
    claims: [cross_001]
```

#### Verdict Handling

```typescript
type ClusterVerdict =
    | { type: 'pass' }
    | {
        type: 'fail';
        violatedClaims: ClaimId[];
        // NO: root cause analysis
        // NO: suggested fixes
        // Just: these claims are violated
    };
```

On failure:
- Only functions **explicitly referenced by violated claims** are re-injected (via CLAIM_REF linkage)
- No debugging, no incremental fixes
- The violated claims are noted in the Decision Ledger

#### Model Assignment

| Role | Model Alias | Rationale |
|------|-------------|-----------|
| Test Synthesis | structurer_model | Good at code generation |
| Logic Auditing | auditor_model | Formal reasoning |

---

### Mass Defect (Beta-Reduction & Distillation)

#### Objective

Reduce code mass while preserving semantics, increasing maintainability and performance.

#### Conceptual Basis

Analogous to beta-reduction in lambda calculus and mass defect in nuclear physics: removing redundancy increases binding energy.

#### Transformation Catalog

The Mass Defect phase uses a **smell-indexed pattern catalog**. Code smells are detected via static analysis, then concrete transformation patterns are applied to address them.

##### Smell Categories

| Category | Smells | Description |
|----------|--------|-------------|
| **Control Flow** | Deep nesting, High cyclomatic complexity, Long function body | Structural complexity that impedes readability |
| **Duplication** | Repeated code blocks, Magic values, Missing type abstraction | Redundancy that increases maintenance burden |
| **Idiom Violation** | Imperative loops, Manual resource management, Verbose null handling | Non-idiomatic patterns that could be simplified |
| **Dead Weight** | Unused bindings, Unreachable code, Redundant conversions | Code that serves no purpose |
| **Clarity Debt** | Over-documentation | Comments compensating for unclear code (fix the code, not the comments) |

##### Risk Levels

| Level | Name | Definition | Verification Required |
|-------|------|------------|----------------------|
| 1 | **Trivial** | Pure removal or rename, no logic change | Compile only |
| 2 | **Safe** | Local transformation, semantics obviously preserved | Compile + unit tests for target function |
| 3 | **Moderate** | May affect callers or require interface changes | Compile + unit tests + integration tests for module |
| 4 | **Structural** | Cross-function refactoring, new abstractions introduced | Full test suite |

##### Pattern Selection Algorithm

When multiple smells are detected in a function:

1. Collect all applicable patterns from detected smells
2. Skip patterns already attempted on this function
3. Deduplicate (same pattern may address multiple smells)
4. Sort by: **risk level ascending**, then **enables-count descending** (patterns that unlock other patterns win tiebreakers)
5. Apply patterns in order until metrics satisfied or no patterns remain

##### Smell Definition Schema

```toml
# Example: smells/control-flow/deep-nesting.toml

[smell]
id = "deep-nesting"
name = "Deep Nesting"
category = "control-flow"
description = "Code with excessive indentation levels, making control flow hard to follow"

[detection]
max_nesting_depth = 3
tools = [
    { name = "eslint", rule = "max-depth" },
    { name = "pylint", rule = "too-many-nested-blocks" }
]

[detection.heuristics]
patterns = [
    "nested if/else chains",
    "try/catch inside conditionals inside loops",
    "callback pyramids"
]

[[applicable_patterns]]
pattern = "early-return"
risk = 2
rationale = "Inverts conditions to exit early, flattening structure"

[[applicable_patterns]]
pattern = "extract-conditional-body"
risk = 3
rationale = "Moves nested block to helper function"
```

##### Pattern Definition Schema

```toml
# Example: patterns/early-return.toml

[pattern]
id = "early-return"
name = "Early Return"
description = "Invert a condition and return early to reduce nesting depth"
risk = 2
risk_rationale = "Local transformation, only affects control flow within function"

[verification]
required = ["compile", "unit_tests_target_function"]

[guards]
conditions = [
    "Function has cleanup logic that must run before all exits",
    "Return value requires computation from both branches",
    "Function uses a single-exit style mandated by project conventions",
    "The condition involves side effects that would change execution order"
]

[enables]
patterns = ["extract-helper", "loop-to-functional"]
rationale = "Flattening often reveals extractable blocks or simplifiable loops"

[prompt]
template = """
PATTERN: Early Return
SMELL: Deep nesting / High cyclomatic complexity
RISK: 2 (Safe - local transformation)

CONTEXT:
You are refactoring a function that has deeply nested conditionals. The goal is to invert conditions and return early to flatten the structure while preserving exact semantics.

DETECTION:
- Nesting depth exceeds 3 levels
- Pattern: if (condition) { ...long block... } with no else, or trivial else

GUARDS (do NOT apply if):
- Function has cleanup logic that must run before all exits
- Return value requires computation from both branches
- Function uses a single-exit style mandated by project conventions
- The condition involves side effects that would change execution order

BEFORE (TypeScript):
```typescript
function processUser(user: User | null): Result {
    if (user !== null) {
        if (user.isActive) {
            if (user.hasPermission('read')) {
                const data = fetchData(user.id);
                return { success: true, data };
            } else {
                return { success: false, error: 'No permission' };
            }
        } else {
            return { success: false, error: 'User inactive' };
        }
    } else {
        return { success: false, error: 'No user' };
    }
}
```

AFTER (TypeScript):
```typescript
function processUser(user: User | null): Result {
    if (user === null) {
        return { success: false, error: 'No user' };
    }
    if (!user.isActive) {
        return { success: false, error: 'User inactive' };
    }
    if (!user.hasPermission('read')) {
        return { success: false, error: 'No permission' };
    }
    const data = fetchData(user.id);
    return { success: true, data };
}
```

BEFORE (Python):
```python
def process_user(user: User | None) -> Result:
    if user is not None:
        if user.is_active:
            if user.has_permission('read'):
                data = fetch_data(user.id)
                return Result(success=True, data=data)
            else:
                return Result(success=False, error='No permission')
        else:
            return Result(success=False, error='User inactive')
    else:
        return Result(success=False, error='No user')
```

AFTER (Python):
```python
def process_user(user: User | None) -> Result:
    if user is None:
        return Result(success=False, error='No user')
    if not user.is_active:
        return Result(success=False, error='User inactive')
    if not user.has_permission('read'):
        return Result(success=False, error='No permission')
    data = fetch_data(user.id)
    return Result(success=True, data=data)
```

INSTRUCTIONS:
1. Identify the outermost condition that guards a large block
2. Invert the condition
3. Return the "else" case immediately after the inverted check
4. Move the "then" block contents to the top level (one less indent)
5. Repeat for remaining nested conditions from outside in

OUTPUT FORMAT:
Return only the transformed function. Do not include explanations.
"""
```

##### Type Definitions

```typescript
// Smell categories
type SmellCategory =
    | 'control-flow'
    | 'duplication'
    | 'idiom-violation'
    | 'dead-weight'
    | 'clarity-debt';

// Risk levels with operational meaning
type RiskLevel = 1 | 2 | 3 | 4;

interface RiskDefinition {
    level: RiskLevel;
    name: 'trivial' | 'safe' | 'moderate' | 'structural';
    verification: VerificationScope;
}

type VerificationScope =
    | { type: 'compile_only' }
    | { type: 'unit_tests'; scope: 'target_function' }
    | { type: 'integration_tests'; scope: 'module' }
    | { type: 'full_test_suite' };

// Smell definition
interface SmellDefinition {
    id: string;
    name: string;
    category: SmellCategory;
    description: string;
    detection: DetectionCriteria;
    applicablePatterns: PatternReference[];
}

interface DetectionCriteria {
    thresholds?: Record<string, number>;
    tools: ToolRule[];
    heuristics: string[];
}

interface ToolRule {
    name: string;  // 'eslint', 'pylint', etc.
    rule: string;
}

interface PatternReference {
    patternId: string;
    risk: RiskLevel;
    rationale: string;
}

// Pattern definition
interface PatternDefinition {
    id: string;
    name: string;
    description: string;
    risk: RiskLevel;
    riskRationale: string;
    verification: VerificationScope;
    guards: string[];
    enables: string[];  // Pattern IDs this transformation enables
    prompt: PromptTemplate;
}

interface PromptTemplate {
    template: string;  // The full prompt text with examples
}

// TransformationType (used in orchestrator state machine)
type TransformationType = {
    patternId: string;
    smell: string;
    risk: RiskLevel;
    prompt: string;  // Rendered prompt template
};

// Catalog access interface
interface TransformationCatalog {
    getSmell(id: string): SmellDefinition | null;
    getPattern(id: string): PatternDefinition | null;
    getSmellsByCategory(category: SmellCategory): SmellDefinition[];

    // Given detected smells, return ordered patterns to attempt
    selectPatterns(
        detectedSmells: DetectedSmell[],
        functionContext: FunctionContext
    ): TransformationType[];
}

interface DetectedSmell {
    smellId: string;
    severity: number;  // How badly the threshold is exceeded
    location: CodeLocation;
}

interface FunctionContext {
    functionId: FunctionId;
    currentMetrics: ComplexityMetrics;
    previouslyAttempted: string[];  // Pattern IDs already tried on this function
}
```

##### Pattern Selection Implementation

```typescript
function selectPatterns(
    detectedSmells: DetectedSmell[],
    context: FunctionContext,
    catalog: TransformationCatalog
): TransformationType[] {
    const candidates: ScoredPattern[] = [];

    // 1. Collect all applicable patterns from detected smells
    for (const detected of detectedSmells) {
        const smell = catalog.getSmell(detected.smellId);
        if (!smell) continue;

        for (const ref of smell.applicablePatterns) {
            // Skip patterns already attempted on this function
            if (context.previouslyAttempted.includes(ref.patternId)) {
                continue;
            }

            const pattern = catalog.getPattern(ref.patternId);
            if (!pattern) continue;

            candidates.push({
                patternId: ref.patternId,
                smellId: detected.smellId,
                risk: ref.risk,
                enablesCount: pattern.enables.length,
                severity: detected.severity,
                prompt: pattern.prompt.template
            });
        }
    }

    // 2. Deduplicate (same pattern may address multiple smells)
    const deduped = deduplicateByPatternId(candidates);

    // 3. Sort by: risk (ascending), then enablesCount (descending)
    deduped.sort((a, b) => {
        if (a.risk !== b.risk) {
            return a.risk - b.risk;  // Lower risk first
        }
        return b.enablesCount - a.enablesCount;  // More enables = higher priority
    });

    // 4. Convert to TransformationType
    return deduped.map(p => ({
        patternId: p.patternId,
        smell: p.smellId,
        risk: p.risk,
        prompt: p.prompt
    }));
}

interface ScoredPattern {
    patternId: string;
    smellId: string;
    risk: RiskLevel;
    enablesCount: number;
    severity: number;
    prompt: string;
}

function deduplicateByPatternId(candidates: ScoredPattern[]): ScoredPattern[] {
    const seen = new Map<string, ScoredPattern>();
    for (const c of candidates) {
        const existing = seen.get(c.patternId);
        if (!existing || c.severity > existing.severity) {
            // Keep the one with higher severity (more pressing to fix)
            seen.set(c.patternId, c);
        }
    }
    return Array.from(seen.values());
}
```

#### Mechanism

1. Analyze complexity metrics (ESLint, Pylint, etc.)
2. Detect smells exceeding thresholds
3. Select patterns using risk-based ordering algorithm
4. For each pattern:
   a. Check guards (skip if any apply)
   b. Generate transformation prompt
   c. Apply LLM-generated transformation
   d. Run verification (scope based on risk level)
   e. Accept if verification passes, revert otherwise
5. Re-analyze metrics after each successful transformation
6. Iterate until metrics satisfied or no applicable patterns remain

#### Complexity Targets

```toml
[mass_defect.targets]
max_cyclomatic_complexity = 10
max_function_length_lines = 50
max_nesting_depth = 4
min_test_coverage = 0.80
```

#### Model Assignment

| Role | Model Alias | Rationale |
|------|-------------|-----------|
| Reducer | worker_model | Fast, good at local transforms |
| Semantic Refiner | architect_model | Complex refactoring |
| High-Risk Auditor | auditor_model (optional) | Verify semantic preservation |

#### Initial Pattern Catalog

The following patterns are included in the initial catalog (TypeScript and Python examples):

| Pattern ID | Addresses Smells | Risk | Description |
|------------|------------------|------|-------------|
| `early-return` | deep-nesting, high-cyclomatic-complexity | 2 | Invert conditions and return early |
| `guard-clause` | deep-nesting | 2 | Move precondition checks to function start |
| `extract-helper` | long-function-body, repeated-code-blocks | 3 | Extract block into named function |
| `loop-to-map` | imperative-loop | 2 | Replace for loop with map/filter/reduce |
| `loop-to-comprehension` | imperative-loop | 2 | Replace loop with list/dict comprehension (Python) |
| `remove-unused-binding` | unused-binding | 1 | Delete unused variable declarations |
| `remove-unreachable` | unreachable-code | 1 | Delete code after unconditional return/throw |
| `inline-single-use` | unused-binding | 1 | Inline variable used exactly once |
| `extract-magic-value` | magic-values | 2 | Replace literal with named constant |
| `introduce-type-alias` | missing-type-abstraction | 3 | Create type alias for repeated complex types |
| `optional-chaining` | verbose-null-handling | 2 | Replace nested null checks with ?. operator |
| `nullish-coalescing` | verbose-null-handling | 2 | Replace ternary null checks with ?? operator |
| `rename-for-clarity` | over-documentation | 2 | Rename variable/function to be self-documenting |
| `extract-explanatory-variable` | over-documentation | 2 | Name intermediate computation to replace comment |

---

## 5. Cross-Cutting Concerns

### 5.1 Decision Ledger

#### Purpose

Preserve validated decisions across phase transitions without preserving reasoning traces.

#### Structure

```toml
[meta]
spec_version = "1.0.0"
created = "2025-01-23T10:00:00Z"

[[decisions]]
id = "d001"
timestamp = "2025-01-23T10:00:00Z"
constraint = "Authentication uses JWT with RS256 signing"
category = "architectural"
source = "user_explicit"
phase = "ignition"
confidence = "canonical"
dependencies = []

[[decisions]]
id = "d002"
timestamp = "2025-01-23T11:30:00Z"
constraint = "Rate limiting must occur at gateway, not per-service"
category = "architectural"
source = "injection_failure"
phase = "injection"
confidence = "inferred"
dependencies = ["d001"]
failure_context = "Per-service rate limiting caused token validation race conditions"

[[decisions]]
id = "d003"
timestamp = "2025-01-23T12:00:00Z"
constraint = "User IDs are UUIDs, not sequential integers"
category = "data_model"
source = "auditor_contradiction"
phase = "ignition"
confidence = "canonical"
dependencies = []
contradiction_resolved = "Sequential IDs leak user count; spec required 'no information leakage'"
```

#### Confidence Levels

| Level | Source | Override Rules |
|-------|--------|----------------|
| `canonical` | User explicit statement, resolved contradiction | Only user can override |
| `delegated` | Architect decision during user delegation | Treated as canonical unless failures occur |
| `inferred` | Derived from failure analysis, auditor suggestion | Can be overridden by new canonical decision |
| `provisional` | Heuristic, unvalidated assumption | Automatically dropped if any phase fails |
| `suspended` | Dependent on invalidated decision | Must be explicitly reinstated or discarded |
| `blocking` | Unresolved contradiction | Protocol halts until resolved |

#### Operations

The ledger uses a **hybrid append-only model**: entries are never modified in place, but a `status` field marks entries as `active`, `superseded`, or `invalidated`. New entries explicitly link to what they replace.

```typescript
type LedgerOp =
    | { type: 'append'; decision: Decision }
    | { type: 'supersede'; id: DecisionId; newConstraint: string; reason: string }  // Creates new entry, marks old as superseded
    | { type: 'invalidate'; id: DecisionId; failureReport: FailureReport }  // Marks entry as invalidated
    | { type: 'cascade'; root: DecisionId }  // Suspend dependents
    | { type: 'reinstate'; id: DecisionId; validation: ValidationProof };

type DecisionStatus = 'active' | 'superseded' | 'invalidated';
```

**Important**: The `rationale` field is for human audit only and is NEVER included in LLM prompts. Only the `constraint` text is fed to subsequent phases.

#### Injection Into Phases

When a phase starts, it receives ledger decisions formatted as constraints:

```
CANONICAL (user-confirmed):
- Authentication uses JWT with RS256 signing [d001]
- User IDs are UUIDs, not sequential integers [d003]

INFERRED (may be revised if contradicted):
- Rate limiting must occur at gateway, not per-service [d002]

SUSPENDED (require explicit confirmation):
- None currently

Your work must satisfy all canonical constraints.
```

---

### 5.2 Type Witnesses (Cross-Language)

#### Purpose

Encode invariants in the type system where possible, degrading gracefully to runtime validation where not.

#### Universal Witness Schema

```yaml
witness:
  name: "SortedVec"
  description: "A vector whose elements are sorted in ascending order"

  base:
    generic: true
    type_params:
      - name: "T"
        bounds: ["Ord"]
    inner_type: "Vec<T>"

  invariants:
    - id: "sorted"
      description: "Elements are in ascending order"
      formal: "forall i, j: i < j implies self[i] <= self[j]"
      testable: true

  constructors:
    - name: "from_sorted"
      trust_level: "unsafe"  # Caller guarantees
    - name: "from_unsorted"
      trust_level: "safe"    # Constructor guarantees
    - name: "empty"
      trust_level: "safe"
```

#### Witness Verification Levels

| Level | Mechanism | Languages |
|-------|-----------|-----------|
| `proof` | Type system rejects invalid construction | Rust (typestate), Haskell |
| `distinction` | Type system distinguishes but doesn't prove | TypeScript brands, Rust newtypes, Java generics |
| `runtime` | Constructor/factory enforces | Python, Go, JavaScript |
| `doc` | Human/LLM must respect | All (fallback) |

#### Language Capability Matrix

| Language | Phantom Types | Branded Types | Newtype | Const Generics | Marker Traits |
|----------|---------------|---------------|---------|----------------|---------------|
| Rust | Full | Via newtype | Full | Full | Full |
| TypeScript | Via brands | Full | N/A | No | Via interfaces |
| Python | No | Via NewType | No | No | Via Protocol |
| Go | No | Via type def | Full | No | Via interfaces |
| Java | Limited | Via wrapper | Full | No | Full |

#### Generated Code Examples

**Rust** (Tier 2):
```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SortedVec<T: Ord>(Vec<T>);

impl<T: Ord> SortedVec<T> {
    pub fn from_unsorted(mut inner: Vec<T>) -> Self {
        inner.sort();
        Self(inner)
    }

    pub unsafe fn from_sorted_unchecked(inner: Vec<T>) -> Self {
        Self(inner)
    }

    pub fn from_sorted(inner: Vec<T>) -> Self {
        debug_assert!(inner.windows(2).all(|w| w[0] <= w[1]));
        Self(inner)
    }
}
```

**TypeScript** (Tier 2):
```typescript
declare const __SortedVecBrand: unique symbol;
type SortedVec<T> = T[] & { readonly [__SortedVecBrand]: true };

function sortedVecFromUnsorted<T>(arr: T[]): SortedVec<T> {
    return [...arr].sort() as SortedVec<T>;
}
```

**Python** (Tier 3):
```python
from dataclasses import dataclass
from typing import TypeVar, Generic

T = TypeVar('T')

@dataclass(frozen=True)
class SortedVec(Generic[T]):
    _inner: tuple[T, ...]

    def __post_init__(self):
        if not all(self._inner[i] <= self._inner[i+1] for i in range(len(self._inner)-1)):
            raise ValueError("SortedVec: elements must be sorted")

    @classmethod
    def from_unsorted(cls, items: list[T]) -> 'SortedVec[T]':
        return cls(_inner=tuple(sorted(items)))
```

---

### 5.3 Micro-Contracts

#### Purpose

Attach semantic constraints to `todo!()` sites that guide implementation without accumulating context.

#### Grammar

```
CONTRACT     := CLAUSE+
CLAUSE       := PRECONDITION | POSTCONDITION | INVARIANT | COMPLEXITY | PURITY | CLAIM_REF

PRECONDITION  := "REQUIRES:" PREDICATE
POSTCONDITION := "ENSURES:" PREDICATE
INVARIANT     := "INVARIANT:" PREDICATE
COMPLEXITY    := "COMPLEXITY:" BIG_O
PURITY        := "PURITY:" PURITY_LEVEL
CLAIM_REF     := "CLAIM_REF:" CLAIM_ID

PURITY_LEVEL := "pure" | "reads" | "writes" | "io"
CLAIM_ID     := [a-z_]+_[0-9]+  # e.g., balance_001, auth_003
```

#### Example

```rust
/// REQUIRES: haystack is sorted ascending (witnessed by SortedVec type)
/// REQUIRES: haystack.len() > 0
/// ENSURES: result.is_some() implies haystack[result.unwrap()] == needle
/// ENSURES: result.is_none() implies !haystack.contains(&needle)
/// COMPLEXITY: O(log n) where n = haystack.len()
/// PURITY: pure
/// CLAIM_REF: search_001
fn binary_search(haystack: &SortedVec<i32>, needle: i32) -> Option<usize> {
    todo!()
}
```

The `CLAIM_REF` clause links micro-contracts to spec claims, enabling:
- Claim-based re-injection scoping in Mesoscopic phase
- Verification that all claims have corresponding contracts
- Traceability from requirements to implementation

#### Contract Categories

| Category | Verification Method |
|----------|-------------------|
| Type-witnessed precondition | Compiler (trust the type) |
| Runtime precondition | Generated test |
| Postcondition | Generated test |
| Invariant | Property test |
| Complexity | Benchmark |
| Purity | Static analysis (where available) |

---

### 5.4 Escalation Logic

#### Failure Taxonomy

```typescript
type FailureType =
    | { type: 'syntax'; parseError: string }
    | { type: 'type'; compilerError: string }
    | { type: 'test'; failingTests: TestFailure[] }
    | { type: 'timeout'; resource: Resource; limit: number }
    | { type: 'semantic'; violation: SemanticViolation }
    | { type: 'complexity'; expected: BigO; measured: BigO }
    | { type: 'security'; vulnerability: VulnerabilityType }
    | { type: 'coherence'; conflictingFunctions: FunctionId[] };
```

#### Escalation Table

| Failure | Model | Attempt | Action |
|---------|-------|---------|--------|
| Syntax (recoverable) | worker_model | 1 | Retry same model |
| Syntax (recoverable) | worker_model | 2 | Retry with syntax hint |
| Syntax (fatal) | worker_model | 1 | Escalate to structurer_model |
| Type | worker_model | 1 | Retry with expanded type context |
| Type | worker_model | 2 | Escalate to structurer_model |
| Type | structurer_model | 2 | Escalate to architect_model |
| Type | architect_model | 2 | Circuit break |
| Test | worker_model | 1-2 | Retry same model |
| Test | worker_model | 3 | Escalate to structurer_model |
| Test | structurer_model | 2 | Escalate to architect_model |
| Test | architect_model | 2 | Circuit break + human review |
| Timeout | Any | 1 | Escalate immediately |
| Semantic | worker_model | 1 | Escalate to structurer_model |
| Semantic | structurer_model | 1 | Escalate to architect_model |
| Semantic | architect_model | 1 | Circuit break + human review |
| Security | Any | 1 | Escalate to architect_model immediately |
| Coherence | Any | 1 | Circuit break (return to Lattice) |

#### Security Vulnerability Detection

Security verification uses static analysis tools per language, run after Injection phase:

| Language | Tools | Notes |
|----------|-------|-------|
| Rust | `cargo-audit`, `clippy` (security lints) | CVE database checks, unsafe patterns |
| TypeScript | `npm audit`, `eslint-plugin-security` | Dependency vulnerabilities, code patterns |
| Python | `bandit`, `safety` | Code analysis, dependency scanning |
| Go | `gosec`, `govulncheck` | Security-focused static analysis |

Security findings are classified by severity. High/critical findings trigger BLOCKED state for human review.

#### Performance Claim Verification

Performance claims (e.g., "O(1) time complexity") are verified via empirical scaling tests:

1. Run benchmarks at multiple input sizes: n = 10, 100, 1000, 10000
2. Fit measured times to expected complexity curve
3. If variance exceeds 20% from expected scaling, the claim fails

This is practical verification, not formal proof—sufficient to catch obvious violations.

#### Circuit Breaker Configuration

```toml
[circuit_breaker]
max_attempts_per_function = 8         # Hard cap on total attempts
require_opus_attempt = true           # Must try Opus before giving up
module_escalation_rate = 0.20         # 20% of functions escalated
phase_failure_rate = 0.10             # 10% of all functions failing
```

#### Failure Summary Format

When escalating, pass **what** failed, not **how** we tried:

```
FUNCTION: binary_search
SIGNATURE: fn binary_search(haystack: &SortedVec<i32>, needle: i32) -> Option<usize>

FAILURE TYPE: Test
FAILING TESTS:
  - test_empty_returns_none: expected None, got panic
  - test_single_element_found: expected Some(0), got None

TYPE CONTEXT: [included]

NOTE: Previous attempts discarded. Implement from scratch.
```

---

### 5.5 Human Intervention & Blocking

#### When Blocking Occurs

- Canonical conflict detected (two user-confirmed decisions contradict)
- Unresolvable contradiction from Composition Audit
- All model tiers exhausted
- Security vulnerability requiring human review
- Archive operation failure (disk full, permissions, etc.)

#### Notification System

The notification system uses a **webhook-first approach** (decision `notify_001`) for maximum flexibility. Webhooks allow users to integrate with any system that accepts HTTP POST requests (Slack, email, PagerDuty, custom systems, etc.) without requiring platform-specific implementations in the protocol.

##### Notification Events

Notifications are triggered on four event types:

| Event | Description |
|--------|-------------|
| `block` | Protocol enters BLOCKED state |
| `complete` | Protocol completes successfully |
| `error` | Unrecoverable error occurs |
| `phase_change` | Phase transition occurs |

##### Webhook Payload Structure

Webhook payloads use a rich JSON format for programmatic consumption while maintaining minimal user-facing messages per decision `block_005`.

```typescript
interface WebhookPayload {
  /** The notification event type */
  readonly event: 'block' | 'complete' | 'error' | 'phase_change';
  /** Timestamp when notification was sent (ISO 8601) */
  readonly timestamp: string;
  /** The blocking record (for block/error events) */
  readonly blocking_record?: BlockingRecord;
  /** Current protocol state (for all events) */
  readonly protocol_state: ProtocolState;
}

interface BlockingRecord {
  /** Unique identifier for this blocking query */
  readonly id: string;
  /** The phase in which blocking occurred */
  readonly phase: ProtocolPhase;
  /** The query prompting human intervention */
  readonly query: string;
  /** Available options for human to choose from */
  readonly options?: readonly string[];
  /** Timestamp when blocking started (ISO 8601) */
  readonly blockedAt: string;
  /** Optional timeout in milliseconds */
  readonly timeoutMs?: number;
  /** Whether this blocking has been resolved */
  readonly resolved: boolean;
  /** The resolution if resolved */
  readonly resolution?: BlockingResolution;
}
```

The minimal notification format for human-facing channels remains:

```
Criticality blocked. Run `criticality status` for details.
```

This message is used in CLI output and can be displayed by webhook receivers. Full blocking context is available in the `blocking_record` field for programmatic handling.

##### Reminder Scheduling

Reminder notifications use **cron-based scheduling** to send periodic reminders while the protocol is blocked.

```typescript
interface ReminderSchedule {
  /** Cron expression for reminder scheduling */
  readonly cron_expression: string;
  /** Whether reminders are enabled */
  readonly enabled: boolean;
  /** Timestamp of last reminder sent (ISO 8601) */
  readonly last_sent?: string;
  /** Timestamp of next scheduled reminder (ISO 8601) */
  readonly next_scheduled?: string;
}
```

Cron expressions use the standard 5-field format: `minute hour day month weekday`.

Examples:
- `0 9 * * *` — Daily at 9:00 AM
- `0 */4 * * *` — Every 4 hours
- `0 9 * * 1-5` — Weekdays at 9:00 AM

Reminders are only sent while the protocol is in a BLOCKED state. The reminder scheduler tracks `last_sent` and `next_scheduled` timestamps in the notification state file (`.criticality/notification-state.json`) to avoid duplicate reminders.

##### Notification Channels

The system supports multiple simultaneous notification channels. Currently, only `webhook` type is implemented. Future phases may add `slack` and `email` channel types.

```typescript
interface NotificationChannel {
  /** Type of notification channel */
  readonly type: 'webhook';
  /** Endpoint URL for sending notifications */
  readonly endpoint: string;
  /** Whether this channel is enabled */
  readonly enabled: boolean;
  /** Events that this channel subscribes to */
  readonly events: readonly ('block' | 'complete' | 'error' | 'phase_change')[];
}
```

Channels are filtered by the `events` array—each notification is sent only to channels that subscribe to that event type.

##### Failure Handling

Notification failures are **never blocking**. If a webhook endpoint fails:
- Failure is logged to notification state
- Protocol execution continues
- Other channels are still notified
- Human can check `criticality status` to see notification status

This fire-and-forget approach ensures notification issues don't prevent protocol progress.

#### Blocking State

```typescript
type ProtocolState =
    | { type: 'active'; currentPhase: Phase; progress: PhaseProgress }
    | { type: 'blocked'; reason: BlockReason; awaiting: HumanQuery }
    | { type: 'completed'; artifacts: FinalArtifacts };
```

#### Human Query Format

```yaml
human_query:
  id: "conflict_001"
  severity: "blocking"
  category: "canonical_conflict"

  question: |
    Two requirements you've confirmed contradict each other:

    [A] "All API responses must be cacheable for at least 5 minutes"
    [B] "User balance must always reflect real-time state"

    Which takes priority?

  options:
    - id: "keep_a"
      label: "Caching takes priority"
      implications: ["Balance may be up to 5 minutes stale"]

    - id: "keep_b"
      label: "Real-time takes priority"
      implications: ["Balance endpoint excluded from caching"]

    - id: "hybrid"
      label: "Hybrid approach"
      implications: ["Balance has 30s cache, others have 5min"]

    - id: "clarify"
      label: "I need to explain more"
```

#### Blocking Behavior

While blocked:
- All phases halt
- State persisted to disk
- No automated retries or workarounds
- No "let me try something else while we wait"

#### Resolution

When human responds:
- Selected option's ledger entry applied
- Superseded decisions marked
- Protocol resumes from appropriate phase
- **Context from before block is NOT restored** (only ledger decisions persist)

#### State Persistence

```typescript
interface PersistedProtocolState {
    state: ProtocolState;
    artifacts: PartialArtifacts;
    ledger: DecisionLedger;
    pendingQueries: HumanQuery[];
    createdAt: string; // ISO 8601
    lastActivity: string; // ISO 8601
}
```

---

## 6. Property Test Synthesis

### Claim Classification

| Claim Type | Pattern | Test Type |
|------------|---------|-----------|
| Invariant | "X is always true" | Property test with arbitrary operations |
| Behavioral | "When X happens, Y results" | Integration test |
| Negative | "X cannot cause Y" | Negative test (expect failure) |
| Temporal | "After X, Y holds until Z" | State machine test with mock time |
| Concurrent | "Concurrent X preserves Y" | Parallel execution test |
| Performance | "X completes in O(f(n))" | Benchmark test |

### Claim Parsing

Natural language claims are parsed by an LLM (structurer_model) into structured form:

```json
{
    "type": "invariant",
    "subject": "balance",
    "predicate": ">= 0",
    "scope": "after any sequence of valid operations",
    "testable": true,
    "requires_mocking": [],
    "suggested_generators": ["arbitrary operations"]
}
```

### Test Generation Pipeline

```
Spec Claims → Parse (LLM) → Structured Claims → Generate (Template) → Executable Tests
```

### Framework Mapping

| Claim Type | Rust | TypeScript | Python | Go |
|------------|------|------------|--------|-----|
| Invariant | proptest | fast-check | hypothesis | gopter |
| Behavioral | #[test] | jest | pytest | testing |
| Negative | should_panic | expect().toThrow | pytest.raises | require.Panics |
| Temporal | mock_time + proptest | jest.useFakeTimers | freezegun + hypothesis | testclock |
| Concurrent | loom | workers | asyncio | go test -race |
| Performance | criterion | benchmark.js | pytest-benchmark | testing.B |

### Example: Invariant Test Generation

**Claim**: "Account balance never goes negative"

**Generated (Rust)**:
```rust
proptest! {
    #[test]
    fn balance_never_negative(
        initial: u64,
        operations in prop::collection::vec(any::<AccountOp>(), 0..100)
    ) {
        let mut account = Account::new(initial);

        for op in operations {
            if !account.can_apply(&op) {
                continue;
            }
            account.apply(op);
            prop_assert!(account.balance() >= 0);
        }
    }
}
```

---

## 7. Model Allocation

### Role-Based Aliases

The protocol uses role-based model aliases. Specific model assignments are configured in `config.toml`.

| Role Alias | Purpose | Used In |
|------------|---------|---------|
| `architect_model` | Complex reasoning, user interaction, architecture | Ignition, Mass Defect |
| `auditor_model` | Logical consistency checking, formal reasoning | Ignition, Composition Audit, Mesoscopic |
| `structurer_model` | Code structure generation, pattern following | Lattice, Mesoscopic |
| `worker_model` | Fast, cheap implementation of straightforward functions | Injection, Mass Defect |
| `fallback_model` | Capable fallback for complex implementations | Injection (escalation) |

### Phase-Role Mapping

| Phase | Roles Used |
|-------|------------|
| Ignition | architect_model + auditor_model |
| Lattice | structurer_model |
| Composition Audit | auditor_model + architect_model |
| Injection | worker_model → structurer_model → architect_model (escalation) |
| Mesoscopic | structurer_model + auditor_model |
| Mass Defect | worker_model + architect_model |

### Cost Optimization Strategy

1. **Default to cheapest capable model** — worker_model for implementation
2. **Conservative pre-emption** — Upgrade on strong signals only (context size, signature complexity)
3. **Escalate on failure** — Move to more capable models after failures
4. **Expensive models for design** — architect_model for architecture decisions
5. **Fast models for verification** — auditor_model for auditing

### Model Capability Requirements

| Role | Min Context | Reasoning | Code Gen | Speed |
|------|-------------|-----------|----------|-------|
| Architect | 100k | High | Medium | Low |
| Auditor | 50k | High | Low | High |
| Structurer | 100k | Medium | High | Medium |
| Worker | 16k | Low | High | High |
| Refiner | 100k | High | High | Low |

### 7.1 Model Routing Rules

The orchestrator uses deterministic routing rules based on measurable signals. No LLM reasoning is used for routing decisions.

#### Routing Signals

```typescript
interface RoutingSignals {
    // From the task itself
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
    taskType: TaskType;  // 'implement' | 'audit' | 'transform' | 'synthesize'

    // From the function context (Injection phase only)
    signatureComplexity: number;  // Count of generic params, union types, etc.
    dependencyCount: number;      // How many types/functions referenced
    contractCount: number;        // Number of micro-contract clauses

    // From history (same session)
    priorEscalations: number;     // How many functions already escalated
    moduleEscalationRate: number; // Current module's escalation rate
}

type TaskType = 'implement' | 'audit' | 'transform' | 'synthesize' | 'structure';
```

#### Initial Model Selection

Task type determines base model:

| Task Type | Base Model Role | Default Model |
|-----------|-----------------|---------------|
| implement | worker_model | worker_model |
| audit | auditor_model | auditor_model |
| transform | worker_model | worker_model |
| synthesize | architect_model | architect_model |
| structure | structurer_model | structurer_model |

#### Conservative Pre-emption Rules

Before attempting with the base model, the orchestrator evaluates upgrade rules. Only strong signals trigger pre-emptive upgrades (evaluated in order, first match wins):

| # | Condition | Upgrade To | Rationale |
|---|-----------|------------|-----------|
| 1 | `estimatedInputTokens > 12000` | structurer_model | Approaching worker context limit |
| 2 | `signatureComplexity > 5` | structurer_model | Complex generics/unions need more capability |

These pre-emptive upgrades reduce wasted API calls on tasks very likely to fail with cheaper models. They do not replace escalation-on-failure.

#### Signature Complexity Formula

```
signatureComplexity =
    genericParams * 2 +
    unionMembers +
    lifetimeParams * 2 +  // Rust-specific
    nestedTypeDepth +
    paramCount * 0.5
```

A threshold of `signatureComplexity > 5` triggers pre-emptive upgrade to a more capable model.

#### Provider Configuration

Two routing paths based on model family:

| Models | Router | Notes |
|--------|--------|-------|
| Claude (Opus, Sonnet) | Claude Code | Native integration |
| Others (MiniMax, Kimi K2) | OpenCode → OpenRouter | Single API for non-Anthropic |

```typescript
interface ProviderConfig {
    anthropic: {
        router: 'claude-code';
        models: ['claude-opus-4-5', 'claude-sonnet-4-5'];
    };
    openrouter: {
        router: 'opencode';
        models: ['minimax-m2', 'kimi-k2'];
    };
}

interface ModelRouting {
    architect_model:   { router: 'claude-code', model: 'claude-opus-4-5' };
    structurer_model:  { router: 'claude-code', model: 'claude-sonnet-4-5' };
    auditor_model:     { router: 'opencode',    model: 'kimi-k2' };
    worker_model:      { router: 'opencode',    model: 'minimax-m2' };
}
```

#### Provider Fallback Behavior

- **OpenRouter unavailable**: Escalate to Claude models via Claude Code
- **Claude Code unavailable**: BLOCK (human intervention required)
- OpenRouter handles internal provider failover (e.g., Cerebras → alternatives)

### 7.2 Context Budget Management

When input exceeds model context limits, the orchestrator applies deterministic strategies.

#### Context Limits

| Model Alias | Max Input Tokens | Max Output Tokens |
|-------------|------------------|-------------------|
| worker_model | 16,000 | 4,000 |
| auditor_model | 128,000 | 8,000 |
| structurer_model | 200,000 | 16,000 |
| architect_model | 200,000 | 32,000 |

#### Overflow Strategies

```typescript
type ContextOverflowStrategy =
    | { type: 'upgrade'; targetModel: ModelRole }
    | { type: 'truncate'; sections: TruncationOrder }
    | { type: 'chunk'; chunkSize: number }  // Audit tasks only
    | { type: 'reject'; reason: string };
```

Strategy selection based on overflow severity:

| Overflow | Strategy | Description |
|----------|----------|-------------|
| Mild (< 20% over) | truncate | Remove low-priority context sections |
| Moderate (20-100% over) | upgrade | Use model with larger context |
| Severe (> largest model) | reject | Cannot proceed, BLOCK |

#### Truncation Priority

When truncating, sections are removed in order (lowest priority first):

| Section | Priority | Notes |
|---------|----------|-------|
| comments | 10 | Drop first |
| examples | 30 | Drop early |
| relatedTypes | 40 | Types not directly referenced |
| requiredTypes | 80 | Types in signature |
| contracts | 90 | Almost never truncate |
| signature | 100 | Never truncate |
| systemPrompt | 100 | Never truncate |

```typescript
interface TruncationOrder {
    // Ordered list of sections to remove until under budget
    order: ['comments', 'examples', 'relatedTypes', 'requiredTypes'];
    // Sections that must never be truncated
    protected: ['systemPrompt', 'signature', 'contracts'];
}
```

#### Chunking (Audit Tasks Only)

Audit tasks (Composition Audit, Mesoscopic verification) can be chunked across files when context exceeds limits:

```typescript
interface ChunkingConfig {
    allowedTaskTypes: ['audit'];  // Only audit tasks can be chunked
    maxChunkSize: number;         // Tokens per chunk (80% of model limit)
    overlapLines: number;         // Lines of overlap between chunks (default: 10)
    aggregation: 'all_must_pass' | 'any_flags';  // How to combine chunk results
}
```

- **Implementation tasks**: Never chunked (must see full context to generate coherent code)
- **Audit tasks**: Chunked by file boundaries when possible, with small overlap for context

### 7.3 Telemetry & Observability

The orchestrator emits telemetry for debugging, cost tracking, and optimization.

#### Telemetry Schema

```typescript
interface ProtocolTelemetry {
    runId: string;
    projectName: string;
    startedAt: string;  // ISO 8601
    completedAt: string | null;

    // Cost tracking
    cost: {
        totalTokensIn: number;
        totalTokensOut: number;
        totalUSD: number;
        byModel: Record<string, { tokensIn: number; tokensOut: number; usd: number }>;
    };

    // Timing
    duration: {
        totalMs: number;
        byPhase: Record<Phase, number>;
    };

    // Quality signals
    quality: {
        escalationRate: number;        // % of functions that escalated
        circuitBreakerTriggers: number;
        humanInterventions: number;
    };

    // Progress
    progress: {
        phase: Phase;
        functionsTotal: number;
        functionsComplete: number;
        testsTotal: number;
        testsPassing: number;
    };
}

type Phase = 'ignition' | 'lattice' | 'compositionAudit' | 'injection' | 'mesoscopic' | 'massDefect';
```

#### Output Files

| File | Format | Purpose |
|------|--------|---------|
| `.criticality/telemetry.json` | JSON | Current run summary, updated after each state transition |
| `.criticality/events.jsonl` | JSONL | Append-only event log for detailed debugging |

#### Event Log Format

```typescript
interface TelemetryEvent {
    timestamp: string;
    event: 'model_call' | 'phase_transition' | 'escalation' | 'circuit_break' | 'block';
    data: Record<string, unknown>;
}
```

Example events:

```jsonl
{"timestamp":"2025-01-24T10:00:00Z","event":"phase_transition","data":{"from":"ignition","to":"lattice"}}
{"timestamp":"2025-01-24T10:00:05Z","event":"model_call","data":{"model":"claude-sonnet-4-5","tokensIn":1200,"tokensOut":3400,"durationMs":2100}}
{"timestamp":"2025-01-24T10:01:00Z","event":"escalation","data":{"function":"parse_config","from":"minimax-m2","to":"claude-sonnet-4-5","reason":"type_error"}}
```

### 7.4 Success Metrics & Benchmarks

The protocol defines success metrics across four categories with specific targets.

#### Metrics Schema

```typescript
interface SuccessMetrics {
    // Correctness (hard requirements)
    correctness: {
        compilationRate: number;         // Target: 1.0 (100% from Lattice)
        testPassRate: number;            // Target: 0.95 (95%+)
        securityVulnerabilities: number; // Target: 0
    };

    // Efficiency (optimization targets)
    efficiency: {
        costPer1KLOC: number;                    // Tracked, no fixed target
        timePer1KLOC: number;                    // Tracked, no fixed target
        escalationToStructurerModel: number;       // Target: < 0.10 (10%)
        escalationToArchitectModel: number;        // Target: < 0.01 (1%)
    };

    // Reliability
    reliability: {
        mtbf: number;                    // Mean time between failures (hours)
        recoveryRate: number;            // Target: 0.95 (95% successful resumes)
        humanInterventionRate: number;   // Target: < 0.05 (5% of runs)
    };

    // Code quality
    quality: {
        avgCyclomaticComplexity: number; // Target: < 10
        testCoverage: number;            // Target: > 0.80 (80%)
    };
}
```

#### Target Summary

| Category | Metric | Target | Notes |
|----------|--------|--------|-------|
| Correctness | Compilation rate | 100% | Hard requirement from Lattice |
| Correctness | Test pass rate | ≥ 95% | After Injection complete |
| Correctness | Security vulns | 0 | No known vulnerabilities |
| Efficiency | Escalation to structurer_model | < 10% | Of total functions |
| Efficiency | Escalation to architect_model | < 1% | Of total functions |
| Reliability | Recovery rate | ≥ 95% | Successful resumes from block |
| Reliability | Human intervention | < 5% | Of total runs |
| Quality | Cyclomatic complexity | < 10 | Per function average |
| Quality | Test coverage | > 80% | Line coverage |

#### Benchmark Suite

A standard benchmark suite will be developed to measure protocol performance:

1. **Micro-benchmarks**: Single-function implementations of varying complexity
2. **Module benchmarks**: Small modules (5-10 functions) with cross-function dependencies
3. **Integration benchmarks**: Complete small applications (CLI tool, REST API, library)

Benchmark results are tracked over time to detect regressions and validate improvements.

---

## 8. Tooling & Agent Architecture

The Criticality Protocol requires specialized tooling to enforce its "Context Shedding" philosophy. Standard "Memory" MCPs are anti-patterns here. Instead, **Artifact Servers** serve rigid, stateless truth.

### 8.1 Criticality MCP Servers

#### `criticality-artifact-server` (The Source of Truth)
Replaces standard memory. Provides read/write access *only* to official protocol artifacts (`spec.toml`, `DECISIONS.toml`).
- **Purpose**: Prevents context hallucination. Agents only see committed truth.
- **Tools**:
    - `read_spec_section(section: string)`: Returns specific toml sections.
    - `append_decision(decision: DecisionEntry)`: Atomic append to ledger.
    - `get_type_witness(name: string)`: Retrieves witness definitions.
    - `validate_schema(artifact: string)`: Validates against `schemas/*.json`.

#### `criticality-toolchain-server` (The Hands)
Safe wrapper around the build system (`npm`, `cargo`, `vitest`).
- **Purpose**: Returns structured JSON results (pass/fail, coverage) instead of raw stdout, essential for the `Injection` phase loop.
- **Tools**:
    - `verify_structure()`: Runs `tsc --noEmit` or `cargo check`.
    - `run_function_test(function_name: string)`: Runs isolated unit tests.
    - `run_property_test(claim_id: string)`: Executes property tests.
    - `check_complexity(file_path: string)`: Returns complexity metrics.

### 8.2 Agent Skills & Permissions

Skills are grouped by phase and assigned strict permissions.

| Phase | Skill | Description | Assigned Role |
|-------|-------|-------------|---------------|
| **Ignition** | `conduct_interview` | Orchestrates Q&A, delegates to artifact-server | Architect |
| | `synthesize_spec` | Transforms transcripts to `spec.toml` | Architect |
| | `audit_proposal` | Cross-references spec vs. decisions | Auditor |
| **Lattice** | `generate_witness` | Creates type-witness definitions | Structurer |
| | `scaffold_module` | Creates file structures & `todo!()` sigs | Structurer |
| **Injection** | `implement_atomic` | Core loop: Read sig -> Write code -> Test -> Commit | Worker |
| **Mass Defect** | `detect_smells` | Runs static analysis | Refiner |
| | `apply_pattern` | Applies refactoring patterns | Refiner |

### 8.3 Subagent Swarm Definition

Agents are defined with strict MCP access policies to enforce the "Principle of Least Privilege".

| Agent | Role | Access Policy | Primary MCPs |
|:---|:---|:---|:---|
| **Architect** | Ignition / Synthesis | **High Reasoning, Low Execution**. Can read/write Specs. Can Search. | `artifact-server`, `brave-search` |
| **Auditor** | Verification | **Read-Only**. "Devil's Advocate". No write access to code. | `artifact-server`, `toolchain-server` (read-only) |
| **Structurer** | Lattice / Scaffold | **Structure Only**. Writes files/types. No logic implementation. | `filesystem`, `artifact-server` (read-only) |
| **Worker** | Injection | **Stateless Coder**. Sees ONE function at a time. No Spec access. No Internet. | `filesystem` (scoped), `toolchain-server` |
| **Guardian** | Security | **Security Scan**. Runs alongside Worker. | `toolchain-server` (security scanners) |

---

## 9. Orchestrator Specification

### 9.1 Responsibilities

The orchestrator is **deterministic** and performs **classification but not reasoning**:

**Classification** (deterministic mapping to predefined categories):
- Error type classification (syntax, type, test, semantic, security)
- Escalation tier selection based on failure type
- Phase transition decisions based on artifact state

**Not Reasoning** (no creative problem-solving or chain-of-thought):
- Never attempts to "fix" or "debug" failures
- Never makes judgment calls outside predefined categories
- Never generates solutions—only routes to appropriate phase/model

**Core Functions**:
- Phase state machine transitions
- Context destruction at phase boundaries
- AST parsing and mutation (via `ts-morph` for TypeScript, helper binaries for other languages)
- Compiler and test execution
- Model routing and escalation
- Ledger operations
- Human notification and response handling
- State persistence

**Blocking Behavior**: On block, the orchestrator persists state, sends a one-time notification (Slack/email), and exits. Human runs `criticality status` or `criticality resume` when ready.

### 9.2 State Hierarchy

The orchestrator uses a **hierarchical state machine** with two levels:

1. **Top-level protocol states**: `active`, `blocked`, `completed`
2. **Phase sub-states** (when active): Each phase has its own sub-states for precise checkpointing

```
ProtocolState
├── Blocked (awaiting human input)
├── Completed (final artifacts delivered)
└── Active
    └── PhaseState
        ├── Ignition
        │   ├── Interviewing
        │   ├── Synthesizing
        │   └── AwaitingApproval
        ├── Lattice
        │   ├── GeneratingStructure
        │   ├── CompilingCheck
        │   └── RepairingStructure
        ├── CompositionAudit
        │   ├── Auditing
        │   └── ReportingContradictions
        ├── Injection
        │   ├── SelectingFunction
        │   ├── Implementing
        │   ├── Verifying
        │   └── Escalating
        ├── Mesoscopic
        │   ├── GeneratingTests
        │   ├── ExecutingCluster
        │   └── HandlingVerdict
        └── MassDefect
            ├── AnalyzingComplexity
            ├── ApplyingTransform
            └── VerifyingSemantics
```

### 9.3 State Definitions

#### Top-Level Protocol State

```typescript
type ProtocolState =
    | { type: 'blocked'; data: BlockedState }
    | { type: 'active'; data: ActiveState }
    | { type: 'completed'; data: CompletedState };

interface BlockedState {
    reason: BlockReason;
    query: HumanQuery;
    priorPhase: PhaseType;           // Phase we were in when blocked
    priorSubState: string;           // Sub-state within that phase
    blockedAt: ISO8601Timestamp;
    notificationSent: boolean;
}

interface ActiveState {
    phase: PhaseState;
    startedAt: ISO8601Timestamp;
    checkpointedAt: ISO8601Timestamp;
}

interface CompletedState {
    finalArtifacts: FinalArtifacts;
    completedAt: ISO8601Timestamp;
    summary: ProtocolSummary;        // Cost, duration, escalation stats
}

type BlockReason =
    | { type: 'canonical_conflict'; decisions: [DecisionId, DecisionId] }
    | { type: 'unresolved_contradiction'; report: ContradictionReport }
    | { type: 'circuit_breaker'; failedFunction: FunctionId; attempts: AttemptLog[] }
    | { type: 'security_review'; vulnerability: VulnerabilityReport }
    | { type: 'user_requested'; message: string };
```

#### Phase State

```typescript
type PhaseState =
    | { phase: 'ignition'; subState: IgnitionSubState }
    | { phase: 'lattice'; subState: LatticeSubState }
    | { phase: 'compositionAudit'; subState: CompositionAuditSubState }
    | { phase: 'injection'; subState: InjectionSubState }
    | { phase: 'mesoscopic'; subState: MesoscopicSubState }
    | { phase: 'massDefect'; subState: MassDefectSubState };
```

#### Ignition Sub-States

```typescript
type IgnitionSubState =
    | { type: 'interviewing'; data: InterviewingData }
    | { type: 'synthesizing'; data: SynthesizingData }
    | { type: 'awaitingApproval'; data: AwaitingApprovalData };

interface InterviewingData {
    interviewPhase: 'discovery' | 'architecture' | 'constraints' | 'designPrefs';
    questionIndex: number;
    extractedRequirements: Requirement[];
    delegatedAfter: InterviewPhase | null;
}

interface SynthesizingData {
    proposalVersion: number;
    architectResponse: string | null;
    auditorResponse: string | null;
}

interface AwaitingApprovalData {
    proposalPath: string;
    presentedAt: ISO8601Timestamp;
}
```

#### Lattice Sub-States

```typescript
type LatticeSubState =
    | { type: 'generatingStructure'; data: GeneratingStructureData }
    | { type: 'compilingCheck'; data: CompilingCheckData }
    | { type: 'repairingStructure'; data: RepairingStructureData };

interface GeneratingStructureData {
    modulesGenerated: string[];
    currentModule: string | null;
}

interface CompilingCheckData {
    compileAttempt: number;
}

interface RepairingStructureData {
    errors: CompilerError[];
    repairAttempt: number;
    maxRepairAttempts: number;
}
```

#### Composition Audit Sub-States

```typescript
type CompositionAuditSubState =
    | { type: 'auditing'; data: AuditingData }
    | { type: 'reportingContradictions'; data: ReportingContradictionsData };

interface AuditingData {
    auditorsCompleted: ('temporal' | 'resource' | 'invariant' | 'precondition')[];
    currentAuditor: string | null;
}

interface ReportingContradictionsData {
    contradictions: Contradiction[];
    severity: 'simple' | 'complex';
}
```

#### Injection Sub-States

```typescript
type InjectionSubState =
    | { type: 'selectingFunction'; data: SelectingFunctionData }
    | { type: 'implementing'; data: ImplementingData }
    | { type: 'verifying'; data: VerifyingData }
    | { type: 'escalating'; data: EscalatingData };

interface SelectingFunctionData {
    remainingFunctions: FunctionId[];
    completedFunctions: FunctionId[];
    failedFunctions: FunctionId[];
}

interface ImplementingData {
    functionId: FunctionId;
    currentTier: 'worker' | 'fallback1' | 'fallback2';
    attemptInTier: number;
    totalAttempts: number;
}

interface VerifyingData {
    functionId: FunctionId;
    implementation: string;
    verificationStep: 'compile' | 'test';
}

interface EscalatingData {
    functionId: FunctionId;
    fromTier: 'worker' | 'fallback1';
    toTier: 'fallback1' | 'fallback2';
    failureType: FailureType;
}
```

#### Mesoscopic Sub-States

```typescript
type MesoscopicSubState =
    | { type: 'generatingTests'; data: GeneratingTestsData }
    | { type: 'executingCluster'; data: ExecutingClusterData }
    | { type: 'handlingVerdict'; data: HandlingVerdictData };

interface GeneratingTestsData {
    clusters: ClusterDefinition[];
    testsGenerated: ClusterId[];
    currentCluster: ClusterId | null;
}

interface ExecutingClusterData {
    clusterId: ClusterId;
    testsRun: number;
    testsFailed: number;
}

interface HandlingVerdictData {
    clusterId: ClusterId;
    verdict: ClusterVerdict;
    clustersRemaining: ClusterId[];
}
```

#### Mass Defect Sub-States

```typescript
type MassDefectSubState =
    | { type: 'analyzingComplexity'; data: AnalyzingComplexityData }
    | { type: 'applyingTransform'; data: ApplyingTransformData }
    | { type: 'verifyingSemantics'; data: VerifyingSemanticsData };

interface AnalyzingComplexityData {
    filesAnalyzed: string[];
    currentFile: string | null;
    violations: ComplexityViolation[];
}

interface ApplyingTransformData {
    targetFunction: FunctionId;
    transformation: TransformationType;
    beforeCode: string;
}

interface VerifyingSemanticsData {
    targetFunction: FunctionId;
    afterCode: string;
    testsToRun: string[];
}
```

### 9.4 Transition Definitions

#### Transition Structure

```typescript
interface Transition {
    from: StateRef;
    to: StateRef;
    guard: Guard;           // Condition that must be true
    action: Action;         // Side effects to perform
}

type StateRef =
    | { level: 'protocol'; state: 'blocked' | 'active' | 'completed' }
    | { level: 'phase'; phase: PhaseType; subState: string };

type Guard =
    | { type: 'always' }
    | { type: 'artifactExists'; artifact: ArtifactType }
    | { type: 'compileSuccess' }
    | { type: 'testSuccess' }
    | { type: 'noContradictions' }
    | { type: 'allFunctionsComplete' }
    | { type: 'allClustersPass' }
    | { type: 'metricsPass' }
    | { type: 'repairAttemptsExhausted' }
    | { type: 'tierExhausted' }
    | { type: 'circuitBreakerTripped' }
    | { type: 'humanResponse'; responseType: string }
    | { type: 'and'; guards: Guard[] }
    | { type: 'or'; guards: Guard[] }
    | { type: 'not'; guard: Guard };

type Action =
    | { type: 'none' }
    | { type: 'destroyContext' }
    | { type: 'archiveArtifacts'; artifacts: ArtifactType[] }
    | { type: 'persistCheckpoint' }
    | { type: 'sendNotification'; channel: NotificationChannel }
    | { type: 'recordDecision'; decision: Decision }
    | { type: 'invokeModel'; role: ModelRole; prompt: PromptTemplate }
    | { type: 'runCompiler' }
    | { type: 'runTests'; scope: TestScope }
    | { type: 'sequence'; actions: Action[] };
```

#### Ignition Phase Transitions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  IGNITION PHASE                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐   question      ┌─────────────┐                            │
│  │ interviewing│───answered────▶│ interviewing│  (next question)            │
│  └─────────────┘                 └─────────────┘                            │
│         │                                                                    │
│         │ all questions answered OR user delegates                          │
│         ▼                                                                    │
│  ┌─────────────┐   auditor       ┌─────────────┐                            │
│  │ synthesizing│───challenges───▶│ synthesizing│  (revise proposal)         │
│  └─────────────┘                 └─────────────┘                            │
│         │                                                                    │
│         │ synthesis complete                                                 │
│         ▼                                                                    │
│  ┌──────────────────┐                                                        │
│  │ awaitingApproval │                                                        │
│  └────────┬─────────┘                                                        │
│           │                                                                  │
│     ┌─────┼─────┬──────────┐                                                │
│     │     │     │          │                                                │
│     ▼     ▼     ▼          ▼                                                │
│  APPROVE REVISE REJECT  CONDITIONAL                                         │
│     │     │     │          │                                                │
│     │     │     │          │ record provisional decisions                   │
│     │     │     │          └───────────────────────────┐                    │
│     │     │     │                                      │                    │
│     │     │     └──▶ interviewing (restart)            │                    │
│     │     │                                            │                    │
│     │     └──────▶ interviewing (targeted phase)       │                    │
│     │                                                  │                    │
│     └──────────────────────────────────────────────────┴──▶ LATTICE         │
│                                                                              │
│  [destroyContext, archiveArtifacts(interview)]                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Lattice Phase Transitions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  LATTICE PHASE                                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐                                                     │
│  │ generatingStructure │                                                     │
│  └──────────┬──────────┘                                                     │
│             │ all modules generated                                          │
│             ▼                                                                │
│  ┌─────────────────────┐                                                     │
│  │   compilingCheck    │◀──────────────────────────┐                        │
│  └──────────┬──────────┘                           │                        │
│             │                                      │                        │
│       ┌─────┴─────┐                                │                        │
│       │           │                                │                        │
│       ▼           ▼                                │                        │
│   SUCCESS      FAILURE                             │                        │
│       │           │                                │                        │
│       │           ▼                                │                        │
│       │    ┌──────────────────┐                    │                        │
│       │    │ repairingStructure│────repair done───┘                        │
│       │    └────────┬─────────┘                                             │
│       │             │                                                        │
│       │             │ maxRepairAttempts exceeded                            │
│       │             ▼                                                        │
│       │         BLOCKED (structural defect)                                  │
│       │                                                                      │
│       └──────────────────────────────────────▶ COMPOSITION_AUDIT            │
│                                                                              │
│  [destroyContext]                                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Composition Audit Transitions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  COMPOSITION AUDIT PHASE                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐   auditor        ┌─────────────┐                           │
│  │  auditing   │───complete──────▶│  auditing   │  (next auditor)           │
│  └─────────────┘                  └─────────────┘                           │
│         │                                                                    │
│         │ all auditors complete                                              │
│         │                                                                    │
│    ┌────┴────┐                                                               │
│    │         │                                                               │
│    ▼         ▼                                                               │
│  CLEAN   CONTRADICTIONS                                                      │
│    │         │                                                               │
│    │         ▼                                                               │
│    │  ┌────────────────────────┐                                            │
│    │  │ reportingContradictions│                                            │
│    │  └───────────┬────────────┘                                            │
│    │              │                                                          │
│    │         ┌────┴────┐                                                     │
│    │         │         │                                                     │
│    │         ▼         ▼                                                     │
│    │     SIMPLE    COMPLEX                                                   │
│    │         │         │                                                     │
│    │         │         └──────────▶ BLOCKED (unresolved contradiction)      │
│    │         │                                                               │
│    │         └──────────────────▶ IGNITION (targeted revision)              │
│    │                               [contradiction report in ledger]          │
│    │                                                                         │
│    └─────────────────────────────▶ INJECTION                                │
│                                                                              │
│  [destroyContext]                                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Injection Phase Transitions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  INJECTION PHASE                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────┐                                                       │
│  │ selectingFunction │◀─────────────────────────────────────────────┐       │
│  └─────────┬─────────┘                                              │       │
│            │ function selected                                       │       │
│            ▼                                                         │       │
│  ┌───────────────────┐                                              │       │
│  │   implementing    │◀───────────────────────────┐                 │       │
│  └─────────┬─────────┘                            │                 │       │
│            │ implementation received               │                 │       │
│            ▼                                       │                 │       │
│  ┌───────────────────┐                            │                 │       │
│  │    verifying      │                            │                 │       │
│  └─────────┬─────────┘                            │                 │       │
│            │                                       │                 │       │
│       ┌────┴────┐                                  │                 │       │
│       │         │                                  │                 │       │
│       ▼         ▼                                  │                 │       │
│    SUCCESS   FAILURE                               │                 │       │
│       │         │                                  │                 │       │
│       │         ▼                                  │                 │       │
│       │    retry in tier?───YES───────────────────┘                 │       │
│       │         │                                                    │       │
│       │         NO                                                   │       │
│       │         ▼                                                    │       │
│       │  ┌─────────────┐                                            │       │
│       │  │  escalating │                                            │       │
│       │  └──────┬──────┘                                            │       │
│       │         │                                                    │       │
│       │    ┌────┴────┐                                              │       │
│       │    │         │                                              │       │
│       │    ▼         ▼                                              │       │
│       │  NEXT    ALL TIERS                                          │       │
│       │  TIER    EXHAUSTED                                          │       │
│       │    │         │                                              │       │
│       │    │         ├──require_opus_attempt?──NO──▶ BLOCKED        │       │
│       │    │         │                                              │       │
│       │    │         └──YES, tried opus──▶ BLOCKED (circuit breaker)│       │
│       │    │                                                         │       │
│       │    └──────────▶ implementing (next tier)                    │       │
│       │                                                              │       │
│       └──────────────▶ selectingFunction ───────────────────────────┘       │
│                              │                                               │
│                              │ no functions remaining                        │
│                              │                                               │
│            ┌─────────────────┴─────────────────┐                            │
│            │                                   │                            │
│            ▼                                   ▼                            │
│    circuitBreaker OK               circuitBreaker TRIPPED                   │
│            │                                   │                            │
│            │                                   └──▶ LATTICE (structural     │
│            │                                         defect report)         │
│            ▼                                                                │
│        MESOSCOPIC                                                           │
│                                                                              │
│  [destroyContext per function, NOT per phase]                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Mesoscopic Phase Transitions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  MESOSCOPIC PHASE                                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐                                                         │
│  │ generatingTests │                                                         │
│  └────────┬────────┘                                                         │
│           │ all cluster tests generated                                      │
│           ▼                                                                  │
│  ┌──────────────────┐                                                        │
│  │ executingCluster │◀────────────────────────────────────────┐             │
│  └────────┬─────────┘                                         │             │
│           │ cluster execution complete                         │             │
│           ▼                                                    │             │
│  ┌──────────────────┐                                         │             │
│  │ handlingVerdict  │                                         │             │
│  └────────┬─────────┘                                         │             │
│           │                                                    │             │
│      ┌────┴────┐                                              │             │
│      │         │                                              │             │
│      ▼         ▼                                              │             │
│    PASS      FAIL                                             │             │
│      │         │                                              │             │
│      │         └──────────────▶ INJECTION                     │             │
│      │                          [re-inject cluster functions]  │             │
│      │                          [violatedClaims in ledger]     │             │
│      │                                                         │             │
│      └──▶ more clusters?───YES────────────────────────────────┘             │
│                 │                                                            │
│                 NO                                                           │
│                 │                                                            │
│                 ▼                                                            │
│            MASS_DEFECT                                                       │
│                                                                              │
│  [destroyContext]                                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Mass Defect Phase Transitions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  MASS DEFECT PHASE                                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐                                                     │
│  │ analyzingComplexity │◀──────────────────────────────────────────┐        │
│  └──────────┬──────────┘                                           │        │
│             │                                                       │        │
│        ┌────┴────┐                                                  │        │
│        │         │                                                  │        │
│        ▼         ▼                                                  │        │
│   NO VIOLATIONS  VIOLATIONS FOUND                                   │        │
│        │               │                                            │        │
│        │               ▼                                            │        │
│        │    ┌───────────────────┐                                   │        │
│        │    │ applyingTransform │                                   │        │
│        │    └─────────┬─────────┘                                   │        │
│        │              │ transform applied                           │        │
│        │              ▼                                             │        │
│        │    ┌───────────────────┐                                   │        │
│        │    │ verifyingSemantics│                                   │        │
│        │    └─────────┬─────────┘                                   │        │
│        │              │                                             │        │
│        │         ┌────┴────┐                                        │        │
│        │         │         │                                        │        │
│        │         ▼         ▼                                        │        │
│        │     TESTS PASS  TESTS FAIL                                 │        │
│        │         │         │                                        │        │
│        │         │         └──▶ revert transform                    │        │
│        │         │              record in ledger                    │        │
│        │         │              │                                   │        │
│        │         └─────────────┴────────────────────────────────────┘        │
│        │                                                                     │
│        │  (also: diminishing returns check)                                  │
│        │                                                                     │
│        ▼                                                                     │
│    COMPLETED                                                                 │
│                                                                              │
│  Final artifacts: optimized code, test suite, coverage report               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.5 Tick Function

The orchestrator executes as a loop of atomic "ticks". Each tick is deterministic given the current state and artifacts.

```typescript
interface Orchestrator {
    state: ProtocolState;
    ledger: DecisionLedger;
    config: OrchestratorConfig;
    models: ModelRouter;
    humanInterface: HumanInterface;

    // Transient state (not persisted)
    phaseContext: unknown | null;
    pendingModelCall: PendingModelCall | null;
    pendingCompilerRun: boolean;
    pendingTestRun: PendingTestRun | null;
    lastModelResult: ModelResult | null;
    lastCompileResult: CompileResult | null;
    lastTestResult: TestResult | null;
}

type TickResult =
    | { type: 'done'; artifacts: FinalArtifacts }
    | { type: 'blocked'; query: HumanQuery }
    | { type: 'waiting'; query: HumanQuery }
    | { type: 'awaitingModel'; call: PendingModelCall }
    | { type: 'awaitingCompiler' }
    | { type: 'awaitingTests'; scope: TestScope }
    | { type: 'continue' };

async function tick(orchestrator: Orchestrator): Promise<TickResult> {
    const { state } = orchestrator;

    switch (state.type) {
        case 'completed':
            return { type: 'done', artifacts: state.data.finalArtifacts };

        case 'blocked':
            return await handleBlocked(orchestrator);

        case 'active':
            return await handleActive(orchestrator);
    }
}

async function handleActive(orchestrator: Orchestrator): Promise<TickResult> {
    const { state } = orchestrator;
    const active = state.data as ActiveState;
    const currentStateRef = {
        phase: active.phase.phase,
        subState: active.phase.subState.type
    };

    // Find first transition whose guard is satisfied
    const applicableTransitions = transitions.filter(t =>
        stateRefEquals(t.from, currentStateRef)
    );

    for (const transition of applicableTransitions) {
        const guardResult = await evaluateGuard(orchestrator, transition.guard);
        if (guardResult.satisfied) {
            return await executeTransition(orchestrator, transition, guardResult.context);
        }
    }

    // No transition applicable - waiting for external event
    return { type: 'pending', awaiting: determinePendingEvent(orchestrator) };
}

async function run(orchestrator: Orchestrator): Promise<RunResult> {
    while (true) {
        const result = await tick(orchestrator);

        switch (result.type) {
            case 'done':
                return { type: 'completed', artifacts: result.artifacts };

            case 'blocked':
            case 'waiting':
                return { type: 'blocked', query: result.query };

            case 'awaitingModel':
                orchestrator.lastModelResult = await invokeModel(orchestrator, result.call);
                orchestrator.pendingModelCall = null;
                break;

            case 'awaitingCompiler':
                orchestrator.lastCompileResult = await runCompiler(orchestrator);
                orchestrator.pendingCompilerRun = false;
                break;

            case 'awaitingTests':
                orchestrator.lastTestResult = await runTests(orchestrator, result.scope);
                orchestrator.pendingTestRun = null;
                break;

            case 'continue':
                break;
        }
    }
}
```

### 9.6 Persistence and Resume

#### Persisted State Schema

```typescript
interface PersistedState {
    version: string;
    projectId: string;

    protocolState: ProtocolState;

    artifacts: {
        spec: string | null;
        lattice: string | null;
        tests: string | null;
        archive: string[];
    };

    ledgerPath: string;
    phaseProgress: PhaseProgress | null;

    pending: {
        modelCall: PendingModelCall | null;
        compilerRun: boolean;
        testRun: PendingTestRun | null;
    };

    metrics: RunMetrics;

    createdAt: ISO8601Timestamp;
    lastCheckpoint: ISO8601Timestamp;
}

interface RunMetrics {
    totalModelCalls: number;
    modelCallsByRole: Record<ModelRole, number>;
    totalCompilations: number;
    totalTestRuns: number;
    escalations: EscalationRecord[];
    phaseDurations: Record<PhaseType, number>;
    estimatedCost: number;
}
```

#### Persistence Operations

```typescript
const STATE_FILE = '.criticality/state.json';
const LEDGER_FILE = '.criticality/ledger.toml';

async function persistState(orchestrator: Orchestrator): Promise<void> {
    const persisted: PersistedState = {
        version: '1.0.0',
        projectId: orchestrator.config.projectId,
        protocolState: orchestrator.state,
        artifacts: { /* ... */ },
        ledgerPath: LEDGER_FILE,
        phaseProgress: extractPhaseProgress(orchestrator),
        pending: {
            modelCall: orchestrator.pendingModelCall,
            compilerRun: orchestrator.pendingCompilerRun,
            testRun: orchestrator.pendingTestRun,
        },
        metrics: orchestrator.metrics,
        createdAt: orchestrator.createdAt,
        lastCheckpoint: new Date().toISOString(),
    };

    // Atomic write: temp file then rename
    const tempPath = `${STATE_FILE}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(persisted, null, 2));
    await fs.rename(tempPath, STATE_FILE);
}

async function resume(projectPath: string): Promise<Orchestrator> {
    const persisted = await loadState(projectPath);
    if (persisted === null) {
        throw new Error('No protocol state found. Run `criticality init` first.');
    }

    const ledger = await loadLedger(path.join(projectPath, persisted.ledgerPath));
    const config = await loadConfig(projectPath);

    return {
        state: persisted.protocolState,
        ledger,
        config,
        models: createModelRouter(config.models),
        humanInterface: createHumanInterface(config.notifications),

        // Restore paths
        specPath: persisted.artifacts.spec,
        latticePath: persisted.artifacts.lattice,
        testsPath: persisted.artifacts.tests,
        archivedPaths: persisted.artifacts.archive,

        // Restore pending operations
        pendingModelCall: persisted.pending.modelCall,
        pendingCompilerRun: persisted.pending.compilerRun,
        pendingTestRun: persisted.pending.testRun,

        metrics: persisted.metrics,
        createdAt: persisted.createdAt,

        // Fresh context (never persisted)
        phaseContext: null,
        lastModelResult: null,
        lastCompileResult: null,
        lastTestResult: null,
    };
}
```

#### CLI Commands

| Command | Description |
|---------|-------------|
| `criticality status` | Show current protocol state without running |
| `criticality resume` | Resume from last checkpoint |
| `criticality resolve` | Resolve a blocking query with interactive selection |

#### Interactive Resolve Mode

The `criticality resolve` command launches an interactive selection interface for resolving blocking queries. The system displays the blocking query and all available resolution options, allowing the user to select one interactively.

**Primary Mode: Arrow-Key Selection**
1. Running `crit resolve` displays the blocking query with numbered options
2. Users navigate using arrow keys (↑/↓) to highlight their choice
3. Press Enter to confirm the selected option
4. The selection is recorded and the protocol resumes

**Alternative: Numbered Input**
Users may also type the option number directly as a shortcut (e.g., type `1` to select option 1 and press Enter).

**Example Interactive Flow**
```
$ crit resolve

Blocking Query: conflict_003
How should this contradiction be resolved?

  ┌─────────────────────────────────────────┐
  │ ○ Option 1: Keep spec, modify lattice  │
  │ ○ Option 2: Keep lattice, modify spec   │
  │ ○ Option 3: Provide custom resolution   │
  └─────────────────────────────────────────┘

Use ↑/↓ to navigate, Enter to select, or type option number
```

The interactive approach ensures users see the full context and implications of each resolution option before making a decision, which is particularly important for blocking queries that may have far-reaching effects on the protocol state.

### 9.7 Invariants

The orchestrator maintains these invariants:

| Invariant | Description | Enforcement |
|-----------|-------------|-------------|
| **Determinism** | Given same (state, artifacts, ledger), same transitions occur | No randomness in guards or actions |
| **Context Isolation** | No LLM conversation history persists across phase boundaries | `destroyContext` action at transitions |
| **Atomic Persistence** | State file is never corrupted | Temp file + rename pattern |
| **Resumability** | Can resume from any checkpoint | All necessary state in PersistedState |
| **No Reasoning** | Orchestrator never generates solutions | Only classification and dispatch |
| **Compile Oracle** | From Lattice onward, code must compile | Guard on phase transitions |

### 9.8 AST Operations

The orchestrator uses language-specific AST libraries for code manipulation:

**TypeScript (orchestrator implementation)**:
```typescript
import { Project } from 'ts-morph';

function injectImplementation(skeleton: string, fnName: string, body: string): string {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile('temp.ts', skeleton);
    const fn = sourceFile.getFunction(fnName);
    if (fn) {
        fn.setBodyText(body);
    }
    return sourceFile.getFullText();
}
```

**For Rust target code** (via child process):
```typescript
import { execSync } from 'child_process';

function injectRustImplementation(skeleton: string, fnName: string, body: string): string {
    const result = execSync('criticality-rust-ast inject', {
        input: JSON.stringify({ skeleton, fnName, body }),
        encoding: 'utf-8'
    });
    return JSON.parse(result).code;
}
```

### 9.9 Configuration

```toml
[orchestrator]
max_parallel_injections = 8
checkpoint_interval_seconds = 60
state_persistence_path = ".criticality/state"

[orchestrator.timeouts]
ignition_max_seconds = 3600
lattice_max_seconds = 1800
injection_per_function_seconds = 60
mesoscopic_per_cluster_seconds = 300

[orchestrator.notifications]
channels = ["cli", "slack"]
reminder_interval_hours = 24
```

---

## 10. Language Support Matrix

**Note**: Protocol v1 assumes single-language projects. Multi-language support (cross-language type mapping, unified spec for polyglot projects, FFI generation) is deferred to Phase 7.

### Full Support

| Language | Compiler | Test Framework | Property Testing | Witness Level |
|----------|----------|----------------|------------------|---------------|
| Rust | cargo check | cargo test | proptest | distinction |

### Strong Support

| Language | Compiler | Test Framework | Property Testing | Witness Level |
|----------|----------|----------------|------------------|---------------|
| TypeScript | tsc | jest/vitest | fast-check | distinction (branded) |
| Python | mypy | pytest | hypothesis | runtime |
| Go | go build | go test | gopter | runtime |

### Basic Support

| Language | Compiler | Test Framework | Property Testing | Witness Level |
|----------|----------|----------------|------------------|---------------|
| Java | javac | JUnit | jqwik | runtime |
| C++ | clang/gcc | gtest | rapidcheck | distinction |

### Language Adapter Interface

```typescript
interface LanguageAdapter {
    compileCheck(sourcePath: string): Promise<CompileResult>;
    runTests(sourcePath: string): Promise<TestResult>;
    parseAst(source: string): Promise<AST>;
    injectBody(ast: AST, fnName: string, body: string): AST;
    emitCode(ast: AST): string;
    generateWitness(spec: WitnessSpec): GeneratedCode;
}

// Implementations for each target language
class RustAdapter implements LanguageAdapter { /* ... */ }
class TypeScriptAdapter implements LanguageAdapter { /* ... */ }
class PythonAdapter implements LanguageAdapter { /* ... */ }
class GoAdapter implements LanguageAdapter { /* ... */ }
```

---

## 11. Open Questions & Future Work

### Open Questions

1. **Ledger Compaction**: How aggressively should we archive old decisions? What's the retrieval cost vs. storage cost tradeoff?

2. **Cross-language Projects**: How do we handle multi-language projects where the Lattice spans multiple languages?

3. **Incremental Re-runs**: If the user updates the spec, can we avoid re-running the entire protocol? Which artifacts can be preserved?

4. **Model Substitution**: As new models become available, how do we evaluate whether they should replace existing assignments?

5. **Distributed Injection**: Can the Ralph Loop be distributed across multiple machines for large codebases?

### Future Work

1. **Formal Verification Integration**: Connect to tools like Creusot (Rust), Dafny, or TLA+ for critical sections

2. **IDE Integration**: Real-time Lattice visualization, contract editing, witness inspection

3. **Learning from Failures**: Aggregate failure patterns across projects to improve prompts (without violating statelessness within a run)

4. **Domain-Specific Extensions**: Specialized phases for web apps, embedded systems, ML pipelines, etc.

5. **Cost Tracking Dashboard**: Real-time cost estimation and optimization suggestions

---

## 12. Appendices

### Appendix A: Glossary

| Term | Definition |
|------|------------|
| **Criticality** | The property of being compilable; the system maintains criticality from Lattice onward |
| **Context Shedding** | Deliberate destruction of conversation history at phase boundaries |
| **Decision Ledger** | Append-only log of validated decisions that survives phase transitions |
| **Lattice** | The compilable skeleton produced by Lattice; contains structure but no logic |
| **Micro-Contract** | Formal constraints attached to a function signature |
| **Ralph Loop** | The stateless implementation loop in Injection, named after the "Ralph Wiggum Loop" pattern from [awesomeclaude.ai](https://awesomeclaude.ai/ralph-wiggum). Embodies "persistent iteration despite setbacks"—a while loop that repeatedly feeds prompts until completion. Named after The Simpsons character representing relentless determination. |
| **Type Witness** | A type-level encoding of a runtime invariant |
| **Mass Defect** | The reduction in code size/complexity during Mass Defect (physics analogy) |

### Appendix B: File Structure

```
project/
├── .criticality/
│   ├── state.json           # Persisted protocol state
│   ├── ledger.toml          # Decision ledger
│   ├── checkpoints/         # Phase checkpoints
│   ├── archive/             # Archived phase artifacts (NEVER fed to LLMs)
│   │   ├── interview/       # Archived interview data after approval
│   │   ├── lattice/         # Archived Lattice attempts after failures
│   │   └── proposals/       # All proposal versions for audit
│   └── interview/
│       ├── state.json       # Interview state (position, extracted facts)
│       ├── transcript.jsonl # Turn-by-turn conversation log
│       └── proposals/
│           ├── v1.toml      # First proposal
│           ├── v1_feedback.json
│           ├── v2.toml      # Revised proposal
│           └── v2_approved.json
├── spec/
│   ├── spec.toml            # Specification artifact (final, from approved proposal)
│   └── claims.toml          # Extracted testable claims
├── src/
│   ├── domain/              # Domain types
│   ├── services/            # Service implementations
│   └── witnesses/           # Type witness definitions
├── tests/
│   ├── unit/                # Unit tests
│   ├── property/            # Property-based tests
│   └── integration/         # Integration tests
└── criticality.toml         # Protocol configuration
```

**Archive Invariant**: Data in `archive/` is for human audit only and is NEVER fed back into LLM prompts. This maintains context shedding while preserving audit trails.

### Appendix C: Configuration Reference

```toml
# criticality.toml

[project]
name = "my-project"
language = "rust"
spec_path = "spec/spec.toml"

[models]
architect = "claude-opus-4-5"
auditor = "kimi-k2"
structurer = "claude-sonnet-4-5"
worker = "minimax-m2"
worker_fallback_1 = "claude-sonnet-4-5"
worker_fallback_2 = "claude-opus-4-5"

[models.endpoints]
minimax = { provider = "cerebras", model = "minimax-m2" }
kimi = { provider = "groq", model = "kimi-k2" }
claude = { provider = "anthropic" }

[escalation]
syntax_retry_limit = 2
type_retry_limit = 2
test_retry_limit = 3

[circuit_breaker]
function_failure_threshold = 5
module_escalation_rate = 0.20
phase_failure_rate = 0.10

[mass_defect]
max_cyclomatic_complexity = 10
max_function_length = 50
target_coverage = 0.80

[notifications]
enabled = true
reminder_schedule = "0 9 * * *"

[[notifications.channels]]
type = "webhook"
endpoint = "https://example.com/webhook"
enabled = true
events = ["block", "complete", "error"]

[[notifications.channels]]
type = "webhook"
endpoint = "https://alerts.example.com/hooks"
enabled = true
events = ["block", "phase_change"]
```

#### Notification Configuration Fields

| Field | Type | Description |
|--------|-------|-------------|
| `enabled` | boolean | Whether notifications are globally enabled |
| `reminder_schedule` | string | Cron expression for reminder scheduling (e.g., `"0 9 * * *"` for daily at 9am) |
| `channels` | array of tables | Notification channel configurations |

#### Channel Configuration Fields

| Field | Type | Description |
|--------|-------|-------------|
| `type` | string | Channel type (currently only `"webhook"` supported) |
| `endpoint` | string | URL for sending notifications (webhook URL) |
| `enabled` | boolean | Whether this specific channel is enabled |
| `events` | array of strings | Events to subscribe to: `"block"`, `"complete"`, `"error"`, `"phase_change"` |

#### Example: Multiple Webhooks with Daily Reminders

```toml
[notifications]
enabled = true
reminder_schedule = "0 9 * * 1-5"  # Weekdays at 9am

[[notifications.channels]]
type = "webhook"
endpoint = "https://hooks.slack.com/services/xxx/yyy"
enabled = true
events = ["block", "error"]

[[notifications.channels]]
type = "webhook"
endpoint = "https://api.pagerduty.com/integration/xxx/enqueue"
enabled = true
events = ["block", "error", "complete"]
```

### Appendix D: Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0-draft | 2025-01-23 | Initial specification |

---

**Document Status**: This is a living document. Updates should be made as design decisions are finalized and implementation reveals new requirements.

**Maintainer**: [To be assigned]

**Review Cycle**: Weekly during active development
