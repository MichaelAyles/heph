/**
 * Type declarations for occt-import-js
 * WASM-based OpenCASCADE STEP file loader
 * @see https://github.com/nicola/occt-import-js
 */

declare module 'occt-import-js' {
  interface OcctMesh {
    name: string
    color: number[]
    brep_faces: unknown[]
    attributes: {
      position: {
        array: Float32Array
      }
      normal?: {
        array: Float32Array
      }
    }
    index?: {
      array: Uint32Array
    }
  }

  interface OcctResult {
    success: boolean
    root: {
      name: string
      meshes: number[]
      children: unknown[]
    }
    meshes: OcctMesh[]
  }

  interface OcctInstance {
    ReadStepFile: (fileContent: Uint8Array, fileExtension: string | null) => OcctResult
  }

  function occtimportjs(): Promise<OcctInstance>

  export default occtimportjs
}
