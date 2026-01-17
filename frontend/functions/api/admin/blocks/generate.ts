/**
 * Admin Block Generation API
 *
 * POST /api/admin/blocks/generate
 * - Accepts multipart form data with KiCad files
 * - Parses files to extract component and net information
 * - Uses LLM to generate block.json metadata
 * - Returns generated block.json and extraction for review
 */

import type { Env } from '../../../env.d'
import { parseKicadFiles, formatExtractForLLM, calculateGridSize } from '../../../../src/services/kicad-parser'
import { buildBlockGenerationMessages } from '../../../../src/prompts/block-generation'
import { parseBlockJson } from '../../../lib/block-validator'
import type { BlockCategory } from '../../../../src/schemas/block'

interface GenerateRequest {
  slug: string
  schematic: string
  pcb?: string
  suggestedCategory?: BlockCategory
}

/**
 * Call the LLM to generate block.json from extracted KiCad data
 */
async function callLLM(
  env: Env,
  messages: { role: 'system' | 'user'; content: string }[]
): Promise<string> {
  const model = env.TEXT_MODEL_SLUG || 'google/gemini-2.0-flash-001'

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://phaestus.app',
      'X-Title': 'PHAESTUS Block Generator',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1, // Low temperature for structured output
      max_tokens: 4096,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`LLM request failed: ${response.status} - ${error}`)
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>
  }

  if (!data.choices?.[0]?.message?.content) {
    throw new Error('No content in LLM response')
  }

  return data.choices[0].message.content
}

/**
 * Extract JSON from LLM response (handles markdown code blocks)
 */
function extractJsonFromResponse(content: string): string {
  // Try to extract from code block first
  const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }

  // Try to extract raw JSON object
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    return jsonMatch[0]
  }

  throw new Error('No JSON found in LLM response')
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, data, request } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined

  // Check admin permission
  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const contentType = request.headers.get('content-type') || ''

    let slug: string
    let schematicContent: string
    let pcbContent: string | undefined
    let suggestedCategory: BlockCategory | undefined

    if (contentType.includes('multipart/form-data')) {
      // Handle multipart form data upload
      const formData = await request.formData()

      slug = formData.get('slug') as string
      if (!slug) {
        return Response.json({ error: 'Block slug is required' }, { status: 400 })
      }

      // Validate slug format
      if (!/^[a-z0-9-]+$/.test(slug) || slug.length < 3 || slug.length > 50) {
        return Response.json(
          { error: 'Slug must be 3-50 lowercase alphanumeric characters with hyphens' },
          { status: 400 }
        )
      }

      const schematicFile = formData.get('schematic') as File | null
      if (!schematicFile) {
        return Response.json({ error: 'Schematic file (.kicad_sch) is required' }, { status: 400 })
      }

      schematicContent = await schematicFile.text()
      if (!schematicContent.includes('kicad_sch')) {
        return Response.json({ error: 'Invalid KiCad schematic file format' }, { status: 400 })
      }

      const pcbFile = formData.get('pcb') as File | null
      if (pcbFile) {
        pcbContent = await pcbFile.text()
        if (!pcbContent.includes('kicad_pcb')) {
          return Response.json({ error: 'Invalid KiCad PCB file format' }, { status: 400 })
        }
      }

      suggestedCategory = formData.get('category') as BlockCategory | null || undefined
    } else if (contentType.includes('application/json')) {
      // Handle JSON body (for testing)
      const body = (await request.json()) as GenerateRequest
      slug = body.slug
      schematicContent = body.schematic
      pcbContent = body.pcb
      suggestedCategory = body.suggestedCategory

      if (!slug || !schematicContent) {
        return Response.json({ error: 'slug and schematic are required' }, { status: 400 })
      }
    } else {
      return Response.json({ error: 'Unsupported content type' }, { status: 400 })
    }

    // Parse KiCad files
    let extract
    try {
      extract = parseKicadFiles(schematicContent, pcbContent)
    } catch (parseError) {
      return Response.json(
        {
          error: 'Failed to parse KiCad files',
          details: parseError instanceof Error ? parseError.message : 'Unknown parse error',
        },
        { status: 400 }
      )
    }

    // Build LLM messages
    const messages = buildBlockGenerationMessages(extract, slug, suggestedCategory)

    // Call LLM
    let llmResponse: string
    try {
      llmResponse = await callLLM(env, messages)
    } catch (llmError) {
      return Response.json(
        {
          error: 'LLM generation failed',
          details: llmError instanceof Error ? llmError.message : 'Unknown LLM error',
          extract: {
            components: extract.components,
            nets: extract.nets,
            boardSize: extract.boardSize,
            busSignals: extract.busSignals,
          },
        },
        { status: 500 }
      )
    }

    // Extract and validate JSON
    let jsonString: string
    let generatedBlock: unknown
    try {
      jsonString = extractJsonFromResponse(llmResponse)
      generatedBlock = JSON.parse(jsonString)
    } catch (jsonError) {
      return Response.json(
        {
          error: 'Failed to parse LLM response as JSON',
          rawResponse: llmResponse,
          extract: {
            components: extract.components,
            nets: extract.nets,
            boardSize: extract.boardSize,
            busSignals: extract.busSignals,
          },
        },
        { status: 500 }
      )
    }

    // Validate against block schema
    const validationResult = parseBlockJson(JSON.stringify(generatedBlock))

    return Response.json({
      success: true,
      blockJson: generatedBlock,
      blockJsonString: JSON.stringify(generatedBlock, null, 2),
      isValid: validationResult.success,
      validationErrors: validationResult.success ? [] : validationResult.errors,
      extract: {
        components: extract.components,
        nets: extract.nets,
        boardSize: extract.boardSize,
        suggestedGridSize: calculateGridSize(extract.boardSize),
        busSignals: extract.busSignals,
        i2cSignals: extract.i2cSignals,
        spiSignals: extract.spiSignals,
        gpioSignals: extract.gpioSignals,
        powerRails: extract.powerRails,
      },
      rawLlmResponse: llmResponse,
    })
  } catch (error) {
    console.error('Block generation error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    )
  }
}
