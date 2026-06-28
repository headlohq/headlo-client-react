import ReactDOM from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import App from './App'

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
