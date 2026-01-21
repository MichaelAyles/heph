/**
 * Result from processing KiCad files
 */
export interface ProcessResult {
  /** Base64-encoded ZIP of Gerber files */
  gerbersZipBase64: string
  /** Base64-encoded STEP file */
  stepBase64: string
  /** Base64-encoded pick and place CSV */
  posBase64: string
}

/**
 * Error response from the service
 */
export interface ErrorResponse {
  error: string
  details?: string
}

/**
 * Success response from the service
 */
export interface SuccessResponse {
  success: true
  files: {
    gerbers: string
    step: string
    pos: string
  }
}

/**
 * KiCad CLI export options
 */
export interface ExportOptions {
  /** Layers to export for gerbers */
  layers?: string[]
  /** Output format for drill files */
  drillFormat?: 'excellon' | 'gerber'
  /** Units for position file */
  posUnits?: 'mm' | 'in'
}

/**
 * Default export options
 */
export const DEFAULT_EXPORT_OPTIONS: Required<ExportOptions> = {
  layers: [
    'F.Cu',
    'B.Cu',
    'In1.Cu',
    'In2.Cu',
    'F.SilkS',
    'B.SilkS',
    'F.Mask',
    'B.Mask',
    'Edge.Cuts',
  ],
  drillFormat: 'excellon',
  posUnits: 'mm',
}
