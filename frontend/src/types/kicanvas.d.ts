/**
 * Type declarations for KiCanvas web component
 * @see https://github.com/MichaelAyles/kicanvas (forked with content attribute support)
 */

import 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'kicanvas-embed': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          /** URL to load KiCAD files from */
          src?: string
          /** Raw KiCAD S-expression content (full documents or fragments) */
          content?: string
          /** Control level: none, basic, or full */
          controls?: 'none' | 'basic' | 'full'
          /** Theme: kicad (light) or dark */
          theme?: 'kicad' | 'dark'
          /** Zoom: 'objects', 'page', or custom value */
          zoom?: string
          /** Hide focus overlay when set to 'nooverlay' */
          controlslist?: string
        },
        HTMLElement
      >
    }
  }
}
