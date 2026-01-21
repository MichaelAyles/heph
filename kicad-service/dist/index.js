"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const processor_1 = require("./processor");
const fs_1 = require("fs");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Configure multer for file uploads
const upload = (0, multer_1.default)({
    dest: '/tmp/uploads/',
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max file size
        files: 2, // Max 2 files (schematic + pcb)
    },
    fileFilter: (req, file, cb) => {
        // Accept only KiCad files
        const validExtensions = ['.kicad_sch', '.kicad_pcb'];
        const hasValidExt = validExtensions.some((ext) => file.originalname.toLowerCase().endsWith(ext));
        if (hasValidExt) {
            cb(null, true);
        }
        else {
            cb(new Error(`Invalid file type: ${file.originalname}. Expected .kicad_sch or .kicad_pcb`));
        }
    },
});
// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
    });
    next();
});
// JSON parsing
app.use(express_1.default.json());
// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
    });
});
// Process KiCad files endpoint
app.post('/process', upload.fields([
    { name: 'schematic', maxCount: 1 },
    { name: 'pcb', maxCount: 1 },
]), async (req, res) => {
    const uploadedFiles = [];
    try {
        const files = req.files;
        if (!files) {
            const response = { error: 'No files uploaded' };
            return res.status(400).json(response);
        }
        const schematic = files.schematic?.[0];
        const pcb = files.pcb?.[0];
        if (!schematic) {
            const response = {
                error: 'Missing schematic file',
                details: 'Please upload a .kicad_sch file',
            };
            return res.status(400).json(response);
        }
        if (!pcb) {
            const response = {
                error: 'Missing PCB file',
                details: 'Please upload a .kicad_pcb file',
            };
            return res.status(400).json(response);
        }
        // Track uploaded files for cleanup
        uploadedFiles.push(schematic.path, pcb.path);
        // Validate files
        if (!(0, processor_1.validateKicadFile)(schematic.path, 'schematic')) {
            const response = {
                error: 'Invalid schematic file',
                details: 'The uploaded file does not appear to be a valid KiCad schematic',
            };
            return res.status(400).json(response);
        }
        if (!(0, processor_1.validateKicadFile)(pcb.path, 'pcb')) {
            const response = {
                error: 'Invalid PCB file',
                details: 'The uploaded file does not appear to be a valid KiCad PCB',
            };
            return res.status(400).json(response);
        }
        console.log(`Processing files: ${schematic.originalname}, ${pcb.originalname}`);
        // Process files
        const result = await (0, processor_1.processKicadFiles)(schematic.path, pcb.path);
        const response = {
            success: true,
            files: {
                gerbers: result.gerbersZipBase64,
                step: result.stepBase64,
                pos: result.posBase64,
            },
        };
        console.log('Processing complete');
        res.json(response);
    }
    catch (error) {
        console.error('Processing error:', error);
        const response = {
            error: error instanceof Error ? error.message : 'Processing failed',
            details: error instanceof Error && error.stack
                ? error.stack.split('\n').slice(0, 3).join('\n')
                : undefined,
        };
        res.status(500).json(response);
    }
    finally {
        // Cleanup uploaded files
        for (const filePath of uploadedFiles) {
            try {
                if ((0, fs_1.existsSync)(filePath)) {
                    (0, fs_1.unlinkSync)(filePath);
                }
            }
            catch (e) {
                console.error(`Failed to cleanup file ${filePath}:`, e);
            }
        }
    }
});
// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    if (err instanceof multer_1.default.MulterError) {
        const response = {
            error: 'File upload error',
            details: err.message,
        };
        return res.status(400).json(response);
    }
    const response = {
        error: err.message || 'Internal server error',
    };
    res.status(500).json(response);
});
// 404 handler
app.use((req, res) => {
    const response = {
        error: 'Not found',
        details: `No route found for ${req.method} ${req.path}`,
    };
    res.status(404).json(response);
});
// Start server
app.listen(PORT, () => {
    console.log(`KiCad service running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Process endpoint: POST http://localhost:${PORT}/process`);
});
//# sourceMappingURL=index.js.map