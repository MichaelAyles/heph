/**
 * Spec Stage Subgraph
 *
 * Handles the specification stage of the hardware design pipeline:
 * 1. Feasibility Check - Analyze if the project can be built
 * 2. Refinement Loop - Q&A to clarify requirements
 * 3. Blueprint Generation - Create visual designs
 * 4. Finalization - Lock the final specification
 */

import { StateGraph, START, END, type GraphNode } from '@langchain/langgraph'
import { AIMessage } from '@langchain/core/messages'
import {
  SpecStateSchema,
  type SpecState,
  type SpecRoute,
  createSpecDebugStep,
  didFeasibilityPass,
  isRefinementComplete,
  areBlueprintsReady,
} from '../states/spec'

// =============================================================================
// Node Implementations
// =============================================================================

/**
 * Feasibility Check Node
 *
 * Analyzes the user's request to determine if it can be built
 * with available components. Returns a feasibility analysis with
 * scores for different aspects (communication, processing, power, etc.)
 */
const feasibilityCheckNode: GraphNode<typeof SpecStateSchema> = async (state) => {
  const startTime = Date.now()

  // TODO: Call LLM with feasibility prompt
  // For now, return a placeholder that allows progression
  const feasibility = {
    communication: { type: 'WiFi', confidence: 90, notes: 'ESP32-C6 supports WiFi 6' },
    processing: { level: 'medium', confidence: 85, notes: 'Sufficient for sensor processing' },
    power: {
      options: ['LiPo battery', 'USB-C'],
      confidence: 80,
      notes: 'Multiple options available',
    },
    inputs: { items: ['Temperature sensor', 'Humidity sensor'], confidence: 85 },
    outputs: { items: ['OLED display', 'LED indicator'], confidence: 90 },
    overallScore: 85,
    manufacturable: true,
  }

  const debugStep = createSpecDebugStep(
    'feasibility_check',
    { userRequest: state.userRequest },
    { feasibility },
    Date.now() - startTime
  )

  // Determine route based on feasibility
  const specRoute: SpecRoute = feasibility.manufacturable ? 'proceed' : 'reject'

  return {
    feasibility,
    specRoute,
    debug: {
      ...state.debug,
      steps: [debugStep],
    },
  }
}

/**
 * Refinement Loop Node
 *
 * Generates clarifying questions and processes user answers.
 * Continues until all questions are answered or max rounds reached.
 */
const refinementLoopNode: GraphNode<typeof SpecStateSchema> = async (state) => {
  const startTime = Date.now()

  // Check if we're processing user feedback
  if (state.userFeedback) {
    // Process the answer and add to decisions
    const currentQuestion = state.openQuestions[0]
    if (currentQuestion) {
      const decision = {
        questionId: currentQuestion.id,
        question: currentQuestion.question,
        answer: state.userFeedback,
        timestamp: new Date().toISOString(),
      }

      const debugStep = createSpecDebugStep(
        'refinement_loop',
        { feedback: state.userFeedback, question: currentQuestion },
        { decision },
        Date.now() - startTime
      )

      return {
        decisions: [...state.decisions, decision],
        openQuestions: state.openQuestions.slice(1),
        userFeedback: null,
        refinementRound: state.refinementRound + 1,
        specRoute: state.openQuestions.length <= 1 ? 'generate_blueprints' : 'clarify',
        debug: {
          ...state.debug,
          steps: [debugStep],
        },
      }
    }
  }

  // Generate questions if this is the first round
  if (state.openQuestions.length === 0 && state.refinementRound === 0) {
    // TODO: Call LLM to generate questions based on feasibility
    const questions = [
      {
        id: 'q1',
        question: 'What enclosure style do you prefer?',
        options: ['Minimal box', 'Rounded organic', 'Industrial rugged'],
      },
      {
        id: 'q2',
        question: 'What is the primary power source?',
        options: ['Rechargeable LiPo', 'USB power only', 'AA batteries'],
      },
    ]

    const responseMessage = new AIMessage({
      id: crypto.randomUUID(),
      content: `Great! Your project looks feasible. I have a few questions to refine the design:\n\n${questions[0].question}\n\nOptions:\n${questions[0].options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`,
    })

    const debugStep = createSpecDebugStep(
      'refinement_loop',
      { feasibility: state.feasibility },
      { questions, questionCount: questions.length },
      Date.now() - startTime
    )

    return {
      messages: [responseMessage],
      openQuestions: questions,
      specRoute: 'clarify',
      debug: {
        ...state.debug,
        steps: [debugStep],
      },
    }
  }

  // Present next question
  const nextQuestion = state.openQuestions[0]
  if (nextQuestion) {
    const responseMessage = new AIMessage({
      id: crypto.randomUUID(),
      content: `${nextQuestion.question}\n\nOptions:\n${nextQuestion.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`,
    })

    const debugStep = createSpecDebugStep(
      'refinement_loop',
      { currentRound: state.refinementRound },
      { presentedQuestion: nextQuestion.question },
      Date.now() - startTime
    )

    return {
      messages: [responseMessage],
      specRoute: 'clarify',
      debug: {
        ...state.debug,
        steps: [debugStep],
      },
    }
  }

  // All questions answered
  const debugStep = createSpecDebugStep(
    'refinement_loop',
    { totalDecisions: state.decisions.length },
    { complete: true },
    Date.now() - startTime
  )

  return {
    specRoute: 'generate_blueprints',
    debug: {
      ...state.debug,
      steps: [debugStep],
    },
  }
}

/**
 * Blueprint Generation Node
 *
 * Generates 4 visual blueprint variations based on the
 * specification and user decisions.
 */
const blueprintGenerationNode: GraphNode<typeof SpecStateSchema> = async (state) => {
  const startTime = Date.now()

  // TODO: Call image generation API for 4 variations
  // For now, return placeholder URLs
  const blueprints = [
    { url: '/placeholder/blueprint-1.png', prompt: 'Minimal design with clean lines' },
    { url: '/placeholder/blueprint-2.png', prompt: 'Organic curves with soft edges' },
    { url: '/placeholder/blueprint-3.png', prompt: 'Industrial look with exposed elements' },
    { url: '/placeholder/blueprint-4.png', prompt: 'Compact form factor' },
  ]

  const responseMessage = new AIMessage({
    id: crypto.randomUUID(),
    content: `I've generated 4 design variations for your project. Please select the one you prefer, or provide feedback for regeneration.`,
  })

  const debugStep = createSpecDebugStep(
    'blueprint_generation',
    { decisions: state.decisions },
    { blueprintCount: blueprints.length },
    Date.now() - startTime
  )

  return {
    messages: [responseMessage],
    blueprints,
    specRoute: 'finalize',
    debug: {
      ...state.debug,
      steps: [debugStep],
    },
  }
}

/**
 * Finalization Node
 *
 * Locks the specification once a blueprint is selected.
 * Generates the final spec document with all details.
 */
const finalizationNode: GraphNode<typeof SpecStateSchema> = async (state) => {
  const startTime = Date.now()

  // Check if blueprint is selected
  if (state.selectedBlueprint === null) {
    const debugStep = createSpecDebugStep(
      'finalization',
      { selectedBlueprint: null },
      { waiting: true },
      Date.now() - startTime
    )

    return {
      specRoute: 'finalize',
      debug: {
        ...state.debug,
        steps: [debugStep],
      },
    }
  }

  // TODO: Call LLM to generate final spec from decisions and selected blueprint
  const finalSpec = {
    name: 'Smart Environmental Monitor',
    summary: 'A compact environmental monitoring device with WiFi connectivity.',
    pcbSize: { width: 50.8, height: 38.1, unit: 'mm' as const },
    inputs: [
      { type: 'Temperature/Humidity sensor', count: 1, notes: 'BME280' },
      { type: 'Light sensor', count: 1, notes: 'VEML7700' },
    ],
    outputs: [
      { type: 'OLED display', count: 1, notes: '0.96" 128x64' },
      { type: 'Status LED', count: 1, notes: 'WS2812B' },
    ],
    power: {
      source: 'LiPo battery with USB-C charging',
      voltage: '3.3V',
      current: '150mA average',
      batteryLife: '~24 hours on 1000mAh',
    },
    communication: { type: 'WiFi', protocol: 'HTTP/MQTT' },
    enclosure: { style: 'Minimal box', width: 60, height: 45, depth: 25 },
    estimatedBOM: [
      { item: 'ESP32-C6 module', quantity: 1, unitCost: 5.0 },
      { item: 'BME280 sensor', quantity: 1, unitCost: 3.0 },
      { item: 'OLED display', quantity: 1, unitCost: 4.0 },
    ],
    locked: true,
    lockedAt: new Date().toISOString(),
  }

  const responseMessage = new AIMessage({
    id: crypto.randomUUID(),
    content: `Specification locked! Your "${finalSpec.name}" is ready for the next stage.\n\nSummary: ${finalSpec.summary}`,
  })

  const debugStep = createSpecDebugStep(
    'finalization',
    { selectedBlueprint: state.selectedBlueprint, decisions: state.decisions },
    { finalSpec: { name: finalSpec.name, locked: true } },
    Date.now() - startTime
  )

  return {
    messages: [responseMessage],
    finalSpec,
    specRoute: 'complete',
    debug: {
      ...state.debug,
      steps: [debugStep],
    },
  }
}

// =============================================================================
// Routing Functions
// =============================================================================

/**
 * Route after feasibility check
 */
function routeAfterFeasibility(state: SpecState): string {
  if (!didFeasibilityPass(state)) {
    return END
  }
  return 'refinement_loop'
}

/**
 * Route after refinement loop
 */
function routeAfterRefinement(state: SpecState): string {
  // If we need more input from user
  if (state.specRoute === 'clarify' && !state.userFeedback) {
    return END // Wait for user input
  }

  // If refinement is complete, move to blueprints
  if (isRefinementComplete(state) || state.specRoute === 'generate_blueprints') {
    return 'blueprint_generation'
  }

  // Continue refinement
  return 'refinement_loop'
}

/**
 * Route after blueprint generation
 */
function routeAfterBlueprints(state: SpecState): string {
  if (!areBlueprintsReady(state)) {
    return 'blueprint_generation'
  }
  return 'finalization'
}

/**
 * Route after finalization
 */
function routeAfterFinalization(state: SpecState): string {
  if (state.specRoute === 'complete') {
    return END
  }
  // Wait for blueprint selection
  return END
}

// =============================================================================
// Graph Builder
// =============================================================================

/**
 * Create the Spec stage subgraph
 */
export function createSpecGraph() {
  const graph = new StateGraph(SpecStateSchema)
    // Add nodes
    .addNode('feasibility_check', feasibilityCheckNode)
    .addNode('refinement_loop', refinementLoopNode)
    .addNode('blueprint_generation', blueprintGenerationNode)
    .addNode('finalization', finalizationNode)

    // Entry point
    .addEdge(START, 'feasibility_check')

    // Conditional routing
    .addConditionalEdges('feasibility_check', routeAfterFeasibility, {
      refinement_loop: 'refinement_loop',
      [END]: END,
    })
    .addConditionalEdges('refinement_loop', routeAfterRefinement, {
      refinement_loop: 'refinement_loop',
      blueprint_generation: 'blueprint_generation',
      [END]: END,
    })
    .addConditionalEdges('blueprint_generation', routeAfterBlueprints, {
      blueprint_generation: 'blueprint_generation',
      finalization: 'finalization',
    })
    .addConditionalEdges('finalization', routeAfterFinalization, {
      [END]: END,
    })

  return graph
}

/**
 * Compile the Spec subgraph
 */
export function compileSpecGraph() {
  return createSpecGraph().compile()
}

// Export node names for visualization
export const SPEC_NODES = [
  'feasibility_check',
  'refinement_loop',
  'blueprint_generation',
  'finalization',
] as const

export type SpecNodeName = (typeof SPEC_NODES)[number]
