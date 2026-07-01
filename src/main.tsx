import ReactDOM from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import App from './App'

// Build marker — bump on every real change so you can tell at a glance
// whether the deployed bundle matches your latest edit. If you don't see
// this line in the console, `deploy-prod.bat` didn't actually ship new code.
const APP_VERSION = 'layout-shift-4-skeleton'
console.log(`%c[headlo-client-react]%c 📦 App build: ${APP_VERSION}`, 'color:#0f6e56;font-weight:bold', 'color:inherit')

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string

// PROP component bundles (e.g. <headlo-auth-button>) read these two globals
// at runtime. Setting them here so any page in this app picks up the local
// dev worker + this site's publishable key automatically — no per-page wiring.
;(window as any).__headlo_prop_key    = import.meta.env.VITE_HEADLO_PUBLISHABLE_KEY
;(window as any).__headlo_auth_issuer = import.meta.env.VITE_HEADLO_AUTH_ISSUER

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ClerkProvider publishableKey={clerkKey}>
    <App />
  </ClerkProvider>
)
