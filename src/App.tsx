import { ClerkProvider } from '@clerk/clerk-react'
import { HeadloProvider } from 'headlo-auth'
import { PropServer, PropPreload } from 'headlo-react'

import Landing from './Landing'
import TestPage from './TestPage'
import ClerkLanding from './ClerkLanding'
import ClerkDashboard from './ClerkDashboard'

const authIssuer = import.meta.env.VITE_HEADLO_AUTH_ISSUER     as string
const authKey    = import.meta.env.VITE_HEADLO_AUTH_KEY        as string
const propKey    = import.meta.env.VITE_HEADLO_PUBLISHABLE_KEY as string
const propUrl    = import.meta.env.VITE_HEADLO_API_URL         as string
const clerkKey   = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY  as string

export default function App() {
  const path = window.location.pathname

  // Clerk variant — /clerk/*
  // Isolated provider tree so the Clerk SDK only loads on these routes.
  if (path.startsWith('/clerk')) {
    return (
      <ClerkProvider publishableKey={clerkKey}>
        {path === '/clerk' || path === '/clerk/'
          ? <ClerkLanding />
          : <ClerkDashboard />}
      </ClerkProvider>
    )
  }

  // headlo-auth variant — everything else
  return (
    <HeadloProvider
      publishableKey={authKey}
      issuer={authIssuer}
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
    >
      <PropServer publishableKey={propKey} url={propUrl}>
        <PropPreload
          dist={[{ runtime: 'react', version: '19' }]}
          components={['headlo-auth-button']}
        />
        {path.startsWith('/test') || path.startsWith('/dashboard')
          ? <TestPage />
          : <Landing />}
      </PropServer>
    </HeadloProvider>
  )
}
