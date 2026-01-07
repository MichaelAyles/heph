/**
 * Files Stage View
 *
 * Virtual file tree showing all project artifacts with preview capabilities.
 */

import { useWorkspaceContext } from '@/components/workspace/WorkspaceLayout'
import { ProjectFileManager } from '@/components/workspace/ProjectFileManager'
import { FolderOpen } from 'lucide-react'

export function FilesStageView() {
  const { project } = useWorkspaceContext()
  const spec = project?.spec

  // Need spec to have any files
  if (!spec) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-surface-800 flex items-center justify-center mx-auto mb-4">
            <FolderOpen className="w-8 h-8 text-surface-500" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-semibold text-steel mb-2">Project Files</h2>
          <p className="text-steel-dim mb-4">
            Complete the spec stage to view project files. Files will be generated as you progress
            through each stage of the design pipeline.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="px-6 py-4 border-b border-surface-700">
        <h2 className="text-xl font-semibold text-steel mb-1">Project Files</h2>
        <p className="text-steel-dim text-sm">
          Browse all project artifacts organized by stage
        </p>
      </div>

      {/* File Manager */}
      <ProjectFileManager
        spec={spec}
        projectName={project?.name ?? 'project'}
        projectId={project?.id ?? ''}
        className="flex-1"
      />
    </div>
  )
}

export default FilesStageView
