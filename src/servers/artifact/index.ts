/**
 * Criticality Artifact Server MCP package.
 *
 * This MCP server provides read/write access ONLY to official protocol
 * artifacts (spec.toml, DECISIONS.toml). It prevents context hallucination
 * by ensuring agents only see committed truth.
 *
 * @packageDocumentation
 */

export { createArtifactServer, startArtifactServer } from './server.js';
export {
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
  type AppendDecisionInput,
} from './types.js';
