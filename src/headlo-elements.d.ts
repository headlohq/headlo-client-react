// Local JSX augmentation for Headlo PROP custom elements.
//
// The prop-type SHAPES (which attributes each tag accepts) come from the
// SDK — imported below. Only the JSX namespace augmentation is duplicated
// here because tsup-bundled augmentations targeting `react/jsx-runtime`
// don't reliably propagate through `jsx: "react-jsx"` + `moduleResolution:
// "bundler"` in the consuming app.
//
// When the SDK adds a new attribute to an existing tag → nothing to update
// here. Rebuild the SDK, this file picks it up via the imported type.
//
// When the SDK adds a whole new custom element → add one line below for
// the new tag → the JSX entry. Its shape still comes from the SDK.

import type {
  HeadloAuthButtonProps,
  HeadloAskWidgetProps,
} from 'headlo-react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'headlo-auth-button': HeadloAuthButtonProps
      'headlo-ask-widget':  HeadloAskWidgetProps
    }
  }
}

export {}
