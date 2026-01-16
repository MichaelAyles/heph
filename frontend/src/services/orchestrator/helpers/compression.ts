/**
 * Tool Result Compression
 *
 * Compresses tool results for conversation history to reduce token usage.
 * Full artifacts are stored in currentSpec; history only gets summaries.
 */

import { extractEnclosureDimensions, extractEnclosureFeatures } from './code-parsing'

/**
 * Compress tool results for conversation history.
 * Full artifacts are stored in currentSpec; history only gets summaries.
 * This reduces token usage by ~80% for large results.
 */
export function compressToolResult(toolName: string, result: unknown): unknown {
  // Handle error results as-is
  if (result && typeof result === 'object' && 'error' in result) {
    return result
  }

  const r = result as Record<string, unknown>

  switch (toolName) {
    case 'analyze_feasibility':
      return {
        success: r.success ?? true,
        manufacturable: r.manufacturable,
        score: r.overallScore ?? r.score,
        openQuestionCount: Array.isArray(r.openQuestions) ? r.openQuestions.length : 0,
        // Full feasibility stored in spec.feasibility
      }

    case 'generate_blueprints':
      return {
        success: true,
        blueprintCount: Array.isArray(r.blueprints) ? r.blueprints.length : (r.blueprintCount ?? 4),
        // Full blueprints stored in spec.blueprints
      }

    case 'select_blueprint':
      return {
        success: true,
        selectedIndex: r.selectedIndex ?? r.index,
        reasoning: r.reasoning,
      }

    case 'finalize_spec':
      return {
        success: true,
        specLocked: true,
        // Full finalSpec stored in spec.finalSpec
      }

    case 'select_pcb_blocks':
      return {
        success: true,
        blockCount: Array.isArray(r.placedBlocks) ? r.placedBlocks.length : (r.blockCount ?? 0),
        reasoning: r.reasoning,
        // Full blocks stored in spec.pcb.placedBlocks
      }

    case 'generate_enclosure': {
      // FULL OpenSCAD code passed to orchestrator - it needs to see the code
      // to understand review feedback and make informed decisions
      // With 1M context window, ~2-5K tokens for OpenSCAD is fine
      const code = typeof r.openScadCode === 'string' ? r.openScadCode : (r.code as string) || ''
      const dimensions = extractEnclosureDimensions(code)
      const features = extractEnclosureFeatures(code)
      return {
        success: true,
        code, // FULL CODE - orchestrator sees everything for decision-making
        codeLength: code.length || (r.codeLength ?? 0),
        dimensions,
        features,
        isRevision: r.isRevision,
      }
    }

    case 'generate_firmware': {
      // FULL files passed to orchestrator - it needs to see the code
      // to understand review feedback and make informed decisions
      // With 1M context window, ~3-8K tokens for firmware is fine
      const files = Array.isArray(r.files) ? r.files : []
      return {
        success: true,
        files, // FULL FILES - orchestrator sees all code for decision-making
        fileCount: files.length || (r.fileCount ?? 0),
        fileNames: files.map((f: { path?: string }) => f.path).filter(Boolean),
        isRevision: r.isRevision,
      }
    }

    case 'validate_cross_stage':
      // Validation reports are already reasonably sized
      return {
        valid: r.valid ?? (r.issueCount === 0),
        issueCount: r.issueCount ?? 0,
        issues: r.issues ?? [],
        suggestions: r.suggestions ?? [],
        report: r.report,
      }

    case 'mark_stage_complete':
      return {
        success: true,
        stage: r.stage,
        status: 'complete',
      }

    case 'review_enclosure':
    case 'review_firmware':
      // CRITICAL: Review results must pass through UNCOMPRESSED
      // The orchestrator needs to see ALL issues to pass meaningful feedback
      // for the generate → review → decide workflow
      return result

    case 'accept_and_render':
      // Accept results should include what was accepted
      return {
        success: r.success ?? true,
        stage: r.stage,
        message: r.message,
      }

    case 'report_progress':
    case 'fix_stage_issue':
    case 'request_user_input':
    case 'answer_questions_auto':
      // These are already small, pass through
      return result

    default: {
      // Unknown tools: truncate if too large
      const json = JSON.stringify(result)
      if (json.length > 500) {
        return { success: true, truncated: true, preview: json.slice(0, 200) + '...' }
      }
      return result
    }
  }
}
