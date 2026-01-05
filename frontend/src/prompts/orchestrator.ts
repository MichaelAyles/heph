/**
 * Orchestrator System Prompt and Tool Definitions
 *
 * The orchestrator is a marathon agent that autonomously drives hardware design
 * from spec through PCB, enclosure, firmware, and export stages.
 */

import type { ToolDefinition } from '@/services/llm'

// =============================================================================
// SYSTEM PROMPT
// =============================================================================

export const ORCHESTRATOR_SYSTEM_PROMPT = `You are PHAESTUS, an autonomous hardware design orchestrator. Your mission is to transform a user's natural language hardware description into a complete, manufacturable design package.

## Your Role

You are a MARATHON AGENT - you work autonomously across multiple stages without user intervention. You make decisions, validate your work, and self-correct when you find issues.

## Available Stages

1. **SPEC** - Analyze feasibility, refine requirements, generate blueprints, finalize specification
2. **PCB** - Select circuit blocks, place on grid, generate schematic
3. **ENCLOSURE** - Generate OpenSCAD parametric enclosure with cutouts
4. **FIRMWARE** - Generate ESP32-C6 PlatformIO firmware
5. **EXPORT** - Package all artifacts for download

## Decision Making

When in VIBE IT mode (fully autonomous):
- Make reasonable default choices
- Prefer simpler solutions over complex ones
- Choose USB-C power unless battery is explicitly needed
- Select compact enclosure styles unless portability matters
- Enable WiFi, disable BLE unless needed

When user input is required:
- Call ask_clarifying_questions tool
- Wait for answers before proceeding

## Validation Philosophy

After EVERY stage completion, run validate_cross_stage. If issues are found:
1. Identify the earliest affected stage
2. Call fix_stage_issue with specific correction
3. Re-run validation
4. Repeat until all validations pass

## Critical Rules

1. NEVER skip validation between stages
2. NEVER proceed to next stage if current stage has errors
3. ALWAYS update project state after each tool call
4. When fixing issues, regenerate ALL downstream artifacts
5. Log your reasoning in the thinking parameter

## Output Behavior

- Call tools to perform actions
- Include brief reasoning in your responses
- Report progress after each major step
- When all stages complete, call mark_stage_complete('export') to finish`

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const ORCHESTRATOR_TOOLS: ToolDefinition[] = [
  {
    name: 'analyze_feasibility',
    description:
      'Analyze if a hardware idea is feasible with available ESP32-C6 components. Returns feasibility score, matched components, and any open questions.',
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'The user hardware description to analyze',
        },
      },
      required: ['description'],
    },
  },
  {
    name: 'answer_questions_auto',
    description:
      'Automatically answer open questions from feasibility analysis using sensible defaults. Use in VIBE IT mode.',
    parameters: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          description: 'Array of question IDs to answer',
          items: { type: 'string' },
        },
        reasoning: {
          type: 'string',
          description: 'Brief explanation of why these answers were chosen',
        },
      },
      required: ['questions', 'reasoning'],
    },
  },
  {
    name: 'generate_blueprints',
    description: 'Generate 4 product visualization images based on the refined specification.',
    parameters: {
      type: 'object',
      properties: {
        style_hints: {
          type: 'array',
          description:
            'Style variations for each blueprint (e.g., "minimal", "rugged", "sleek", "industrial")',
          items: { type: 'string' },
        },
      },
      required: ['style_hints'],
    },
  },
  {
    name: 'select_blueprint',
    description: 'Select one of the generated blueprints to proceed with.',
    parameters: {
      type: 'object',
      properties: {
        index: {
          type: 'number',
          description: 'Index of the blueprint to select (0-3)',
        },
        reasoning: {
          type: 'string',
          description: 'Why this blueprint was selected',
        },
      },
      required: ['index', 'reasoning'],
    },
  },
  {
    name: 'finalize_spec',
    description:
      'Generate the final locked specification with BOM from the selected blueprint and decisions.',
    parameters: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Confirm that spec should be locked',
        },
      },
      required: ['confirm'],
    },
  },
  {
    name: 'select_pcb_blocks',
    description:
      'Select and place circuit blocks on the PCB grid based on the final specification.',
    parameters: {
      type: 'object',
      properties: {
        blocks: {
          type: 'array',
          description: 'Array of block placements',
          items: { type: 'object' },
        },
        reasoning: {
          type: 'string',
          description: 'Explanation of block selection and placement strategy',
        },
      },
      required: ['blocks', 'reasoning'],
    },
  },
  {
    name: 'generate_enclosure',
    description:
      'Generate OpenSCAD parametric enclosure code based on PCB dimensions and components.',
    parameters: {
      type: 'object',
      properties: {
        style: {
          type: 'string',
          description: 'Enclosure style',
          enum: ['box', 'rounded_box', 'handheld', 'wall_mount', 'desktop'],
        },
        wall_thickness: {
          type: 'number',
          description: 'Wall thickness in mm (default: 2)',
        },
        corner_radius: {
          type: 'number',
          description: 'Corner radius in mm for rounded styles (default: 3)',
        },
      },
      required: ['style'],
    },
  },
  {
    name: 'generate_firmware',
    description:
      'Generate ESP32-C6 PlatformIO firmware based on PCB configuration and spec requirements.',
    parameters: {
      type: 'object',
      properties: {
        enable_wifi: {
          type: 'boolean',
          description: 'Enable WiFi connectivity',
        },
        enable_ble: {
          type: 'boolean',
          description: 'Enable BLE connectivity',
        },
        enable_ota: {
          type: 'boolean',
          description: 'Enable OTA updates',
        },
        enable_deep_sleep: {
          type: 'boolean',
          description: 'Enable deep sleep for battery optimization',
        },
      },
      required: [],
    },
  },
  {
    name: 'validate_cross_stage',
    description: 'Validate consistency across stages. MUST be called after each stage completes.',
    parameters: {
      type: 'object',
      properties: {
        check_type: {
          type: 'string',
          description: 'Type of validation to perform',
          enum: ['pcb_fits_enclosure', 'firmware_matches_pcb', 'spec_satisfied', 'all'],
        },
      },
      required: ['check_type'],
    },
  },
  {
    name: 'fix_stage_issue',
    description: 'Fix an issue found during validation by modifying a specific stage.',
    parameters: {
      type: 'object',
      properties: {
        stage: {
          type: 'string',
          description: 'The stage to fix',
          enum: ['spec', 'pcb', 'enclosure', 'firmware'],
        },
        issue: {
          type: 'string',
          description: 'Description of the issue',
        },
        fix: {
          type: 'string',
          description: 'Description of how to fix it',
        },
      },
      required: ['stage', 'issue', 'fix'],
    },
  },
  {
    name: 'mark_stage_complete',
    description: 'Mark a stage as complete and advance to the next stage.',
    parameters: {
      type: 'object',
      properties: {
        stage: {
          type: 'string',
          description: 'The stage that completed',
          enum: ['spec', 'pcb', 'enclosure', 'firmware', 'export'],
        },
      },
      required: ['stage'],
    },
  },
  {
    name: 'report_progress',
    description: 'Report current progress to the user interface.',
    parameters: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Progress message to display',
        },
        stage: {
          type: 'string',
          description: 'Current stage',
          enum: ['spec', 'pcb', 'enclosure', 'firmware', 'export'],
        },
        percentage: {
          type: 'number',
          description: 'Completion percentage (0-100)',
        },
      },
      required: ['message', 'stage'],
    },
  },
  {
    name: 'request_user_input',
    description: 'Request user input when a decision cannot be made automatically. Use sparingly.',
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'The question to ask the user',
        },
        options: {
          type: 'array',
          description: 'Available options (if multiple choice)',
          items: { type: 'string' },
        },
        context: {
          type: 'string',
          description: 'Context for why this decision matters',
        },
      },
      required: ['question', 'context'],
    },
  },
]

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Build the initial orchestrator prompt for a new project
 */
export function buildOrchestratorInitPrompt(
  description: string,
  mode: 'vibe_it' | 'fix_it' | 'design_it'
): string {
  const modeInstructions = {
    vibe_it: `You are in VIBE IT mode. Make all decisions autonomously using sensible defaults. Do not ask for user input unless absolutely necessary. Aim for a complete design in one autonomous session.`,
    fix_it: `You are in FIX IT mode. Focus on making the design work correctly. Ask for user input on major decisions but handle technical details automatically.`,
    design_it: `You are in DESIGN IT mode. Guide the user through each decision point. Present options and wait for user input before proceeding with significant choices.`,
  }

  return `${modeInstructions[mode]}

User's hardware description:
"${description}"

Begin the autonomous hardware design process. Start by analyzing feasibility.`
}

/**
 * Build prompt for resuming an in-progress orchestration
 */
export function buildOrchestratorResumePrompt(
  currentStage: string,
  stageStatus: string,
  lastAction: string
): string {
  return `Resume orchestration from ${currentStage} stage (status: ${stageStatus}).

Last action: ${lastAction}

Continue the design process from where we left off.`
}
