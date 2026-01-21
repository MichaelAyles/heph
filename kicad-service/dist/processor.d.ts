import { ProcessResult, ExportOptions } from './types';
/**
 * Process KiCad schematic and PCB files to generate manufacturing outputs
 */
export declare function processKicadFiles(schPath: string, pcbPath: string, options?: ExportOptions): Promise<ProcessResult>;
/**
 * Validate that a file is a valid KiCad file
 */
export declare function validateKicadFile(filePath: string, type: 'schematic' | 'pcb'): boolean;
//# sourceMappingURL=processor.d.ts.map