declare module 'esptool-js' {
  export interface LoaderOptions {
    transport: Transport
    baudrate: number
    romBaudrate: number
    terminal: {
      clean: () => void
      writeLine: (data: string) => void
      write: (data: string) => void
    }
    debugLogging: boolean
  }

  export interface FlashOptions {
    fileArray: Array<{ data: string; address: number }>
    flashSize: string
    flashMode: string
    flashFreq: string
    eraseAll: boolean
    compress: boolean
    reportProgress: (fileIndex: number, written: number, total: number) => void
    calculateMD5Hash: (image: string) => string
  }

  export class Transport {
    constructor(port: unknown, debug?: boolean)
    disconnect(): Promise<void>
  }

  export class ESPLoader {
    constructor(options: LoaderOptions)
    main(): Promise<string>
    writeFlash(options: FlashOptions): Promise<void>
    after(): Promise<void>
  }
}
