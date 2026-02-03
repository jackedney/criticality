/**
 * Criticality Artifact Server - MCP Server for protocol artifacts.
 *
 * Provides read/write access ONLY to official protocol artifacts
 * (spec.toml, DECISIONS.toml). Prevents context hallucination by
 * ensuring agents only see committed truth.
 *
 * @packageDocumentation
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import path from 'node:path';
import TOML from '@iarna/toml';
import Ajv from 'ajv';

import {
  ArtifactScopingError,
  ArtifactNotFoundError,
  SpecSectionNotFoundError,
  WitnessNotFoundError,
  ALLOWED_ARTIFACT_FILES,
  ALLOWED_ARTIFACT_DIRS,
  type ArtifactServerConfig,
  type ReadSpecSectionResult,
  type AppendDecisionResult,
  type GetTypeWitnessResult,
  type ValidateSchemaResult,
} from './types.js';
import { fromData } from '../../ledger/ledger.js';
import type { DecisionInput, LedgerData, Decision } from '../../ledger/types.js';
import type { ErrorObject } from 'ajv';
import { createServerLogger } from '../logging.js';
import { safeReadFile, safeWriteFile } from '../../utils/safe-fs.js';

/**
 * Creates and configures the criticality-artifact-server.
 *
 * Note: We use the low-level Server class intentionally for compatibility
 * with manual request handling patterns.
 */
// eslint-disable-next-line @typescript-eslint/no-deprecated
export function createArtifactServer(config: ArtifactServerConfig): Server {
  const { projectRoot, debug = false } = config;

  const logger = createServerLogger({ serverName: 'artifact-server', debug });

  const ajv = new (Ajv as unknown as new (opts: { allErrors: boolean }) => {
    compile: (schema: Record<string, unknown>) => {
      (data: unknown): boolean;
      errors: ErrorObject[] | null;
    };
  })({
    allErrors: true,
  });

  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const server = new Server(
    { name: 'criticality-artifact-server', version: '1.0.0' },
    { capabilities: { tools: { listChanged: true } } }
  );

  /**
   * Validates that a path is an allowed artifact file.
   * Throws ArtifactScopingError if access is denied.
   */
  function validateArtifactPath(requestedPath: string): string {
    const normalizedPath = path.normalize(requestedPath);
    const baseName = path.basename(normalizedPath);

    // Check if it's a directly allowed file
    if (ALLOWED_ARTIFACT_FILES.includes(baseName as (typeof ALLOWED_ARTIFACT_FILES)[number])) {
      return path.join(projectRoot, baseName);
    }

    // Check if it's within an allowed directory
    for (const dir of ALLOWED_ARTIFACT_DIRS) {
      if (normalizedPath.startsWith(dir) || normalizedPath.startsWith(`./${dir}`)) {
        const fullPath = path.join(projectRoot, normalizedPath);
        // Ensure the path doesn't escape via ..
        const resolved = path.resolve(fullPath);
        const expectedRoot = path.resolve(projectRoot);
        if (!resolved.startsWith(expectedRoot)) {
          throw new ArtifactScopingError(requestedPath);
        }
        return resolved;
      }
    }

    throw new ArtifactScopingError(requestedPath);
  }

  /**
   * Reads and parses a TOML artifact file.
   */
  async function readTomlArtifact(filePath: string): Promise<Record<string, unknown>> {
    const validPath = validateArtifactPath(filePath);
    try {
      const content = await safeReadFile(validPath, 'utf-8');
      return TOML.parse(content) as Record<string, unknown>;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new ArtifactNotFoundError(filePath);
      }
      throw err;
    }
  }

  /**
   * Reads a JSON schema file.
   */
  async function readSchema(schemaName: string): Promise<Record<string, unknown>> {
    const schemaPath = path.join(projectRoot, 'schemas', `${schemaName}.schema.json`);
    try {
      const content = await safeReadFile(schemaPath, 'utf-8');
      return JSON.parse(content) as Record<string, unknown>;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new ArtifactNotFoundError(`schemas/${schemaName}.schema.json`);
      }
      throw err;
    }
  }

  /**
   * Writes a TOML artifact file.
   */
  async function writeTomlArtifact(filePath: string, data: Record<string, unknown>): Promise<void> {
    const validPath = validateArtifactPath(filePath);
    const content = TOML.stringify(data as TOML.JsonMap);
    await safeWriteFile(validPath, content, 'utf-8');
  }

  // Handle tool listing
  server.setRequestHandler(ListToolsRequestSchema, () => {
    return Promise.resolve({
      tools: [
        {
          name: 'read_spec_section',
          description:
            'Returns a specific section from the spec.toml file. ' +
            'Use this to retrieve structured specification data without loading the entire file.',
          inputSchema: {
            type: 'object',
            properties: {
              section: {
                type: 'string',
                description:
                  'The top-level section to retrieve (e.g., "meta", "system", "data_models", "interfaces", "claims", "witnesses")',
              },
              subsection: {
                type: 'string',
                description:
                  'Optional: A specific subsection within the top-level section (e.g., "Account" for data_models.Account)',
              },
            },
            required: ['section'],
          },
        },
        {
          name: 'append_decision',
          description:
            'Atomically appends a new decision entry to the DECISIONS.toml ledger. ' +
            'Validates against ledger.schema.json before writing. ' +
            'Auto-generates ID and timestamp.',
          inputSchema: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                enum: [
                  'architectural',
                  'phase_structure',
                  'injection',
                  'ledger',
                  'type_witnesses',
                  'contracts',
                  'models',
                  'blocking',
                  'testing',
                  'orchestrator',
                  'language_support',
                  'data_model',
                  'interface',
                  'constraint',
                  'security',
                ],
                description: 'Decision category',
              },
              constraint: {
                type: 'string',
                description: 'The actual decision/constraint (WHAT, not WHY)',
              },
              rationale: {
                type: 'string',
                description: 'Explanation of why this decision was made (optional)',
              },
              source: {
                type: 'string',
                enum: [
                  'user_explicit',
                  'design_principle',
                  'original_design',
                  'discussion',
                  'design_choice',
                  'design_review',
                  'injection_failure',
                  'auditor_contradiction',
                  'composition_audit',
                  'mesoscopic_failure',
                  'human_resolution',
                ],
                description: 'Origin of the decision',
              },
              confidence: {
                type: 'string',
                enum: [
                  'canonical',
                  'delegated',
                  'inferred',
                  'provisional',
                  'suspended',
                  'blocking',
                ],
                description: 'Confidence level determining override rules',
              },
              phase: {
                type: 'string',
                enum: [
                  'design',
                  'ignition',
                  'lattice',
                  'composition_audit',
                  'injection',
                  'mesoscopic',
                  'mass_defect',
                ],
                description: 'Phase in which the decision was made',
              },
              dependencies: {
                type: 'array',
                items: { type: 'string' },
                description: 'IDs of decisions this depends on (optional)',
              },
            },
            required: ['category', 'constraint', 'source', 'confidence', 'phase'],
          },
        },
        {
          name: 'get_type_witness',
          description:
            'Retrieves a type witness definition by name. ' +
            'Searches both spec.toml witnesses section and standalone witness files.',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'The name of the witness to retrieve (e.g., "NonNegativeDecimal")',
              },
            },
            required: ['name'],
          },
        },
        {
          name: 'validate_schema',
          description:
            'Validates an artifact against its JSON schema. ' +
            'Returns validation result with any errors.',
          inputSchema: {
            type: 'object',
            properties: {
              artifact: {
                type: 'string',
                enum: ['spec', 'ledger', 'witness', 'proposal', 'interview', 'question-bank'],
                description: 'The artifact type to validate',
              },
              file: {
                type: 'string',
                description:
                  'Optional: specific file to validate. Defaults to canonical location for artifact type.',
              },
            },
            required: ['artifact'],
          },
        },
      ],
    });
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params;

    logger.logDebug('tool_call', { name, args });

    try {
      switch (name) {
        case 'read_spec_section': {
          const { section, subsection } = args as { section: string; subsection?: string };
          const result = await handleReadSpecSection(section, subsection);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'append_decision': {
          const input = args as unknown as DecisionInput;
          const result = await handleAppendDecision(input);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'get_type_witness': {
          const { name: witnessName } = args as { name: string };
          const result = await handleGetTypeWitness(witnessName);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'validate_schema': {
          const { artifact, file } = args as { artifact: string; file?: string };
          const result = await handleValidateSchema(artifact, file);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: errorMessage }) }],
        isError: true,
      };
    }
  });

  /**
   * Handles the read_spec_section tool.
   */
  async function handleReadSpecSection(
    section: string,
    subsection?: string
  ): Promise<ReadSpecSectionResult> {
    const spec = await readTomlArtifact('spec.toml');

    if (!(section in spec)) {
      throw new SpecSectionNotFoundError(section);
    }

    // eslint-disable-next-line security/detect-object-injection -- safe: section is validated with 'in' check above
    let content = spec[section];

    if (subsection !== undefined) {
      if (typeof content !== 'object' || content === null) {
        throw new SpecSectionNotFoundError(`${section}.${subsection}`);
      }
      const sectionObj = content as Record<string, unknown>;
      if (!(subsection in sectionObj)) {
        throw new SpecSectionNotFoundError(`${section}.${subsection}`);
      }
      // eslint-disable-next-line security/detect-object-injection -- safe: subsection is validated with 'in' check above
      content = sectionObj[subsection];
    }

    return {
      section: subsection !== undefined ? `${section}.${subsection}` : section,
      content,
      file: 'spec.toml',
    };
  }

  /**
   * Handles the append_decision tool.
   */
  async function handleAppendDecision(input: DecisionInput): Promise<AppendDecisionResult> {
    // Read existing ledger
    const ledgerPath = 'DECISIONS.toml';
    let ledgerData: LedgerData;

    try {
      const tomlData = await readTomlArtifact(ledgerPath);
      // Convert TOML structure to LedgerData
      const rawDecisions = tomlData.decisions as Decision[] | undefined;
      ledgerData = {
        meta: tomlData.meta as LedgerData['meta'],
        decisions: rawDecisions ?? [],
      };
    } catch (err) {
      if (err instanceof ArtifactNotFoundError) {
        // Create new ledger if it doesn't exist
        const now = new Date().toISOString();
        ledgerData = {
          meta: {
            version: '1.0.0',
            created: now,
            project: 'criticality-protocol',
          },
          decisions: [],
        };
      } else {
        throw err;
      }
    }

    // Load into Ledger class for validation and ID generation
    const ledger = fromData(ledgerData);

    // Append the new decision (this validates and generates ID/timestamp)
    const decision = ledger.append(input, { skipDependencyValidation: false });

    // Get updated data
    const updatedData = ledger.toData();

    // Write back to file
    await writeTomlArtifact(ledgerPath, updatedData as unknown as Record<string, unknown>);

    return {
      decision,
      file: ledgerPath,
    };
  }

  /**
   * Handles the get_type_witness tool.
   */
  async function handleGetTypeWitness(witnessName: string): Promise<GetTypeWitnessResult> {
    // First, try to find in spec.toml witnesses section
    try {
      const spec = await readTomlArtifact('spec.toml');
      if (spec.witnesses !== undefined && typeof spec.witnesses === 'object') {
        const witnesses = spec.witnesses as Record<string, unknown>;
        if (witnessName in witnesses) {
          return {
            name: witnessName,
            // eslint-disable-next-line security/detect-object-injection -- safe: witnessName is validated with 'in' check above
            witness: witnesses[witnessName],
            file: 'spec.toml',
          };
        }
      }
    } catch {
      // spec.toml might not exist, continue to standalone files
    }

    // Try standalone witness file in examples/
    try {
      const witnessPath = `examples/${witnessName.toLowerCase()}.witness.toml`;
      const witnessData = await readTomlArtifact(witnessPath);
      return {
        name: witnessName,
        witness: witnessData,
        file: witnessPath,
      };
    } catch {
      // Not found as standalone file
    }

    // Try the example witness.example.toml and look for the witness there
    try {
      const exampleWitness = await readTomlArtifact('examples/witness.example.toml');
      if (exampleWitness.witnesses !== undefined && Array.isArray(exampleWitness.witnesses)) {
        const witnesses = exampleWitness.witnesses as { name?: string }[];
        const found = witnesses.find((w) => w.name === witnessName);
        if (found !== undefined) {
          return {
            name: witnessName,
            witness: found,
            file: 'examples/witness.example.toml',
          };
        }
      }
    } catch {
      // Not found in example file
    }

    throw new WitnessNotFoundError(witnessName);
  }

  /**
   * Handles the validate_schema tool.
   */
  async function handleValidateSchema(
    artifact: string,
    file?: string
  ): Promise<ValidateSchemaResult> {
    // Map artifact type to default file and schema
    const artifactMap: Record<string, { defaultFile: string; schema: string }> = {
      spec: { defaultFile: 'spec.toml', schema: 'spec' },
      ledger: { defaultFile: 'DECISIONS.toml', schema: 'ledger' },
      witness: { defaultFile: 'examples/witness.example.toml', schema: 'witness' },
      proposal: { defaultFile: 'examples/proposal.example.toml', schema: 'proposal' },
      interview: { defaultFile: 'examples/interview.example.toml', schema: 'interview' },
      'question-bank': {
        defaultFile: 'examples/question-bank.example.toml',
        schema: 'question-bank',
      },
    };

    // eslint-disable-next-line security/detect-object-injection -- safe: artifact is typed as ArtifactType with known literal keys
    const mapping = artifactMap[artifact];
    if (mapping === undefined) {
      return {
        valid: false,
        errors: [`Unknown artifact type: ${artifact}`],
        schema: 'unknown',
      };
    }

    const targetFile = file ?? mapping.defaultFile;
    const schema = await readSchema(mapping.schema);
    const data = await readTomlArtifact(targetFile);

    const validate = ajv.compile(schema);
    const valid = validate(data);

    const errorMessages = valid
      ? undefined
      : (validate.errors?.map(
          (e: ErrorObject) => `${e.instancePath}: ${e.message ?? 'Unknown error'}`
        ) ?? []);

    const result: ValidateSchemaResult = {
      valid,
      schema: `${mapping.schema}.schema.json`,
    };

    if (errorMessages !== undefined && errorMessages.length > 0) {
      result.errors = errorMessages;
    }

    return result;
  }

  return server;
}

/**
 * Starts the artifact server with stdio transport.
 * This is the main entry point when running as a standalone MCP server.
 */
export async function startArtifactServer(config: ArtifactServerConfig): Promise<void> {
  const server = createArtifactServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
