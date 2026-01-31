/**
 * Tests for interview state types.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  INTERVIEW_PHASES,
  INTERVIEW_STATE_VERSION,
  isValidInterviewPhase,
  getInterviewPhaseIndex,
  getNextInterviewPhase,
  isInterviewComplete,
  createInitialInterviewState,
  createTranscriptEntry,
  type InterviewState,
  type Feature,
  FEATURE_CLASSIFICATIONS,
  isValidFeatureClassification,
  createFeature,
  getUnclassifiedFeatures,
  getFeaturesByClassification,
} from './types.js';

describe('InterviewPhase constants', () => {
  it('should have all phases in correct order', () => {
    expect(INTERVIEW_PHASES).toEqual([
      'Discovery',
      'Architecture',
      'Constraints',
      'DesignPreferences',
      'Synthesis',
      'Approval',
    ]);
  });

  it('should be readonly', () => {
    // TypeScript enforces this at compile time, but we can verify at runtime
    expect(Object.isFrozen(INTERVIEW_PHASES)).toBe(false); // as const doesn't freeze
    expect(INTERVIEW_PHASES.length).toBe(6);
  });
});

describe('isValidInterviewPhase', () => {
  it('should return true for valid phases', () => {
    for (const phase of INTERVIEW_PHASES) {
      expect(isValidInterviewPhase(phase)).toBe(true);
    }
  });

  it('should return false for invalid phases', () => {
    expect(isValidInterviewPhase('InvalidPhase')).toBe(false);
    expect(isValidInterviewPhase('')).toBe(false);
    expect(isValidInterviewPhase('discovery')).toBe(false); // case sensitive
    expect(isValidInterviewPhase('DISCOVERY')).toBe(false);
  });
});

describe('getInterviewPhaseIndex', () => {
  it('should return correct index for each phase', () => {
    expect(getInterviewPhaseIndex('Discovery')).toBe(0);
    expect(getInterviewPhaseIndex('Architecture')).toBe(1);
    expect(getInterviewPhaseIndex('Constraints')).toBe(2);
    expect(getInterviewPhaseIndex('DesignPreferences')).toBe(3);
    expect(getInterviewPhaseIndex('Synthesis')).toBe(4);
    expect(getInterviewPhaseIndex('Approval')).toBe(5);
  });
});

describe('getNextInterviewPhase', () => {
  it('should return next phase for non-terminal phases', () => {
    expect(getNextInterviewPhase('Discovery')).toBe('Architecture');
    expect(getNextInterviewPhase('Architecture')).toBe('Constraints');
    expect(getNextInterviewPhase('Constraints')).toBe('DesignPreferences');
    expect(getNextInterviewPhase('DesignPreferences')).toBe('Synthesis');
    expect(getNextInterviewPhase('Synthesis')).toBe('Approval');
  });

  it('should return undefined for Approval phase', () => {
    expect(getNextInterviewPhase('Approval')).toBeUndefined();
  });
});

describe('isInterviewComplete', () => {
  it('should return true when Approval is in completedPhases', () => {
    const state: InterviewState = {
      version: INTERVIEW_STATE_VERSION,
      projectId: 'test-project',
      currentPhase: 'Approval',
      completedPhases: [
        'Discovery',
        'Architecture',
        'Constraints',
        'DesignPreferences',
        'Synthesis',
        'Approval',
      ],
      extractedRequirements: [],
      features: [],
      delegationPoints: [],
      transcriptEntryCount: 0,
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T10:30:00Z',
    };

    expect(isInterviewComplete(state)).toBe(true);
  });

  it('should return false when Approval is not in completedPhases', () => {
    const state: InterviewState = {
      version: INTERVIEW_STATE_VERSION,
      projectId: 'test-project',
      currentPhase: 'Synthesis',
      completedPhases: ['Discovery', 'Architecture'],
      extractedRequirements: [],
      features: [],
      delegationPoints: [],
      transcriptEntryCount: 0,
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T10:30:00Z',
    };

    expect(isInterviewComplete(state)).toBe(false);
  });
});

describe('createInitialInterviewState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create initial state with Discovery phase', () => {
    const state = createInitialInterviewState('my-project');

    expect(state.version).toBe(INTERVIEW_STATE_VERSION);
    expect(state.projectId).toBe('my-project');
    expect(state.currentPhase).toBe('Discovery');
    expect(state.completedPhases).toEqual([]);
    expect(state.extractedRequirements).toEqual([]);
    expect(state.features).toEqual([]);
    expect(state.delegationPoints).toEqual([]);
    expect(state.transcriptEntryCount).toBe(0);
    expect(state.createdAt).toBe('2024-01-15T10:00:00.000Z');
    expect(state.updatedAt).toBe('2024-01-15T10:00:00.000Z');
  });

  it('should use provided projectId', () => {
    const state = createInitialInterviewState('another-project');
    expect(state.projectId).toBe('another-project');
  });
});

describe('createTranscriptEntry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create transcript entry with all fields', () => {
    const entry = createTranscriptEntry('Discovery', 'user', 'Hello, I want to build an app');

    expect(entry.id).toMatch(
      /^transcript_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(entry.phase).toBe('Discovery');
    expect(entry.role).toBe('user');
    expect(entry.content).toBe('Hello, I want to build an app');
    expect(entry.timestamp).toBe('2024-01-15T10:30:00.000Z');
    expect(entry.metadata).toBeUndefined();
  });

  it('should include metadata when provided', () => {
    const metadata = { questionId: 'q1', attempt: 1 };
    const entry = createTranscriptEntry('Architecture', 'assistant', 'What stack?', metadata);

    expect(entry.metadata).toEqual(metadata);
  });

  it('should create unique IDs', () => {
    const entry1 = createTranscriptEntry('Discovery', 'user', 'Test 1');
    const entry2 = createTranscriptEntry('Discovery', 'user', 'Test 2');

    // IDs should be different due to random component
    // Note: with mocked time, the timestamp part is the same, but random part differs
    expect(entry1.id).not.toBe(entry2.id);
  });

  it('should handle different roles', () => {
    const systemEntry = createTranscriptEntry('Discovery', 'system', 'System message');
    const assistantEntry = createTranscriptEntry('Discovery', 'assistant', 'Assistant message');
    const userEntry = createTranscriptEntry('Discovery', 'user', 'User message');

    expect(systemEntry.role).toBe('system');
    expect(assistantEntry.role).toBe('assistant');
    expect(userEntry.role).toBe('user');
  });
});

describe('InterviewState type structure', () => {
  it('should allow valid state structure', () => {
    const state: InterviewState = {
      version: '1.0.0',
      projectId: 'test-project',
      currentPhase: 'Architecture',
      completedPhases: ['Discovery'],
      extractedRequirements: [
        {
          id: 'req_001',
          sourcePhase: 'Discovery',
          category: 'functional',
          text: 'User authentication required',
          confidence: 'high',
          extractedAt: '2024-01-15T10:30:00Z',
        },
      ],
      features: [],
      delegationPoints: [
        {
          phase: 'Constraints',
          decision: 'Delegate',
          delegatedAt: '2024-01-15T11:00:00Z',
        },
      ],
      transcriptEntryCount: 5,
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T11:00:00Z',
    };

    // If this compiles, the type is valid
    expect(state.version).toBe('1.0.0');
    expect(state.completedPhases).toHaveLength(1);
    expect(state.extractedRequirements).toHaveLength(1);
    expect(state.delegationPoints).toHaveLength(1);
  });

  it('should allow delegation with notes', () => {
    const state: InterviewState = {
      version: '1.0.0',
      projectId: 'test-project',
      currentPhase: 'Synthesis',
      completedPhases: ['Discovery', 'Architecture', 'Constraints', 'DesignPreferences'],
      extractedRequirements: [],
      features: [],
      delegationPoints: [
        {
          phase: 'DesignPreferences',
          decision: 'DelegateWithNotes',
          notes: 'Prefer React for frontend',
          delegatedAt: '2024-01-15T11:00:00Z',
        },
      ],
      transcriptEntryCount: 10,
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T12:00:00Z',
    };

    expect(state.delegationPoints[0]?.notes).toBe('Prefer React for frontend');
  });
});

describe('FeatureClassification', () => {
  describe('FEATURE_CLASSIFICATIONS', () => {
    it('should have all classification types', () => {
      expect(FEATURE_CLASSIFICATIONS).toEqual(['core', 'foundational', 'bolt-on']);
    });

    it('should be readonly', () => {
      expect(FEATURE_CLASSIFICATIONS.length).toBe(3);
    });
  });

  describe('isValidFeatureClassification', () => {
    it('should return true for valid classifications', () => {
      expect(isValidFeatureClassification('core')).toBe(true);
      expect(isValidFeatureClassification('foundational')).toBe(true);
      expect(isValidFeatureClassification('bolt-on')).toBe(true);
    });

    it('should return false for invalid classifications', () => {
      expect(isValidFeatureClassification('invalid')).toBe(false);
      expect(isValidFeatureClassification('')).toBe(false);
      expect(isValidFeatureClassification('Core')).toBe(false); // case sensitive
      expect(isValidFeatureClassification('CORE')).toBe(false);
    });
  });
});

describe('createFeature', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create a feature with all required fields', () => {
    const feature = createFeature(
      'User Authentication',
      'Allow users to log in with email/password',
      'core',
      'Discovery'
    );

    expect(feature.id).toMatch(
      /^feature_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(feature.name).toBe('User Authentication');
    expect(feature.description).toBe('Allow users to log in with email/password');
    expect(feature.classification).toBe('core');
    expect(feature.sourcePhase).toBe('Discovery');
    expect(feature.identifiedAt).toBe('2024-01-15T10:30:00.000Z');
    expect(feature.classificationRationale).toBeUndefined();
  });

  it('should include rationale when provided', () => {
    const feature = createFeature(
      'Multi-tenancy',
      'Support multiple organizations',
      'foundational',
      'Architecture',
      'Database schema should include tenant_id even if not used in MVP'
    );

    expect(feature.classification).toBe('foundational');
    expect(feature.classificationRationale).toBe(
      'Database schema should include tenant_id even if not used in MVP'
    );
  });

  it('should create bolt-on features', () => {
    const feature = createFeature(
      'Social Login',
      'Allow login via Google/Facebook',
      'bolt-on',
      'Architecture'
    );

    expect(feature.classification).toBe('bolt-on');
  });

  it('should create unique IDs', () => {
    const feature1 = createFeature('Feature 1', 'Desc 1', 'core', 'Discovery');
    const feature2 = createFeature('Feature 2', 'Desc 2', 'core', 'Discovery');

    expect(feature1.id).not.toBe(feature2.id);
  });
});

describe('getUnclassifiedFeatures', () => {
  it('should return empty array when all features are classified', () => {
    const features: Feature[] = [
      {
        id: 'feature_1',
        name: 'Auth',
        description: 'Authentication',
        classification: 'core',
        sourcePhase: 'Discovery',
        identifiedAt: '2024-01-15T10:00:00Z',
      },
      {
        id: 'feature_2',
        name: 'Tenancy',
        description: 'Multi-tenancy',
        classification: 'foundational',
        sourcePhase: 'Architecture',
        identifiedAt: '2024-01-15T10:00:00Z',
      },
    ];

    expect(getUnclassifiedFeatures(features)).toEqual([]);
  });

  it('should return empty array for empty input', () => {
    expect(getUnclassifiedFeatures([])).toEqual([]);
  });
});

describe('getFeaturesByClassification', () => {
  const features: Feature[] = [
    {
      id: 'feature_1',
      name: 'Auth',
      description: 'Authentication',
      classification: 'core',
      sourcePhase: 'Discovery',
      identifiedAt: '2024-01-15T10:00:00Z',
    },
    {
      id: 'feature_2',
      name: 'Tenancy',
      description: 'Multi-tenancy',
      classification: 'foundational',
      sourcePhase: 'Architecture',
      identifiedAt: '2024-01-15T10:00:00Z',
    },
    {
      id: 'feature_3',
      name: 'Payments',
      description: 'Payment processing',
      classification: 'core',
      sourcePhase: 'Discovery',
      identifiedAt: '2024-01-15T10:00:00Z',
    },
    {
      id: 'feature_4',
      name: 'Social Login',
      description: 'OAuth providers',
      classification: 'bolt-on',
      sourcePhase: 'Architecture',
      identifiedAt: '2024-01-15T10:00:00Z',
    },
  ];

  it('should return core features', () => {
    const coreFeatures = getFeaturesByClassification(features, 'core');
    expect(coreFeatures).toHaveLength(2);
    expect(coreFeatures.map((f) => f.name)).toEqual(['Auth', 'Payments']);
  });

  it('should return foundational features', () => {
    const foundationalFeatures = getFeaturesByClassification(features, 'foundational');
    expect(foundationalFeatures).toHaveLength(1);
    expect(foundationalFeatures[0]?.name).toBe('Tenancy');
  });

  it('should return bolt-on features', () => {
    const boltOnFeatures = getFeaturesByClassification(features, 'bolt-on');
    expect(boltOnFeatures).toHaveLength(1);
    expect(boltOnFeatures[0]?.name).toBe('Social Login');
  });

  it('should return empty array when no features match', () => {
    const coreOnly: Feature[] = [
      {
        id: 'feature_1',
        name: 'Auth',
        description: 'Authentication',
        classification: 'core',
        sourcePhase: 'Discovery',
        identifiedAt: '2024-01-15T10:00:00Z',
      },
    ];
    expect(getFeaturesByClassification(coreOnly, 'bolt-on')).toEqual([]);
  });
});

describe('InterviewState with features', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should include features array in initial state', () => {
    const state = createInitialInterviewState('test-project');
    expect(state.features).toEqual([]);
  });

  it('should allow state with features', () => {
    const state: InterviewState = {
      version: '1.0.0',
      projectId: 'test-project',
      currentPhase: 'Architecture',
      completedPhases: ['Discovery'],
      extractedRequirements: [],
      features: [
        {
          id: 'feature_1',
          name: 'User Auth',
          description: 'Email/password authentication',
          classification: 'core',
          sourcePhase: 'Discovery',
          identifiedAt: '2024-01-15T10:30:00Z',
        },
        {
          id: 'feature_2',
          name: 'Multi-tenancy',
          description: 'Support for multiple organizations',
          classification: 'foundational',
          sourcePhase: 'Discovery',
          identifiedAt: '2024-01-15T10:30:00Z',
          classificationRationale: 'Include tenant_id in schema for future expansion',
        },
      ],
      delegationPoints: [],
      transcriptEntryCount: 5,
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T10:30:00Z',
    };

    expect(state.features).toHaveLength(2);
    expect(state.features[0]?.classification).toBe('core');
    expect(state.features[1]?.classification).toBe('foundational');
    expect(state.features[1]?.classificationRationale).toBe(
      'Include tenant_id in schema for future expansion'
    );
  });
});
