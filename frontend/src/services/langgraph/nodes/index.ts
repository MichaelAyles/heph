/**
 * LangGraph Nodes
 *
 * Standalone, independently-invocable nodes for all LLM calls.
 * Each node can be invoked via POST /api/langgraph/invoke/:nodeName
 */

// Types and registry
export * from './types'
export * from './registry'

// Import all nodes to trigger registration
import './admin-test'
import './feasibility'
import './refinement'
import './finalization'
// import './blueprint'  // TODO: Image generation node
import './enclosure-text'
import './enclosure-validation'
import './enclosure-fix'
// import './enclosure-vision'  // TODO: Multimodal node
// import './enclosure-regenerate'  // TODO
// import './enclosure-visual-compare'  // TODO: Multimodal node
import './firmware-generate'
import './firmware-modify'
// import './export-bom'  // TODO

// Re-export specific nodes for direct use
export { adminTestNode } from './admin-test'
export { feasibilityNode } from './feasibility'
export { refinementNode } from './refinement'
export { finalizationNode } from './finalization'
export { enclosureTextNode } from './enclosure-text'
export { enclosureValidationNode } from './enclosure-validation'
export { enclosureFixNode } from './enclosure-fix'
export { firmwareGenerateNode } from './firmware-generate'
export { firmwareModifyNode } from './firmware-modify'
