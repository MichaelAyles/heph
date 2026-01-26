/**
 * Firmware components for firmware stage
 */

export { BuildPanel } from './BuildPanel'
export type { CompileResult } from './BuildPanel'
export { EditorPanel } from './EditorPanel'
export { FileTreeItem } from './FileTreeItem'
export { FileTreePanel } from './FileTreePanel'
export { FirmwareHeader } from './FirmwareHeader'
export { FooterActions } from './FooterActions'
export { NotReadyState } from './NotReadyState'

export type { FileNode, UploadedBinary } from './types'
export { STARTER_TEMPLATE } from './types'

export {
  flattenFiles,
  buildFileTree,
  findNode,
  updateFileContent,
  getFilesForSave,
  generateReadme,
} from './utils'
