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

// Action-binding attributes accepted by the migrated ask-chat widget.
// `on-ask` / `on-reset` values are composite `<slug>:<version>:<action>`
// strings resolved into bound functions by the PROP action resolver
// before the widget renders. All other attributes are widget-config
// strings — same shape as the legacy HeadloAskWidgetProps.
interface HeadloAskChatProps extends HeadloAskWidgetProps {
  'on-ask'?:   string
  'on-reset'?: string
}

// Cap-expert widget — walks a buyer through a Capture Protocol (CAP) via
// action-binding to the cap-expert service.
interface CapExpertWidgetProps {
  capId?:    string
  'cap-id'?: string
  'on-ask'?: string
}

// Headlo-pricing-table — Wave 11 drop-in pricing page. Auto-fetches active
// plans for the pk's agency, opens Stripe Checkout on merchant Connect
// account when a buyer clicks Subscribe.
interface HeadloPricingTableProps {
  'prop-key'?:                      string
  'new-subscription-redirect-url'?: string
  'cancel-redirect-url'?:           string
  layout?:                          'default' | 'compact'
}

// Headlo-init — declarative config setter. Sets window.__headlo_prop_key +
// window.__headlo_api_url from these attributes so downstream widgets on
// the same page share one publishable key + one API base URL.
interface HeadloInitProps {
  publishableKey?:    string
  'publishable-key'?: string
  apiUrl?:            string
  'api-url'?:         string
}

// Headlo-service-config — per-service runtime config setter. `service` is
// required (`slug:version`); every other attribute is sprayed into
// window.__headlo_service_config[service] for the target service's client_js
// to read. Signature is intentionally open (`[key: string]: string`) because
// the accepted attributes vary per service — refer to each service's docs.
interface HeadloServiceConfigProps {
  service?: string
  [key: string]: string | undefined
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'headlo-auth-button':  HeadloAuthButtonProps
      'headlo-ask-widget':   HeadloAskWidgetProps
      'headlo-ask-chat':     HeadloAskChatProps
      'cap-expert-widget':     CapExpertWidgetProps
      'headlo-init':           HeadloInitProps
      'headlo-service-config': HeadloServiceConfigProps
      'headlo-pricing-table':  HeadloPricingTableProps
    }
  }
}

export {}
