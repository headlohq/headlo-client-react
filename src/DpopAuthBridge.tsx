import React from 'react'
import { useHeadloAuth, dpopFetch, getExistingKeyPair } from 'headlo-auth'
import { HeadloAuthProvider } from 'headlo-react'

// ABS Phase A.5.3 — bridge that plumbs the V2 DPoP key + access token into
// headlo-react's data hooks via HeadloAuthProvider's `authFetch` prop.
//
// Any useCollection / useRecord call inside this subtree automatically sends
// `Authorization: Bearer <token>` + `DPoP: <fresh proof>` on every request,
// satisfying the Phase A.5.1 middleware enforcement branch without the hook
// consumer needing to know anything about DPoP.
//
// Falls back to plain fetch (no DPoP header) if the keypair or token isn't
// available yet — e.g., during the initial sign-in redirect before the
// session is fully hydrated.
//
// Usage:
//   <HeadloProviderV2 ...>
//     <DpopAuthBridge>
//       <YourApp />
//     </DpopAuthBridge>
//   </HeadloProviderV2>
export function DpopAuthBridge({ children }: { children: React.ReactNode }) {
  const { getToken } = useHeadloAuth()

  const authFetch = React.useCallback(async (url: string, init?: RequestInit): Promise<Response> => {
    const token = await getToken()
    const kp    = await getExistingKeyPair()
    if (!kp || !token) return fetch(url, init)
    return dpopFetch(url, {
      ...init,
      keyPair:     kp,
      accessToken: token,
      method:      (init?.method ?? 'GET').toUpperCase(),
    })
  }, [getToken])

  return <HeadloAuthProvider getToken={getToken} authFetch={authFetch}>{children}</HeadloAuthProvider>
}
