/**
 * Type declarations for KiCanvas web component
 * @see https://kicanvas.org
 */

import 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'kicanvas-embed': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string
          controls?: 'none' | 'basic' | 'full'
          theme?: 'kicad' | 'dark'
          zoom?: string
        },
        HTMLElement
      >
    }
  }
}
