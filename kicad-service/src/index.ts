import express, { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import { processKicadFiles, validateKicadFile } from './processor'
import { ErrorResponse, SuccessResponse } from './types'
import { unlinkSync, existsSync } from 'fs'

const app = express()
const PORT = process.env.PORT || 3000
const INTERNAL_TOKEN = process.env.SERVICE_AUTH_TOKEN

function isAuthorizedInternalRequest(req: Request): boolean {
  if (!INTERNAL_TOKEN) {
    // Only allow bypass in development; fail closed in production.
    if (process.env.NODE_ENV === 'production') return false
    console.warn('SERVICE_AUTH_TOKEN is unset — allowing request (non-production)')
    return true
  }

  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return false

  const token = auth.slice('Bearer '.length).trim()
  return token === INTERNAL_TOKEN
}

// Configure multer for file uploads
const upload = multer({
  dest: '/tmp/uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
    files: 2, // Max 2 files (schematic + pcb)
  },
  fileFilter: (req, file, cb) => {
    // Accept only KiCad files
    const validExtensions = ['.kicad_sch', '.kicad_pcb']
    const hasValidExt = validExtensions.some((ext) =>
      file.originalname.toLowerCase().endsWith(ext)
    )
    if (hasValidExt) {
      cb(null, true)
    } else {
      cb(new Error(`Invalid file type: ${file.originalname}. Expected .kicad_sch or .kicad_pcb`))
    }
  },
})

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`)
  })
  next()
})

// JSON parsing
app.use(express.json())

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  })
})

app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/health') {
    next()
    return
  }

  if (!isAuthorizedInternalRequest(req)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  next()
})

// Process KiCad files endpoint
app.post(
  '/process',
  upload.fields([
    { name: 'schematic', maxCount: 1 },
    { name: 'pcb', maxCount: 1 },
  ]),
  async (req: Request, res: Response) => {
    const uploadedFiles: string[] = []

    try {
      const files = req.files as { [key: string]: Express.Multer.File[] } | undefined

      if (!files) {
        const response: ErrorResponse = { error: 'No files uploaded' }
        return res.status(400).json(response)
      }

      const schematic = files.schematic?.[0]
      const pcb = files.pcb?.[0]

      if (!schematic) {
        const response: ErrorResponse = {
          error: 'Missing schematic file',
          details: 'Please upload a .kicad_sch file',
        }
        return res.status(400).json(response)
      }

      if (!pcb) {
        const response: ErrorResponse = {
          error: 'Missing PCB file',
          details: 'Please upload a .kicad_pcb file',
        }
        return res.status(400).json(response)
      }

      // Track uploaded files for cleanup
      uploadedFiles.push(schematic.path, pcb.path)

      // Validate files
      if (!validateKicadFile(schematic.path, 'schematic')) {
        const response: ErrorResponse = {
          error: 'Invalid schematic file',
          details: 'The uploaded file does not appear to be a valid KiCad schematic',
        }
        return res.status(400).json(response)
      }

      if (!validateKicadFile(pcb.path, 'pcb')) {
        const response: ErrorResponse = {
          error: 'Invalid PCB file',
          details: 'The uploaded file does not appear to be a valid KiCad PCB',
        }
        return res.status(400).json(response)
      }

      console.log(
        `Processing files: ${schematic.originalname}, ${pcb.originalname}`
      )

      // Process files
      const result = await processKicadFiles(schematic.path, pcb.path)

      const response: SuccessResponse = {
        success: true,
        files: {
          gerbers: result.gerbersZipBase64,
          step: result.stepBase64,
          pos: result.posBase64,
        },
      }

      console.log('Processing complete')
      res.json(response)
    } catch (error) {
      console.error('Processing error:', error)

      const response: ErrorResponse = {
        error: error instanceof Error ? error.message : 'Processing failed',
        details: 'See server logs for diagnostics',
      }

      res.status(500).json(response)
    } finally {
      // Cleanup uploaded files
      for (const filePath of uploadedFiles) {
        try {
          if (existsSync(filePath)) {
            unlinkSync(filePath)
          }
        } catch (e) {
          console.error(`Failed to cleanup file ${filePath}:`, e)
        }
      }
    }
  }
)

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err)

  if (err instanceof multer.MulterError) {
    const response: ErrorResponse = {
      error: 'File upload error',
      details: err.message,
    }
    return res.status(400).json(response)
  }

  const response: ErrorResponse = {
    error: err.message || 'Internal server error',
  }
  res.status(500).json(response)
})

// 404 handler
app.use((req: Request, res: Response) => {
  const response: ErrorResponse = {
    error: 'Not found',
    details: `No route found for ${req.method} ${req.path}`,
  }
  res.status(404).json(response)
})

// Start server
app.listen(PORT, () => {
  console.log(`KiCad service running on port ${PORT}`)
  console.log(`Health check: http://localhost:${PORT}/health`)
  console.log(`Process endpoint: POST http://localhost:${PORT}/process`)
})
