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
import './blueprint'
import './enclosure-text'
import './enclosure-validation'
import './enclosure-fix'
import './enclosure-vision'
import './enclosure-regenerate'
import './enclosure-visual-compare'
import './firmware-generate'
import './firmware-modify'
// import './export-bom'  // TODO: If needed

// Re-export specific nodes for direct use
export { adminTestNode } from './admin-test'
export { feasibilityNode } from './feasibility'
export { refinementNode } from './refinement'
export { finalizationNode } from './finalization'
export { blueprintNode } from './blueprint'
export { enclosureTextNode } from './enclosure-text'
export { enclosureValidationNode } from './enclosure-validation'
export { enclosureFixNode } from './enclosure-fix'
export { enclosureVisionNode } from './enclosure-vision'
export { enclosureRegenerateNode } from './enclosure-regenerate'
export { enclosureVisualCompareNode } from './enclosure-visual-compare'
export { firmwareGenerateNode } from './firmware-generate'
export { firmwareModifyNode } from './firmware-modify'
