/**
 * PlatformIO Compile Service
 *
 * Accepts PlatformIO project files and compiles them for ESP32.
 * Returns the compiled .bin firmware file.
 */

import express from 'express'
import multer from 'multer'
import { compileFirmware, CompileResult } from './compiler'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'

const app = express()
const PORT = process.env.PORT || 3000

// Multer config for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(os.tmpdir(), 'pio-uploads', Date.now().toString())
    await fs.mkdir(uploadDir, { recursive: true })
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max per file
})

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'platformio-compile',
    timestamp: new Date().toISOString(),
  })
})

// Compile endpoint - accepts JSON with file contents
app.post('/compile', express.json({ limit: '10mb' }), async (req, res) => {
  const startTime = Date.now()

  try {
    const { files, board, framework } = req.body as {
      files: Array<{ path: string; content: string }>
      board?: string
      framework?: string
    }

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files provided. Expected { files: [{ path, content }] }',
      })
    }

    // Validate required files
    const hasPlatformioIni = files.some((f) => f.path === 'platformio.ini')
    const hasMainCpp = files.some(
      (f) => f.path === 'src/main.cpp' || f.path === 'main.cpp'
    )

    if (!hasPlatformioIni && !board) {
      return res.status(400).json({
        success: false,
        error: 'Missing platformio.ini. Either provide it or specify board/framework.',
      })
    }

    if (!hasMainCpp) {
      return res.status(400).json({
        success: false,
        error: 'Missing src/main.cpp or main.cpp',
      })
    }

    console.log(`Compiling firmware with ${files.length} files...`)

    const result: CompileResult = await compileFirmware({
      files,
      board: board || 'esp32-c6-devkitc-1',
      framework: framework || 'arduino',
    })

    const duration = Date.now() - startTime
    console.log(`Compilation ${result.success ? 'succeeded' : 'failed'} in ${duration}ms`)

    if (result.success && result.firmware) {
      res.json({
        success: true,
        firmware: result.firmware.toString('base64'),
        firmwareSize: result.firmware.length,
        buildOutput: result.buildOutput,
        duration,
      })
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Compilation failed',
        buildOutput: result.buildOutput,
        duration,
      })
    }
  } catch (error) {
    const duration = Date.now() - startTime
    console.error('Compilation error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      duration,
    })
  }
})

// Multipart upload endpoint (alternative for large files)
app.post('/compile-upload', upload.array('files', 20), async (req, res) => {
  const startTime = Date.now()
  let uploadDir: string | null = null

  try {
    const uploadedFiles = req.files as Express.Multer.File[]
    if (!uploadedFiles || uploadedFiles.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded',
      })
    }

    // Read uploaded files
    const files: Array<{ path: string; content: string }> = await Promise.all(
      uploadedFiles.map(async (f) => ({
        path: f.originalname,
        content: await fs.readFile(f.path, 'utf-8'),
      }))
    )

    // Track upload directory for guaranteed cleanup
    uploadDir = path.dirname(uploadedFiles[0].path)

    const board = (req.body.board as string) || 'esp32-c6-devkitc-1'
    const framework = (req.body.framework as string) || 'arduino'

    console.log(`Compiling firmware (upload) with ${files.length} files...`)

    const result = await compileFirmware({ files, board, framework })

    const duration = Date.now() - startTime
    console.log(`Compilation ${result.success ? 'succeeded' : 'failed'} in ${duration}ms`)

    if (result.success && result.firmware) {
      res.json({
        success: true,
        firmware: result.firmware.toString('base64'),
        firmwareSize: result.firmware.length,
        buildOutput: result.buildOutput,
        duration,
      })
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Compilation failed',
        buildOutput: result.buildOutput,
        duration,
      })
    }
  } catch (error) {
    const duration = Date.now() - startTime
    console.error('Compilation error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      duration,
    })
  } finally {
    if (uploadDir) {
      await fs.rm(uploadDir, { recursive: true, force: true }).catch(() => {})
    }
  }
})

// Get supported boards
app.get('/boards', (req, res) => {
  res.json({
    supported: [
      {
        id: 'esp32-c6-devkitc-1',
        name: 'ESP32-C6 DevKit',
        description: 'ESP32-C6 development board (default)',
      },
      {
        id: 'seeed_xiao_esp32c6',
        name: 'Seeed XIAO ESP32-C6',
        description: 'Compact ESP32-C6 board',
      },
      {
        id: 'esp32dev',
        name: 'ESP32 Dev Module',
        description: 'Generic ESP32 board',
      },
      {
        id: 'esp32-s3-devkitc-1',
        name: 'ESP32-S3 DevKit',
        description: 'ESP32-S3 development board',
      },
    ],
    default: 'esp32-c6-devkitc-1',
  })
})

app.listen(PORT, () => {
  console.log(`PlatformIO compile service running on port ${PORT}`)
  console.log(`Health check: http://localhost:${PORT}/health`)
  console.log(`Compile: POST http://localhost:${PORT}/compile`)
})
