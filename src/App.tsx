import { HeadloProvider, useAuth as useHeadloAuth } from 'headlo-auth'
import { useAuth as useClerkAuth } from '@clerk/clerk-react'
import { PropServer, PropPreload, SiteProvider, MultiAuthBridge } from 'headlo-react'
import React from 'react'

import Landing from './Landing'
import Onboarding from './Onboarding'
import Dashboard from './Dashboard'
import TestPage from './TestPage'
import ClerkLanding from './ClerkLanding'
import ClerkDashboard from './ClerkDashboard'
import MultiAuthDashboard from './MultiAuthDashboard'
import MultiAuthOnboarding from './MultiAuthOnboarding'

const authIssuer     = import.meta.env.VITE_HEADLO_AUTH_ISSUER     as string
const publishableKey = import.meta.env.VITE_HEADLO_PUBLISHABLE_KEY as string
const apiUrl         = import.meta.env.VITE_HEADLO_API_URL         as string
const anonKey        = import.meta.env.VITE_HEADLO_ANON_KEY        as string | undefined

export default function App() {
  const path = window.location.pathname

  // Clerk variant — uses the ClerkProvider mounted in main.tsx
  if (path.startsWith('/clerk')) {
    return path === '/clerk' || path === '/clerk/'
      ? <ClerkLanding />
      : <ClerkDashboard />
  }

  // headlo-auth variant — Router runs inside the provider so it can read auth state.
  // MultiAuthBridge sits between HeadloProvider and PropServer so that data hooks
  // (useCollection, useRecord, useList) automatically pick up a token from whichever
  // auth provider is currently active — headlo-auth wins by priority, Clerk is fallback.
  return (
    <HeadloProvider
      publishableKey={publishableKey}
      issuer={authIssuer}
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
    >
      <AppMultiAuthBridge>
        <SiteProvider anonKey={anonKey} apiUrl={apiUrl}>
          <PropServer publishableKey={publishableKey} url={apiUrl}>
            <PropPreload
              dist={[{ runtime: 'react', version: '19' }]}
              components={['headlo-auth-button']}
            />
            <HeadloRouter />
          </PropServer>
        </SiteProvider>
      </AppMultiAuthBridge>
    </HeadloProvider>
  )
}

// AppMultiAuthBridge — adapts headlo-auth + Clerk hooks into the SDK's
// generic <MultiAuthBridge sources={...}> primitive. Priority headlo > clerk.
//
// Usage downstream is now zero-arg (anonKey from SiteProvider, getToken from
// this bridge via HeadloAuthContext, both via React context):
//
//   const { records } = useCollection('posts')
//
// Explicit args still work and take priority if passed.
function AppMultiAuthBridge({ children }: { children: React.ReactNode }) {
  const headlo = useHeadloAuth()
  const clerk  = useClerkAuth()
  return (
    <MultiAuthBridge
      sources={[
        { name: 'headlo', isLoaded: headlo.isLoaded, isSignedIn: headlo.isSignedIn, getToken: () => headlo.getToken() },
        { name: 'clerk',  isLoaded: clerk.isLoaded,  isSignedIn: !!clerk.isSignedIn, getToken: async () => clerk.getToken() },
      ]}
    >
      {children}
    </MultiAuthBridge>
  )
}

// Routes inside the headlo-auth provider tree.
// /dashboard is protected — must be signed in or we redirect to /onboarding.
function HeadloRouter() {
  const { isLoaded, isSignedIn } = useHeadloAuth()
  const path = window.location.pathname

  // Protected route: /dashboard
  if (path.startsWith('/dashboard')) {
    if (!isLoaded) {
      // Wait for auth state to resolve before deciding. Avoids flashing
      // the dashboard to a logged-out user (or vice versa).
      return (
        <div style={loadingStyle}>
          <span style={{ opacity: 0.5 }}>Loading…</span>
        </div>
      )
    }
    if (!isSignedIn) {
      // Redirect to onboarding. window.location.replace doesn't add to history,
      // so the back button skips this state.
      window.location.replace('/onboarding')
      return null
    }
    return <Dashboard />
  }

  // Multi-auth migration demo — accepts headlo-auth OR Clerk, headlo wins
  if (path.startsWith('/multiauth/dashboard'))   return <MultiAuthDashboard />
  if (path.startsWith('/multiauth/onboarding') || path === '/multiauth' || path === '/multiauth/') return <MultiAuthOnboarding />

  // Public routes
  if (path.startsWith('/onboarding')) return <Onboarding />
  if (path.startsWith('/test'))       return <TestPage />
  return <Landing />
}

const loadingStyle: React.CSSProperties = {
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'center',
  minHeight:      '100vh',
  fontFamily:     '-apple-system, sans-serif',
  fontSize:       14,
  color:          '#8a8a80',
  background:     '#faf9f6',
}
