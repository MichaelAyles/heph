/**
 * PreviewPanel - 3D STL preview panel with comparison trigger
 */

import { Box, Download, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { STLViewer } from './STLViewer'
import type { PreviewPanelProps } from './types'

export function PreviewPanel({
  stlBlobUrl,
  stlData,
  stlViewerRef,
  isRendering,
  renderError,
  hasBlueprint,
  isVisualValidating,
  onDownload,
  onPerformVisualValidation,
}: PreviewPanelProps) {
  return (
    <div className="bg-surface-900 rounded-lg border border-surface-700 flex flex-col min-h-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-700 flex items-center justify-between">
        <h3 className="text-sm font-medium text-steel">3D Preview</h3>
        <div className="flex items-center gap-2">
          {stlData && hasBlueprint && (
            <button
              onClick={onPerformVisualValidation}
              disabled={isVisualValidating}
              className="text-xs text-steel hover:text-copper flex items-center gap-1"
              title="Compare render to blueprint"
            >
              {isVisualValidating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              Compare
            </button>
          )}
          {stlData && (
            <button
              onClick={onDownload}
              className="text-xs text-copper hover:text-copper-light flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              Download STL
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {stlBlobUrl || stlData ? (
          <STLViewer
            ref={stlViewerRef}
            src={stlBlobUrl || undefined}
            data={stlData || undefined}
            className="w-full h-full"
            color="#8B7355"
            showGrid={true}
            autoRotate={false}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center h-full">
            <div className="text-center">
              <Box className="w-12 h-12 text-surface-600 mx-auto mb-3" strokeWidth={1} />
              <p className="text-steel-dim text-sm mb-2">
                {isRendering ? 'Rendering...' : 'Click "Render" to generate 3D preview'}
              </p>
              {renderError && (
                <p className="text-red-400 text-xs mt-2">
                  <XCircle className="w-3 h-3 inline-block mr-1" />
                  {renderError}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
