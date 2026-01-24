# Criticality Protocol - Design Review & Decisions

**Date**: 2025-01-24
**Status**: ✅ Completed - All decisions applied to documentation

This document captures contradictions and unclear designs identified during project review. Each issue includes options and a recommendation. Fill in the **Decision** section for each item.

---

## Table of Contents

1. [Contradictions](#contradictions)
   - [C1: Ledger "Append-Only" vs Override Operations](#c1-ledger-append-only-vs-override-operations)
   - [C2: Context Shedding vs Rationale Preservation](#c2-context-shedding-vs-rationale-preservation)
   - [C3: Mesoscopic Verification Optional vs Required](#c3-mesoscopic-verification-optional-vs-required)
   - [C4: Type Witness Tier Numbering Inconsistency](#c4-type-witness-tier-numbering-inconsistency)
   - [C5: Witness Schema Field Name Mismatch](#c5-witness-schema-field-name-mismatch)
   - [C6: Circuit Breaker Threshold Definitions](#c6-circuit-breaker-threshold-definitions)
2. [Unclear Designs](#unclear-designs)
   - [U1: What Survives Phase Boundaries](#u1-what-survives-phase-boundaries)
   - [U2: Composition Audit Failure Recovery Path](#u2-composition-audit-failure-recovery-path)
   - [U3: Orchestrator "No Reasoning" Boundary](#u3-orchestrator-no-reasoning-boundary)
   - [U4: Human Blocking Notification Mechanism](#u4-human-blocking-notification-mechanism)
   - [U5: Delegation Decision Confidence Level](#u5-delegation-decision-confidence-level)
   - [U6: Conditional Approval Flow](#u6-conditional-approval-flow)
   - [U7: Model Substitution Strategy](#u7-model-substitution-strategy)
3. [Design Gaps](#design-gaps)
   - [G1: Enum/Union Types in Spec Schema](#g1-enumunion-types-in-spec-schema)
   - [G2: Multi-Language Project Compilation Oracle](#g2-multi-language-project-compilation-oracle)
   - [G3: Ralph Loop Naming](#g3-ralph-loop-naming)

---

## Contradictions

### C1: Ledger "Append-Only" vs Override Operations

**Severity**: Medium
**Files**: `SPECIFICATION.md:941-952`, `DECISIONS.toml:171-179`, `ledger.schema.json:117-125`

#### Problem

The Decision Ledger is described as "append-only" (decision `ledger_001`), yet the specification defines mutation operations:

```typescript
type LedgerOp =
    | { type: 'append'; decision: Decision }
    | { type: 'override'; id: DecisionId; newConstraint: string; reason: string }
    | { type: 'invalidate'; id: DecisionId; failureReport: FailureReport }
```

The schema also includes `supersedes` and `superseded_by` fields, suggesting in-place modification.

#### Options

**Option A: True Append-Only (Event Sourcing)**
- Override creates a NEW entry that references the old one
- Original entry remains unchanged, gains `superseded_by` pointer
- Query layer reconstructs current state from event history
- Pro: Full audit trail, immutable history
- Con: More complex queries, storage grows indefinitely

**Option B: Mutable with Audit Trail**
- Entries can be modified in place
- All modifications logged to separate audit table
- Simpler queries, smaller active dataset
- Pro: Simpler implementation
- Con: "Append-only" terminology is misleading

**Option C: Hybrid (Soft Delete)**
- Entries are never deleted or modified
- `status` field marks entries as `active`, `superseded`, `invalidated`
- New entries explicitly link to what they replace
- Pro: True append-only while supporting logical overrides
- Con: Requires careful query filtering

#### Recommendation

**Option C (Hybrid)** - Maintains the append-only invariant for auditability while supporting the override semantics the protocol needs. Rename "override" operation to "supersede" for clarity.

#### Decision

```
[ ] Option A: True Append-Only (Event Sourcing)
[ ] Option B: Mutable with Audit Trail
[x] Option C: Hybrid (Soft Delete) [Recommended]
[ ] Other: _______________

Notes:


```

---

### C2: Context Shedding vs Rationale Preservation

**Severity**: Low
**Files**: `SPECIFICATION.md:63-66`, `DECISIONS.toml:27-31`, `ledger.schema.json:84-85`

#### Problem

Core principle states reasoning traces should not propagate between phases. Yet every decision includes a detailed `rationale` field explaining the reasoning behind it.

#### Options

**Option A: Remove Rationale from Ledger**
- Ledger stores only constraint + metadata
- Rationale documented elsewhere (design docs, ADRs)
- Pro: Pure context shedding
- Con: Loses valuable context for human review

**Option B: Rationale is Human-Only**
- Rationale stored but NEVER included in LLM prompts
- Only `constraint` field fed to subsequent phases
- Pro: Best of both worlds
- Con: Requires discipline in prompt construction

**Option C: Clarify Terminology**
- "Reasoning traces" means LLM conversation/chain-of-thought
- Human-authored rationale is explicitly permitted
- Update spec to distinguish these clearly
- Pro: No structural changes needed
- Con: Subtle distinction may cause confusion

#### Recommendation

**Option B** - The rationale serves human auditors and future maintainers. The key constraint is that LLM prompts in subsequent phases receive only the `constraint` text, never the `rationale`. Document this explicitly.

#### Decision

```
[ ] Option A: Remove Rationale from Ledger
[x] Option B: Rationale is Human-Only [Recommended]
[ ] Option C: Clarify Terminology
[ ] Other: _______________

Notes:


```

---

### C3: Mesoscopic Verification Optional vs Required

**Severity**: Medium
**Files**: `SPECIFICATION.md:767-824`, `DECISIONS.toml:107-115`, Phase transition table

#### Problem

Decision `phase_002` states Mesoscopic Verification is "recommended but optional." However, the phase transition table shows it as mandatory in the pipeline:

```
Injection → Mesoscopic → Mass Defect
```

No bypass path is defined.

#### Options

**Option A: Make Mesoscopic Mandatory**
- Update `phase_002` decision to remove "optional"
- All projects must pass Mesoscopic before Mass Defect
- Pro: Consistent with transition table, catches integration bugs
- Con: Overhead for simple single-module projects

**Option B: Make Mesoscopic Truly Optional**
- Add transition path: `Injection → Mass Defect` (skip Mesoscopic)
- Configuration flag: `skip_mesoscopic = true`
- Pro: Flexibility for simple projects
- Con: Risk of integration bugs in production

**Option C: Conditional Based on Project Size**
- Auto-skip if project has only 1 module/cluster
- Mandatory if 2+ clusters exist
- Pro: Smart default behavior
- Con: Magic threshold may not fit all cases

#### Recommendation

**Option C** - Single-module projects gain nothing from Mesoscopic (no cross-module integration to test). Projects with multiple modules should always run it. Make this the default with override available.

#### Decision

```
[x] Option A: Make Mesoscopic Mandatory
[ ] Option B: Make Mesoscopic Truly Optional
[ ] Option C: Conditional Based on Project Size [Recommended]
[ ] Other: _______________

Notes:


```

---

### C4: Type Witness Tier Numbering Inconsistency

**Severity**: Low
**Files**: `SPECIFICATION.md:1009-1017`, `README.md:162-168`

#### Problem

The SPECIFICATION defines 4 verification tiers:
1. Compile-time proof (Haskell, Rust typestate)
2. Compile-time distinction (branded types)
3. Runtime validation
4. Documentation only

The README defines 3 support tiers:
1. Full (Rust)
2. Strong (TypeScript, Python, Go)
3. Basic (Java, C++)

These are conflated in places—Rust is called "Tier 1" in README but uses "Tier 2" verification mechanisms.

#### Options

**Option A: Rename to Avoid Confusion**
- Verification Tiers → "Witness Levels" (L1-L4)
- Support Tiers → Keep as "Tier 1-3"
- Pro: Clear distinction
- Con: Requires updating all documentation

**Option B: Consolidate into Single Hierarchy**
- Merge concepts: Support tier = highest witness level achievable
- Rust = Tier 1 = L1-L2 witnesses available
- Pro: Simpler mental model
- Con: Loses nuance about what's possible vs default

**Option C: Use Descriptive Names Instead of Numbers**
- Witness levels: `proof`, `distinction`, `runtime`, `doc`
- Support tiers: `full`, `strong`, `basic`
- Pro: Self-documenting
- Con: More verbose

#### Recommendation

**Option C** - Numbers are confusing when two different hierarchies exist. Descriptive names make the distinction obvious without requiring readers to remember which "tier 2" is which.

#### Decision

```
[ ] Option A: Rename to Avoid Confusion
[ ] Option B: Consolidate into Single Hierarchy
[x] Option C: Use Descriptive Names [Recommended]
[ ] Other: _______________

Notes:


```

---

### C5: Witness Schema Field Name Mismatch

**Severity**: High
**Files**: `spec.schema.json`, `witness.schema.json`, `spec.example.toml`

#### Problem

Three different structures for the same concept:

| Location | Required Fields | Base Type Field |
|----------|-----------------|-----------------|
| `spec.schema.json` | `name`, `invariants` | (not required) |
| `witness.schema.json` | `name`, `base`, `invariants` | `base.inner_type` |
| `spec.example.toml` | `name`, `base_type`, `invariants` | `base_type` |

This will cause validation failures and implementation confusion.

#### Options

**Option A: Align All to `witness.schema.json`**
- It's the most complete schema
- Update `spec.schema.json` to reference it
- Update examples to use `base: { inner_type: "..." }`
- Pro: Single source of truth
- Con: More verbose in TOML

**Option B: Simplify All to `base_type` String**
- Flatten the structure everywhere
- `base_type = "Decimal"` instead of nested object
- Pro: Simpler TOML authoring
- Con: Loses room for type parameters in base

**Option C: Two-Level Schema**
- `spec.schema.json` uses simplified inline format
- `witness.schema.json` used for standalone witness files
- Converter between formats
- Pro: Best of both worlds
- Con: Two formats to maintain

#### Recommendation

**Option B with extension** - Use `base_type` as primary field. Add optional `type_params` array at same level for generics. This keeps TOML simple while supporting complex cases.

```toml
[witnesses.SortedVec]
name = "SortedVec"
base_type = "Vec<T>"
type_params = [{ name = "T", bounds = ["Ord"] }]
invariants = [...]
```

#### Decision

```
[ ] Option A: Align All to witness.schema.json
[x] Option B: Simplify All to base_type String [Recommended]
[ ] Option C: Two-Level Schema
[ ] Other: _______________

Notes:


```

---

### C6: Circuit Breaker Threshold Definitions

**Severity**: Medium
**Files**: `SPECIFICATION.md:759-764`, `SPECIFICATION.md:1172-1177`

#### Problem

Two definitions of circuit breaker conditions:

**Definition 1** (prose):
- Single function fails "across all model tiers" (exhaustion)
- >20% escalation rate
- >10% failure rate

**Definition 2** (config):
```toml
function_failure_threshold = 5  # Total attempts across all models
```

"Fails across all model tiers" ≠ "5 total attempts". Five attempts could all be on MiniMax.

#### Options

**Option A: Exhaustion-Based**
- Circuit breaks when a function fails at EVERY tier (MiniMax, Sonnet, Opus)
- Remove numeric threshold
- Pro: Clear semantic meaning
- Con: Could waste many attempts before breaking

**Option B: Attempt-Count-Based**
- Circuit breaks after N total attempts regardless of tier
- Config: `max_attempts_per_function = 5`
- Pro: Predictable cost/time bounds
- Con: Might give up before trying capable model

**Option C: Hybrid (Both Conditions)**
- Break if: (all tiers exhausted) OR (N attempts exceeded)
- Whichever comes first
- Pro: Covers both runaway costs and true impossibility
- Con: More complex logic

#### Recommendation

**Option C** - The hybrid approach provides safety bounds while ensuring capable models get a chance. Suggested config:

```toml
[circuit_breaker]
max_attempts_per_function = 8      # Hard cap
require_opus_attempt = true        # Must try Opus before giving up
```

#### Decision

```
[ ] Option A: Exhaustion-Based
[ ] Option B: Attempt-Count-Based
[x] Option C: Hybrid [Recommended]
[ ] Other: _______________

Notes:


```

---

## Unclear Designs

### U1: What Survives Phase Boundaries

**Severity**: High
**Files**: `SPECIFICATION.md:479-485`, `SPECIFICATION.md:1589-1616`

#### Problem

The spec states "only `spec.toml` and Decision Ledger entries persist" after Ignition. But Appendix B shows persistent interview data:

```
~/.criticality/projects/<project>/
├── interview/
│   ├── state.json
│   ├── transcript.jsonl
│   └── proposals/
```

What happens to:
- Interview transcript after approval?
- Proposal versions?
- Lattice code after failed Composition Audit?

#### Options

**Option A: Aggressive Destruction**
- Delete interview data after spec approval
- Delete Lattice code on Composition Audit failure
- Only `spec.toml` + `ledger.toml` survive
- Pro: True context shedding
- Con: Loses audit trail

**Option B: Archive, Don't Destroy**
- Move completed phase artifacts to `archive/` directory
- Never feed archived data to LLMs
- Keep for human audit/debugging
- Pro: Audit trail preserved
- Con: "Context shedding" becomes "context hiding"

**Option C: Configurable Retention**
- `retention_policy = "destroy" | "archive" | "keep"`
- Default: archive
- Pro: Flexibility
- Con: Another config option

#### Recommendation

**Option B** - Archive for audit purposes. The key invariant is that archived data is NEVER fed back into LLM prompts. Add explicit `archive/` directory to file structure and document the isolation requirement.

#### Decision

```
[ ] Option A: Aggressive Destruction
[x] Option B: Archive, Don't Destroy [Recommended]
[ ] Option C: Configurable Retention
[ ] Other: _______________

Notes:


```

---

### U2: Composition Audit Failure Recovery Path

**Severity**: High
**Files**: `SPECIFICATION.md:191`, `SPECIFICATION.md:673`

#### Problem

The failure transition states: "Composition Audit → Contradiction found → Ignition (with contradiction report)"

Unclear:
- Does Ignition restart from scratch or resume?
- Is the user involved in resolving the contradiction?
- What happens to the invalidated spec?

#### Options

**Option A: Full Restart**
- Clear all state, begin new interview
- Contradiction report shown as context at start
- Pro: Clean slate
- Con: Wastes prior work if contradiction is minor

**Option B: Targeted Revision**
- Return to relevant interview phase (Architecture/Constraints)
- Present contradiction, request resolution
- Preserve unaffected portions of spec
- Pro: Efficient
- Con: Complex to implement partial rollback

**Option C: Human Blocking Decision**
- Enter BLOCKED state with contradiction
- Human chooses: full restart vs targeted revision
- Pro: User control
- Con: Requires human for every contradiction

#### Recommendation

**Option B with C fallback** - Attempt targeted revision for simple contradictions (single constraint conflict). Enter BLOCKED state for complex contradictions (multiple interacting constraints).

#### Decision

```
[ ] Option A: Full Restart
[x] Option B: Targeted Revision [Recommended]
[ ] Option C: Human Blocking Decision
[ ] Other: _______________

Notes:


```

---

### U3: Orchestrator "No Reasoning" Boundary

**Severity**: Medium
**Files**: `SPECIFICATION.md:1395-1398`, `DECISIONS.toml:441-449`

#### Problem

The orchestrator is "deterministic and performs no reasoning," yet must:
- Parse compiler errors and classify failure types
- Decide escalation paths based on failure classification
- Determine if errors are "recoverable" vs "fatal"

Where is the line between "classification" and "reasoning"?

#### Options

**Option A: Pattern Matching Only**
- Orchestrator uses regex/AST patterns to classify
- No LLM involvement in classification
- Ambiguous cases → escalate immediately
- Pro: Truly deterministic
- Con: Brittle, language-specific patterns needed

**Option B: LLM-Assisted Classification**
- Small/fast model classifies errors
- Classification itself is a mini-phase
- Results are deterministic given classification
- Pro: More robust classification
- Con: Violates "no reasoning" principle

**Option C: Clarify "Reasoning" Definition**
- "Reasoning" = multi-step chain-of-thought, creative problem-solving
- "Classification" = mapping input to predefined category
- Orchestrator can classify but not reason
- Pro: Pragmatic distinction
- Con: Fuzzy boundary

#### Recommendation

**Option C** - Document that the orchestrator performs CLASSIFICATION (deterministic mapping to categories) but not REASONING (creative problem-solving, multi-step inference). Classification can use simple heuristics or even an LLM, as long as the output is a discrete category from a fixed set.

#### Decision

```
[ ] Option A: Pattern Matching Only
[ ] Option B: LLM-Assisted Classification
[x] Option C: Clarify "Reasoning" Definition [Recommended]
[ ] Other: _______________

Notes:


```

---

### U4: Human Blocking Notification Mechanism

**Severity**: Medium
**Files**: `SPECIFICATION.md:1248-1257`, `SPECIFICATION.md:1496-1497`

#### Problem

When blocked, "all phases halt" and "state is persisted to disk." But how is the human notified if the process isn't running?

#### Options

**Option A: Daemon Mode**
- Orchestrator runs as background service
- Polls for human responses
- Sends notifications via configured channels
- Pro: Responsive
- Con: Resource usage, complexity

**Option B: CLI Resume Model**
- Process exits when blocked
- Human runs `criticality resume` to check status
- Notifications are fire-and-forget (Slack/email on block)
- Pro: Simple, no daemon
- Con: Relies on human checking

**Option C: Webhook Integration**
- Block triggers webhook to external system
- External system (Slack bot, email, etc.) handles notification
- Human response triggers webhook back
- Pro: Flexible, integrates with existing tools
- Con: Requires external infrastructure

#### Recommendation

**Option B** - Keep the orchestrator simple. On block: persist state, send one-time notification, exit. Human runs `criticality status` or `criticality resume` when ready. This aligns with the "state machine" nature of the orchestrator.

#### Decision

```
[ ] Option A: Daemon Mode
[x] Option B: CLI Resume Model [Recommended]
[ ] Option C: Webhook Integration
[ ] Other: _______________

Notes:


```

---

### U5: Delegation Decision Confidence Level

**Severity**: Medium
**Files**: `SPECIFICATION.md:268-296`, `interview.schema.json:43-51`

#### Problem

When users delegate interview phases to the Architect, decisions are made on their behalf. What confidence level do these decisions get?

- `canonical` (user-confirmed) - implies user approved each decision
- `inferred` (derived) - implies decisions can be overridden

#### Options

**Option A: Delegation = Canonical**
- User trusts Architect completely
- All delegated decisions are canonical
- Pro: Consistent with "use your judgment"
- Con: User may not agree with specific choices

**Option B: Delegation = Inferred**
- Delegated decisions are provisional
- Can be overridden if issues arise
- Pro: Allows correction
- Con: Undermines delegation concept

**Option C: New Confidence Level: `delegated`**
- Sits between canonical and inferred
- User can promote to canonical after review
- Defaults to canonical if not contested by Mesoscopic
- Pro: Captures semantics accurately
- Con: Another confidence level to manage

#### Recommendation

**Option C** - A `delegated` confidence level accurately represents the situation: user authorized the Architect to decide, but hasn't explicitly confirmed each decision. These should be treated as canonical unless they cause failures.

#### Decision

```
[ ] Option A: Delegation = Canonical
[ ] Option B: Delegation = Inferred
[x] Option C: New Confidence Level: delegated [Recommended]
[ ] Other: _______________

Notes:


```

---

### U6: Conditional Approval Flow

**Severity**: Medium
**Files**: `interview.schema.json:380-390`

#### Problem

The schema supports `approval_type: "conditional"` with conditions, but the phase transition rules don't mention this path:
- Approve → Lattice
- Revise → Return to phase
- Reject → Restart

What happens with conditional approval?

#### Options

**Option A: Remove Conditional Approval**
- Simplify to binary: approve or revise
- Conditions become revision requests
- Pro: Simpler flow
- Con: Loses nuance

**Option B: Conditions as Blocking**
- Conditional approval proceeds to Lattice
- Conditions become blocking queries at Lattice start
- Must resolve before generating structure
- Pro: Conditions are tracked
- Con: Delays Lattice

**Option C: Conditions as Ledger Entries**
- Conditional approval proceeds normally
- Conditions recorded as `provisional` decisions
- Validated during Composition Audit
- Pro: Non-blocking, conditions still enforced
- Con: Late failure if condition violated

#### Recommendation

**Option C** - Conditional approval should not block progress. Record conditions as provisional constraints. If Composition Audit or Mesoscopic reveals a condition violation, that triggers the appropriate failure path.

#### Decision

```
[ ] Option A: Remove Conditional Approval
[ ] Option B: Conditions as Blocking
[x] Option C: Conditions as Ledger Entries [Recommended]
[ ] Other: _______________

Notes:


```

---

### U7: Model Substitution Strategy

**Severity**: Medium
**Files**: `SPECIFICATION.md:1553-1554`, `DECISIONS.toml:285-339`

#### Problem

Decision ledger hardcodes specific models:
```toml
constraint = "Claude Opus 4.5 for high-level architecture"
constraint = "MiniMax M2 on Cerebras as primary Injection worker"
```

As new models emerge (Claude 5, GPT-5, etc.), how do we substitute without creating canonical conflicts?

#### Options

**Option A: Decisions Reference Capability, Not Model**
- Rewrite: "Architect role requires: 100k context, high reasoning, medium code gen"
- Model selection is configuration, not decision
- Pro: Future-proof
- Con: Requires rewriting existing decisions

**Option B: Model Decisions are Provisional**
- Change confidence from `canonical` to `provisional`
- Can be overridden by configuration
- Pro: Minimal change
- Con: Weakens decision authority

**Option C: Versioned Model Aliases**
- Define aliases: `architect_model`, `worker_model`, etc.
- Decisions reference aliases
- Configuration maps aliases to actual models
- Pro: Clean separation
- Con: Indirection layer

#### Recommendation

**Option C** - Use role-based aliases in decisions (`architect_model`, `auditor_model`, `worker_model`, etc.). The configuration file maps these to actual models. This allows model updates without touching the ledger.

#### Decision

```
[ ] Option A: Decisions Reference Capability, Not Model
[ ] Option B: Model Decisions are Provisional
[x] Option C: Versioned Model Aliases [Recommended]
[ ] Other: _______________

Notes:


```

---

## Design Gaps

### G1: Enum/Union Types in Spec Schema

**Severity**: Medium
**Files**: `spec.schema.json`, `spec.example.toml`

#### Problem

The example references `AccountStatus`, `TransactionStatus` types but the schema has no way to define enums or union types.

#### Options

**Option A: Add `enums` Section**
```toml
[enums.AccountStatus]
variants = ["Active", "Frozen", "Closed"]
```

**Option B: Enums as Data Models**
- Use existing `data_models` with marker
- `{ type = "enum", variants = [...] }`

**Option C: Type System Extension**
- Full type definition language
- Supports enums, unions, aliases, generics
- Pro: Expressive
- Con: Complexity

#### Recommendation

**Option A** - Add a dedicated `enums` section. Keep it simple: name and list of variants. Complex discriminated unions can come later.

#### Decision

```
[x] Option A: Add enums Section [Recommended]
[ ] Option B: Enums as Data Models
[ ] Option C: Type System Extension
[ ] Other: _______________

Notes:


```

---

### G2: Multi-Language Project Compilation Oracle

**Severity**: Medium
**Files**: `SPECIFICATION.md:1551-1552`, `ROADMAP.md:278-281`

#### Problem

The protocol requires "compilable from Phase II onward." For polyglot projects, which compiler is the oracle?

#### Options

**Option A: Primary Language Oracle**
- Spec declares one primary language
- That language's compiler is the oracle
- Other languages are "secondary" with weaker guarantees

**Option B: All Must Pass**
- Every language in the project must compile
- Lattice phase runs all relevant compilers
- Pro: Strong guarantees
- Con: Slower, more complex

**Option C: Defer to Phase 7**
- Multi-language is explicitly future work
- Current protocol assumes single-language
- Document this limitation
- Pro: Ship sooner
- Con: Limitation may surprise users

#### Recommendation

**Option C** - Multi-language support is complex. Document that v1 assumes single-language projects. Add to Open Questions for Phase 7.

#### Decision

```
[ ] Option A: Primary Language Oracle
[ ] Option B: All Must Pass
[x] Option C: Defer to Phase 7 [Recommended]
[ ] Other: _______________

Notes:


```

---

### G3: Ralph Loop Naming

**Severity**: Low
**Files**: `SPECIFICATION.md:689`, `SPECIFICATION.md:1584`

#### Problem

"Ralph Loop" is undefined. The glossary says "named after the pattern of forgetting and retrying" but doesn't explain the reference.

#### Options

**Option A: Document the Reference**
- If it's a cultural reference (movie, person, etc.), cite it
- Add footnote or glossary expansion

**Option B: Rename to Descriptive**
- "Stateless Retry Loop" or "Amnesiac Implementation Loop"
- Self-documenting
- Con: Less memorable

**Option C: Keep as Project Jargon**
- Internal naming is fine
- Add brief explanation to glossary
- "Ralph" as in "starting fresh" (informal)

#### Recommendation

**Option C** - If there's a specific reference, document it. If not, keep the name (it's memorable) but expand the glossary entry to clarify it's project-specific terminology meaning "stateless retry."

#### Decision

```
[ ] Option A: Document the Reference
[ ] Option B: Rename to Descriptive
[ ] Option C: Keep as Project Jargon [Recommended]
[x] Other: ralph refers to the ralph wiggum loop, it might be worth doing a quick bit of research 

What is the Ralph reference (if any)?


Notes:

https://awesomeclaude.ai/ralph-wiggum

```

---

## Summary

| ID | Issue | Severity | Recommendation |
|----|-------|----------|----------------|
| C1 | Ledger append-only vs override | Medium | Hybrid (soft delete) |
| C2 | Context shedding vs rationale | Low | Rationale is human-only |
| C3 | Mesoscopic optional vs required | Medium | Conditional on project size |
| C4 | Type witness tier numbering | Low | Use descriptive names |
| C5 | Witness schema field mismatch | High | Simplify to base_type |
| C6 | Circuit breaker thresholds | Medium | Hybrid approach |
| U1 | Phase boundary survival | High | Archive, don't destroy |
| U2 | Composition Audit failure path | High | Targeted revision |
| U3 | Orchestrator reasoning boundary | Medium | Clarify classification vs reasoning |
| U4 | Blocking notification | Medium | CLI resume model |
| U5 | Delegation confidence level | Medium | New `delegated` level |
| U6 | Conditional approval flow | Medium | Conditions as ledger entries |
| U7 | Model substitution | Medium | Role-based aliases |
| G1 | Enum types in spec | Medium | Add enums section |
| G2 | Multi-language oracle | Medium | Defer to Phase 7 |
| G3 | Ralph Loop naming | Low | Keep with explanation |

---

## Resolution Summary

All decisions have been applied to the following files:

### Updated Files

1. **DECISIONS.toml** - Added 16 new decision entries (ledger_004 through inject_005, spec_001, lang_004, etc.)
2. **schemas/ledger.schema.json** - Added `delegated` confidence level, `status` field, `design_review` source
3. **schemas/spec.schema.json** - Added `enums` section with Enum definition
4. **examples/spec.example.toml** - Added AccountStatus, TransactionStatus, Currency enums
5. **README.md** - Updated tier naming to descriptive (full/strong/basic, proof/distinction/runtime/doc)
6. **SPECIFICATION.md** - Multiple updates:
   - Added `delegated` confidence level
   - Clarified hybrid append-only ledger model
   - Updated witness verification levels to descriptive names
   - Updated circuit breaker to hybrid approach
   - Expanded Ralph Loop glossary entry with Ralph Wiggum reference
   - Added archive/ directory to file structure
   - Clarified orchestrator classification vs reasoning
   - Added v1 single-language limitation note

### Key Changes

| Decision | Change |
|----------|--------|
| C1 | Ledger uses hybrid append-only with status field |
| C2 | Rationale is human-only, never in LLM prompts |
| C3 | Mesoscopic now mandatory |
| C4 | Tiers renamed: proof/distinction/runtime/doc |
| C5 | Witness schema uses base_type consistently |
| C6 | Circuit breaker hybrid with require_opus_attempt |
| U1 | Archive artifacts, never destroy |
| U2 | Targeted revision for Composition Audit failures |
| U3 | Classification ≠ reasoning clarified |
| U4 | CLI resume model, no daemon |
| U5 | New `delegated` confidence level added |
| U6 | Conditional approval → provisional ledger entries |
| U7 | Model role aliases in config |
| G1 | `enums` section added to spec schema |
| G2 | v1 single-language documented |
| G3 | Ralph Wiggum Loop documented with reference |
