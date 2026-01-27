/**
 * Firmware generation prompt stubs
 * Used to generate ESP32-C6 firmware for hardware projects.
 */

import type { FinalSpec } from '../db/schema'

// NOTE: System prompt is stored in database (orchestrator_prompts table)
// Use /api/langgraph/invoke/firmware

export interface FirmwareProject {
  files: Array<{
    path: string
    content: string
    language: string
  }>
}

export interface FirmwareInput {
  projectName: string
  description: string
  inputs: Array<{ type: string; pin?: string; notes?: string }>
  outputs: Array<{ type: string; pin?: string; notes?: string }>
  communication: { type: string; protocol?: string }
  power: { source: string; voltage?: string }
  blocks: string[]
}

export interface PCBArtifacts {
  placedBlocks?: Array<{ blockSlug: string }>
}

export function buildFirmwareInputFromSpec(
  projectName: string,
  description: string,
  finalSpec?: FinalSpec,
  pcbArtifacts?: PCBArtifacts | null
): FirmwareInput {
  const defaultInput: FirmwareInput = {
    projectName: projectName.toLowerCase().replace(/\s+/g, '_') || 'phaestus_project',
    description: description || 'IoT device',
    inputs: [],
    outputs: [],
    communication: { type: 'WiFi', protocol: 'MQTT' },
    power: { source: 'USB', voltage: '5V' },
    blocks: [],
  }

  if (!finalSpec) return defaultInput

  return {
    projectName: projectName.toLowerCase().replace(/\s+/g, '_') || 'phaestus_project',
    description: finalSpec.summary ?? description ?? 'IoT device',
    inputs: finalSpec.inputs?.map((i) => ({ type: i.type, notes: i.notes })) ?? [],
    outputs: finalSpec.outputs?.map((o) => ({ type: o.type, notes: o.notes })) ?? [],
    communication: finalSpec.communication ?? { type: 'WiFi' },
    power: finalSpec.power ?? { source: 'USB' },
    blocks: (pcbArtifacts?.placedBlocks ?? []).map((b) => b.blockSlug),
  }
}

export function buildFirmwarePrompt(input: FirmwareInput): string {
  return `Generate complete PlatformIO firmware for this ESP32-C6 project:

Project: ${input.projectName}
Description: ${input.description}

Hardware Configuration:
- MCU: ESP32-C6 SuperMini
- Framework: Arduino

Inputs:
${input.inputs.map((i) => `- ${i.type}${i.notes ? ` (${i.notes})` : ''}`).join('\n') || '- None specified'}

Outputs:
${input.outputs.map((o) => `- ${o.type}${o.notes ? ` (${o.notes})` : ''}`).join('\n') || '- None specified'}

Communication: ${input.communication.type}${input.communication.protocol ? ` via ${input.communication.protocol}` : ''}
Power: ${input.power.source}${input.power.voltage ? ` (${input.power.voltage})` : ''}

Hardware Blocks: ${input.blocks.join(', ') || 'Basic components'}

Generate a complete, working PlatformIO project with:
1. platformio.ini with correct board configuration
2. src/main.cpp with setup() and loop()
3. WiFi configuration and connection handling
4. Appropriate sensor/actuator libraries
5. Basic error handling and status feedback

Return JSON with files array containing path, content, and language for each file.`
}

export function buildFirmwareModificationPrompt(
  currentFiles: Array<{ path: string; content: string }>,
  feedback: string,
  input: FirmwareInput
): string {
  const filesSection = currentFiles.map((f) => `--- ${f.path} ---\n${f.content}`).join('\n\n')

  return `Modify this ESP32-C6 firmware based on user feedback:

Current Project Files:
${filesSection}

User Feedback: ${feedback}

Project Context:
- Name: ${input.projectName}
- Inputs: ${input.inputs.map((i) => i.type).join(', ') || 'None'}
- Outputs: ${input.outputs.map((o) => o.type).join(', ') || 'None'}
- Communication: ${input.communication.type}

Generate updated firmware that addresses the feedback while maintaining functionality.
Return JSON with the modified files array.`
}
