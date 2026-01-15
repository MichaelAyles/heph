/**
 * Generate Firmware Node
 *
 * LangGraph node that generates ESP32 firmware code.
 */

import { llmAdapter, createChatRequest } from '../../llm-wrapper'
import {
  createHistoryItem,
  type OrchestratorState,
  type OrchestratorStateUpdate,
} from '../../state'
import {
  buildFirmwarePrompt,
  buildFirmwareInputFromSpec,
  FIRMWARE_SYSTEM_PROMPT,
} from '@/prompts/firmware'
import type { FirmwareArtifacts, FirmwareFile } from '@/db/schema'

const VALID_LANGUAGES = ['cpp', 'c', 'h', 'json'] as const

/**
 * Generate ESP32 firmware code.
 *
 * @param state - Current orchestrator state
 * @param enableWifi - Enable WiFi functionality
 * @param enableBle - Enable BLE functionality
 * @param enableOta - Enable OTA updates
 * @param enableDeepSleep - Enable deep sleep
 * @param feedback - Feedback from previous review (for revision)
 * @returns State update with firmware artifacts
 */
export async function generateFirmwareNode(
  state: OrchestratorState,
  enableWifi?: boolean,
  enableBle?: boolean,
  enableOta?: boolean,
  enableDeepSleep?: boolean,
  feedback?: string
): Promise<OrchestratorStateUpdate> {
  const { finalSpec, pcb, projectId, firmwareAttempts } = state

  if (!finalSpec || !pcb) {
    return {
      error: 'Spec and PCB must be complete before firmware generation',
      history: [
        createHistoryItem('error', 'firmware', 'generate_firmware', 'Missing spec or PCB'),
      ],
    }
  }

  try {
    const input = buildFirmwareInputFromSpec(
      finalSpec.name,
      finalSpec.summary,
      finalSpec,
      pcb
    )

    // Override preferences if provided
    if (enableWifi !== undefined) input.preferences.useWiFi = enableWifi
    if (enableBle !== undefined) input.preferences.useBLE = enableBle
    if (enableOta !== undefined) input.preferences.useOTA = enableOta
    if (enableDeepSleep !== undefined) input.power.deepSleepEnabled = enableDeepSleep

    // Build prompt, including feedback if this is a revision
    let userPrompt = buildFirmwarePrompt(input)
    if (feedback) {
      userPrompt += `\n\n## PREVIOUS REVIEW FEEDBACK - Address these issues:\n${feedback}`
    }

    const chatRequest = createChatRequest(
      FIRMWARE_SYSTEM_PROMPT,
      userPrompt,
      { temperature: 0.3, maxTokens: 8192, projectId }
    )

    const response = await llmAdapter.chat(chatRequest)

    // Parse firmware files from JSON response
    let files: FirmwareFile[] = []
    const parsed = llmAdapter.parseJson<{ files: Array<{ path: string; content: string; language?: string }> }>(response.content)

    if (parsed?.files && parsed.files.length > 0) {
      files = parsed.files.map((f) => ({
        path: f.path,
        content: f.content,
        language: VALID_LANGUAGES.includes(f.language as (typeof VALID_LANGUAGES)[number])
          ? (f.language as FirmwareFile['language'])
          : 'cpp',
      }))
    } else {
      // If JSON parse fails, create a single main.cpp file
      const code = llmAdapter.extractCodeBlock(response.content, 'cpp') ||
                   llmAdapter.extractCodeBlock(response.content) ||
                   response.content
      files = [{ path: 'src/main.cpp', content: code, language: 'cpp' }]
    }

    const firmware: FirmwareArtifacts = {
      files,
      buildStatus: 'pending',
    }

    return {
      firmware,
      firmwareAttempts: firmwareAttempts + 1,
      firmwareReview: null, // Clear previous review
      history: [
        createHistoryItem(
          'tool_result',
          'firmware',
          'generate_firmware',
          `Generated firmware (attempt ${firmwareAttempts + 1})`,
          {
            fileCount: files.length,
            fileNames: files.map((f) => f.path),
            isRevision: !!feedback,
          }
        ),
      ],
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      error: `Firmware generation failed: ${message}`,
      history: [
        createHistoryItem('error', 'firmware', 'generate_firmware', message),
      ],
    }
  }
}

/**
 * Check if firmware has been generated
 */
export function hasFirmwareGenerated(state: OrchestratorState): boolean {
  return state.firmware !== null && (state.firmware.files?.length ?? 0) > 0
}
