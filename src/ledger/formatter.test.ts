import { describe, expect, it, beforeEach } from 'vitest';
import { Ledger } from './index.js';
import type { DecisionInput } from './index.js';
import { formatLedgerForPrompt } from './formatter.js';

describe('formatLedgerForPrompt', () => {
  const createTestInput = (overrides: Partial<DecisionInput> = {}): DecisionInput => ({
    category: 'architectural',
    constraint: 'Test constraint',
    source: 'design_choice',
    confidence: 'canonical',
    phase: 'design',
    ...overrides,
  });

  const fixedDate = new Date('2024-01-20T12:00:00.000Z');
  const createTestLedger = (): Ledger =>
    new Ledger({
      project: 'test-project',
      now: (): Date => fixedDate,
    });

  let ledger: Ledger;

  beforeEach(() => {
    ledger = createTestLedger();
  });

  it('should return empty string when no active decisions', () => {
    const result = formatLedgerForPrompt(ledger);
    expect(result).toBe('');
  });

  it('should format canonical decisions with [id] suffix', () => {
    ledger.append(
      createTestInput({
        constraint: 'Authentication uses JWT with RS256 signing',
        confidence: 'canonical',
      })
    );

    const result = formatLedgerForPrompt(ledger);

    expect(result).toContain('CANONICAL (user-confirmed):');
    expect(result).toContain('- Authentication uses JWT with RS256 signing [architectural_001]');
  });

  it('should format inferred/delegated/provisional under INFERRED group', () => {
    ledger.append(
      createTestInput({
        constraint: 'Inferred constraint',
        confidence: 'inferred',
      })
    );
    ledger.append(
      createTestInput({
        constraint: 'Delegated constraint',
        confidence: 'delegated',
      })
    );
    ledger.append(
      createTestInput({
        constraint: 'Provisional constraint',
        confidence: 'provisional',
      })
    );

    const result = formatLedgerForPrompt(ledger);

    expect(result).toContain('INFERRED (may be revised if contradicted):');
    expect(result).toContain('- Inferred constraint [architectural_001]');
    expect(result).toContain('- Delegated constraint [architectural_002]');
    expect(result).toContain('- Provisional constraint [architectural_003]');
  });

  it('should show "None currently" for empty suspended section', () => {
    ledger.append(
      createTestInput({
        constraint: 'Canonical decision',
        confidence: 'canonical',
      })
    );

    const result = formatLedgerForPrompt(ledger);

    expect(result).toContain('SUSPENDED (require explicit confirmation):');
    expect(result).toContain('- None currently');
  });

  it('should format suspended decisions when present', () => {
    ledger.append(
      createTestInput({
        constraint: 'Suspended constraint',
        confidence: 'suspended',
      })
    );

    const result = formatLedgerForPrompt(ledger);

    expect(result).toContain('SUSPENDED (require explicit confirmation):');
    expect(result).toContain('- Suspended constraint [architectural_001]');
  });

  it('should exclude rationale field from output', () => {
    ledger.append(
      createTestInput({
        constraint: 'Some constraint',
        confidence: 'canonical',
        rationale: 'This is a secret rationale that should not appear',
      })
    );

    const result = formatLedgerForPrompt(ledger);

    expect(result).not.toContain('secret rationale');
    expect(result).not.toContain('rationale');
  });

  it('should exclude blocking decisions', () => {
    ledger.append(
      createTestInput({
        constraint: 'Blocking issue',
        confidence: 'blocking',
        category: 'blocking',
      })
    );

    const result = formatLedgerForPrompt(ledger);

    expect(result).toBe('');
  });

  it('should exclude blocking decisions while including others', () => {
    ledger.append(
      createTestInput({
        constraint: 'Canonical constraint',
        confidence: 'canonical',
      })
    );
    ledger.append(
      createTestInput({
        constraint: 'Blocking issue',
        confidence: 'blocking',
        category: 'blocking',
      })
    );

    const result = formatLedgerForPrompt(ledger);

    expect(result).toContain('Canonical constraint');
    expect(result).not.toContain('Blocking issue');
  });

  it('should include closing instruction when canonical decisions present', () => {
    ledger.append(
      createTestInput({
        constraint: 'Canonical constraint',
        confidence: 'canonical',
      })
    );

    const result = formatLedgerForPrompt(ledger);

    expect(result).toContain('Your work must satisfy all canonical constraints.');
  });

  it('should not include closing instruction when no canonical decisions', () => {
    ledger.append(
      createTestInput({
        constraint: 'Inferred constraint',
        confidence: 'inferred',
      })
    );

    const result = formatLedgerForPrompt(ledger);

    expect(result).not.toContain('Your work must satisfy all canonical constraints.');
  });

  it('should suppress closing instruction when includeInstruction is false', () => {
    ledger.append(
      createTestInput({
        constraint: 'Canonical constraint',
        confidence: 'canonical',
      })
    );

    const result = formatLedgerForPrompt(ledger, { includeInstruction: false });

    expect(result).not.toContain('Your work must satisfy all canonical constraints.');
  });

  it('should respect phase filter option', () => {
    ledger.append(
      createTestInput({
        constraint: 'Design phase decision',
        confidence: 'canonical',
        phase: 'design',
      })
    );
    ledger.append(
      createTestInput({
        constraint: 'Ignition phase decision',
        confidence: 'canonical',
        phase: 'ignition',
      })
    );
    ledger.append(
      createTestInput({
        constraint: 'Injection phase decision',
        confidence: 'canonical',
        phase: 'injection',
      })
    );

    const result = formatLedgerForPrompt(ledger, { phase: 'ignition' });

    expect(result).toContain('Design phase decision');
    expect(result).toContain('Ignition phase decision');
    expect(result).not.toContain('Injection phase decision');
  });

  it('should exclude superseded and invalidated decisions', () => {
    const d1 = ledger.append(
      createTestInput({
        constraint: 'To be superseded',
        confidence: 'provisional',
      })
    );
    const d2 = ledger.append(
      createTestInput({
        constraint: 'To be invalidated',
        confidence: 'provisional',
      })
    );
    ledger.append(
      createTestInput({
        constraint: 'Active decision',
        confidence: 'canonical',
      })
    );

    ledger.supersede(d1.id, createTestInput({ constraint: 'Replacement' }));
    ledger.invalidate(d2.id);

    const result = formatLedgerForPrompt(ledger);

    expect(result).not.toContain('To be superseded');
    expect(result).not.toContain('To be invalidated');
    expect(result).toContain('Active decision');
    expect(result).toContain('Replacement');
  });

  it('should format a complete example matching spec format', () => {
    ledger.append(
      createTestInput({
        constraint: 'Authentication uses JWT with RS256 signing',
        confidence: 'canonical',
      })
    );
    ledger.append(
      createTestInput({
        constraint: 'User IDs are UUIDs, not sequential integers',
        confidence: 'canonical',
      })
    );
    ledger.append(
      createTestInput({
        constraint: 'Rate limiting must occur at gateway, not per-service',
        confidence: 'inferred',
      })
    );

    const result = formatLedgerForPrompt(ledger);

    expect(result).toContain('CANONICAL (user-confirmed):');
    expect(result).toContain('- Authentication uses JWT with RS256 signing [architectural_001]');
    expect(result).toContain('- User IDs are UUIDs, not sequential integers [architectural_002]');
    expect(result).toContain('INFERRED (may be revised if contradicted):');
    expect(result).toContain(
      '- Rate limiting must occur at gateway, not per-service [architectural_003]'
    );
    expect(result).toContain('SUSPENDED (require explicit confirmation):');
    expect(result).toContain('Your work must satisfy all canonical constraints.');
  });
});
