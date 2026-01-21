"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processKicadFiles = processKicadFiles;
exports.validateKicadFile = validateKicadFile;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
const jszip_1 = __importDefault(require("jszip"));
const types_1 = require("./types");
/**
 * Process KiCad schematic and PCB files to generate manufacturing outputs
 */
async function processKicadFiles(schPath, pcbPath, options = {}) {
    const opts = { ...types_1.DEFAULT_EXPORT_OPTIONS, ...options };
    // Create temporary working directory
    const workDir = (0, fs_1.mkdtempSync)((0, path_1.join)((0, os_1.tmpdir)(), 'kicad-'));
    const outDir = (0, path_1.join)(workDir, 'out');
    (0, fs_1.mkdirSync)(outDir, { recursive: true });
    // Copy input files to work directory with proper names
    const workPcbPath = (0, path_1.join)(workDir, 'board.kicad_pcb');
    const workSchPath = (0, path_1.join)(workDir, 'board.kicad_sch');
    (0, fs_1.copyFileSync)(pcbPath, workPcbPath);
    (0, fs_1.copyFileSync)(schPath, workSchPath);
    try {
        // Export Gerbers
        console.log('Exporting Gerbers...');
        exportGerbers(workPcbPath, outDir, opts.layers);
        // Export drill files
        console.log('Exporting drill files...');
        exportDrill(workPcbPath, outDir, opts.drillFormat);
        // Export pick and place
        console.log('Exporting pick and place...');
        const posPath = (0, path_1.join)(outDir, 'positions.csv');
        exportPos(workPcbPath, posPath, opts.posUnits);
        // Export STEP model
        console.log('Exporting STEP model...');
        const stepPath = (0, path_1.join)(outDir, 'model.step');
        exportStep(workPcbPath, stepPath);
        // Create gerbers ZIP
        console.log('Creating gerbers ZIP...');
        const gerbersZip = await createGerbersZip(outDir);
        // Read generated files
        const stepContent = (0, fs_1.existsSync)(stepPath)
            ? (0, fs_1.readFileSync)(stepPath).toString('base64')
            : '';
        const posContent = (0, fs_1.existsSync)(posPath)
            ? (0, fs_1.readFileSync)(posPath).toString('base64')
            : '';
        return {
            gerbersZipBase64: gerbersZip,
            stepBase64: stepContent,
            posBase64: posContent,
        };
    }
    finally {
        // Cleanup
        try {
            (0, fs_1.rmSync)(workDir, { recursive: true, force: true });
        }
        catch (e) {
            console.error('Failed to cleanup work directory:', e);
        }
    }
}
/**
 * Export Gerber files for all specified layers
 */
function exportGerbers(pcbPath, outDir, layers) {
    const layerArg = layers.join(',');
    try {
        (0, child_process_1.execSync)(`kicad-cli pcb export gerbers \
        --output "${outDir}/" \
        --layers "${layerArg}" \
        --use-drill-file-origin \
        "${pcbPath}"`, {
            stdio: 'pipe',
            timeout: 60000, // 60 second timeout
        });
    }
    catch (error) {
        const err = error;
        const stderr = err.stderr?.toString() || err.message || 'Unknown error';
        throw new Error(`Gerber export failed: ${stderr}`);
    }
}
/**
 * Export drill files in Excellon or Gerber format
 */
function exportDrill(pcbPath, outDir, format) {
    try {
        (0, child_process_1.execSync)(`kicad-cli pcb export drill \
        --output "${outDir}/" \
        --format ${format} \
        --excellon-units mm \
        "${pcbPath}"`, {
            stdio: 'pipe',
            timeout: 60000,
        });
    }
    catch (error) {
        const err = error;
        const stderr = err.stderr?.toString() || err.message || 'Unknown error';
        throw new Error(`Drill export failed: ${stderr}`);
    }
}
/**
 * Export pick and place file
 */
function exportPos(pcbPath, outPath, units) {
    try {
        (0, child_process_1.execSync)(`kicad-cli pcb export pos \
        --output "${outPath}" \
        --format csv \
        --units ${units} \
        --side both \
        "${pcbPath}"`, {
            stdio: 'pipe',
            timeout: 60000,
        });
    }
    catch (error) {
        const err = error;
        const stderr = err.stderr?.toString() || err.message || 'Unknown error';
        // Position export may fail if no components - this is non-fatal
        console.warn(`Position export warning: ${stderr}`);
    }
}
/**
 * Export STEP 3D model
 */
function exportStep(pcbPath, outPath) {
    try {
        (0, child_process_1.execSync)(`kicad-cli pcb export step \
        --output "${outPath}" \
        --subst-models \
        "${pcbPath}"`, {
            stdio: 'pipe',
            timeout: 120000, // 2 minute timeout for STEP (can be slow)
        });
    }
    catch (error) {
        const err = error;
        const stderr = err.stderr?.toString() || err.message || 'Unknown error';
        // STEP export may fail if 3D models missing - this is non-fatal
        console.warn(`STEP export warning: ${stderr}`);
    }
}
/**
 * Create a ZIP file containing all Gerber and drill files
 */
async function createGerbersZip(outDir) {
    const zip = new jszip_1.default();
    const files = (0, fs_1.readdirSync)(outDir);
    const gerberExtensions = [
        '.gbr',
        '.gtl',
        '.gbl',
        '.gts',
        '.gbs',
        '.gto',
        '.gbo',
        '.gtp',
        '.gbp',
        '.gm1',
        '.gm2',
        '.gko',
        '.drl',
        '.xln',
    ];
    for (const file of files) {
        const ext = file.toLowerCase().slice(file.lastIndexOf('.'));
        if (gerberExtensions.includes(ext) || file.includes('-')) {
            // Include files with gerber extensions or KiCad's naming convention
            const filePath = (0, path_1.join)(outDir, file);
            zip.file(file, (0, fs_1.readFileSync)(filePath));
        }
    }
    return zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
}
/**
 * Validate that a file is a valid KiCad file
 */
function validateKicadFile(filePath, type) {
    if (!(0, fs_1.existsSync)(filePath)) {
        return false;
    }
    const content = (0, fs_1.readFileSync)(filePath, 'utf-8').slice(0, 1000);
    if (type === 'schematic') {
        return content.includes('kicad_sch') || content.includes('(sheet');
    }
    else {
        return content.includes('kicad_pcb') || content.includes('(board');
    }
}
//# sourceMappingURL=processor.js.map