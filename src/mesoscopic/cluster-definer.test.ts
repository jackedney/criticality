/**
 * Tests for cluster definition generator.
 *
 * Validates module extraction, claim mapping, and cluster grouping.
 */

import { describe, it, expect } from 'vitest';
import { parseSpec } from '../spec/parser.js';
import { defineClusters, validateClusterResult } from './cluster-definer.js';

describe('cluster-definer', () => {
  describe('extractModulesFromSpec', () => {
    it('should extract modules from data models', () => {
      const specToml = `
[meta]
version = "1.0.0"
created = "2025-01-23T10:00:00Z"

[system]
name = "test-system"

[data_models.Account]
fields = [
    { name = "id", type = "AccountId" },
    { name = "balance", type = "Decimal" }
]

[data_models.Transaction]
fields = [
    { name = "id", type = "TransactionId" },
    { name = "amount", type = "Decimal" }
]
      `;

      const spec = parseSpec(specToml);
      const result = defineClusters(spec);

      expect(result.modules).toHaveLength(2);
      const accountModule = result.modules.find((m) => m.name === 'Account');
      expect(accountModule).toBeDefined();
      expect(accountModule?.dataModels).toEqual(['Account']);
      const transactionModule = result.modules.find((m) => m.name === 'Transaction');
      expect(transactionModule).toBeDefined();
      expect(transactionModule?.dataModels).toEqual(['Transaction']);
    });
  });

  describe('mapClaimsToModules', () => {
    it('should map claims to modules by name matching', () => {
      const specToml = `
[meta]
version = "1.0.0"
created = "2025-01-23T10:00:00Z"

[system]
name = "test-system"

[data_models.Account]
fields = [
    { name = "id", type = "AccountId" }
]

[claims.balance_001]
text = "Account balance never goes negative"
type = "invariant"
testable = true
subject = "account.balance"
      `;

      const spec = parseSpec(specToml);
      const result = defineClusters(spec);

      const accountModule = result.modules.find((m) => m.name === 'Account');
      expect(accountModule?.claimIds).toContain('balance_001');
    });
  });

  describe('groupModulesIntoClusters', () => {
    it('should create single-module clusters for modules with claims', () => {
      const specToml = `
[meta]
version = "1.0.0"
created = "2025-01-23T10:00:00Z"

[system]
name = "test-system"

[data_models.Account]
fields = [
    { name = "id", type = "AccountId" }
]

[claims.balance_001]
text = "Account balance never goes negative"
type = "invariant"
testable = true
subject = "account.balance"
      `;

      const spec = parseSpec(specToml);
      const result = defineClusters(spec);

      const accountCluster = result.clusters.find((c) => c.id === 'account');
      expect(accountCluster).toBeDefined();
      expect(accountCluster?.modules).toEqual(['account']);
      expect(accountCluster?.claimIds).toEqual(['balance_001']);
      expect(accountCluster?.isCrossModule).toBe(false);
    });

    it('should create cross-module integration clusters for modules sharing claims', () => {
      const specToml = `
[meta]
version = "1.0.0"
created = "2025-01-23T10:00:00Z"

[system]
name = "auth-system"

[data_models.Auth]
fields = [
    { name = "userId", type = "UserId" }
]

[data_models.JWT]
fields = [
    { name = "token", type = "string" }
]

[claims.auth_001]
text = "Auth and JWT work together for authentication"
type = "behavioral"
testable = true
subject = "authentication"
      `;

      const spec = parseSpec(specToml);
      const result = defineClusters(spec);

      expect(result.modules).toHaveLength(2);
      const authModule = result.modules.find((m) => m.name === 'Auth');
      const jwtModule = result.modules.find((m) => m.name === 'JWT');
      expect(authModule).toBeDefined();
      expect(jwtModule).toBeDefined();

      expect(authModule?.claimIds).toEqual(['auth_001']);
      expect(jwtModule?.claimIds).toEqual(['auth_001']);

      const integrationCluster = result.clusters.find((c) => c.isCrossModule);
      expect(integrationCluster).toBeDefined();
      expect(integrationCluster?.modules).toContain('auth');
      expect(integrationCluster?.modules).toContain('jwt');
      expect(integrationCluster?.name).toMatch(/Auth.*JWT|JWT.*Auth/);
    });

    it('should create single-module clusters for orphan modules', () => {
      const specToml = `
[meta]
version = "1.0.0"
created = "2025-01-23T10:00:00Z"

[system]
name = "test-system"

[data_models.Account]
fields = [
    { name = "id", type = "AccountId" }
]

[data_models.Utility]
fields = [
    { name = "config", type = "string" }
]

[claims.balance_001]
text = "Account balance never goes negative"
type = "invariant"
testable = true
subject = "account.balance"
      `;

      const spec = parseSpec(specToml);
      const result = defineClusters(spec);

      expect(result.orphanCount).toBe(1);
      expect(result.modules).toHaveLength(2);

      const utilityOrphanCluster = result.clusters.find((c) => c.id === 'utility');
      expect(utilityOrphanCluster).toBeDefined();
      expect(utilityOrphanCluster?.modules).toEqual(['utility']);
      expect(utilityOrphanCluster?.claimIds).toEqual([]);
      expect(utilityOrphanCluster?.name).toBe('Utility (orphan)');
      expect(utilityOrphanCluster?.isCrossModule).toBe(false);

      const accountCluster = result.clusters.find((c) => c.id === 'account');
      expect(accountCluster).toBeDefined();
      expect(accountCluster?.claimIds).toContain('balance_001');
    });

    it('should not create orphan clusters when option is disabled', () => {
      const specToml = `
[meta]
version = "1.0.0"
created = "2025-01-23T10:00:00Z"

[system]
name = "test-system"

[data_models.Account]
fields = [
    { name = "id", type = "AccountId" }
]

[data_models.Utility]
fields = [
    { name = "config", type = "string" }
]

[claims.balance_001]
text = "Account balance never goes negative"
type = "invariant"
testable = true
subject = "account.balance"
      `;

      const spec = parseSpec(specToml);
      const result = defineClusters(spec, { createOrphanClusters: false });

      expect(result.orphanCount).toBe(1);
      const utilityCluster = result.clusters.find((c) => c.id === 'utility');
      expect(utilityCluster).toBeUndefined();
    });
  });

  describe('validateClusterResult', () => {
    it('should reject clusters referencing non-existent module IDs', () => {
      const specToml = `
[meta]
version = "1.0.0"
created = "2025-01-23T10:00:00Z"

[system]
name = "test-system"

[data_models.Account]
fields = [
    { name = "id", type = "AccountId" }
]

[claims.balance_001]
text = "Account balance never goes negative"
type = "invariant"
testable = true
subject = "account.balance"
      `;

      const spec = parseSpec(specToml);
      const result = defineClusters(spec);

      const invalidResult = {
        ...result,
        clusters: [
          ...result.clusters,
          {
            id: 'invalid',
            name: 'Invalid Cluster',
            modules: ['nonexistent-module'],
            claimIds: [],
            isCrossModule: false,
          },
        ],
      };

      expect(validateClusterResult(invalidResult)).toBe(false);
    });
  });
});
