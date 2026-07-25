import ReactDOM from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import App from './App'

// Build marker — bump on every real change so you can tell at a glance
// whether the deployed bundle matches your latest edit. If you don't see
// this line in the console, `deploy-prod.bat` didn't actually ship new code.
const APP_VERSION = 'def-contract-1'
console.log(`%c[headlo-client-react]%c 📦 App build: ${APP_VERSION}`, 'color:#0f6e56;font-weight:bold', 'color:inherit')

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string

// Flat globals used ONLY by PROP service stubs (llm-chat, etc.) — stubs are
// not custom elements and can't accept HTML attributes, so they read config
// from window at fetch time. PROP COMPONENTS (auth-button, ask-widget) read
// their config from HTML attributes on the tag — see below where PropCard.tsx
// passes prop-key on <headlo-auth-button>. Attributes-only design.
;(window as any).__headlo_prop_key = import.meta.env.VITE_HEADLO_PUBLISHABLE_KEY
;(window as any).__headlo_api_url  = import.meta.env.VITE_HEADLO_API_URL

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ClerkProvider publishableKey={clerkKey}>
    <App />
  </ClerkProvider>
)
