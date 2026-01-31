/**
 * Tests for the Lattice phase types.
 */

import { describe, it, expect } from 'vitest';
import { ModuleGeneratorError } from './types.js';
import type {
  DomainBoundary,
  DomainModule,
  GeneratedFile,
  ModuleGeneratorOptions,
  ModuleStructureResult,
  ProjectConventions,
} from './types.js';

describe('ModuleGeneratorError', () => {
  it('should create error with message and code', () => {
    const error = new ModuleGeneratorError('Test error', 'SPEC_PARSE_ERROR');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ModuleGeneratorError);
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('SPEC_PARSE_ERROR');
    expect(error.name).toBe('ModuleGeneratorError');
    expect(error.details).toBeUndefined();
  });

  it('should create error with details', () => {
    const error = new ModuleGeneratorError('Test error', 'FILE_WRITE_ERROR', 'Additional details');

    expect(error.message).toBe('Test error');
    expect(error.code).toBe('FILE_WRITE_ERROR');
    expect(error.details).toBe('Additional details');
  });

  it('should support all error codes', () => {
    const codes = [
      'SPEC_PARSE_ERROR',
      'INVALID_SPEC',
      'FILE_WRITE_ERROR',
      'CONVENTION_DETECTION_ERROR',
    ] as const;

    for (const code of codes) {
      const error = new ModuleGeneratorError(`Error with code ${code}`, code);
      expect(error.code).toBe(code);
    }
  });
});

describe('Type definitions', () => {
  it('should allow creating DomainBoundary', () => {
    const boundary: DomainBoundary = {
      name: 'account',
      description: 'Account domain',
      dataModels: ['Account', 'AccountBalance'],
      interfaces: ['AccountService'],
      classification: 'core',
    };

    expect(boundary.name).toBe('account');
    expect(boundary.dataModels).toHaveLength(2);
    expect(boundary.interfaces).toHaveLength(1);
    expect(boundary.classification).toBe('core');
  });

  it('should allow creating DomainBoundary without optional fields', () => {
    const boundary: DomainBoundary = {
      name: 'simple',
      dataModels: [],
      interfaces: [],
    };

    expect(boundary.name).toBe('simple');
    expect(boundary.description).toBeUndefined();
    expect(boundary.classification).toBeUndefined();
  });

  it('should allow creating GeneratedFile', () => {
    const file: GeneratedFile = {
      relativePath: 'src/domain/account/types.ts',
      content: 'export interface Account {}',
      isBarrel: false,
      description: 'Account types',
    };

    expect(file.relativePath).toBe('src/domain/account/types.ts');
    expect(file.isBarrel).toBe(false);
  });

  it('should allow creating DomainModule', () => {
    const module: DomainModule = {
      domain: {
        name: 'account',
        dataModels: ['Account'],
        interfaces: [],
      },
      path: 'src/domain/account',
      files: [
        {
          relativePath: 'src/domain/account/types.ts',
          content: 'export interface Account {}',
          isBarrel: false,
          description: 'Types',
        },
      ],
    };

    expect(module.domain.name).toBe('account');
    expect(module.path).toBe('src/domain/account');
    expect(module.files).toHaveLength(1);
  });

  it('should allow creating ModuleGeneratorOptions', () => {
    const options: ModuleGeneratorOptions = {
      baseDir: 'lib',
      domainDir: 'modules',
      detectConventions: false,
      generatePlaceholders: false,
    };

    expect(options.baseDir).toBe('lib');
    expect(options.domainDir).toBe('modules');
    expect(options.detectConventions).toBe(false);
    expect(options.generatePlaceholders).toBe(false);
  });

  it('should allow creating ModuleGeneratorOptions with partial fields', () => {
    const options: ModuleGeneratorOptions = {
      baseDir: 'src',
    };

    expect(options.baseDir).toBe('src');
    expect(options.domainDir).toBeUndefined();
  });

  it('should allow creating ModuleStructureResult', () => {
    const result: ModuleStructureResult = {
      modules: [],
      files: [],
      boundaries: [],
      hasPlaceholders: false,
      baseDir: 'src',
      domainDir: 'domain',
    };

    expect(result.modules).toHaveLength(0);
    expect(result.hasPlaceholders).toBe(false);
    expect(result.baseDir).toBe('src');
    expect(result.domainDir).toBe('domain');
  });

  it('should allow creating ProjectConventions', () => {
    const conventions: ProjectConventions = {
      sourceDir: 'src',
      domainDir: 'domain',
      usesBarrelFiles: true,
      usesJsExtension: true,
    };

    expect(conventions.sourceDir).toBe('src');
    expect(conventions.domainDir).toBe('domain');
    expect(conventions.usesBarrelFiles).toBe(true);
    expect(conventions.usesJsExtension).toBe(true);
  });

  it('should allow creating ProjectConventions without optional domainDir', () => {
    const conventions: ProjectConventions = {
      sourceDir: 'lib',
      usesBarrelFiles: false,
      usesJsExtension: false,
    };

    expect(conventions.sourceDir).toBe('lib');
    expect(conventions.domainDir).toBeUndefined();
  });
});
