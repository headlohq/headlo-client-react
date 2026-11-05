import { HeadloProviderV1, useAuth as useHeadloAuth } from 'headlo-auth'
import { useAuth as useClerkAuth } from '@clerk/clerk-react'
import { PropServer, SiteProvider, MultiAuthBridge } from 'headlo-react'
import React from 'react'

import Landing from './Landing'
import Onboarding from './Onboarding'
import Dashboard from './Dashboard'
import TestPage from './TestPage'
import AskWidgetDemo from './AskWidgetDemo'
import AskWidgetView from './AskWidgetView'
import AskChatView   from './AskChatView'
import CapExpertView from './CapExpertView'
import PricingDebugView from './PricingDebugView'
import ServicesDebugView from './ServicesDebugView'
import CmsComponentsDemo from './CmsComponentsDemo'
import CmsComponentsDemoV2 from './CmsComponentsDemoV2'
import AskWidgetDemoV2 from './AskWidgetDemoV2'
import PropComponentsDemo from './PropComponentsDemo'
import ClerkLanding from './ClerkLanding'
import ClerkDashboard from './ClerkDashboard'
import MultiAuthDashboard from './MultiAuthDashboard'
import MultiAuthOnboarding from './MultiAuthOnboarding'
import AbsSpikePage from './AbsSpikePage'
import AbsTestPage from './AbsTestPage'
import PropAuthV2Demo from './PropAuthV2Demo'
import ScopeTestPage from './ScopeTestPage'
import ScopeDataTestPage from './ScopeDataTestPage'
import CapJsonView from './CapJsonView'

const authIssuer     = import.meta.env.VITE_HEADLO_AUTH_ISSUER     as string
const publishableKey = import.meta.env.VITE_HEADLO_PUBLISHABLE_KEY as string
const apiUrl         = import.meta.env.VITE_HEADLO_API_URL         as string
const anonKey        = import.meta.env.VITE_HEADLO_ANON_KEY        as string | undefined

export default function App() {
  const path = window.location.pathname

  // ABS spike — standalone route with zero auth surface. Verifies browser
  // primitives (WebCrypto extractable:false, IndexedDB CryptoKey persistence,
  // DPoP-style sign roundtrip, performance) required by the Anchor-Bound
  // Session design before we start building it. See:
  //   claude/headlo-auth-abs-build-sequencing.md — 11 known gaps this test covers
  //   claude/headlo-auth-anchor-bound-session.md — the design being validated
  if (path.startsWith('/abs-spike')) return <AbsSpikePage />

  // ABS Phase A end-to-end test — HeadloProviderV1V2 (DPoP + cookie-less).
  // Bypasses the root <HeadloProviderV1> v1 so the two providers don't conflict.
  // Test flow + spec in claude/headlo-auth-abs-phase0-spec.md.
  if (path.startsWith('/abs-test')) return <AbsTestPage />

  // Scope enforcement smoke test — verifies the token-exchange → verify → requireScope loop.
  // See claude/headlo-widget-scope-enforcement.md § 4 Steps 1-6.
  // ORDER MATTERS: /scope-data-test must match before /scope-test since both
  // paths start with `/scope-`.
  if (path.startsWith('/scope-data-test')) return <ScopeDataTestPage />
  if (path.startsWith('/scope-test'))      return <ScopeTestPage />

  // CAP JSON inspector — GET /v1/plugin/cap/:cap_id with Clerk auth. Uses
  // ClerkProvider from main.tsx directly, no headlo-auth surface needed.
  if (path.startsWith('/cap-json')) return <CapJsonView />

  // PROP-service-only v2 demo — no React provider, entire auth surface driven
  // by window.__headlo_service_headlo_auth_v2 loaded via <script>. Proves the
  // framework-agnostic path used by vanilla HTML pages and non-React frameworks.
  if (path.startsWith('/demo/prop-auth-v2')) return <PropAuthV2Demo />

  // Clerk variant — uses the ClerkProvider mounted in main.tsx
  if (path.startsWith('/clerk')) {
    return path === '/clerk' || path === '/clerk/'
      ? <ClerkLanding />
      : <ClerkDashboard />
  }

  // headlo-auth variant — Router runs inside the provider so it can read auth state.
  // MultiAuthBridge sits between HeadloProviderV1 and PropServer so that data hooks
  // (useCollection, useRecord, useList) automatically pick up a token from whichever
  // auth provider is currently active — headlo-auth wins by priority, Clerk is fallback.
  return (
    <HeadloProviderV1
      publishableKey={publishableKey}
      issuer={authIssuer}
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
    >
      <AppMultiAuthBridge>
        <SiteProvider anonKey={anonKey} apiUrl={apiUrl}>
          <PropServer publishableKey={publishableKey} url={apiUrl}>
            {/* PropPreload used to live here for headlo-auth-button + headlo-ask-widget.
               Removed — the app-level preload injected <link rel="preload"> on every
               route including ones that don't render those widgets, triggering
               "preloaded but not used" console warnings. Individual page components
               that render those widgets rely on useComponent() to fetch on mount
               (cached after first load), so overall perf is unchanged. If a specific
               page needs faster first paint, add <PropPreload> INSIDE that page
               component, not at the app root. */}
            <HeadloRouter />
          </PropServer>
        </SiteProvider>
      </AppMultiAuthBridge>
    </HeadloProviderV1>
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
  if (path.startsWith('/onboarding'))     return <Onboarding />
  if (path.startsWith('/test'))           return <TestPage />
  if (path.startsWith('/demo/auth-v2/askwidget')) return <AskWidgetDemoV2 />
  if (path.startsWith('/demo/askwidget')) return <AskWidgetDemo />
  if (path.startsWith('/demo/auth-v2/cms-components')) return <CmsComponentsDemoV2 />
  if (path.startsWith('/demo/cms-components')) return <CmsComponentsDemo />
  if (path.startsWith('/demo/prop-components')) return <PropComponentsDemo />
  if (path.startsWith('/view/askwidget'))         return <AskWidgetView />
  if (path.startsWith('/view/askchat'))           return <AskChatView />
  if (path.startsWith('/view/cap-expert-widget')) return <CapExpertView />
  if (path.startsWith('/pricing-debug'))          return <PricingDebugView />
  if (path.startsWith('/services-debug'))         return <ServicesDebugView />
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
