// Ambient JSX types for Headlo PROP custom elements mounted in this app.
// Extend this list when you mount new PROP components — one entry per tag.
// Consumers of the SDK have to declare these locally because tsup-bundled
// module augmentations don't reliably propagate through `jsx: "react-jsx"`.

import type { HTMLAttributes } from 'react'

// React 19 puts JSX at React.JSX (inside `declare module 'react'`).
// `jsx: "react-jsx"` in tsconfig resolves IntrinsicElements through this
// namespace, NOT the global one.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'headlo-auth-button': HTMLAttributes<HTMLElement> & {
        'return-url'?: string
      }
    }
  }
}

export {}
