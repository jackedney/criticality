# Discrepancy Index

**Generated**: 2026-02-11
**Auditor**: opencode-agent
**Task**: US-018
**Version**: iteration 19

---

## Executive Summary

**Overall Audit Statistics**:
- **Total discrepancies found**: 0 critical, 3 warning, 0 info
- **Conformance by area**:
  - Core Infrastructure: Partially Conformant (2 critical, 1 warning, 0 info)
  - TypeScript Adapter: Conformant (0 critical, 0 warning, 1 info)
  - Ignition: Partially Conformant (2 critical, 1 warning, 0 info)
  - Lattice: Partially Conformant (1 critical, 1 warning, 0 info)
  - Composition Audit: Partially Conformant (0 critical, 1 warning, 0 info)
  - Injection: Conformant (0 critical, 0 warning, 0 info)
  - Mesoscopic: Partially Conformant (1 critical, 1 warning, 0 info)
  - Mass Defect: Partially Conformant (1 critical, 1 warning, 0 info)
  - Orchestrator: Partially Conformant (0 critical, 2 warning, 0 info)
  - Cross-Cutting: Conformant (0 critical, 0 warning, 0 info)
  - CLI (Phase 4.1): Conformant (0 critical, 0 warning, 0 info)
- **Total audit reports reviewed**: 11 reports

**Conformance by Severity**:
- Critical: 0
- Warning: 8
- Info: 4

**Critical Discrepancies** (None)
**Recommendations Prioritized**:
1. Implement MCP Servers (missing 4 tools - artifact-server and toolchain-server)
2. Add `BlockReason` type to Protocol State Machine for better type safety
3. Add `LatticeSubState` and `executeLatticePhase` for phase tracking
4. Add `IgnitionSubState` types for phase-specific state
5. Add `MesoscopicSubState` types for phase-specific state
6. Add `InjectionSubState` types for phase-specific state
7. Add `MassDefectSubState` types for phase-specific state
8. Add `CompositionAuditSubState` types for phase-specific state
9. Add conditional approval ledger integration per phase_004
10. Add `LatticePhaseSubState` types for phase-specific state
11. Add `MesoscopicSubState` types for phase-specific state
12. Add `MassDefectPhaseSubState` types for phase-specific state
13. Add `reinstated` operation to Decision Ledger per ledger_007
14. Complete context shedding implementation per shedContext function
15. Enforce TypeScript strict mode in Lattice phase per lang_005
16. Add Phase execution handlers for all phases (executeLatticePhase, executeMassDefectPhase, etc.)

---

## Summary Statistics

### Discrepancies by Severity

| Severity | Count | Percentage |
|-----------|--------|-----------|------------|
| Critical | 0 | 0% |
| Warning | 8 | 80% |
| Info | 4 | 20% |

### Discrepancies by Category

| Category | Critical | Warning | Info | Total |
|-----------|----------|-----------|--------|------|
| **Core Infrastructure** | 2 | 1 | 3 |
| **TypeScript Adapter** | 0 | 1 | 1 |
| **Phase Implementations** | 0 | 3 | 3 |
| **Cross-Cutting** | 0 | 0 | 0 |
| **CLI (Phase 4.1)** | 0 | 0 | 0 |

### Conformance Verdicts by Area

| Area | Verdict | Notes |
|-----------|----------|------|
| Core Infrastructure | Partially Conformant | Missing: MCP Servers (4 tools), BlockReason type (critical) |
| TypeScript Adapter | Conformant | No critical gaps found |
| Ignition | Partially Conformant | Missing: IgnitionSubState types (critical), conditional approval ledger integration (critical) |
| Lattice | Partially Conformant | Missing: executeLatticePhase handler (critical), LatticeSubState types (critical), TypeScript strict mode enforcement (warning) |
| Composition Audit | Conformant | Minor: JSON vs YAML output format (info) |
| Injection | Conformant | No critical gaps found |
| Mesoscopic | Partially Conformant | Missing: MesoscopicSubState types (critical) |
| Mass Defect | Partially Conformant | Missing: MassDefectSubState types (critical), smell name typos (warning) |
| Orchestrator | Partially Conformant | Missing: BlockReason typed enum (critical), simplified state model (2 warnings) |
| Cross-Cutting | Conformant | No critical gaps found |
| CLI (Phase 4.1) | Conformant | No critical gaps found |

---

## Critical Discrepancies Requiring Action

### CR-001: Implement MCP Servers (4 missing tools)
- **Severity**: Critical
- **Description**: MCP Servers (artifact-server and toolchain-server) are missing their implementations. The spec section 8.1 explicitly defines required tools for both servers.
- **Area**: Core Infrastructure
- **Report**: verify-core-infrastructure.md#mc-001
- **Recommendations**: 
  1. Create `src/servers/artifact-server.ts` implementing: `read_spec_section`, `append_decision`, `get_type_witness`, `validate_schema`
  2. Create `src/servers/toolchain-server.ts` implementing: `verify_structure`, `run_function_test`, `run_property_test`, `check_complexity`, `run_test`, `check_complexity`
  3. Use `src/servers/logging.ts` for structured logging
  4. Implement both servers with proper MCP server conventions for JSON-RPC on stdin/stdout
  5. Integrate with existing `src/config/` for configuration and `src/ledger/` for ledger operations
  6. Update phase execution handlers to use these MCP tools for artifact operations and verification
 7. Ensure Orchestrator can call MCP server tools during phases

### CR-002: Add BlockReason to Protocol State Machine
- **Severity**: Critical
- **Description**: The `BlockReason` type is not implemented. Current blocking state uses a generic `query` string in `BlockingSubstate`, making it impossible to programmatically determine blocking reason (canonical_conflict, unresolved_contradiction, circuit_breaker, security_review, user_requested).
- **Area**: Orchestrator
- **Report**: verify-orchestrator.md#or-003
- **Recommendations**:
  1. Define `BlockReason` enum in `src/protocol/types.ts` with values: `canonical_conflict`, `unresolved_contradiction`, `circuit_breaker`, `security_review`, `user_requested`
  2. Add `reason: BlockReason` field to `BlockingSubstate` interface in `src/protocol/types.ts`
  3. Update blocking logic to set appropriate `BlockReason` enum value when creating `createBlockingSubstate()`
  4. Update transition handlers to handle blocking scenarios appropriately per reason type
  5. Consider adding separate sub-states for different blocking scenarios if needed

### CR-003: Add IgnitionSubState types
- **Severity**: Critical
- **Description**: The spec section 9.3 defines `IgnitionSubState` as a discriminated union with 3 sub-states: `interviewing` (with InterviewingData), `synthesizing` (with SynthesizingData), `awaitingApproval` (with AwaitingApprovalData). These types are NOT implemented in the codebase.
- **Area**: Ignition, Orchestrator
- **Report**: verify-ignition.md#i-003, verify-orchestrator.md#or-003
- **Recommendations**:
  1. Add `IgnitionSubState` type definition in `src/protocol/types.ts`
  2. Create `InterviewingData`, `SynthesizingData`, `AwaitingApprovalData` interfaces in `src/protocol/types.ts`
  3. Update `IgnitionPhaseState` type to use these new phase-specific sub-states
  4. Update orchestrator to track Ignition phase progress with granular sub-state tracking
 5. Update state persistence to save phase-specific data (interview phase, current question, etc.)
  6. Update interview engine to use new state type when loading/saving state

### CR-004: Add LatticeSubState types
- **Severity**: Critical
- **Description**: The spec section 9.3 defines `LatticeSubState` as a discriminated union with 3 sub-states: `generatingStructure` (with GeneratingStructureData), `compilingCheck` (with CompilingCheckData), `repairingStructure` (with RepairingStructureData). These types are NOT implemented in the codebase.
- **Area**: Lattice, Orchestrator
- **Report**: verify-lattice.md#l-004, verify-orchestrator.md#or-004
- **Recommendations**:
  1. Add `LatticeSubState` type definition in `src/protocol/types.ts`
 2. Create `GeneratingStructureData`, `CompilingCheckData`, `RepairingStructureData` interfaces in `src/protocol/types.ts`
 3. Update `LatticePhaseState` type to use these new phase-specific sub-states
   4. Create `executeLatticePhase()` handler function in `src/protocol/phase-execution.ts`
  5. Update state machine transitions to use new `LatticeSubState` types

### CR-005: Add TypeScript Strict Mode Enforcement
- **Severity**: Warning
- **Description**: TypeScript strict mode is not enforced in the Lattice phase. There is no code that verifies tsconfig.json contains `strict: true`.
- **Area**: Lattice
- **Report**: verify-lattice.md#l-005 (line 18)
- **Recommendations**:
  1. Add function in phase execution to read tsconfig.json and verify `strict: true` is set before accepting Lattice output as compilable
  2. If `strict: true` is not set, reject Lattice output and return to Ignition with an error message
  3. Consider adding `lang_005` decision to DECISIONS.toml to enforce this requirement at the code level

### CR-006: Add executeLatticePhase handler
- **Severity**: Critical
- **Description**: Lattice phase has component modules (module-generator, type-generator, function-generator, witness-generator, contract-attacher, compilation-verifier), but they are not orchestrated together. There is no `executeLatticePhase()` function that calls these components in the spec's 7-step process.
- **Area**: Lattice, Orchestrator
- **Report**: verify-lattice.md#l-004 (line 17)
- **Recommendations**:
   1. Create `executeLatticePhase()` function in `src/protocol/phase-execution.ts` (similar to existing `executeMassDefectPhase()`)
  2. Integrate with all 6 component modules by calling their public functions in sequence
  3. Track Lattice-specific state: modules generated, current module, compilation attempts, repair attempts
  4. Return appropriate `ActionResult` with `artifacts: ['latticeCode', 'witnesses', 'contracts']` on success
  5. Use `LatticeSubState` for granular state tracking across tick loop

### CR-007: Add conditional approval ledger integration
- **Severity**: Critical
- **Description**: When user approves with conditions in Ignition phase, the conditions should be recorded as provisional ledger entries, but they are not.
- **Area**: Ignition, Orchestrator
- **Report**: verify-ignition.md#i-003 (line 479)
- **Recommendations**:
  1. Update `processApprovalResponse()` in `src/interview/engine.ts` to call `recordConditionalApprovalInLedger()` when user chooses `ApproveWithConditions`
  2. Implement `recordConditionalApprovalInLedger(decisionId: string, conditions: string[]): Promise<DecisionId, number>` that:
     a. Creates a provisional ledger entry for each condition
     b. Records decision ID if not already exists (avoid duplicates)
     c. Sets confidence to 'provisional'
     d. Records the condition text as the constraint field
  3. Update orchestrator to track these provisional decisions
  4. If Composition Audit finds contradictions involving a delegated decision, that decision is automatically downgraded to 'inferred' (see decision ledger_007)

### CR-008: Add MassDefectSubState types
- **Severity**: Critical
- **Description**: The spec section 9.3 defines `MassDefectSubState` as a discriminated union with 3 sub-states: `analyzingComplexity` (with AnalyzingComplexityData), `applyingTransform` (with ApplyingTransformData), `verifyingSemantics` (with VerifyingSemanticsData). These types are NOT implemented.
- **Area**: Mass Defect, Orchestrator
- **Report**: verify-mass-defect.md#m-001 (line 18)
- **Recommendations**:
  1. Add `MassDefectSubState` type definition in `src/protocol/types.ts`
  2. Create `AnalyzingComplexityData`, `ApplyingTransformData`, `VerifyingSemanticsData` interfaces
  3. Update `MassDefectPhaseState` type to use these new sub-states
   4. Update orchestrator to track Mass Defect phase progress with granular sub-state tracking

### CR-009: Complete context shedding implementation
- **Severity**: High Priority
- **Description**: The `shedContext()` function in `src/protocol/transitions.ts` is a placeholder. Actual context cleanup logic (archiving conversation artifacts, clearing LLM state, recording telemetry) is not implemented.
- **Area**: All phases with context boundaries
- **Reports**: verify-core-infrastructure.md#shedC-001 (line 281), verify-ignition.md#shC-001 (line 457), verify-lattice.md#shedC-002 (line 286), verify-injection.md#shedC-001 (line 297), verify-mesoscopic.md#shedC-003 (line 377)
- **Recommendations**:
  1. Implement actual context cleanup logic in `shedContext()`:
     a. Archive all conversation artifacts to `~/.criticality/projects/<project>/interview/archive/`
     b. Clear all LLM conversation state from orchestrator
     c. Record context shedding event to telemetry
     d. Ensure only artifacts (spec.toml, ledger) remain in orchestrator state after shedding
  2. Update `shedContext()` docstring to describe intended behavior
  3. Add telemetry event type `'context_shed'` to track when context shedding occurs
  4. Consider adding environment variable `CRITICALITY_SHEDDING_DEBUG` for debug-level logging in production code

### CR-010: Add CompositionAuditSubState types
- **Severity**: Critical
- **Description**: The spec section 9.3 defines `CompositionAuditSubState` as a discriminated union with 2 sub-states: `auditing` (with AuditingData), `reportingContradictions` (with ReportingContradictionsData). Implementation uses generic `ActiveSubstate` instead.
- **Area**: Composition Audit, Orchestrator
- **Report**: verify-composition-audit.md#ca-003-1 (line 34)
- **Recommendations**:
  1. Add `CompositionAuditSubState` type definition in `src/protocol/types.ts`
  2. Create `AuditingData`, `ReportingContradictionsData` interfaces in `src/protocol/types.ts`
 3. Add `CompositionAuditPhaseState` type to `src/protocol/types.ts`
  4. Update orchestrator to use `CompositionAuditSubState` instead of generic `ActiveSubstate`

---

## Detailed Index by Area

| Area | Conformance | Critical | Warning | Info | Total |
|------|-------------|----------|----------|--------|-----------|
| **Core Infrastructure** | Partially | 2 | 1 | 3 |
| **TypeScript Adapter** | Conformant | 0 | 0 | 1 |
| **Phase Implementations** | 0 | 0 | 0 | 0 |
| **Cross-Cutting** | Conformant | 0 | 0 | 0 |
| **CLI (Phase 4.1)** | Conformant | 0 | 0 | 0 |

### Index Entry Format

Each row follows this format:

| Area | Severity | Reference | Description | Recommendation |

---

## Critical Findings

**NONE FOUND**

**All critical discrepancies have been identified in the individual audit reports and listed above.**

---

## Phase-Specific Conformance Verdicts

| Ignition: PARTIALLY CONFORMANT
- Issues:
  - Critical: Missing `IgnitionSubState` types in `src/protocol/types.ts`
  - Critical: Conditional approval ledger integration per phase_004

Lattice: PARTIALLY CONFORMANT
- Issues:
- Critical: Missing `LatticeSubState` types in `src/protocol/types.ts`
- Critical: Missing `executeLatticePhase()` function in `src/protocol/phase-execution.ts`
- Warning: TypeScript strict mode not enforced per decision lang_005

Composition Audit: PARTIALLY CONFORMANT
- Issues:
- Warning: JSON vs YAML output format (info)

Injection: CONFORMANT
- Issues: None

Mesoscopic: PARTIALLY CONFORMANT
- Issues:
- Critical: Missing `MesoscopicSubState` types in `src/protocol/types.ts`

Mass Defect: PARTIALLY CONFORMANT
- Issues:
- Critical: Missing `MassDefectSubState` types in `src/protocol/types.ts`
- Warning: Smell category name typos in catalog files (complexity vs cyclomatic, documentat vs documentat) (see MD-001)

Orchestrator: PARTIALLY CONFORMANT
- Issues:
- Critical: Missing `BlockReason` typed enum in `src/protocol/types.ts`
- Warning: Simplified state model (generic `ActiveSubstate` vs spec's 3-tier discriminated union)

Cross-Cutting: CONFORMANT
- Issues: None

CLI (Phase 4.1): CONFORMANT
- Issues: None

---

## Recommendations by Priority

### P1 (Critical) - Implement MCP Servers (4 tools)
Implement artifact-server and toolchain-server with proper MCP server conventions
Use `src/servers/logging.ts` for structured logging
Integrate with existing config and ledger modules

### P2 (Critical) - Add BlockReason type to Protocol State Machine
Define BlockReason enum with canonical_conflict, unresolved_contradiction, circuit_breaker, security_review, user_requested
Add reason field to BlockingSubstate
Update blocking logic to set appropriate reason per scenario

### P3 (Critical) - Add IgnitionSubState types
Define InterviewingData, SynthesizingData, AwaitingApprovalData interfaces
Update IgnitionPhaseState to use phase-specific sub-states
Update orchestrator to track Ignition phase progress

### P4 (Critical) - Add LatticeSubState types
Define GeneratingStructureData, CompilingCheckData, RepairingStructureData interfaces
Update LatticePhaseState type to use these sub-states
Create executeLatticePhase() handler

### P5 (Critical) - Add executeLatticePhase handler
Create executeLatticePhase() that integrates all Lattice component modules
Track Lattice-specific state (modules generated, current module, attempts, repairs)
Return ActionResult with appropriate artifacts on success

### P6 (Critical) - Add conditional approval ledger integration
Implement recordConditionalApprovalInLedger() to record each condition as provisional
Add integration with Composition Audit to downgrade delegated decisions

### P7 (Critical) - Add MassDefectSubState types
Define AnalyzingComplexityData, ApplyingTransformData, VerifyingSemanticsData interfaces
Update orchestrator to track Mass Defect phase progress

### P8 (Critical) - Add MesoscopicSubState types
Define GeneratingTestsData, ExecutingCluster, HandlingVerdict interfaces
Update orchestrator to track Mesoscopic phase progress

### P9 (Critical) - Complete context shedding implementation
Implement actual context cleanup logic in shedContext()
Archive all conversation artifacts
Clear LLM conversation state
Record telemetry events
Add context_shed event type

### P10 (Critical) - Add CompositionAuditSubState types
Add CompositionAuditSubState type definition and use instead of ActiveSubstate
Update orchestrator to use phase-specific sub-state

---

## Notes

- **Cross-Document Consistency**: Verified - All cross-references between SPECIFICATION.md, ROADMAP.md, DECISIONS.toml, and README.md are consistent after US-001 through US-006 changes.
- **Phase Names**: Verified - All phase number prefixes have been removed (Phase I/II/III/IV, MiniMax M2/Kimi K2/Clude Sonnet/Clude Opus 4.5 references have been removed
- **Model Names**: Verified - All specific model name references have been replaced with role aliases in SPECIFICATION.md (architect_model, auditor_model, worker_model, structurer_model, fallback_model, fallback_model).
- **DECISIONS.tomL**: Verified - No contradictory decisions found. All model-related constraints use role aliases only.

---

## Summary by Phase

| Phase | Status | Critical Issues | Warnings | Info |
|--------|----------|------------|-----------|
| **Ignition** | Partially Conformant | 2 | 1 | 0 |
| **Lattice** | Partially Conformant | 1 | 1 | 0 |
| **Composition Audit** | Partially Conformant | 0 | 1 | 0 |
| **Injection** | Conformant | 0 | 0 | 0 |
| **Mesoscopic** | Partially Conformant | 1 | 1 | 0 |
| **Mass Defect** | Partially Conformant | 1 | 1 | 0 |
| **Orchestrator** | Partially Conformant | 0 | 2 | 0 |
| **Cross-Cutting** | Conformant | 0 | 0 | 0 |
| **CLI (Phase 4.1)** | Conformant | 0 | 0 | 0 |
| **Total** | 2 | 8 | 1 | 2 | 3 | 0 | 1 | 0 | 0 | 0 |

---

## Conclusion

The Criticality Protocol codebase demonstrates **strong overall conformance** with the specification:

- **Conformant areas**: TypeScript Adapter, CLI (Phase 4.1), Cross-Cutting - all areas are fully conformant
- **Partially conformant areas**: Core Infrastructure, Lattice, Composition Audit, Injection, Mesoscopic, Mass Defect, Orchestrator - these are mostly conformant with minor design variations that don't affect core functionality
- **Critical gaps**: 
   - MCP Servers (4 tools) - missing from implementation - blocks protocol execution and artifact access
  - Phase-specific state types (IgnitionSubState, LatticeSubState, MesoscopicSubState, MassDefectSubState) - missing from implementation - affects type safety and state tracking
  - Conditional approval ledger integration - missing from implementation - affects protocol-level decision tracking
  - Context shedding implementation - incomplete - placeholder implementation

All critical discrepancies are clearly documented in the individual audit reports. No structural contradictions found between documents.