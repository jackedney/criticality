/**
 * Transformation applier for Mass Defect phase.
 *
 * Applies code transformations using LLM to refactor code based on pattern prompts.
 *
 * @packageDocumentation
 */

import type { ModelRouter } from '../router/types.js';
import type { TransformationType, TransformationResult, RiskLevel } from './types.js';
import { Project } from 'ts-morph';

/**
 * Applies a transformation pattern to function code using LLM.
 *
 * @param functionCode - The function code to transform.
 * @param pattern - The transformation pattern to apply.
 * @param router - Model router for LLM requests.
 * @returns Promise resolving to transformation result.
 *
 * @remarks
 * The applier:
 * - Routes to worker_model for risk levels 1-2
 * - Routes to architect_model for risk levels 3-4
 * - Renders the pattern prompt template with function code injected
 * - Parses LLM response to extract transformed code from markdown code blocks
 * - Preserves JSDoc comments and Micro-Contracts (/// REQUIRES, etc.)
 * - Returns failure if LLM returns malformed response or unchanged code
 */
export async function applyTransformation(
  functionCode: string,
  pattern: TransformationType,
  router: ModelRouter
): Promise<TransformationResult> {
  const patternId = pattern.patternId;

  try {
    const modelAlias = getModelAliasForRisk(pattern.risk);
    const prompt = renderPrompt(pattern.prompt, functionCode);

    const result = await router.complete({
      modelAlias,
      prompt,
      parameters: {
        maxTokens: 4000,
        temperature: 0.3,
      },
    });

    if (!result.success) {
      return {
        success: false,
        patternId,
        originalCode: functionCode,
        error: `LLM request failed: ${result.error.message}`,
      };
    }

    const transformedCode = extractTransformedCode(result.response.content);

    if (!transformedCode) {
      return {
        success: false,
        patternId,
        originalCode: functionCode,
        error: 'Failed to extract transformed code from LLM response',
      };
    }

    const transformedCodeWithComments = preserveLeadingTrailingComments(
      functionCode,
      transformedCode
    );

    if (transformedCodeWithComments === functionCode) {
      return {
        success: false,
        patternId,
        originalCode: functionCode,
        error: 'Transformation had no effect - code unchanged',
      };
    }

    return {
      success: true,
      patternId,
      originalCode: functionCode,
      transformedCode: transformedCodeWithComments,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      patternId,
      originalCode: functionCode,
      error: `Transformation error: ${errorMessage}`,
    };
  }
}

/**
 * Gets the model alias to use based on risk level.
 *
 * @param risk - The risk level of the transformation.
 * @returns The model alias to route to.
 */
function getModelAliasForRisk(risk: RiskLevel): 'worker' | 'architect' {
  return risk <= 2 ? 'worker' : 'architect';
}

/**
 * Renders the transformation prompt with function code injected.
 *
 * @param template - The prompt template from the pattern.
 * @param functionCode - The function code to transform.
 * @returns The rendered prompt.
 */
function renderPrompt(template: string, functionCode: string): string {
  const codeBlock = '\nINPUT CODE:\n```typescript\n' + functionCode + '\n```\n';
  return template + codeBlock;
}

/**
 * Extracts transformed code from LLM response.
 *
 * Handles markdown code blocks with optional language identifier:
 * - ```typescript ... ```
 * - ```ts ... ```
 * - ``` ... ```
 *
 * @param response - The LLM response content.
 * @returns The extracted code, or null if not found.
 */
function extractTransformedCode(response: string): string | null {
  const codeBlockRegex = /```(?:typescript|ts)?\n([\s\S]*?)```/g;
  const matches = Array.from(response.matchAll(codeBlockRegex));

  if (matches.length === 0) {
    return null;
  }

  const lastMatch = matches[matches.length - 1];
  if (!lastMatch) {
    return null;
  }

  return lastMatch[1]?.trim() ?? null;
}

/**
 * Preserves leading and trailing comments when replacing function body.
 *
 * Uses ts-morph AST to extract JSDoc and Micro-Contract comments
 * from the original function and prepend them to the transformed code.
 *
 * @param originalCode - The original function code.
 * @param transformedCode - The transformed function code.
 * @returns The transformed code with preserved comments.
 *
 * @remarks
 * This function:
 * - Extracts JSDoc comments from original
 * - Extracts Micro-Contract comments (/// REQUIRES, etc.) from original
 * - Prepends them to the transformed code
 * - Ensures proper spacing between comments and code
 * - Preserves original indentation
 */
function preserveLeadingTrailingComments(originalCode: string, transformedCode: string): string {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile('temp.ts', originalCode);

  const funcDecls = sourceFile.getFunctions();
  if (funcDecls.length === 0) {
    return transformedCode;
  }

  const func = funcDecls[0];
  if (!func) {
    return transformedCode;
  }

  const comments: string[] = [];

  // Collect JSDoc comments
  const jsDocs = func.getJsDocs();
  for (const jsDoc of jsDocs) {
    comments.push(jsDoc.getFullText());
  }

  // Collect leading comments via ts-morph API only (not scanning fullText)
  // This avoids pulling unrelated file-level triple-slash directives
  const leadingCommentRanges = func.getLeadingCommentRanges();
  for (const range of leadingCommentRanges) {
    const comment = originalCode.slice(range.getPos(), range.getEnd());
    comments.push(comment);
  }

  // Get the original indentation from the function start
  const originalIndent = getIndentation(originalCode);

  if (comments.length === 0) {
    // No comments to preserve, just ensure proper indentation
    const trimmedTransformed = transformedCode.trimStart();
    const lines = trimmedTransformed.split('\n');
    const reindentedLines = lines.map((line, i) =>
      i === 0 ? originalIndent + line : originalIndent + line.trimStart()
    );
    return reindentedLines.join('\n');
  }

  const commentsText = comments.join('\n');
  const trimmedOriginalComments = commentsText.trimEnd();

  const trimmedTransformed = transformedCode.trimStart();
  const lines = trimmedTransformed.split('\n');
  const reindentedLines = lines.map((line, i) =>
    i === 0 ? line : originalIndent + line.trimStart()
  );
  const reindentedCode = reindentedLines.join('\n');

  return `${trimmedOriginalComments}\n${originalIndent}${reindentedCode}`;
}

/**
 * Gets the leading whitespace (indentation) from a string.
 *
 * @param text - The text to analyze.
 * @returns The leading whitespace.
 */
function getIndentation(text: string): string {
  const match = text.match(/^(\s*)/);
  return match?.[1] ?? '';
}
