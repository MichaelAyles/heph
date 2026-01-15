/**
 * Prompt Service for LangGraph Nodes
 *
 * Fetches prompts from the database at runtime, with fallback to hardcoded prompts.
 * This allows runtime editing of prompts via the admin UI.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface NodePrompt {
  systemPrompt: string
  userPromptTemplate: string
  temperature: number
  maxTokens: number
}

interface DBPromptRow {
  system_prompt: string
  user_prompt_template: string
  temperature: number
  max_tokens: number
  is_active: number
}

// D1 Database interface (subset of what we need)
interface D1Database {
  prepare(query: string): {
    bind(...params: unknown[]): {
      first<T>(): Promise<T | null>
    }
  }
}

// =============================================================================
// PROMPT CACHE
// =============================================================================

// In-memory cache for prompts (cleared on worker restart)
const CACHE_TTL_MS = 60 * 1000 // 1 minute cache

interface CacheEntry {
  prompt: NodePrompt
  timestamp: number
}

const cacheWithTimestamp = new Map<string, CacheEntry>()

// =============================================================================
// FALLBACK PROMPTS
// =============================================================================

// Import existing prompts as fallbacks
import { FEASIBILITY_SYSTEM_PROMPT } from '../../prompts/feasibility'
import { REFINEMENT_SYSTEM_PROMPT } from '../../prompts/refinement'
import { FINAL_SPEC_SYSTEM_PROMPT } from '../../prompts/finalSpec'
import { BLOCK_SELECTION_SYSTEM_PROMPT } from '../../prompts/block-selection'
import { ENCLOSURE_SYSTEM_PROMPT } from '../../prompts/enclosure'
import { FIRMWARE_SYSTEM_PROMPT } from '../../prompts/firmware'
import { NAMING_SYSTEM_PROMPT } from '../../prompts/naming'

// Fallback prompts from code (used when DB is unavailable or prompt not found)
const FALLBACK_PROMPTS: Record<string, NodePrompt> = {
  analyzeFeasibility: {
    systemPrompt: FEASIBILITY_SYSTEM_PROMPT,
    userPromptTemplate: 'Analyze this product description for feasibility:\n\n"{{description}}"\n\nDetermine if this can be built with the available components. Identify any open questions that need user decisions. Respond with JSON only.',
    temperature: 0.3,
    maxTokens: 4096,
  },
  answerQuestions: {
    systemPrompt: REFINEMENT_SYSTEM_PROMPT,
    userPromptTemplate: 'Based on the project description: "{{description}}"\n\nAnd feasibility analysis showing these capabilities:\n{{feasibility}}\n\nPlease answer the following open questions:\n{{questions}}\n\nRespond with JSON containing your answers.',
    temperature: 0.3,
    maxTokens: 2048,
  },
  generateNames: {
    systemPrompt: NAMING_SYSTEM_PROMPT,
    userPromptTemplate: 'Generate product names for this hardware project:\n\nName context: {{projectName}}\nDescription: {{description}}\nKey features: {{features}}\n\nProvide 5 diverse name options in JSON format.',
    temperature: 0.9,
    maxTokens: 1024,
  },
  finalizeSpec: {
    systemPrompt: FINAL_SPEC_SYSTEM_PROMPT,
    userPromptTemplate: 'Generate the final product specification for: {{projectName}}\n\nOriginal description: {{description}}\n\nSelected blueprint style: {{blueprintStyle}}\n\nDesign decisions made:\n{{decisions}}\n\nFeasibility analysis:\n{{feasibility}}\n\nCreate a complete, manufacturable specification in JSON format.',
    temperature: 0.3,
    maxTokens: 4096,
  },
  selectBlocks: {
    systemPrompt: BLOCK_SELECTION_SYSTEM_PROMPT,
    userPromptTemplate: 'Select and place PCB blocks for: {{projectName}}\n\nFinal specification:\n{{finalSpec}}\n\nAvailable blocks in library:\n{{availableBlocks}}\n\nRespond with JSON containing block selections and grid placements.',
    temperature: 0.3,
    maxTokens: 4096,
  },
  generateEnclosure: {
    systemPrompt: ENCLOSURE_SYSTEM_PROMPT,
    userPromptTemplate: 'Generate OpenSCAD enclosure for: {{projectName}}\n\nPCB dimensions: {{pcbWidth}}mm x {{pcbHeight}}mm x {{pcbThickness}}mm\n\nFeatures requiring apertures:\n{{features}}\n\nStyle: {{style}}\nWall thickness: {{wallThickness}}mm\nCorner radius: {{cornerRadius}}mm\n\n{{#if feedback}}\nPREVIOUS REVIEW FEEDBACK - Address these issues:\n{{feedback}}\n{{/if}}',
    temperature: 0.3,
    maxTokens: 8192,
  },
  reviewEnclosure: {
    systemPrompt: 'You are a mechanical engineering reviewer specializing in 3D-printable enclosures.\n\nReview the OpenSCAD code for:\n1. Syntax errors and undefined variables\n2. Printability (overhangs, wall thickness, support requirements)\n3. Assembly feasibility (snap-fits, screw bosses alignment)\n4. Component fit (PCB clearance, aperture sizes)\n5. Aesthetic quality (proportions, symmetry)\n\nScore from 0-100 and provide specific issues with suggestions.\n\nRespond with JSON containing score, verdict (accept/revise/reject), issues array, and positives array.',
    userPromptTemplate: 'Review this OpenSCAD enclosure code:\n\n```openscad\n{{openScadCode}}\n```\n\nPCB dimensions: {{pcbWidth}}mm x {{pcbHeight}}mm\nRequired features: {{features}}\n\nProvide detailed review in JSON format.',
    temperature: 0.3,
    maxTokens: 2048,
  },
  generateFirmware: {
    systemPrompt: FIRMWARE_SYSTEM_PROMPT,
    userPromptTemplate: 'Generate ESP32-C6 firmware for: {{projectName}}\n\nSpecification:\n{{finalSpec}}\n\nPin assignments from PCB:\n{{pinAssignments}}\n\nCommunication protocols:\n{{protocols}}\n\nSensors to support:\n{{sensors}}\n\nOutputs to control:\n{{outputs}}\n\n{{#if feedback}}\nPREVIOUS REVIEW FEEDBACK - Address these issues:\n{{feedback}}\n{{/if}}\n\nGenerate complete firmware in JSON format with files array.',
    temperature: 0.3,
    maxTokens: 8192,
  },
  reviewFirmware: {
    systemPrompt: 'You are an embedded systems code reviewer specializing in ESP32 firmware.\n\nReview the firmware code for:\n1. Syntax errors and compilation issues\n2. Pin assignment correctness\n3. I2C/SPI protocol implementation\n4. Memory management and leaks\n5. Power efficiency\n6. Security (no hardcoded credentials)\n7. Error handling completeness\n\nScore from 0-100 and provide specific issues with suggestions.\n\nRespond with JSON containing score, verdict (accept/revise/reject), issues array, and positives array.',
    userPromptTemplate: 'Review this ESP32-C6 firmware:\n\n{{#each files}}\n--- {{this.path}} ---\n```{{this.language}}\n{{this.content}}\n```\n{{/each}}\n\nPin assignments: {{pinAssignments}}\nRequired features: {{features}}\n\nProvide detailed review in JSON format.',
    temperature: 0.3,
    maxTokens: 2048,
  },
}

// =============================================================================
// PROMPT SERVICE
// =============================================================================

/**
 * Get a prompt for a node, with DB lookup and fallback.
 *
 * @param nodeName - The node name (e.g., 'analyzeFeasibility')
 * @param db - Optional D1 database for fetching from DB
 * @returns The prompt configuration
 */
export async function getNodePrompt(
  nodeName: string,
  db?: D1Database
): Promise<NodePrompt> {
  // Check cache first
  const cached = cacheWithTimestamp.get(nodeName)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.prompt
  }

  // Try to fetch from DB if available
  if (db) {
    try {
      const row = await db
        .prepare('SELECT system_prompt, user_prompt_template, temperature, max_tokens, is_active FROM orchestrator_prompts WHERE node_name = ? AND is_active = 1')
        .bind(nodeName)
        .first<DBPromptRow>()

      if (row) {
        const prompt: NodePrompt = {
          systemPrompt: row.system_prompt,
          userPromptTemplate: row.user_prompt_template,
          temperature: row.temperature,
          maxTokens: row.max_tokens,
        }

        // Cache the result
        cacheWithTimestamp.set(nodeName, { prompt, timestamp: Date.now() })

        return prompt
      }
    } catch (error) {
      console.error(`Failed to fetch prompt for ${nodeName} from DB:`, error)
      // Fall through to fallback
    }
  }

  // Use fallback prompt
  const fallback = FALLBACK_PROMPTS[nodeName]
  if (fallback) {
    return fallback
  }

  // No prompt found - throw error
  throw new Error(`No prompt found for node: ${nodeName}`)
}

/**
 * Render a user prompt template with variables.
 *
 * Supports simple {{variable}} syntax and {{#if variable}}...{{/if}} conditionals.
 *
 * @param template - The template string
 * @param variables - Variables to substitute
 * @returns Rendered template
 */
export function renderPromptTemplate(
  template: string,
  variables: Record<string, unknown>
): string {
  let result = template

  // Handle {{#if variable}}...{{/if}} conditionals
  const ifRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g
  result = result.replace(ifRegex, (_, varName, content) => {
    const value = variables[varName]
    if (value !== undefined && value !== null && value !== '' && value !== false) {
      return content
    }
    return ''
  })

  // Handle {{#each array}}...{{/each}} loops
  const eachRegex = /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g
  result = result.replace(eachRegex, (_, varName, content) => {
    const arr = variables[varName]
    if (!Array.isArray(arr)) return ''

    return arr
      .map((item, index) => {
        let itemContent = content
        // Replace {{this.property}} with item.property
        itemContent = itemContent.replace(/\{\{this\.(\w+)\}\}/g, (_: string, prop: string) => {
          return item[prop] !== undefined ? String(item[prop]) : ''
        })
        // Replace {{@index}} with index
        itemContent = itemContent.replace(/\{\{@index\}\}/g, String(index))
        return itemContent
      })
      .join('')
  })

  // Handle simple {{variable}} substitution
  result = result.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
    const value = variables[varName]
    if (value === undefined || value === null) return ''
    if (typeof value === 'object') return JSON.stringify(value, null, 2)
    return String(value)
  })

  return result
}

/**
 * Clear the prompt cache (useful after editing prompts).
 */
export function clearPromptCache(): void {
  cacheWithTimestamp.clear()
}

/**
 * Clear a specific prompt from cache.
 */
export function clearPromptFromCache(nodeName: string): void {
  cacheWithTimestamp.delete(nodeName)
}
