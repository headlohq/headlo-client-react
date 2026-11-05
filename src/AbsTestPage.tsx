import React from 'react'
import { HeadloProviderV2, useHeadloAuth, useHeadloUser as useUser, SignInButton, SignOutButton, SignedIn, SignedOut, dpopFetch, getOrCreateKeyPair, getExistingKeyPair, signDpopProof, exportPublicJwk, computeJwkThumbprint, discoverSession, readCachedProfile, writeCachedProfile, clearCachedProfile, signInViaPopup, readStoredPkceVerifier, clearStoredPkceState, exchangeAuthCodeDpop, ContinueAsModal, GoogleOneTap, HeadloAppleSignIn, AuthMenu, AuthMenuSignInButton, AuthMenuSignUpButton, decodePublishableKey, encodePublishableKey, PopupBlockedError, UserClosedPopupError, PopupTimeoutError, AuthServerError, type DiscoverResult, type SignInPopupResult, type AuthAction } from 'headlo-auth'
import { DpopAuthBridge } from './DpopAuthBridge'
import { resolveSharedPk, setSharedPk, clearSharedPk, SHARED_PK_LS_KEY } from './lib/shared-pk'

// ABS Phase A end-to-end test page.
//
// Uses HeadloProviderV2 (DPoP + cookie-less) instead of the root HeadloProvider (v1
// cookie-based). Route bypasses the root provider entirely — this page has its own
// V2 provider tree.
//
// Test flow:
//   1. Load /abs-test — should show signed-out UI (unless previously signed in)
//   2. Click Sign in → PKCE redirect to auth.headlo.com → back to /abs-test
//   3. Should now be signed in. Check DevTools:
//      - Application → Session Storage → headlo_auth_v2_token (JWT with cnf.jkt)
//      - Application → IndexedDB → headlo_auth_v2 → dpop_keys → session_key (CryptoKeyPair)
//      - NO refresh cookie for auth.headlo.com (v2 doesn't use cookies)
//   4. Reload page — session persists via silent refresh (POST /oauth/token/refresh-dpop)
//   5. Close tab, reopen — same, session persists via sessionStorage + IndexedDB
//   6. Try in Safari iOS on customer bare domain (pages.dev) — should NOT lose session
//      the way v1 does (this is the whole point of ABS)
//   7. Click Sign out → session cleared, DPoP key deleted from IndexedDB

const authIssuer     = import.meta.env.VITE_HEADLO_AUTH_ISSUER     as string

// Publishable key resolution shared across all debug pages via lib/shared-pk.
// Precedence: ?pk=pk_live_... URL param > shared LS (headlo:pk-override)
// > VITE_HEADLO_PUBLISHABLE_KEY env var.
//
// IMPORTANT: HeadloProviderV2 keys DPoP registration by (jkt, azp). Changing
// the pk here means a new sign-in session — the existing DPoP key registered
// against the previous pk won't mint fresh tokens under the new pk (that's
// the DPOP_KEY_WRONG_PK failure mode). Sign out + sign in fresh after
// switching pks.
const _pkResolved = resolveSharedPk()
const publishableKey       = _pkResolved.pk
const publishableKeySource = _pkResolved.source === 'empty' ? 'env' : _pkResolved.source

// Wave 4 B.6 test harness — when `?omit_issuer=1` is in the URL, we DO NOT
// pass the `issuer` prop to HeadloProviderV2 / ContinueAsModal / GoogleOneTap.
// Proves the SDK can derive the issuer from an encoded pk alone (i.e. a
// merchant can delete `VITE_HEADLO_AUTH_ISSUER` from their .env and still
// work). Resolved at module scope because flipping it must remount the whole
// provider tree, which only reload-boundary accomplishes cleanly.
const omitIssuerProp = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('omit_issuer') === '1'

export default function AbsTestPage() {
  return (
    <HeadloProviderV2
      publishableKey={publishableKey}
      {...(omitIssuerProp ? {} : { issuer: authIssuer })}
      signInFallbackRedirectUrl="/abs-test"
      signUpFallbackRedirectUrl="/abs-test"
    >
      <DpopAuthBridge>
        <AbsTestPageInner />
      </DpopAuthBridge>
    </HeadloProviderV2>
  )
}

// DpopAuthBridge now lives in ./DpopAuthBridge.tsx so it can be shared with
// other V2 demo routes. See that file for the full pattern + comments.

function AbsTestPageInner() {
  const { isLoaded, isSignedIn, getToken, signOut } = useHeadloAuth()
  const user = useUser()

  // OAuth code-exchange window indicator. Between the redirect back
  // (?code=... in URL) and isSignedIn flipping true, the page would
  // otherwise show a blank signed-out state — confusing because it
  // looks like the sign-in silently failed. Show "Signing you in…"
  // during that window. Cleared once isSignedIn becomes true, or after
  // a 20s safety timeout if the exchange never completes.
  const [returningFromOAuth, setReturningFromOAuth] = React.useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('code'),
  )
  React.useEffect(() => {
    if (!returningFromOAuth) return
    if (isSignedIn) { setReturningFromOAuth(false); return }
    const t = window.setTimeout(() => setReturningFromOAuth(false), 20_000)
    return () => window.clearTimeout(t)
  }, [returningFromOAuth, isSignedIn])
  const showSigningIn = returningFromOAuth && !isSignedIn

  const [tokenDetails, setTokenDetails] = React.useState<{
    raw?:      string
    payload?:  Record<string, unknown>
    error?:    string
  }>({})

  const [storageState, setStorageState] = React.useState<{
    sessionToken:    string | null
    cachedUser:      string | null
    hasIdbDpopKey:   boolean | 'unknown'
    refreshCookie:   string | null
  }>({
    sessionToken:  null,
    cachedUser:    null,
    hasIdbDpopKey: 'unknown',
    refreshCookie: null,
  })

  async function inspectToken() {
    try {
      const t = await getToken()
      if (!t) { setTokenDetails({ error: 'No token available' }); return }
      const [, payloadB64] = t.split('.')
      const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')))
      setTokenDetails({ raw: t, payload })
    } catch (e) {
      setTokenDetails({ error: String(e) })
    }
  }

  async function inspectStorage() {
    // sessionStorage
    const sessionToken = sessionStorage.getItem('headlo_auth_v2_token')
    const cachedUser   = localStorage.getItem('headlo_auth_user')
    // document.cookie won't show HttpOnly cookies (headlo_refresh is HttpOnly)
    // — we can only check for its absence at the "visible cookies" layer.
    const refreshCookie = document.cookie.includes('headlo_refresh') ? '<visible cookie present>' : null
    // IndexedDB DPoP key check
    let hasIdbDpopKey: boolean | 'unknown' = 'unknown'
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('headlo_auth_v2', 1)
        req.onsuccess = () => resolve(req.result)
        req.onerror   = () => reject(req.error)
      })
      const tx = db.transaction('dpop_keys', 'readonly')
      const req = tx.objectStore('dpop_keys').get('session_key')
      hasIdbDpopKey = await new Promise<boolean>((resolve) => {
        req.onsuccess = () => resolve(!!req.result)
        req.onerror   = () => resolve(false)
      })
    } catch {
      hasIdbDpopKey = false
    }

    setStorageState({ sessionToken, cachedUser, hasIdbDpopKey, refreshCookie })
  }

  async function clearAllLocal() {
    try { sessionStorage.removeItem('headlo_auth_v2_token') } catch {}
    try { localStorage.removeItem('headlo_auth_user') } catch {}
    try {
      const req = indexedDB.deleteDatabase('headlo_auth_v2')
      await new Promise<void>((resolve) => { req.onsuccess = () => resolve(); req.onerror = () => resolve() })
    } catch {}
    location.reload()
  }

  // Full reset — signs out via the SDK (which fires /oauth/dpop/revoke to kill
  // the server-side DPoP session), then also POSTs /oauth/signout to expire
  // any lingering v1-style HttpOnly refresh cookie for the auth server. After
  // that wipes ALL client-side auth state (sessionStorage token, cached user,
  // PKCE verifier, IndexedDB DPoP DB) and reloads. Result: next Sign In click
  // must go through the full OAuth flow — no auto-reauth from surviving cookies.
  // Note: this does NOT clear Google's own SSO session at accounts.google.com;
  // if Google auto-picks the account, that's Google's cookie, out of our reach.
  // Open an incognito window if you need a truly clean-slate test.
  async function signOutAndClear() {
    try { await signOut() } catch {}
    try {
      await fetch(`${authIssuer}/oauth/signout`, {
        method:      'POST',
        credentials: 'include',
      })
    } catch {}
    try { sessionStorage.removeItem('headlo_auth_v2_token') } catch {}
    try { localStorage.removeItem('headlo_auth_user') } catch {}
    try { localStorage.removeItem('headlo_auth_v2_verifier') } catch {}
    try {
      const req = indexedDB.deleteDatabase('headlo_auth_v2')
      await new Promise<void>((resolve) => { req.onsuccess = () => resolve(); req.onerror = () => resolve() })
    } catch {}
    location.reload()
  }

  // ABS Phase A.5.1 — enforcement test. Fires a request against a real
  // /v1/editor/* endpoint two ways as numbered steps:
  //   Step 1: Bearer-only    → expects 401 dpop_dpop_missing when flag ON
  //   Step 2: Bearer + DPoP  → expects 200 (or 403 no_headlo_membership if the
  //                            user's headlo_auth_sub isn't linked to an agency)
  //
  // UI modeled on /admin/api/cap (AdminCapExplorer) — numbered steps with
  // color-coded status, request/response inline, per-step Run button, copy-
  // curl option below each step.
  //
  // Server-side enforcement plan: claude/headlo-auth-abs-phase-a5-api-enforcement.md
  const apiUrl = import.meta.env.VITE_HEADLO_API_URL as string
  const testPath = '/v1/editor/prop/components'
  const testUrl = apiUrl + testPath

  type StepStatus = 'idle' | 'running' | 'ok' | 'error'
  interface StepState {
    status:       StepStatus
    headers?:     Record<string, string>   // headers actually sent (with masking)
    response?:    { status: number; body: string }
    durationMs?:  number
    proof?:       string                    // populated for step 2 — used for curl copy
    error?:       string
  }

  const [steps, setSteps] = React.useState<{
    bearer?:            StepState
    dpop?:              StepState
    // SSO Wave 1 — three steps covering /oauth/me/graph + /oauth/signout-all
    // + post-signout refresh (verifies SESSION_REVOKED fires correctly).
    meGraph?:           StepState
    signoutAll?:        StepState
    postRevokeRefresh?: StepState
  }>({})
  const [runningAll,     setRunningAll]     = React.useState(false)
  const [runningWave1,   setRunningWave1]   = React.useState(false)
  const [copyState,      setCopyState]      = React.useState<Record<string, boolean>>({})

  type WaveStepId = 'meGraph' | 'signoutAll' | 'postRevokeRefresh'
  type StepId     = 'bearer' | 'dpop' | WaveStepId

  function updateStep(id: StepId, patch: Partial<StepState>) {
    setSteps(prev => ({ ...prev, [id]: { ...(prev[id] ?? { status: 'idle' }), ...patch } }))
  }

  function maskToken(t: string): string {
    return t.length > 30 ? `${t.slice(0, 20)}…${t.slice(-8)}` : t
  }

  async function runBearer() {
    updateStep('bearer', { status: 'running', response: undefined, error: undefined })
    const t0 = Date.now()
    try {
      const token = await getToken()
      if (!token) { updateStep('bearer', { status: 'error', error: 'No access token — sign in first' }); return }
      const headers = { Authorization: `Bearer ${maskToken(token)}` }
      const r = await fetch(testUrl, { headers: { Authorization: `Bearer ${token}` } })
      const body = await r.text()
      let pretty = body
      try { pretty = JSON.stringify(JSON.parse(body), null, 2) } catch {}
      updateStep('bearer', {
        status: r.ok ? 'ok' : 'error',
        headers, response: { status: r.status, body: pretty.slice(0, 2000) }, durationMs: Date.now() - t0,
      })
    } catch (e) {
      updateStep('bearer', { status: 'error', error: String(e), durationMs: Date.now() - t0 })
    }
  }

  async function runDpop() {
    updateStep('dpop', { status: 'running', response: undefined, error: undefined })
    const t0 = Date.now()
    try {
      const token = await getToken()
      if (!token) { updateStep('dpop', { status: 'error', error: 'No access token — sign in first' }); return }
      const kp = await getExistingKeyPair()
      if (!kp) { updateStep('dpop', { status: 'error', error: 'No DPoP keypair in IndexedDB — sign in first' }); return }
      const proof = await signDpopProof(kp, { url: testUrl, method: 'GET' })
      const headers = {
        Authorization: `Bearer ${maskToken(token)}`,
        DPoP:          `${proof.slice(0, 40)}…`,
      }
      const r = await fetch(testUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, DPoP: proof },
      })
      const body = await r.text()
      let pretty = body
      try { pretty = JSON.stringify(JSON.parse(body), null, 2) } catch {}
      updateStep('dpop', {
        status: r.ok ? 'ok' : 'error',
        headers, response: { status: r.status, body: pretty.slice(0, 2000) }, durationMs: Date.now() - t0, proof,
      })
    } catch (e) {
      updateStep('dpop', { status: 'error', error: String(e), durationMs: Date.now() - t0 })
    }
  }

  async function runAll() {
    setRunningAll(true)
    await runBearer()
    await runDpop()
    setRunningAll(false)
  }

  // ── SSO Wave 1 — /oauth/me/graph + /oauth/signout-all + post-signout refresh ──
  // Full plan: claude/headlo-sso-shop-equivalent.md § B.1 + B.8.
  //
  // Flow:
  //   Step 1 — GET /oauth/me/graph. Shows the stitched identity:
  //     { headloUserId, email, displayName, sessionEpoch, stepUpRequiredUntil,
  //       merchants: [{ azp, registeredAt, lastUsedAt }] }
  //   Step 2 — POST /oauth/signout-all. Revokes every session + refresh token +
  //     DPoP registration for this user. Sets step_up_required_until = NOW() + 30d
  //     so the next /oauth/authorize demands a fresh IdP consent, not silent SSO.
  //   Step 3 — POST /oauth/token/refresh-dpop with the (now-revoked) access
  //     token + DPoP proof. Expects 401 SESSION_REVOKED — proves that
  //     isUserSignedOutAll's KV lookup fires on the v2 DPoP refresh path.
  //
  // After Step 3 the only recovery is "Sign in" via the main button up top.
  // That next sign-in should land on the login form (not silent SSO) because
  // the step_up_required_until flag suppresses the silent short-circuit until
  // the user re-completes a Google round-trip or a password re-entry.
  const meGraphUrl    = `${apiUrl}/oauth/me/graph`
  const signoutAllUrl = `${apiUrl}/oauth/signout-all`
  const refreshDpopUrl = `${apiUrl}/oauth/token/refresh-dpop`

  async function runMeGraph() {
    updateStep('meGraph', { status: 'running', response: undefined, error: undefined })
    const t0 = Date.now()
    try {
      const token = await getToken()
      if (!token) { updateStep('meGraph', { status: 'error', error: 'No access token — sign in first' }); return }
      const headers = { Authorization: `Bearer ${maskToken(token)}` }
      const r = await fetch(meGraphUrl, { headers: { Authorization: `Bearer ${token}` } })
      const body = await r.text()
      let pretty = body
      try { pretty = JSON.stringify(JSON.parse(body), null, 2) } catch {}
      updateStep('meGraph', {
        status: r.ok ? 'ok' : 'error',
        headers, response: { status: r.status, body: pretty.slice(0, 2000) }, durationMs: Date.now() - t0,
      })
    } catch (e) {
      updateStep('meGraph', { status: 'error', error: String(e), durationMs: Date.now() - t0 })
    }
  }

  async function runSignoutAll() {
    updateStep('signoutAll', { status: 'running', response: undefined, error: undefined })
    const t0 = Date.now()
    try {
      const token = await getToken()
      if (!token) { updateStep('signoutAll', { status: 'error', error: 'No access token — sign in first' }); return }
      const headers = { Authorization: `Bearer ${maskToken(token)}` }
      // credentials:'include' so the response's Set-Cookie clears auth.headlo.com
      // refresh + session cookies in this browser as part of the request.
      const r = await fetch(signoutAllUrl, {
        method:      'POST',
        credentials: 'include',
        headers:     { Authorization: `Bearer ${token}` },
      })
      const body = await r.text()
      let pretty = body
      try { pretty = JSON.stringify(JSON.parse(body), null, 2) } catch {}
      updateStep('signoutAll', {
        status: r.ok ? 'ok' : 'error',
        headers, response: { status: r.status, body: pretty.slice(0, 2000) }, durationMs: Date.now() - t0,
      })
    } catch (e) {
      updateStep('signoutAll', { status: 'error', error: String(e), durationMs: Date.now() - t0 })
    }
  }

  async function runPostRevokeRefresh() {
    updateStep('postRevokeRefresh', { status: 'running', response: undefined, error: undefined })
    const t0 = Date.now()
    try {
      const token = await getToken()
      if (!token) { updateStep('postRevokeRefresh', { status: 'error', error: 'No access token — expected (sign in, then run Step 2)' }); return }
      // Pass the publishable key explicitly so we hit the pk-scoped slot
      // (dpop_keypair:pk_live_...) rather than the legacy slot. V2 Provider
      // stores keys per-pk since the multi-env refactor; the no-arg form
      // only hits the legacy single-slot which is empty for recent sign-ins.
      const kp = await getExistingKeyPair(publishableKey)
      if (!kp) { updateStep('postRevokeRefresh', { status: 'error', error: `No DPoP keypair in IndexedDB for pk ${publishableKey.slice(0, 12)}… — sign in first` }); return }
      const proof = await signDpopProof(kp, { url: refreshDpopUrl, method: 'POST' })
      const headers = {
        Authorization: `Bearer ${maskToken(token)}`,
        DPoP:          `${proof.slice(0, 40)}…`,
      }
      const r = await fetch(refreshDpopUrl, {
        method:      'POST',
        credentials: 'include',
        headers:     { Authorization: `Bearer ${token}`, DPoP: proof, 'Content-Type': 'application/json' },
        body:        JSON.stringify({ client_id: publishableKey }),
      })
      const body = await r.text()
      let pretty = body
      try { pretty = JSON.stringify(JSON.parse(body), null, 2) } catch {}
      // Success criterion inverted here — we EXPECT a 401 with SESSION_REVOKED.
      // Anything else (200, other 4xx, 5xx) means revocation didn't take effect.
      const isExpected = r.status === 401 && body.includes('SESSION_REVOKED')
      updateStep('postRevokeRefresh', {
        status: isExpected ? 'ok' : 'error',
        headers, response: { status: r.status, body: pretty.slice(0, 2000) }, durationMs: Date.now() - t0,
      })
    } catch (e) {
      updateStep('postRevokeRefresh', { status: 'error', error: String(e), durationMs: Date.now() - t0 })
    }
  }

  // ── Wave 2 B.2 — silent discovery state ──────────────────────────────────
  const [discoverResult,     setDiscoverResult]     = React.useState<DiscoverResult | null>(null)
  const [discoverDurationMs, setDiscoverDurationMs] = React.useState<number | null>(null)
  const [runningDiscover,    setRunningDiscover]    = React.useState(false)
  const [cachedProfile,      setCachedProfile]      = React.useState<ReturnType<typeof readCachedProfile>>(null)

  // Snapshot the cache on mount so Phil can see what's persisted BEFORE
  // running a fresh discovery. Re-read after each discovery / clear so the
  // "Cached profile" line stays truthful.
  React.useEffect(() => {
    setCachedProfile(readCachedProfile(publishableKey))
  }, [])

  async function runDiscover() {
    setRunningDiscover(true)
    setDiscoverResult(null)
    setDiscoverDurationMs(null)
    const t0 = Date.now()
    const result = await discoverSession({
      issuer:         authIssuer,
      publishableKey,
    })
    const elapsed = Date.now() - t0
    setDiscoverResult(result)
    setDiscoverDurationMs(elapsed)
    // Mirror server result into localStorage cache so return visits paint
    // instantly without waiting for a round-trip. On "not discovered" we
    // bust the cache — the stale-modal window should self-heal on each check.
    if (result.discovered) writeCachedProfile(publishableKey, result.user)
    else                   clearCachedProfile()
    setCachedProfile(readCachedProfile(publishableKey))
    setRunningDiscover(false)
  }

  function wipeCache() {
    clearCachedProfile()
    setCachedProfile(null)
  }

  // ── Wave 2 B.3 — popup sign-in state ────────────────────────────────────
  interface PopupTestResult {
    kind:        'success' | 'error' | null
    message:     string
    code?:       string
    state?:      string
    verifier?:   string | null
    durationMs?: number
  }
  const [popupResult,     setPopupResult]     = React.useState<PopupTestResult>({ kind: null, message: '' })
  const [runningPopup,    setRunningPopup]    = React.useState(false)
  const [popupLoginHint,  setPopupLoginHint]  = React.useState<string>('')

  // ── Wave 2 B.9 — consent-screen test state ──────────────────────────────
  interface ConsentStatus {
    checked:    boolean
    loading:    boolean
    granted:    boolean | null
    granted_at: string | null
    revoked_at: string | null
    scopes:     string[]
    error:      string | null
  }
  const [consentStatus, setConsentStatus] = React.useState<ConsentStatus>({
    checked: false, loading: false, granted: null, granted_at: null, revoked_at: null, scopes: [], error: null,
  })
  async function runConsentStatus() {
    setConsentStatus(s => ({ ...s, loading: true, error: null }))
    try {
      const res = await fetch(`${authIssuer}/oauth/consent/status?client_id=${encodeURIComponent(publishableKey)}`, { credentials: 'include' })
      if (res.status === 401) {
        setConsentStatus({ checked: true, loading: false, granted: null, granted_at: null, revoked_at: null, scopes: [], error: 'Signed out — sign in with the popup above, then retry.' })
        return
      }
      if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`)
      const data = await res.json() as { granted: boolean; granted_at: string | null; revoked_at: string | null; scopes: string[] }
      setConsentStatus({ checked: true, loading: false, granted: data.granted, granted_at: data.granted_at, revoked_at: data.revoked_at, scopes: data.scopes, error: null })
    } catch (e) {
      setConsentStatus({ checked: true, loading: false, granted: null, granted_at: null, revoked_at: null, scopes: [], error: String((e as Error).message ?? e) })
    }
  }
  async function runConsentClear() {
    setConsentStatus(s => ({ ...s, loading: true, error: null }))
    try {
      const res = await fetch(`${authIssuer}/oauth/consent?client_id=${encodeURIComponent(publishableKey)}`, { method: 'DELETE', credentials: 'include' })
      if (res.status === 401) {
        setConsentStatus(s => ({ ...s, loading: false, error: 'Signed out — sign in with the popup above, then retry.' }))
        return
      }
      if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`)
      await runConsentStatus()
    } catch (e) {
      setConsentStatus(s => ({ ...s, loading: false, error: String((e as Error).message ?? e) }))
    }
  }
  // Soft revoke — mirrors /account page's Revoke button. Sets revoked_at.
  // Grant row stays for audit; refresh handlers treat revoked_at IS NOT NULL
  // as "no grant" and return CONSENT_REVOKED.
  async function runConsentRevoke() {
    setConsentStatus(s => ({ ...s, loading: true, error: null }))
    try {
      const res = await fetch(`${authIssuer}/oauth/consent/revoke?client_id=${encodeURIComponent(publishableKey)}`, { method: 'POST', credentials: 'include' })
      if (res.status === 401) {
        setConsentStatus(s => ({ ...s, loading: false, error: 'Signed out — sign in with the popup above, then retry.' }))
        return
      }
      if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`)
      await runConsentStatus()
    } catch (e) {
      setConsentStatus(s => ({ ...s, loading: false, error: String((e as Error).message ?? e) }))
    }
  }
  // Direct hit on /oauth/token/refresh-dpop — same request the SDK fires
  // periodically. After a revoke, this returns 401 + CONSENT_REVOKED, which
  // in a real app triggers the SDK's auto-sign-out. Here we just surface the
  // raw response so you can see the marker land.
  const [refreshResult, setRefreshResult] = React.useState<{ status: number; body: string; ms: number } | null>(null)
  const [refreshRunning, setRefreshRunning] = React.useState(false)
  async function runRefreshNow() {
    setRefreshRunning(true)
    setRefreshResult(null)
    const t0 = Date.now()
    try {
      const token = await getToken()
      if (!token) throw new Error('No access token — sign in first')
      const kp = await getExistingKeyPair(publishableKey)
      if (!kp) throw new Error(`No DPoP keypair for pk ${publishableKey.slice(0, 12)}…`)
      const url = `${apiUrl}/oauth/token/refresh-dpop`
      const proof = await signDpopProof(kp, { url, method: 'POST' })
      const r = await fetch(url, {
        method: 'POST', credentials: 'include',
        headers: { Authorization: `Bearer ${token}`, DPoP: proof, 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: publishableKey }),
      })
      const body = await r.text()
      let pretty = body
      try { pretty = JSON.stringify(JSON.parse(body), null, 2) } catch {}
      setRefreshResult({ status: r.status, body: pretty.slice(0, 2000), ms: Date.now() - t0 })
    } catch (e) {
      setRefreshResult({ status: 0, body: String((e as Error).message ?? e), ms: Date.now() - t0 })
    } finally {
      setRefreshRunning(false)
    }
  }

  // ── Wave 3 B.4 — ContinueAs modal state ─────────────────────────────────
  // Auto-opens when the URL carries a Wave 5 handshake-return param so the
  // test page shows the handshake result immediately after the 302 bounce
  // instead of requiring the user to re-click Open. In production merchant
  // pages the modal is mounted unconditionally and this gap doesn't exist.
  const [showContinueAsModal, setShowContinueAsModal] = React.useState(() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).has('__headlo_discover_handshake')
  })
  // ── Wave 5 — fallback discovery handshake toggle (default on) ───────────
  const [fallbackHandshake,   setFallbackHandshake]   = React.useState(true)
  // ── Dev-only — force the discovery iframe to fail so the Wave 5 handshake
  //    path becomes observable in Chrome dev (where 3PC isn't blocked).
  const [forceDiscoveryFail,  setForceDiscoveryFail]  = React.useState(false)
  // ── Wave 4 B.10 — Google One Tap mount gate ─────────────────────────────
  const [mountOneTap,         setMountOneTap]         = React.useState(false)
  const [oneTapStatus,        setOneTapStatus]        = React.useState<string>('')

  async function runPopup(opts?: { prompt?: 'none' | 'login'; loginHint?: string }) {
    setRunningPopup(true)
    setPopupResult({ kind: null, message: 'Preparing DPoP key + opening popup…' })
    const t0 = Date.now()
    try {
      // SSO Wave 2 B.3 Option A — pre-bind the auth code to our DPoP key.
      // Generate (or reuse) the per-pk ECDSA P-256 keypair in IndexedDB, send
      // its thumbprint along in the authorize URL as `dpop_jkt` (RFC 9449 § 10),
      // so the subsequent /oauth/token exchange returns a cnf.jkt-bound access
      // token in one round-trip — no follow-up /oauth/dpop/register needed.
      const keyPair = await getOrCreateKeyPair(publishableKey)
      const jwk     = await exportPublicJwk(keyPair)
      const jkt     = await computeJwkThumbprint(jwk)

      const result: SignInPopupResult = await signInViaPopup({
        issuer:         authIssuer,
        publishableKey,
        redirectUri:    window.location.origin,  // merchant origin — must be in pk's allowed_origins
        prompt:         opts?.prompt,
        loginHint:      opts?.loginHint,
        dpopJkt:        jkt,
      })

      const verifier = readStoredPkceVerifier()
      if (!verifier) throw new Error('PKCE verifier missing — session storage cleared mid-flow')

      setPopupResult({ kind: null, message: 'Exchanging code for DPoP-bound token…', code: result.code, state: result.state, verifier, durationMs: Date.now() - t0 })

      const tokenRes = await exchangeAuthCodeDpop({
        issuer:         authIssuer,
        code:           result.code,
        codeVerifier:   verifier,
        redirectUri:    window.location.origin,
        publishableKey,
        dpopKeyPair:    keyPair,
      })

      // Persist token where HeadloProviderV2 looks on mount. storageKey is
      // unset for this provider instance, so the key is the unsuffixed base.
      sessionStorage.setItem('headlo_auth_v2_token', tokenRes.access_token)
      // Decode sub/email/name for the shared user-cache slot so other tabs
      // + the Provider's cross-tab channel can rehydrate without a network
      // round-trip. Mirrors client-v2's setTokenAndUser side-effect.
      // Also refresh the discover-cache (`headlo_user_cache`) so the
      // ContinueAsModal's cached paint on next visit matches reality — without
      // this, signing in as a different account via the popup leaves the
      // discover cache stale and the modal flashes the old name for one
      // iframe round-trip before repainting.
      try {
        const [, payloadB64] = tokenRes.access_token.split('.')
        if (payloadB64) {
          const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: string; email?: string; name?: string }
          if (payload.sub && payload.email) {
            localStorage.setItem('headlo_auth_user', JSON.stringify({ id: payload.sub, email: payload.email, displayName: payload.name ?? null }))
            writeCachedProfile(publishableKey, {
              headloUserId: payload.sub,
              email:        payload.email,
              displayName:  payload.name ?? null,
              avatarUrl:    null,
            })
          }
        }
      } catch { /* non-fatal */ }

      clearStoredPkceState()
      setPopupResult({
        kind:       'success',
        message:    `Signed in. token_type=${tokenRes.token_type}, expires_in=${tokenRes.expires_in}s. Reloading…`,
        code:       result.code,
        state:      result.state,
        verifier,
        durationMs: Date.now() - t0,
      })
      // Give the UI one tick to render success, then reload so the Provider
      // picks up the fresh sessionStorage token on mount.
      setTimeout(() => { window.location.reload() }, 400)
    } catch (e) {
      // Map error class → readable message. The error matrix lives in signInPopup.ts;
      // we surface the class name + message for debugging.
      let msg = String(e)
      if (e instanceof PopupBlockedError)    msg = 'Popup blocked by browser. Enable popups for this site OR fall back to redirect flow.'
      else if (e instanceof UserClosedPopupError) msg = 'You closed the popup before completing sign-in.'
      else if (e instanceof PopupTimeoutError)    msg = 'Popup timed out (no server response within 2 minutes).'
      else if (e instanceof AuthServerError)      msg = `Auth server error: ${e.code}  (login_required = silent-SSO with no session; step_up_required = step-up gate active; DPOP_KEY_MISMATCH = IndexedDB key diverged mid-flow; INVALID_CODE_VERIFIER = PKCE storage wiped)`
      setPopupResult({ kind: 'error', message: msg, durationMs: Date.now() - t0 })
      clearStoredPkceState()
    } finally {
      setRunningPopup(false)
    }
  }

  async function runWave1All() {
    setRunningWave1(true)
    await runMeGraph()
    await runSignoutAll()
    await runPostRevokeRefresh()
    // SSO Wave 1 B.8 close-out shipped — the SDK's silent refresh timer auto-
    // detects SESSION_REVOKED and clears local state. BUT Step 3 above uses a
    // raw fetch (not the SDK's client.dpopFetch) to prove server behavior
    // explicitly, so the SDK itself didn't see the 401 and won't fire the
    // auto-handler. In real merchant code the SDK's heartbeat (refresh timer
    // ~10s before expiry, OR any client.dpopFetch call) picks up SESSION_REVOKED
    // and flips isSignedIn within seconds. We call signOut() here to simulate
    // what the auto-handler would do — makes the test loop demoable in one click
    // instead of waiting for the refresh timer. Fire-and-forget: the signOut
    // network call will 401 (token is revoked), which is fine — the local state
    // wipe happens regardless.
    try { await signOut() } catch { /* expected 401 — token is revoked */ }
    setRunningWave1(false)
  }

  // Build curl commands for a given step. Uses the FULL token from getToken()
  // and (for the dpop variant) the fresh proof stored in step state after run.
  async function copyCurl(kind: 'bearer-sh' | 'bearer-ps' | 'dpop-sh' | 'dpop-ps') {
    try {
      const token = await getToken()
      if (!token) return
      let cmd: string
      if (kind === 'bearer-sh') {
        cmd = `curl -i -H "Authorization: Bearer ${token}" \\\n  ${testUrl}`
      } else if (kind === 'bearer-ps') {
        cmd = `curl.exe -i -H "Authorization: Bearer ${token}" ${testUrl}`
      } else {
        // dpop — need a fresh proof each time (60s validity)
        const kp = await getExistingKeyPair()
        if (!kp) return
        const proof = await signDpopProof(kp, { url: testUrl, method: 'GET' })
        if (kind === 'dpop-sh') {
          cmd = `curl -i \\\n  -H "Authorization: Bearer ${token}" \\\n  -H "DPoP: ${proof}" \\\n  ${testUrl}`
        } else {
          cmd = `curl.exe -i -H "Authorization: Bearer ${token}" -H "DPoP: ${proof}" ${testUrl}`
        }
      }
      await navigator.clipboard.writeText(cmd)
      setCopyState(prev => ({ ...prev, [kind]: true }))
      setTimeout(() => setCopyState(prev => ({ ...prev, [kind]: false })), 1500)
    } catch { /* ignore */ }
  }

  const STATUS_ICON: Record<StepStatus, string> = { idle: '○', running: '◌', ok: '●', error: '✗' }
  const STATUS_COLOR: Record<StepStatus, string> = { idle: '#ccc', running: '#4a6ea8', ok: '#0f6e56', error: '#c0392b' }
  const statusBg = (n: number) => n === 0 ? '#f5f5f0' : n >= 200 && n < 300 ? '#e6f4ea' : '#fdecea'
  const statusColor = (n: number) => n === 0 ? '#444' : n >= 200 && n < 300 ? '#1a4a2a' : '#7a1a10'

  return (
    <div style={s.page}>
      <div style={s.container}>
        {/* Back-to-home link — mirrors the header on /view/cap-expert-widget. */}
        <div style={{ marginBottom: 12 }}>
          <a href="/" style={{ textDecoration: 'none', color: '#1a1a18', fontSize: 13 }}>← Back</a>
        </div>
        {/* Publishable key banner — same pattern as /scope-test and
            /pricing-debug. Shows the pk currently registering DPoP keys +
            minting V2 tokens. Change via ?pk=pk_live_... or Override button.
            NB: switching pk means DPoP-key mismatch until sign-in fresh
            under the new pk. See DPOP_KEY_WRONG_PK diagnostic. */}
        <div style={{ background: '#f5f2eb', border: '1px solid #e0ddd8', borderRadius: 6, padding: '10px 12px', marginBottom: 16, fontSize: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10, fontWeight: 600 }}>
              Publishable key in use on this page
            </div>
            <div style={{
              fontSize: 9, padding: '1px 6px', borderRadius: 3, fontWeight: 600,
              background: publishableKeySource === 'env' ? '#e0ddd8' : '#0f6e56',
              color:      publishableKeySource === 'env' ? '#666' : '#fff',
            }}>
              {publishableKeySource === 'env' ? 'from env (.env)' :
               publishableKeySource === 'url' ? 'from ?pk= URL param' :
               'from localStorage (prior URL override)'}
            </div>
          </div>
          <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, wordBreak: 'break-all', color: '#0f6e56' }}>
            {publishableKey || '(none — VITE_HEADLO_PUBLISHABLE_KEY not set)'}
          </code>
          <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
            {publishableKey && (
              <button
                onClick={() => void navigator.clipboard.writeText(publishableKey)}
                style={{ padding: '2px 8px', fontSize: 10, borderRadius: 3, background: '#fff', border: '1px solid #d8d4cc', cursor: 'pointer' }}
              >
                Copy
              </button>
            )}
            <button
              onClick={() => {
                const next = prompt('Publishable key override for /abs-test (blank = clear + use env)\n\nHeads-up: switching pk mid-session leaves the DPoP key registered against the OLD pk. Sign out + sign in fresh after switching or you\'ll see DPOP_KEY_WRONG_PK.', publishableKeySource === 'env' ? '' : publishableKey)
                if (next === null) return
                const trimmed = next.trim()
                const url = new URL(window.location.href)
                if (trimmed) {
                  url.searchParams.set('pk', trimmed)
                  setSharedPk(trimmed)
                } else {
                  url.searchParams.delete('pk')
                  clearSharedPk()
                }
                window.location.href = url.toString()
              }}
              style={{ padding: '2px 8px', fontSize: 10, borderRadius: 3, background: '#fff', border: '1px solid #d8d4cc', cursor: 'pointer' }}
            >
              {publishableKeySource === 'env' ? 'Override…' : 'Change / clear override'}
            </button>
          </div>
          {publishableKeySource === 'url' && (
            <div style={{ marginTop: 4, fontSize: 10, color: '#666' }}>
              Override saved in localStorage — refresh preserves it without <code style={{ fontFamily: 'ui-monospace, monospace' }}>?pk=</code> in the URL.
            </div>
          )}
          {/* Wave 4 B.6 — decoded pk info. Shows whether the current pk is
              encoded (new) or legacy raw-hex, and what issuer it would derive. */}
          {publishableKey && (() => {
            const decoded = decodePublishableKey(publishableKey)
            return (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #d8d4cc', fontSize: 10, color: '#5a5a55', lineHeight: 1.5 }}>
                <div style={{ fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 9, color: '#5a5a55', marginBottom: 2 }}>
                  Wave 4 B.6 — decode result
                </div>
                <div>
                  <strong>format:</strong>{' '}
                  <span style={{ color: decoded.isEncoded ? '#0f6e56' : '#78350f', fontFamily: 'ui-monospace, monospace' }}>
                    {decoded.isEncoded ? 'encoded (new)' : 'legacy raw-hex (needs explicit issuer)'}
                  </span>
                </div>
                <div><strong>derived issuer:</strong> <code style={{ fontFamily: 'ui-monospace, monospace' }}>{decoded.issuer ?? '(none — SDK falls back to prop/default)'}</code></div>
                <div><strong>keyId:</strong> <code style={{ fontFamily: 'ui-monospace, monospace' }}>{decoded.keyId ?? '(not parseable)'}</code></div>
                {!decoded.isEncoded && (
                  <div style={{ marginTop: 4 }}>
                    <button
                      onClick={() => {
                        try {
                          const host = new URL(authIssuer).host
                          const encoded = encodePublishableKey({ prefix: 'pk_live', hostname: host, keyId: publishableKey.replace(/^pk_(live|test)_/, '').slice(0, 12) || 'testkey00000' })
                          void navigator.clipboard.writeText(encoded)
                          alert(`Encoded preview copied:\n\n${encoded}\n\nNote: this is a client-side-only re-encoding for testing — the server won't find this key in its DB (lookup still uses the full stored pk string). To get a real encoded pk, mint a new one via the dashboard; new pks ship encoded automatically.`)
                        } catch (e) { alert('Preview failed: ' + String(e)) }
                      }}
                      style={{ padding: '2px 8px', fontSize: 10, borderRadius: 3, background: '#fff', border: '1px solid #d8d4cc', cursor: 'pointer' }}
                    >
                      Preview encoded form (for curiosity)
                    </button>
                  </div>
                )}
                {/* Wave 4 B.6 test toggle — strip the explicit `issuer` prop from
                    HeadloProviderV2 / ContinueAsModal / GoogleOneTap so you can
                    verify the pk alone drives the SDK. Toggle requires a page
                    reload because the provider's auth client is created once. */}
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dotted #d8d4cc', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 }}
                    title="When ON, this page remounts WITHOUT passing an `issuer` prop to HeadloProviderV2 / ContinueAsModal / GoogleOneTap. Proves the SDK derives issuer from the pk's embedded hostname alone (merchant can delete VITE_HEADLO_AUTH_ISSUER from .env).">
                    <input type="checkbox" checked={omitIssuerProp} onChange={(e) => {
                      const url = new URL(window.location.href)
                      if (e.target.checked) url.searchParams.set('omit_issuer', '1')
                      else                   url.searchParams.delete('omit_issuer')
                      window.location.href = url.toString()
                    }} />
                    <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>omit_issuer</code>
                    <span style={{ color: '#5a5a55' }}>
                      — pass <code>undefined</code> for the <code>issuer</code> prop everywhere; SDK must derive from pk
                    </span>
                  </label>
                  {omitIssuerProp && (
                    <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, fontWeight: 600, background: '#fde047', color: '#78350f' }}>
                      ACTIVE
                    </span>
                  )}
                </div>
              </div>
            )
          })()}
        </div>

        {showSigningIn && (
          <div style={signingInBanner}>
            <span style={signingInSpinner} />
            <span>Signing you in…</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#666' }}>
              Exchanging OAuth code for a DPoP-bound token
            </span>
          </div>
        )}

        <h1 style={s.h1}>ABS Test — HeadloProviderV2 (DPoP + cookie-less)</h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={waveTag.phaseA}>Phase A — shipped</span>
          <span style={waveTag.a51}>A.5.1 — DPoP enforcement</span>
          <span style={waveTag.wave1}>SSO Wave 1 — B.1 + B.8 + B.8.1</span>
          <span style={waveTag.wave2}>SSO Wave 2 — B.2 + B.3 + Option A</span>
          <span style={waveTag.wave3}>SSO Wave 3 — B.4 "Continue as X"</span>
          <span style={waveTag.date}>Last updated 2026-10-10</span>
        </div>
        <p style={s.lede}>
          Sibling test to <code>/abs-spike</code>. This page uses <strong>HeadloProviderV2</strong>
          {' '}(DPoP-anchored, no refresh cookie) instead of v1. Verifies the end-to-end
          {' '}session flow works on iOS Safari on this third-party domain — the load-bearing
          {' '}claim of ABS Phase A. Scroll down for SSO Wave 1 tests (identity graph, session
          {' '}revocation, step-up auth).
        </p>

        <div style={s.card}>
          <div style={s.cardTitle}>Auth state</div>
          <div style={s.row}><span style={s.label}>isLoaded</span> <code>{String(isLoaded)}</code></div>
          <div style={s.row}><span style={s.label}>isSignedIn</span> <code>{String(isSignedIn)}</code></div>
          <div style={s.row}><span style={s.label}>user.id</span> <code>{user?.id ?? '—'}</code></div>
          <div style={s.row}><span style={s.label}>user.email</span> <code>{user?.email ?? '—'}</code></div>
          <div style={s.row}><span style={s.label}>user.displayName</span> <code>{user?.displayName ?? '—'}</code></div>

          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <SignedOut>
              <SignInButton style={s.btnPrimary}>Sign in with Headlo (v2)</SignInButton>
              {/* forceLogin=true → appends prompt=login to /oauth/authorize
                 so the IdP shows the login form even if headlo_session
                 cookie is valid. Verifies OIDC prompt=login bypass. */}
              <SignInButton
                style={s.btnPrimary}
                forceLogin
                title="Skips silent-SSO — always shows the login form even with a valid IdP session cookie"
              >
                Sign in with Headlo (v2) force
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <SignOutButton style={s.btnDanger}>Sign out</SignOutButton>
              <button
                style={s.btnDanger}
                onClick={() => void signOutAndClear()}
                title="Sign out AND wipe all client storage AND expire the auth server's refresh cookie. Next sign-in must go through the full OAuth flow (no auto-reauth). Google's own SSO session is untouched — use an incognito window for a truly clean-slate test."
              >
                Sign out &amp; clear
              </button>
              {/* Wave 4 B.8/B.8.1 UI — jump to the hosted account page on
                  auth.headlo.com. Opens in a new tab because that page lives
                  on the auth origin (so the session cookie reaches it); same
                  URL shape in dev (127.0.0.1:8787/account) and prod
                  (auth.headlo.com/account) — authIssuer env var covers both. */}
              <a
                href={`${authIssuer}/account`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...s.btnPrimary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                title={`Open the hosted account page on ${new URL(authIssuer).host} — sign out of all devices, see merchants you're signed into, view step-up status`}
              >
                Manage account ↗
              </a>
            </SignedIn>
          </div>
        </div>

        <div style={s.card}>
          <div style={s.cardTitleRow}>
            <div style={s.cardTitle}>Access token</div>
            <button style={s.btnSmall} onClick={inspectToken}>Inspect</button>
          </div>
          {tokenDetails.error && <div style={s.err}>{tokenDetails.error}</div>}
          {tokenDetails.raw && (
            <>
              <div style={s.mono}>{tokenDetails.raw.slice(0, 80)}…{tokenDetails.raw.slice(-20)}</div>
              <div style={s.remark}>
                Look for <code>cnf.jkt</code> claim — that's the DPoP binding.
                Also <code>azp</code> = publishable key.
              </div>
              <pre style={s.pre}>{JSON.stringify(tokenDetails.payload, null, 2)}</pre>
            </>
          )}
        </div>

        <div style={s.card}>
          <div style={s.cardTitleRow}>
            <div style={s.cardTitle}>Storage inspection</div>
            <button style={s.btnSmall} onClick={inspectStorage}>Refresh</button>
          </div>
          <div style={s.row}><span style={s.label}>sessionStorage.headlo_auth_v2_token</span> <span style={s.value}>{storageState.sessionToken ? '✓ present' : '— absent'}</span></div>
          <div style={s.row}><span style={s.label}>localStorage.headlo_auth_user</span> <span style={s.value}>{storageState.cachedUser ? '✓ present' : '— absent'}</span></div>
          <div style={s.row}><span style={s.label}>IndexedDB.headlo_auth_v2.dpop_keys.session_key</span> <span style={s.value}>{storageState.hasIdbDpopKey === 'unknown' ? '?' : storageState.hasIdbDpopKey ? '✓ present (extractable: false)' : '— absent'}</span></div>
          <div style={s.row}><span style={s.label}>Refresh cookie (visible)</span> <span style={s.value}>{storageState.refreshCookie ?? '— absent (expected for v2)'}</span></div>

          <div style={{ marginTop: 12 }}>
            <button style={s.btnDangerSmall} onClick={clearAllLocal}>
              Clear all local storage + reload
            </button>
            <div style={s.remark}>
              Wipes sessionStorage token, localStorage user cache, and IndexedDB DPoP key.
              Simulates a fresh visitor.
            </div>
          </div>
        </div>

        <div style={s.card}>
          <div style={s.cardTitle}>Phase A.5.1 — data-API DPoP enforcement</div>
          <div style={s.remark}>
            Two step-runner tests against <code>{testPath}</code>. Flip <code>core.agency.is_dpop_enforced = true</code> on your agency to see step 1 start failing while step 2 keeps passing.
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button style={s.btnPrimary} onClick={runAll} disabled={runningAll}>
              {runningAll ? 'Running sequence…' : 'Run all →'}
            </button>
            <button style={s.btnSmall} onClick={() => setSteps({})}>Clear results</button>
          </div>

          {/* Step 1 — Bearer only */}
          {(() => {
            const state = steps.bearer ?? { status: 'idle' as StepStatus }
            return (
              <div style={{ ...s.stepSection, borderLeft: `3px solid ${STATUS_COLOR[state.status]}` }}>
                <div style={s.stepHeader}>
                  <div style={{ fontSize: 18, color: STATUS_COLOR[state.status], lineHeight: 1, marginTop: 2, flexShrink: 0 }}>{STATUS_ICON[state.status]}</div>
                  <div style={{ flex: 1 }}>
                    <div style={s.stepTag}>Step 1</div>
                    <h3 style={s.stepTitle}>Bearer-only request</h3>
                  </div>
                  <button style={s.btnSmall} onClick={runBearer} disabled={state.status === 'running'}>
                    {state.status === 'running' ? 'Running…' : 'Run →'}
                  </button>
                </div>
                <div style={s.stepExplain}>
                  Fires <code>GET {testPath}</code> with only <code>Authorization: Bearer</code>. When flag OFF: expect 200 (or 403 <code>no_headlo_membership</code>). When flag ON: expect <strong>401 dpop_dpop_missing</strong> — that's enforcement rejecting a DPoP-bound token that arrived without its proof.
                </div>

                <div style={s.reqLine}>
                  <span style={{ ...s.methodBadge, background: '#e6f4ea', color: '#1a4a2a' }}>GET</span>
                  <code style={s.reqPath}>{testUrl}</code>
                  {state.durationMs !== undefined && <span style={s.duration}>{state.durationMs}ms</span>}
                </div>

                {state.headers && (
                  <div style={s.headersBlock}>
                    {Object.entries(state.headers).map(([k, v]) => (
                      <div key={k} style={s.headerRow}><span style={s.headerKey}>{k}:</span> <span style={s.headerVal}>{v}</span></div>
                    ))}
                  </div>
                )}

                {state.error && <div style={{ ...s.err, marginTop: 8 }}>{state.error}</div>}

                {state.response && (
                  <div style={{ marginTop: 10 }}>
                    <div style={s.respLine}>
                      <span style={{ ...s.statusBadge, background: statusBg(state.response.status), color: statusColor(state.response.status) }}>
                        {state.response.status || 'ERR'}
                      </span>
                    </div>
                    <pre style={s.respBody}>{state.response.body}</pre>
                  </div>
                )}

                <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button style={s.btnCurl} onClick={() => copyCurl('bearer-sh')}>{copyState['bearer-sh'] ? '✓ curl (bash)' : 'Copy curl (bash)'}</button>
                  <button style={s.btnCurl} onClick={() => copyCurl('bearer-ps')}>{copyState['bearer-ps'] ? '✓ curl (PowerShell)' : 'Copy curl (PowerShell)'}</button>
                </div>
              </div>
            )
          })()}

          {/* Step 2 — Bearer + DPoP */}
          {(() => {
            const state = steps.dpop ?? { status: 'idle' as StepStatus }
            return (
              <div style={{ ...s.stepSection, borderLeft: `3px solid ${STATUS_COLOR[state.status]}` }}>
                <div style={s.stepHeader}>
                  <div style={{ fontSize: 18, color: STATUS_COLOR[state.status], lineHeight: 1, marginTop: 2, flexShrink: 0 }}>{STATUS_ICON[state.status]}</div>
                  <div style={{ flex: 1 }}>
                    <div style={s.stepTag}>Step 2</div>
                    <h3 style={s.stepTitle}>With DPoP proof</h3>
                  </div>
                  <button style={s.btnSmall} onClick={runDpop} disabled={state.status === 'running'}>
                    {state.status === 'running' ? 'Running…' : 'Run →'}
                  </button>
                </div>
                <div style={s.stepExplain}>
                  Same URL, adds a fresh <code>DPoP:</code> proof signed by the IndexedDB keypair. Middleware validates: proof signature ✓, <code>htu/htm</code> match ✓, <code>iat</code> fresh ✓, <code>jti</code> not replayed ✓, thumbprint matches token's <code>cnf.jkt</code> ✓ — all pass, enforcement satisfied. Expect 200 (or 403 <code>no_headlo_membership</code> if your V2 sub isn't linked).
                </div>

                <div style={s.reqLine}>
                  <span style={{ ...s.methodBadge, background: '#e6f4ea', color: '#1a4a2a' }}>GET</span>
                  <code style={s.reqPath}>{testUrl}</code>
                  {state.durationMs !== undefined && <span style={s.duration}>{state.durationMs}ms</span>}
                </div>

                {state.headers && (
                  <div style={s.headersBlock}>
                    {Object.entries(state.headers).map(([k, v]) => (
                      <div key={k} style={s.headerRow}><span style={s.headerKey}>{k}:</span> <span style={s.headerVal}>{v}</span></div>
                    ))}
                  </div>
                )}

                {state.error && <div style={{ ...s.err, marginTop: 8 }}>{state.error}</div>}

                {state.response && (
                  <div style={{ marginTop: 10 }}>
                    <div style={s.respLine}>
                      <span style={{ ...s.statusBadge, background: statusBg(state.response.status), color: statusColor(state.response.status) }}>
                        {state.response.status || 'ERR'}
                      </span>
                    </div>
                    <pre style={s.respBody}>{state.response.body}</pre>
                  </div>
                )}

                <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button style={s.btnCurl} onClick={() => copyCurl('dpop-sh')}>{copyState['dpop-sh'] ? '✓ curl (bash)' : 'Copy curl (bash)'}</button>
                  <button style={s.btnCurl} onClick={() => copyCurl('dpop-ps')}>{copyState['dpop-ps'] ? '✓ curl (PowerShell)' : 'Copy curl (PowerShell)'}</button>
                  <span style={{ ...s.remark, marginTop: 0, marginLeft: 4, fontStyle: 'normal' }}>
                    curl copy generates a fresh DPoP proof at click time (60s validity).
                  </span>
                </div>
              </div>
            )
          })()}
        </div>

        {/* ── SSO Wave 1 — identity graph + session revocation + step-up ── */}
        <div style={s.card}>
          <div style={s.cardTitle}>SSO Wave 1 — /oauth/me/graph + /oauth/signout-all + revocation check</div>
          <div style={s.remark}>
            Full flow in three steps. Step 1 shows the stitched identity (B.1). Step 2 revokes every session + token + DPoP registration for this user (B.8) AND flags step_up_required_until = NOW()+30d (B.8.1). Step 3 proves the revocation stuck — expects <strong>401 SESSION_REVOKED</strong> on refresh. After Step 3, click Sign In up top: the next OAuth round should land on the login form (not silent SSO) until you complete a Google round-trip, which clears the step-up flag.
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button style={s.btnPrimary} onClick={runWave1All} disabled={runningWave1}>
              {runningWave1 ? 'Running sequence…' : 'Run all → signs you out at end'}
            </button>
            <button style={s.btnSmall} onClick={() => setSteps(prev => ({ ...prev, meGraph: undefined, signoutAll: undefined, postRevokeRefresh: undefined }))}>Clear results</button>
            <span style={{ ...s.remark, marginTop: 0 }}>
              Individual steps don't auto-sign-out; use the Sign Out button up top after testing.
            </span>
          </div>

          {/* Step 1 — GET /oauth/me/graph */}
          {(() => {
            const state = steps.meGraph ?? { status: 'idle' as StepStatus }
            return (
              <div style={{ ...s.stepSection, borderLeft: `3px solid ${STATUS_COLOR[state.status]}` }}>
                <div style={s.stepHeader}>
                  <div style={{ fontSize: 18, color: STATUS_COLOR[state.status], lineHeight: 1, marginTop: 2, flexShrink: 0 }}>{STATUS_ICON[state.status]}</div>
                  <div style={{ flex: 1 }}>
                    <div style={s.stepTag}>Step 1 — B.1</div>
                    <h3 style={s.stepTitle}>GET /oauth/me/graph</h3>
                  </div>
                  <button style={s.btnSmall} onClick={runMeGraph} disabled={state.status === 'running'}>
                    {state.status === 'running' ? 'Running…' : 'Run →'}
                  </button>
                </div>
                <div style={s.stepExplain}>
                  Returns the Headlo user stitched across every merchant (pk) they've touched. Payload: <code>{'{ headloUserId, email, displayName, sessionEpoch, stepUpRequiredUntil, merchants: [{ azp, registeredAt, lastUsedAt }] }'}</code>. Expect 200 with your profile + an entry in <code>merchants</code> for the pk shown in the banner above.
                </div>

                <div style={s.reqLine}>
                  <span style={{ ...s.methodBadge, background: '#e6f4ea', color: '#1a4a2a' }}>GET</span>
                  <code style={s.reqPath}>{meGraphUrl}</code>
                  {state.durationMs !== undefined && <span style={s.duration}>{state.durationMs}ms</span>}
                </div>

                {state.headers && (
                  <div style={s.headersBlock}>
                    {Object.entries(state.headers).map(([k, v]) => (
                      <div key={k} style={s.headerRow}><span style={s.headerKey}>{k}:</span> <span style={s.headerVal}>{v}</span></div>
                    ))}
                  </div>
                )}

                {state.error && <div style={{ ...s.err, marginTop: 8 }}>{state.error}</div>}

                {state.response && (
                  <div style={{ marginTop: 10 }}>
                    <div style={s.respLine}>
                      <span style={{ ...s.statusBadge, background: statusBg(state.response.status), color: statusColor(state.response.status) }}>
                        {state.response.status || 'ERR'}
                      </span>
                    </div>
                    <pre style={s.respBody}>{state.response.body}</pre>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Step 2 — POST /oauth/signout-all */}
          {(() => {
            const state = steps.signoutAll ?? { status: 'idle' as StepStatus }
            return (
              <div style={{ ...s.stepSection, borderLeft: `3px solid ${STATUS_COLOR[state.status]}` }}>
                <div style={s.stepHeader}>
                  <div style={{ fontSize: 18, color: STATUS_COLOR[state.status], lineHeight: 1, marginTop: 2, flexShrink: 0 }}>{STATUS_ICON[state.status]}</div>
                  <div style={{ flex: 1 }}>
                    <div style={s.stepTag}>Step 2 — B.8 + B.8.1</div>
                    <h3 style={s.stepTitle}>POST /oauth/signout-all</h3>
                  </div>
                  <button style={s.btnSmall} onClick={runSignoutAll} disabled={state.status === 'running'}>
                    {state.status === 'running' ? 'Running…' : 'Run →'}
                  </button>
                </div>
                <div style={s.stepExplain}>
                  Revokes every session, refresh token, and DPoP registration for this user; bumps <code>session_epoch</code>; sets <code>step_up_required_until = NOW() + 30d</code> (B.8.1); clears this browser's own cookies via Set-Cookie. Expect 200 <code>{'{ ok: true }'}</code>. After this fires, your current access token is dead on refresh — see Step 3.
                </div>

                <div style={s.reqLine}>
                  <span style={{ ...s.methodBadge, background: '#fef3c7', color: '#78350f' }}>POST</span>
                  <code style={s.reqPath}>{signoutAllUrl}</code>
                  {state.durationMs !== undefined && <span style={s.duration}>{state.durationMs}ms</span>}
                </div>

                {state.headers && (
                  <div style={s.headersBlock}>
                    {Object.entries(state.headers).map(([k, v]) => (
                      <div key={k} style={s.headerRow}><span style={s.headerKey}>{k}:</span> <span style={s.headerVal}>{v}</span></div>
                    ))}
                  </div>
                )}

                {state.error && <div style={{ ...s.err, marginTop: 8 }}>{state.error}</div>}

                {state.response && (
                  <div style={{ marginTop: 10 }}>
                    <div style={s.respLine}>
                      <span style={{ ...s.statusBadge, background: statusBg(state.response.status), color: statusColor(state.response.status) }}>
                        {state.response.status || 'ERR'}
                      </span>
                    </div>
                    <pre style={s.respBody}>{state.response.body}</pre>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Step 3 — POST /oauth/token/refresh-dpop (expects SESSION_REVOKED) */}
          {(() => {
            const state = steps.postRevokeRefresh ?? { status: 'idle' as StepStatus }
            return (
              <div style={{ ...s.stepSection, borderLeft: `3px solid ${STATUS_COLOR[state.status]}` }}>
                <div style={s.stepHeader}>
                  <div style={{ fontSize: 18, color: STATUS_COLOR[state.status], lineHeight: 1, marginTop: 2, flexShrink: 0 }}>{STATUS_ICON[state.status]}</div>
                  <div style={{ flex: 1 }}>
                    <div style={s.stepTag}>Step 3 — B.8 verification</div>
                    <h3 style={s.stepTitle}>Refresh with revoked token</h3>
                  </div>
                  <button style={s.btnSmall} onClick={runPostRevokeRefresh} disabled={state.status === 'running'}>
                    {state.status === 'running' ? 'Running…' : 'Run →'}
                  </button>
                </div>
                <div style={s.stepExplain}>
                  Attempts <code>POST /oauth/token/refresh-dpop</code> with the access token + a DPoP proof <em>after</em> signout-all has fired. Server checks <code>isUserSignedOutAll(sub, iat)</code> via the KV <code>signout-all:&lt;user_id&gt;</code> entry; token's iat predates NOW() so the check fires. <strong>Expect 401 with body containing <code>SESSION_REVOKED</code></strong> — that's "pass" for this step (success criterion is inverted).
                </div>

                <div style={s.reqLine}>
                  <span style={{ ...s.methodBadge, background: '#fef3c7', color: '#78350f' }}>POST</span>
                  <code style={s.reqPath}>{refreshDpopUrl}</code>
                  {state.durationMs !== undefined && <span style={s.duration}>{state.durationMs}ms</span>}
                </div>

                {state.headers && (
                  <div style={s.headersBlock}>
                    {Object.entries(state.headers).map(([k, v]) => (
                      <div key={k} style={s.headerRow}><span style={s.headerKey}>{k}:</span> <span style={s.headerVal}>{v}</span></div>
                    ))}
                  </div>
                )}

                {state.error && <div style={{ ...s.err, marginTop: 8 }}>{state.error}</div>}

                {state.response && (
                  <div style={{ marginTop: 10 }}>
                    <div style={s.respLine}>
                      <span style={{ ...s.statusBadge, background: statusBg(state.response.status), color: statusColor(state.response.status) }}>
                        {state.response.status || 'ERR'}
                      </span>
                      {state.response.status === 401 && state.response.body.includes('SESSION_REVOKED') && (
                        <span style={{ fontSize: 11, color: '#1a4a2a', fontWeight: 600 }}>✓ expected SESSION_REVOKED</span>
                      )}
                    </div>
                    <pre style={s.respBody}>{state.response.body}</pre>
                  </div>
                )}
              </div>
            )
          })()}

          <div style={{ ...s.callout, marginTop: 14, background: '#f0f6ff', borderColor: '#c6d9f0' }}>
            <div style={{ ...s.calloutTitle, color: '#1e3a8a' }}>What to try next (step-up verification)</div>
            <ol style={{ ...s.ol, color: '#1e3a8a' }}>
              <li>Click <strong>Sign in with Headlo (v2)</strong> up top after running Step 2.</li>
              <li>You should land on the login form (not silent SSO) because <code>step_up_required_until</code> is active for 30 days.</li>
              <li>Complete the <strong>Continue with Google</strong> round-trip. The B.8.1 clearing rule fires on fresh Google consent → <code>step_up_required_until = NULL</code>.</li>
              <li>Run Step 1 again — <code>stepUpRequiredUntil</code> in the response should now be <code>null</code>.</li>
              <li>Open <code>/abs-test</code> in a second tab — silent SSO should work again (short-circuit mint, no login form).</li>
            </ol>
          </div>
        </div>

        {/* ── SSO Wave 2 B.2 — silent discovery via hidden iframe ── */}
        <div style={s.card}>
          <div style={s.cardTitle}>
            <span style={{ ...waveTag.wave2, marginRight: 8, verticalAlign: 'middle' }}>Wave 2 · B.2</span>
            Silent discovery (iframe + /oauth/discover)
          </div>
          <div style={s.remark}>
            Mounts a hidden <code>&lt;iframe src=".../oauth/discover?client_id=…&amp;parent_origin=…"&gt;</code> on this page. Because the iframe's origin IS auth.headlo.com, the server-side request executes in a first-party context — session cookie is sent despite being inside a cross-site iframe. Server reads the cookie, resolves the user, posts <code>window.parent.postMessage({'{ discovered, user, stepUpRequiredUntil }'}, parentOrigin)</code>. SDK listens for the message, verifies origin, resolves promise. Fire-and-forget: no user gesture required.
          </div>
          <div style={s.remark}>
            Returns <strong>{"{ discovered: true, user, stepUpRequiredUntil }"}</strong> when you're signed in on auth.headlo.com (any merchant pk — the session is global per-user). Returns <strong>{"{ discovered: false }"}</strong> when there's no session cookie OR when the session cookie fails the SameSite=None requirement (Safari ITP, Firefox TCP partition, strict Chrome 3PC). 4s timeout → treats as not-discovered.
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button style={s.btnPrimary} onClick={runDiscover} disabled={runningDiscover}>
              {runningDiscover ? 'Discovering…' : 'Run silent discovery →'}
            </button>
            <button style={s.btnSmall} onClick={wipeCache} disabled={!cachedProfile}>
              Clear cached profile
            </button>
            <span style={{ ...s.remark, marginTop: 0 }}>
              Cache lives in merchant-origin localStorage (<code>headlo_user_cache</code>). 7-day TTL. Busted on 401 SESSION_REVOKED (future).
            </span>
          </div>

          {/* Cached profile — snapshot at the top, so Phil can see what's
              persisted BEFORE running a fresh discovery. Changes on each run. */}
          <div style={{ ...s.card, marginTop: 12, background: '#fafaf5', border: '1px solid #ece9e0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#5a5a55', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Cached profile (localStorage)</div>
            {cachedProfile ? (
              <div style={{ fontFamily: '"DM Mono", monospace', fontSize: 12, color: '#1a1a18' }}>
                <div><span style={s.label}>headloUserId</span> <code>{cachedProfile.headloUserId}</code></div>
                <div><span style={s.label}>email</span> <code>{cachedProfile.email}</code></div>
                <div><span style={s.label}>displayName</span> <code>{cachedProfile.displayName ?? '—'}</code></div>
                <div><span style={s.label}>avatarUrl</span> <code>{cachedProfile.avatarUrl ?? 'null'}</code></div>
              </div>
            ) : (
              <div style={s.remark}>No cached profile. Run discovery below to populate.</div>
            )}
          </div>

          {/* Live result from the most recent discovery call */}
          {discoverResult && (
            <div style={{ ...s.card, marginTop: 12, background: discoverResult.discovered ? '#f3faf6' : '#fdf6f6', border: `1px solid ${discoverResult.discovered ? '#c8e6cc' : '#f1cfcf'}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#5a5a55', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                Live result
                {discoverDurationMs !== null && <span style={{ fontSize: 10, color: '#8a8a80', fontWeight: 400 }}>· {discoverDurationMs}ms</span>}
              </div>
              {discoverResult.discovered ? (
                <>
                  <div style={{ fontSize: 12, color: '#1a4a2a', fontWeight: 600, marginBottom: 6 }}>
                    ✓ discovered — session cookie reached the iframe
                  </div>
                  <div style={{ fontFamily: '"DM Mono", monospace', fontSize: 12 }}>
                    <div><span style={s.label}>headloUserId</span> <code>{discoverResult.user.headloUserId}</code></div>
                    <div><span style={s.label}>email</span> <code>{discoverResult.user.email}</code></div>
                    <div><span style={s.label}>displayName</span> <code>{discoverResult.user.displayName ?? '—'}</code></div>
                    <div><span style={s.label}>avatarUrl</span> <code>{discoverResult.user.avatarUrl ?? 'null'}</code></div>
                    <div><span style={s.label}>stepUpRequiredUntil</span> <code>{discoverResult.stepUpRequiredUntil ?? 'null'}</code></div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: '#7a1a10', fontWeight: 600, marginBottom: 6 }}>
                    ✗ not discovered
                  </div>
                  <div style={s.remark}>
                    Reason: <code>{discoverResult.error ?? 'no_session'}</code>. If you ARE signed in on this device but see this, likely cause: the session cookie isn't being sent on the iframe request (browser 3PC blocking). Check DevTools → Application → Cookies for <code>auth.headlo.com</code> → <code>headlo_session</code> should exist with SameSite=None.
                  </div>
                </>
              )}
            </div>
          )}

          <div style={{ ...s.callout, marginTop: 14, background: '#fef9ec', borderColor: '#f5e1a0' }}>
            <div style={{ ...s.calloutTitle, color: '#78350f' }}>What to try — exercising all four branches</div>
            <ol style={{ ...s.ol, color: '#78350f' }}>
              <li>Sign in via the button up top. Click <strong>Run silent discovery</strong> → expect ✓ discovered with your profile.</li>
              <li>Click <strong>Sign out</strong> up top. Click Run silent discovery → expect ✗ not discovered (no session cookie).</li>
              <li>Sign back in. Reload the page. Cached profile should repopulate <em>instantly</em> on mount (before you run discovery — that's the UX win Shop gets).</li>
              <li>Open DevTools → Network tab → run discovery → find the <code>/oauth/discover?...</code> request. Response is <code>text/html</code> containing the inline postMessage script. Request headers should include the <code>headlo_session</code> cookie.</li>
              <li>In Safari (or Chrome with "Block third-party cookies" on): run discovery → expect ✗ not discovered even when signed in. That's the 3PC blocking B.5 (FedCM + handshake) will eventually close.</li>
            </ol>
          </div>
        </div>

        {/* ── SSO Wave 2 B.3 — popup sign-in via window.open + web_message ── */}
        <div style={s.card}>
          <div style={s.cardTitle}>
            <span style={{ ...waveTag.wave2, marginRight: 8, verticalAlign: 'middle' }}>Wave 2 · B.3</span>
            Popup sign-in (window.open + response_mode=web_message)
          </div>
          <div style={s.remark}>
            Click a button below → <code>window.open('about:blank', 'headlo_signin', 'width=500,height=640')</code> fires synchronously inside the click handler, then navigates to <code>/oauth/authorize?response_mode=web_message&amp;…</code>. Server reads session cookie (if any), decides silent-SSO vs form, and returns HTML with inline <code>window.opener.postMessage({'{code, state}'}, parentOrigin)</code> + <code>window.close()</code>. SDK listens for the postMessage, verifies origin + state, resolves promise with the auth code.
          </div>
          <div style={s.remark}>
            <strong>Option A (shipped 2026-10-10) — this button signs you in end-to-end.</strong> <code>runPopup()</code> generates/retrieves the per-pk DPoP keypair, computes <code>jkt</code>, passes it to <code>signInViaPopup({'{ dpopJkt }'})</code> so the authorize URL carries <code>dpop_jkt=…</code> (RFC 9449 § 10), then calls <code>exchangeAuthCodeDpop({'{ dpopKeyPair }'})</code> which POSTs <code>/oauth/token</code> with a DPoP proof — the server validates <code>proof.jkt === row.dpop_jkt</code>, upserts an <code>oauth.dpop_registration</code> row, and returns a <code>cnf.jkt</code>-bound access token. The token lands in <code>sessionStorage.headlo_auth_v2_token</code> and the page reloads so <code>HeadloProviderV2</code> picks it up on mount. The Auth state card at the top will flip to signed-in after the reload.
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button style={s.btnPrimary} onClick={() => void runPopup()} disabled={runningPopup}>
              {runningPopup ? 'Popup open…' : 'Sign in with popup →'}
            </button>
            <button style={s.btnSmall} onClick={() => void runPopup({ prompt: 'login' })} disabled={runningPopup}
              title="Adds prompt=login — bypasses silent-SSO even when session cookie is valid; always renders the form inside the popup">
              Popup + prompt=login
            </button>
            <input
              type="email"
              placeholder="login_hint (email)"
              value={popupLoginHint}
              onChange={e => setPopupLoginHint(e.target.value)}
              disabled={runningPopup}
              style={{ padding: '6px 10px', fontSize: 12, border: '1px solid #d8d4cc', borderRadius: 4, fontFamily: 'inherit' }}
            />
            <button style={s.btnSmall} onClick={() => void runPopup({ prompt: 'login', loginHint: popupLoginHint || undefined })} disabled={runningPopup || !popupLoginHint}
              title="Pre-fills the email field in the popup form. Simulates returning-user UX where we know the email from a prior discover call.">
              Popup + login_hint
            </button>
          </div>

          {/* Live result */}
          {popupResult.kind && (
            <div style={{ ...s.card, marginTop: 12, background: popupResult.kind === 'success' ? '#f3faf6' : '#fdf6f6', border: `1px solid ${popupResult.kind === 'success' ? '#c8e6cc' : '#f1cfcf'}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#5a5a55', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                Live result
                {popupResult.durationMs !== undefined && <span style={{ fontSize: 10, color: '#8a8a80', fontWeight: 400 }}>· {popupResult.durationMs}ms</span>}
              </div>
              <div style={{ fontSize: 12, color: popupResult.kind === 'success' ? '#1a4a2a' : '#7a1a10', fontWeight: 600, marginBottom: 8 }}>
                {popupResult.kind === 'success' ? '✓' : '✗'} {popupResult.message}
              </div>
              {popupResult.code && (
                <div style={{ fontFamily: '"DM Mono", monospace', fontSize: 11 }}>
                  <div><span style={s.label}>code</span> <code style={{ wordBreak: 'break-all' }}>{popupResult.code}</code></div>
                  <div><span style={s.label}>state</span> <code>{popupResult.state}</code></div>
                  <div><span style={s.label}>verifier</span> <code style={{ wordBreak: 'break-all' }}>{popupResult.verifier ?? 'null'}</code></div>
                </div>
              )}
            </div>
          )}

          <div style={{ ...s.callout, marginTop: 14, background: '#fef9ec', borderColor: '#f5e1a0' }}>
            <div style={{ ...s.calloutTitle, color: '#78350f' }}>What to try — all four B.3 branches</div>
            <ol style={{ ...s.ol, color: '#78350f' }}>
              <li><strong>Fast silent path</strong> — be signed in, click "Sign in with popup →". Popup opens, immediately returns a code, auto-closes in &lt;500ms. Live result shows ✓ + code+state+verifier.</li>
              <li><strong>Login form path</strong> — be signed in, click "Popup + prompt=login". Popup opens login form (silent-SSO skipped). Complete via Google. Popup closes, result shows code.</li>
              <li><strong>login_hint prefill</strong> — type an email, click "Popup + login_hint". Popup opens login form with email prefilled. Mirrors Shop's returning-user UX.</li>
              <li><strong>Step-up gate (needs setup)</strong> — run /oauth/signout-all from Wave 1 card to set <code>step_up_required_until</code>. Then click "Sign in with popup →" with prompt=none logic (not in default button — would need SDK change). The pattern: silent attempt returns <code>step_up_required</code> error via postMessage; SDK re-launches popup with prompt=login.</li>
              <li><strong>User closes popup</strong> — click a button, close the popup window via its X before signing in. Live result shows error "You closed the popup before completing sign-in."</li>
              <li><strong>Popup blocked</strong> — enable browser's popup blocker aggressively (Safari with Block Pop-ups on, or any blocker extension). Click button → error "Popup blocked by browser. Enable popups OR fall back to redirect flow." Production SDK should auto-fall-back to redirect on PopupBlockedError.</li>
            </ol>
          </div>
        </div>

        {/* ── SSO Wave 2 B.9 — first-time merchant consent screen ────────── */}
        <div style={s.card}>
          <div style={s.cardTitle}>
            <span style={{ ...waveTag.wave2, marginRight: 8, verticalAlign: 'middle' }}>Wave 2 · B.9</span>
            Consent screen (first-time merchant access)
          </div>
          <div style={s.remark}>
            On the first <code>/oauth/authorize</code> for a (user, pk) pair, the server renders a first-party consent page on <code>auth.headlo.com/oauth/consent</code> inside whatever surface drove the authorize (popup for B.3, same tab for standard redirect). Click Allow → <code>POST /oauth/consent/accept</code> writes <code>platform.oauth_consent_grant</code>, mints the auth code, delivers via the original <code>response_mode</code>. Click Cancel → <code>error=access_denied</code>. Row survives sign-out — only one grant per (user, pk).
          </div>
          <div style={s.remark}>
            To re-exercise the gate after you've already clicked Allow once: use <strong>Clear consent</strong> below. The next popup/discover will show the consent page again.
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button style={s.btnPrimary} onClick={() => void runConsentStatus()} disabled={consentStatus.loading}>
              {consentStatus.loading ? 'Checking…' : 'Check consent status →'}
            </button>
            <button style={s.btnDanger} onClick={() => void runConsentRevoke()} disabled={consentStatus.loading || consentStatus.granted !== true}
                    title="Soft revoke — sets revoked_at (same as /account page Revoke button). Grant row kept for audit.">
              Revoke (soft, like /account)
            </button>
            <button style={s.btnDanger} onClick={() => void runConsentClear()} disabled={consentStatus.loading}
                    title="Hard delete — removes the row entirely. Dev-only convenience; /account uses the soft revoke above.">
              Clear (hard delete)
            </button>
          </div>

          {consentStatus.checked && !consentStatus.error && (
            <div style={{ ...s.mono, marginTop: 10 }}>
              <div><span style={s.label}>granted</span> <code>{String(consentStatus.granted)}</code></div>
              {consentStatus.granted_at && <div><span style={s.label}>granted_at</span> <code>{consentStatus.granted_at}</code></div>}
              {consentStatus.revoked_at && <div><span style={s.label}>revoked_at</span> <code>{consentStatus.revoked_at}</code></div>}
              {consentStatus.scopes.length > 0 && <div><span style={s.label}>scopes</span> <code>{consentStatus.scopes.join(', ')}</code></div>}
            </div>
          )}
          {consentStatus.error && <div style={{ ...s.err, marginTop: 10 }}>{consentStatus.error}</div>}

          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #e8e5df' }}>
            <div style={s.remark}>
              <strong>Enforcement check.</strong> After revoke, the SDK's next silent refresh fires <code>POST /oauth/token/refresh-dpop</code> and should get back <code>401 CONSENT_REVOKED</code>. In a real app that triggers auto-sign-out (<code>REVOCATION_ERROR_CODES</code> set in client-v2.ts includes CONSENT_REVOKED). This button fires the exact same request so you can watch the marker land without waiting for the SDK's timer.
            </div>
            <div style={{ marginTop: 8 }}>
              <button style={s.btnPrimary} onClick={() => void runRefreshNow()} disabled={refreshRunning}>
                {refreshRunning ? 'Refreshing…' : 'Try refresh now →'}
              </button>
            </div>
            {refreshResult && (
              <div style={{ marginTop: 10 }}>
                <div style={s.mono}>
                  <div><span style={s.label}>status</span> <code>{refreshResult.status}</code> <span style={s.label}>in</span> <code>{refreshResult.ms}ms</code></div>
                </div>
                <pre style={s.pre}>{refreshResult.body}</pre>
                {refreshResult.status === 401 && refreshResult.body.includes('CONSENT_REVOKED') && (
                  <div style={{ ...s.remark, color: '#166534', fontStyle: 'normal' }}>✓ CONSENT_REVOKED marker returned — in production this fires onRevocation and auto-signs the user out.</div>
                )}
                {refreshResult.status === 200 && (
                  <div style={{ ...s.remark, color: '#166534', fontStyle: 'normal' }}>✓ 200 — consent is granted, refresh succeeded.</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── SSO Wave 3 B.4 — "Continue as X" modal (composes B.2 + B.3 + Option A) ── */}
        <div style={s.card}>
          <div style={s.cardTitle}>
            <span style={{ ...waveTag.wave3, marginRight: 8, verticalAlign: 'middle' }}>Wave 3 · B.4</span>
            "Continue as X" modal (Shop-equivalent)
          </div>
          <div style={s.remark}>
            Pitch-deck demo moment. Component mounts → paints instantly from <code>readCachedProfile(pk)</code> if a prior discovery result exists → fires silent iframe discovery (B.2) → if the server confirms a session, shows "Continue as {'{name}'}" with user avatar; else falls to a plain "Sign in with Headlo". Click Continue → <code>signInViaPopup({'{ dpopJkt }'})</code> → <code>exchangeAuthCodeDpop({'{ dpopKeyPair }'})</code> (B.3 Option A path) → DPoP-bound token → reload. "Use a different account" opens the popup with <code>prompt=login</code>.
          </div>
          <div style={s.remark}>
            <strong>Wave 5 — <code>fallbackHandshake</code>:</strong> when the discovery iframe times out (Safari ITP / Firefox TCP / Chrome with 3PC off), the modal auto-navigates to <code>/oauth/discover-handshake</code> on auth.headlo.com. First-party cookie read, 302 back with a signed JWT in <code>?__headlo_discover_handshake=…</code>. Modal picks up the payload on return and paints "Continue as X" exactly as if the iframe had worked. Loop-protected (max 1 handshake per page load); terminal <code>nosession</code> marker short-circuits further attempts.
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button style={s.btnPrimary} onClick={() => setShowContinueAsModal(true)} disabled={showContinueAsModal}>
              {showContinueAsModal ? 'Modal open…' : 'Open "Continue as X" modal →'}
            </button>
            <button style={s.btnSmall} onClick={() => { clearCachedProfile(); setCachedProfile(null) }}
              title="Clears localStorage.headlo_user_cache so the modal starts from the discovering state instead of the cached-paint state.">
              Clear cached profile
            </button>
            <label style={{ fontSize: 12, color: '#5a5a55', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
              title="When OFF, pins pre-Wave-5 behavior: iframe only; cached paint on timeout; no redirect. When ON (default), triggers top-level handshake redirect on iframe ambiguous failure.">
              <input type="checkbox" checked={fallbackHandshake} onChange={e => setFallbackHandshake(e.target.checked)} />
              fallbackHandshake
            </label>
            <label style={{ fontSize: 12, color: '#991b1b', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
              title="Dev only. Skips the discovery iframe and jumps straight to the ambiguous-failure branch — simulates a 3PC-blocked browser so the Wave 5 handshake path is observable in Chrome dev without needing Safari/Incognito/DevTools blocking.">
              <input type="checkbox" checked={forceDiscoveryFail} onChange={e => setForceDiscoveryFail(e.target.checked)} />
              Force iframe fail (dev)
            </label>
            <button style={s.btnSmall} onClick={() => {
              try {
                sessionStorage.removeItem('headlo_discover_handshake_nonce')
                sessionStorage.removeItem('headlo_discover_handshake_attempted')
                const u = new URL(window.location.href)
                u.searchParams.delete('__headlo_discover_handshake')
                history.replaceState({}, '', u.toString())
              } catch { /* non-fatal */ }
            }} title="Clears handshake nonce + loop-protection flag + any lingering URL param so the next modal open can trigger a fresh handshake.">
              Reset handshake state
            </button>
          </div>

          <div style={{ ...s.callout, marginTop: 14, background: '#fdf2f8', borderColor: '#f9b4d2' }}>
            <div style={{ ...s.calloutTitle, color: '#831843' }}>What to try — all six B.4 + Wave 5 paths</div>
            <ol style={{ ...s.ol, color: '#831843' }}>
              <li><strong>Returning-user fast paint</strong> — be signed in. Click Open → modal paints "Continue as {'{you}'}" instantly from localStorage cache, then revalidates silently via the discovery iframe (same card in the body — no flash). Click Continue → popup opens briefly, auto-closes, page reloads signed in. Full round-trip under 2s.</li>
              <li><strong>Use a different account</strong> — on the modal, click "Use a different account". Popup opens with the login form (prompt=login) and the current user's email pre-filled as login_hint. Sign in as someone else → page reloads with the new identity.</li>
              <li><strong>Not-signed-in fallback</strong> — click "Clear cached profile" + run Wave 1 "Sign out all devices" first (or open in Incognito). Open modal → discovery runs → server returns no_session → modal flips to "Sign in with Headlo" with a single Sign in button. Click → full form path, same reload.</li>
              <li><strong>Dismissable</strong> — click the × in the modal header → <code>onCancel</code> fires → modal closes. Nothing persists.</li>
              <li><strong>Wave 5 — 3PC-blocked recovery</strong> — Safari OR Chrome Incognito with "Block third-party cookies" on. Clear cached profile, open modal. Iframe discovery times out at 4s. With <code>fallbackHandshake</code> ON → URL flashes to <code>auth.headlo.com/oauth/discover-handshake?…</code> → 302 back with signed token → modal paints "Continue as {'{you}'}" from the handshake payload. With it OFF → modal falls through to anonymous "Sign in" state.</li>
              <li><strong>Handshake nosession path</strong> — be signed OUT, 3PC-blocked browser, <code>fallbackHandshake</code> ON. Modal triggers handshake → server reads cookie, finds no session → 302s back with <code>?__headlo_discover_handshake=nosession</code> → modal immediately flips to anonymous (no second handshake fires; loop protection working).</li>
            </ol>
          </div>
        </div>

        {/* The modal itself — mounts outside the card so the backdrop covers the whole viewport. */}
        {showContinueAsModal && (
          <ContinueAsModal
            {...(omitIssuerProp ? {} : { issuer: authIssuer })}
            publishableKey={publishableKey}
            onCancel={() => setShowContinueAsModal(false)}
            fallbackHandshake={fallbackHandshake}
            _debugForceDiscoveryFail={forceDiscoveryFail}
          />
        )}

        {/* ── SSO Wave 4 B.10 — Google One Tap ─────────────────────────── */}
        <div style={s.card}>
          <div style={s.cardTitle}>
            <span style={{ ...waveTag.wave3, marginRight: 8, verticalAlign: 'middle', background: '#dbeafe', color: '#1e3a8a', borderColor: '#a7c4f3' }}>Wave 4 · B.10</span>
            Google One Tap (Chrome-native account chooser)
          </div>
          <div style={s.remark}>
            Chrome-rendered account chooser from the user's Google browser-level state. Zero merchant config beyond the Headlo pk — the SDK fetches our Google client ID from <code>/.well-known/openid-configuration</code>, loads Google's GIS script, calls <code>google.accounts.id.initialize({'{...}'})</code>, and auto-prompts the bubble. User taps an account → Google returns an ID token → SDK POSTs it to <code>/oauth/google/one-tap</code> with a DPoP proof → server verifies the Google JWT against Google's JWKS, runs the existing linking rule (<code>google_sub</code> → <code>email+verified</code> → create), mints a <code>cnf.jkt</code>-bound token in one shot, plants the SSO session cookie. Page reloads signed in.
          </div>
          <div style={s.remark}>
            <strong>Why this compounds with the other surfaces:</strong> <code>&lt;ContinueAsModal /&gt;</code> recognizes you via Headlo's session cookie (fails on brand-new browser profiles). One Tap recognizes you via Google's browser-level state — survives private-browsing, new installs, 3PC blocking. Mount both; whichever fires first wins.
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button style={s.btnPrimary}
              onClick={() => { setMountOneTap(true); setOneTapStatus('mounted — Google chooser should appear in top-right corner') }}
              disabled={mountOneTap}>
              {mountOneTap ? 'One Tap mounted…' : 'Mount <GoogleOneTap /> →'}
            </button>
            <button style={s.btnSmall}
              onClick={() => { setMountOneTap(false); setOneTapStatus('unmounted'); try { (window as unknown as { google?: { accounts?: { id?: { cancel: () => void; disableAutoSelect: () => void } } } }).google?.accounts?.id?.cancel() } catch { /* non-fatal */ } }}>
              Unmount
            </button>
            <button style={s.btnSmall}
              onClick={() => {
                // Reset Google's auto-select memory so a fresh prompt appears next time
                try { (window as unknown as { google?: { accounts?: { id?: { cancel: () => void; disableAutoSelect: () => void } } } }).google?.accounts?.id?.disableAutoSelect() } catch { /* non-fatal */ }
                setOneTapStatus('called disableAutoSelect — next prompt will show the chooser instead of silently signing you in with the last-used account')
              }}
              title="Clears Google's remembered account so you see the chooser instead of a silent auto-sign-in on the next mount.">
              Reset Google auto-select
            </button>
          </div>

          {oneTapStatus && (
            <div style={{ marginTop: 10, fontSize: 11, color: '#6a6a62', fontFamily: '"DM Mono", monospace' }}>
              status: {oneTapStatus}
            </div>
          )}

          <div style={{ ...s.callout, marginTop: 14, background: '#eef2ff', borderColor: '#c7d2fe' }}>
            <div style={{ ...s.calloutTitle, color: '#312e81' }}>What to try — all four B.10 paths</div>
            <ol style={{ ...s.ol, color: '#312e81' }}>
              <li><strong>Fresh prompt</strong> — click <strong>Reset Google auto-select</strong>, then <strong>Mount</strong>. Chrome shows the account bubble in the top-right (same UI you saw on zillow.com). Pick an account → Google sends an ID token → SDK POSTs it → page reloads signed in.</li>
              <li><strong>Silent auto-sign-in</strong> — if you've completed step 1 before AND left <code>auto_select: true</code> (default), subsequent mounts sign you in silently with no bubble. Fastest flow — one network round-trip, no clicks.</li>
              <li><strong>Not configured</strong> — if the server env lacks <code>GOOGLE_CLIENT_ID</code>, SDK logs "Google sign-in not configured on this issuer — skipping" and does nothing. Graceful degradation.</li>
              <li><strong>Password-account conflict</strong> — if the Google email matches an existing Headlo password account with <code>email_verified=false</code>, server returns 409 <code>ACCOUNT_EXISTS_UNVERIFIED</code>. SDK fires <code>onError</code>; merchant falls back to the normal popup flow where the user can verify + link.</li>
            </ol>
            <div style={{ marginTop: 10, padding: '10px 12px', background: '#fef9ec', border: '1px solid #f5e1a0', borderRadius: 6, fontSize: 12, color: '#78350f' }}>
              <strong>⚠️ Chrome one-tap cooldown — expected behavior.</strong> After one interaction (sign-in OR dismissal), Chrome suppresses the One Tap bubble on this origin for ~24h regardless of what the SDK does. The SDK still calls <code>prompt()</code>, Google just doesn't render the bubble. Open the DevTools console to see <code>[headlo-one-tap] ⚠️ prompt NOT DISPLAYED — reason=suppressed_by_user</code>. To test again: <strong>open an Incognito window</strong> OR go to <code>chrome://settings/content/federatedIdentityApi</code> and clear the entry for this origin OR wait out the cooldown.
            </div>
          </div>
        </div>

        {mountOneTap && (
          <GoogleOneTap
            {...(omitIssuerProp ? {} : { issuer: authIssuer })}
            publishableKey={publishableKey}
            onError={(code) => setOneTapStatus(`❌ error: ${code}`)}
          />
        )}

        {/* ── SSO Wave 4 B.12 — Multi-provider auth menu ─────────────────── */}
        <div style={s.card}>
          <div style={s.cardTitle}>
            <span style={{ ...waveTag.wave3, marginRight: 8, verticalAlign: 'middle', background: '#dbeafe', color: '#1e3a8a', borderColor: '#a7c4f3' }}>Wave 4 · B.12</span>
            Multi-provider menu + SignIn/SignUp wrappers
          </div>
          <div style={s.remark}>
            Centered modal picks the provider in one click: Continue as X (if returning), Google, Apple, Email. Cross-link footer swaps between sign-in and sign-up in place. React v1 only — PROP custom-element and anchored dropdown deferred. Three API shapes shipped: <code>&lt;AuthMenu action="…" open={'{bool}'} /&gt;</code>, <code>&lt;AuthMenuSignInButton /&gt;</code>, <code>&lt;AuthMenuSignUpButton /&gt;</code>.
          </div>
          <div style={s.remark}>
            Apple row auto-hides when the server env lacks <code>HEADLO_APPLE_SERVICES_ID</code> (B.11 setup deferred). Email row runs the standard B.3 popup flow (Headlo form inside). Google row jumps straight to <code>/oauth/google/start</code> in the popup — no extra click on a form.
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <AuthMenuSignInButton
              {...(omitIssuerProp ? {} : { issuer: authIssuer })}
              publishableKey={publishableKey}>Sign in with menu →</AuthMenuSignInButton>
            <AuthMenuSignUpButton
              {...(omitIssuerProp ? {} : { issuer: authIssuer })}
              publishableKey={publishableKey}
              style={{ padding: '9px 16px', background: '#fff', color: '#0e0e0c', border: '1px solid #d8d5cd', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Sign up with menu →</AuthMenuSignUpButton>
          </div>
          <div style={{ ...s.callout, marginTop: 14, background: '#eef2ff', borderColor: '#c7d2fe' }}>
            <div style={{ ...s.calloutTitle, color: '#312e81' }}>What to try</div>
            <ol style={{ ...s.ol, color: '#312e81' }}>
              <li><strong>Fresh visit (no session)</strong> — click Sign in → modal shows Google/Apple/Email rows (no Continue-as). Pick one, flow runs, page reloads signed in.</li>
              <li><strong>Returning visit (cached profile)</strong> — click Sign in → modal shows "Continue as [you]" at the top above a divider, then providers. Clicking Continue-as runs the Email popup; server silent-SSOs on the still-valid session cookie, no form shown.</li>
              <li><strong>Cross-link swap</strong> — click Sign in, then the "Sign up" link in the footer → title changes to "Create your account", footer flips to "Already have an account? Log in". Modal doesn't close/reopen. One AuthMenu instance; `action` state swaps.</li>
              <li><strong>Google row</strong> — opens popup DIRECTLY to <code>/oauth/google/start</code>, user picks Google account, server round-trips Google, posts auth code via web_message, exchange → DPoP token.</li>
              <li><strong>Apple row</strong> — if <code>HEADLO_APPLE_SERVICES_ID</code> is set, click → AppleID.auth.signIn popup → <code>/oauth/token/apple-federated</code> → DPoP token. If unset, row is dimmed/hidden.</li>
              <li><strong>Esc + backdrop click</strong> close the modal.</li>
            </ol>
          </div>
        </div>

        {/* ── SSO Wave 4 B.11 — Sign in with Apple ─────────────────────── */}
        <div style={s.card}>
          <div style={s.cardTitle}>
            <span style={{ ...waveTag.wave3, marginRight: 8, verticalAlign: 'middle', background: '#dbeafe', color: '#1e3a8a', borderColor: '#a7c4f3' }}>Wave 4 · B.11</span>
            Sign in with Apple
          </div>
          <div style={s.remark}>
            Click-triggered — no auto-prompt (Apple doesn't offer one). Loads <code>appleid.auth.js</code>, calls <code>AppleID.auth.signIn()</code> which opens Apple's popup, exchanges the resulting <code>id_token</code> at <code>POST /oauth/token/apple-federated</code> for a Headlo DPoP-bound access token (Option A fast-path — single round-trip). On first consent Apple sends <code>user.name</code>; we persist it on the first <code>INSERT</code> only (Apple never resends it).
          </div>
          <div style={s.remark}>
            Zero merchant setup — Apple Services ID is advertised at <code>/.well-known/openid-configuration</code> as <code>headlo:apple_services_id</code>. If the server env lacks <code>HEADLO_APPLE_SERVICES_ID</code>, the button logs "APPLE_NOT_CONFIGURED" and does nothing — graceful degradation.
          </div>
          <div style={{ marginTop: 12, maxWidth: 320 }}>
            <HeadloAppleSignIn
              {...(omitIssuerProp ? {} : { issuer: authIssuer })}
              publishableKey={publishableKey}
              onError={(code) => console.log('[abs-test] apple error:', code)}
            />
          </div>
          <div style={{ ...s.callout, marginTop: 14, background: '#f8f6f0', borderColor: '#e8e5df' }}>
            <div style={{ ...s.calloutTitle, color: '#44433d' }}>What to try — all three B.11 paths</div>
            <ol style={{ ...s.ol, color: '#44433d' }}>
              <li><strong>First sign-in</strong> — click the button, Apple popup opens, choose "Share My Email" OR "Hide My Email", click Continue. Apple returns <code>authorization.id_token</code> + a one-time <code>user.name</code> payload. Server verifies signature against Apple's JWKS, inserts a new <code>headlo_auth.user</code> row with <code>apple_sub</code>, mints a DPoP-bound token, page reloads signed in.</li>
              <li><strong>Returning sign-in</strong> — click again (same Apple account). Apple sends <code>id_token</code> only, NO <code>user.name</code> this time. Server looks up by <code>apple_sub</code>, skips the UPSERT fields that would blank the row, mints the same bound token.</li>
              <li><strong>Not configured</strong> — if <code>HEADLO_APPLE_SERVICES_ID</code> is unset on the worker, the button fires <code>onError('APPLE_NOT_CONFIGURED')</code> and nothing happens. Open DevTools console to see the log line.</li>
            </ol>
            <div style={{ marginTop: 10, padding: '10px 12px', background: '#fef9ec', border: '1px solid #f5e1a0', borderRadius: 6, fontSize: 12, color: '#78350f' }}>
              <strong>⚠️ Needs Apple Developer setup first.</strong> You (Phil) must: (1) create an App ID + Services ID in Apple Developer portal, (2) register this origin + <code>${window.location.origin}/</code> as the Services ID's redirect URL, (3) set <code>HEADLO_APPLE_SERVICES_ID</code> in <code>.dev.vars</code> and prod. Until then this button returns APPLE_NOT_CONFIGURED. No .p8 private key needed for this flow — we verify Apple's id_token directly, no server-to-server token exchange.
            </div>
          </div>
        </div>

        {/* ── SSO Wave 4 B.7 — Universal install script ─────────────────── */}
        <div style={s.card}>
          <div style={s.cardTitle}>
            <span style={{ ...waveTag.wave3, marginRight: 8, verticalAlign: 'middle', background: '#dcfce7', color: '#14532d', borderColor: '#86efac' }}>Wave 4 · B.7</span>
            Universal install script — the one-liner
          </div>
          <div style={s.remark}>
            The pitch-deck install story. Merchant pastes a single <code>&lt;script&gt;</code> tag into their HTML. Script reads <code>data-pk</code>, decodes the issuer (B.6 encoded pks), mounts Google One Tap + a floating "Sign in with Headlo" button. Zero React, zero bundler, zero config. 15 KB IIFE served from <code>{authIssuer}/button.js</code>.
          </div>

          <div style={{ marginTop: 10, padding: '12px 14px', background: '#1a1a18', color: '#f0f0e8', borderRadius: 8, fontFamily: '"DM Mono", ui-monospace, monospace', fontSize: 12, lineHeight: 1.6, overflow: 'auto' }}>
            <span style={{ color: '#8a8a80' }}>{'<!-- Paste anywhere in your HTML — zero config -->'}</span>
            <br />
            {'<script'}<br />
            {'  src='}<span style={{ color: '#5dcaa5' }}>{`"${authIssuer}/button.js"`}</span><br />
            {'  data-pk='}<span style={{ color: '#5dcaa5' }}>{`"${publishableKey || 'pk_live_…'}"`}</span><br />
            {'></script>'}
          </div>

          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={s.btnSmall}
              onClick={() => void navigator.clipboard.writeText(`<script src="${authIssuer}/button.js" data-pk="${publishableKey}"></script>`)}>
              Copy snippet
            </button>
            <a style={{ ...s.btnSmall, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
              href={`${authIssuer}/button.js`} target="_blank" rel="noopener noreferrer">
              View bundle source ↗
            </a>
            <button style={s.btnSmall}
              onClick={() => {
                // Inject the script tag live into THIS page so you can see
                // the actual rendered button + One Tap behavior. Uses the
                // same data-pk as the rest of the test harness.
                //
                // data-force-mount="1" bypasses the "already-signed-in short-
                // circuit" so the UI mounts even when you have a sessionStorage
                // token from an earlier /abs-test sign-in. Production merchants
                // never set this — their users correctly see no sign-in UI
                // when already signed in.
                const existing = document.querySelector('script[data-headlo-pk]')
                if (existing) { alert('Script tag already injected on this page — look for the floating "Sign in with Headlo" button bottom-right and the Google One Tap bubble top-right.'); return }
                const s = document.createElement('script')
                s.src = `${authIssuer}/button.js`
                s.setAttribute('data-headlo-pk', publishableKey)
                s.setAttribute('data-force-mount', '1')
                document.head.appendChild(s)
              }}
              title="Live-mounts the script into this page WITH data-force-mount=1 so the UI appears even while you're signed in. Production merchants never use data-force-mount.">
              Inject script into this page →
            </button>
          </div>

          <div style={{ ...s.callout, marginTop: 14, background: '#f0fdf4', borderColor: '#86efac' }}>
            <div style={{ ...s.calloutTitle, color: '#14532d' }}>What the script does on load</div>
            <ol style={{ ...s.ol, color: '#14532d' }}>
              <li>Reads <code>data-pk</code> from its own <code>&lt;script&gt;</code> tag (also accepts <code>data-headlo-pk</code> for async-loaded cases where <code>document.currentScript</code> is null)</li>
              <li>Decodes the pk via <code>decodePublishableKey</code> → derives issuer URL (B.6)</li>
              <li>Short-circuits if a fresh <code>headlo_auth_v2_token</code> already exists in sessionStorage (user already signed in — no UI mounted)</li>
              <li>Mounts Google One Tap by loading GIS script + initializing with Headlo's Google client ID from <code>/.well-known/openid-configuration</code> (same path <code>&lt;GoogleOneTap&gt;</code> uses)</li>
              <li>Renders a floating "Sign in with Headlo" button (position via <code>data-position</code>, theme via <code>data-theme</code>)</li>
              <li>On any sign-in success: writes token to sessionStorage + user to both cache slots + reloads the page</li>
            </ol>
            <div style={{ marginTop: 8, fontSize: 12 }}>
              <strong>Optional attributes:</strong> <code>data-mode="auto"|"button"|"one-tap"|"none"</code>, <code>data-position="bottom-right"|"bottom-left"|"top-right"|"top-left"</code>, <code>data-theme="auto"|"light"|"dark"</code>, <code>data-on-success="reload"|"none"</code>
            </div>
          </div>
        </div>

        <PersistedLogViewer />

        <div style={s.callout}>
          <div style={s.calloutTitle}>What to verify on iOS Safari (the load-bearing test)</div>
          <ol style={s.ol}>
            <li>Sign in (redirect → back). Session established.</li>
            <li>Reload the tab. Session persists (via silent DPoP refresh).</li>
            <li>Close tab, reopen. Session persists (sessionStorage cleared but IndexedDB DPoP key survives → next mount triggers fresh sign-in). <em>Actually, sessionStorage clears on tab close — so this test would sign you out. That's expected v2 behavior on tab close. iOS Safari nav within the tab should persist though.</em></li>
            <li>Navigate to <a href="/">home</a> then back to <a href="/abs-test">/abs-test</a>. Session should persist across full-page navigation. This is where v1 fails on Safari.</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

// Persistent log viewer — reads the ring buffer HeadloProviderV2 writes to
// localStorage. Survives page reloads so we can debug multi-refresh flows.
function PersistedLogViewer() {
  const [entries, setEntries] = React.useState<Array<{ ts: number; msg: string; data?: unknown }>>([])
  const [copied, setCopied]   = React.useState(false)

  const refresh = React.useCallback(() => {
    try {
      const raw = localStorage.getItem('headlo_auth_v2_debug_log')
      setEntries(raw ? JSON.parse(raw) : [])
    } catch { setEntries([]) }
  }, [])

  React.useEffect(() => {
    refresh()
    // Auto-refresh every 500ms so live activity shows without click
    const id = setInterval(refresh, 500)
    return () => clearInterval(id)
  }, [refresh])

  function clearLog() {
    try { localStorage.removeItem('headlo_auth_v2_debug_log') } catch {}
    setEntries([])
  }

  function copyLog() {
    const text = entries.map(e => {
      const t = new Date(e.ts).toISOString().slice(11, 23)
      const dataStr = e.data ? ' ' + JSON.stringify(e.data) : ''
      return `${t}  ${e.msg}${dataStr}`
    }).join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={s.card}>
      <div style={s.cardTitleRow}>
        <div style={s.cardTitle}>
          Persistent log ({entries.length} entries)
          <span style={{ fontSize: 11, color: '#8a8a80', fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 8 }}>
            — survives page reload
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={s.btnSmall} onClick={copyLog}>{copied ? '✓ Copied' : 'Copy'}</button>
          <button style={s.btnDangerSmall} onClick={clearLog}>Clear</button>
        </div>
      </div>
      {entries.length === 0 ? (
        <div style={s.remark}>No entries yet. Sign in / reload / refresh to populate.</div>
      ) : (
        <div style={s.logBox}>
          {entries.map((e, i) => {
            const t = new Date(e.ts).toISOString().slice(11, 23)  // HH:MM:SS.mmm
            return (
              <div key={i} style={s.logRow}>
                <span style={s.logTs}>{t}</span>
                <span style={s.logMsg}>{e.msg}</span>
                {e.data ? <span style={s.logData}>{JSON.stringify(e.data)}</span> : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Signing-in banner — shown during the code-exchange window after OAuth
// return. Inline CSS-in-JS style + one <style> tag with the keyframes since
// this page's style object doesn't already have a keyframes carrier.
const signingInBanner: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 14px',
  marginBottom: 16,
  background: '#fffbeb',
  border: '1px solid #fcd34d',
  color: '#92400e',
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 3,
}
const signingInSpinner: React.CSSProperties = {
  display: 'inline-block',
  width: 12,
  height: 12,
  border: '2px solid #f5d38b',
  borderTopColor: '#92400e',
  borderRadius: '50%',
  animation: 'absTestSpin 0.7s linear infinite',
}
// Keyframes need a real stylesheet — inject once at module load.
if (typeof document !== 'undefined' && !document.getElementById('abs-test-spin-kf')) {
  const style = document.createElement('style')
  style.id = 'abs-test-spin-kf'
  style.textContent = '@keyframes absTestSpin { to { transform: rotate(360deg); } }'
  document.head.appendChild(style)
}

// Color-coded phase/wave badges rendered beneath the H1. Each tag maps to
// the lifecycle status + the roadmap phase being exercised on this page, so
// a reader can tell at a glance "what's shipped vs new vs reference-only."
const tagBase: React.CSSProperties = {
  display:        'inline-flex',
  alignItems:     'center',
  padding:        '3px 8px',
  borderRadius:   4,
  fontSize:       10,
  fontWeight:     700,
  letterSpacing:  '.04em',
  textTransform:  'uppercase',
  lineHeight:     1,
}
const waveTag = {
  phaseA: { ...tagBase, background: '#e6f4ea', color: '#1a4a2a', border: '1px solid #c8e6cc' } as React.CSSProperties,
  a51:    { ...tagBase, background: '#f0eafc', color: '#4c1d95', border: '1px solid #d8c7f0' } as React.CSSProperties,
  wave1:  { ...tagBase, background: '#dbeafe', color: '#1e3a8a', border: '1px solid #a7c4f3' } as React.CSSProperties,
  wave2:  { ...tagBase, background: '#fef3c7', color: '#78350f', border: '1px solid #fde68a' } as React.CSSProperties,
  wave3:  { ...tagBase, background: '#fde7f3', color: '#9d174d', border: '1px solid #f9b4d2' } as React.CSSProperties,
  date:   { ...tagBase, background: '#f5f2eb', color: '#6b6b60', border: '1px solid #e0ddd8', textTransform: 'none' as const, letterSpacing: 0, fontWeight: 500 } as React.CSSProperties,
}

const s = {
  page:      { background: '#faf9f6', minHeight: '100vh', fontFamily: '-apple-system, sans-serif', color: '#1a1a18', padding: '24px 16px' } as React.CSSProperties,
  container: { maxWidth: 720, margin: '0 auto' } as React.CSSProperties,
  h1:        { fontSize: 22, fontWeight: 700, margin: '0 0 12px', lineHeight: 1.3 } as React.CSSProperties,
  lede:      { fontSize: 14, color: '#5a5a55', lineHeight: 1.6, margin: '0 0 20px' } as React.CSSProperties,
  card:      { background: '#fff', border: '1px solid #e8e5df', borderRadius: 8, padding: '14px 16px', marginBottom: 12 } as React.CSSProperties,
  cardTitle: { fontSize: 13, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.05em', color: '#5a5a55', marginBottom: 10 } as React.CSSProperties,
  cardTitleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 } as React.CSSProperties,
  row:       { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', fontSize: 13, gap: 12, borderBottom: '1px solid #f5f2eb' } as React.CSSProperties,
  label:     { color: '#8a8a80', fontSize: 12 } as React.CSSProperties,
  value:     { fontFamily: '"DM Mono", monospace', fontSize: 12, color: '#1a1a18', wordBreak: 'break-all' as const } as React.CSSProperties,
  mono:      { fontFamily: '"DM Mono", monospace', fontSize: 11, color: '#5a5a55', wordBreak: 'break-all' as const, background: '#f5f2eb', padding: 8, borderRadius: 4, marginBottom: 8 } as React.CSSProperties,
  pre:       { fontFamily: '"DM Mono", monospace', fontSize: 11, color: '#1a1a18', background: '#f5f2eb', padding: 10, borderRadius: 4, overflowX: 'auto' as const, margin: 0 } as React.CSSProperties,
  remark:    { fontSize: 11, color: '#8a8a80', marginTop: 4, fontStyle: 'italic' as const } as React.CSSProperties,
  err:       { color: '#991b1b', fontSize: 12, padding: 6, background: '#fef2f2', borderRadius: 4 } as React.CSSProperties,
  btnPrimary:      { background: '#1a1a18', color: '#faf9f6', border: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
  btnDanger:       { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
  btnSmall:        { background: '#f5f2eb', color: '#1a1a18', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, fontWeight: 500, cursor: 'pointer' } as React.CSSProperties,
  btnDangerSmall:  { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: 4, padding: '4px 10px', fontSize: 12, fontWeight: 500, cursor: 'pointer' } as React.CSSProperties,
  callout:   { background: '#fffbea', border: '1px solid #fbe7a1', borderRadius: 8, padding: '14px 16px' } as React.CSSProperties,
  calloutTitle: { fontSize: 12, fontWeight: 700, color: '#8a5a00', marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: '.05em' } as React.CSSProperties,
  ol:        { margin: 0, paddingLeft: 20, fontSize: 13, color: '#5a4a20', lineHeight: 1.6 } as React.CSSProperties,
  logBox:    { background: '#0f0f0d', color: '#e8e5df', borderRadius: 6, padding: '10px 12px', maxHeight: 280, overflowY: 'auto' as const, fontFamily: '"DM Mono", monospace', fontSize: 11, lineHeight: 1.5 } as React.CSSProperties,
  logRow:    { display: 'flex', gap: 8, alignItems: 'baseline', padding: '1px 0', flexWrap: 'wrap' as const } as React.CSSProperties,
  logTs:     { color: '#7c7a72', flexShrink: 0, minWidth: 90 } as React.CSSProperties,
  logMsg:    { color: '#e8e5df', flexShrink: 0 } as React.CSSProperties,
  logData:   { color: '#7c3aed', opacity: 0.9, wordBreak: 'break-all' as const } as React.CSSProperties,
  curlLabel: { fontSize: 12, color: '#5a5a55', marginBottom: 8 } as React.CSSProperties,
  curlBlockRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 4 } as React.CSSProperties,
  curlBlockTag: { fontSize: 10, fontWeight: 700, color: '#8a8a80', textTransform: 'uppercase' as const, letterSpacing: '.06em' } as React.CSSProperties,
  // Step-runner styles — mirror /admin/api/cap (AdminCapExplorer)
  stepSection: { background: '#fdfcf8', border: '1px solid #f0ede5', borderRadius: 8, padding: '14px 16px 12px', marginTop: 14 } as React.CSSProperties,
  stepHeader:  { display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 } as React.CSSProperties,
  stepTag:     { fontSize: 10, fontWeight: 700, color: '#aaa', letterSpacing: '.06em', textTransform: 'uppercase' as const } as React.CSSProperties,
  stepTitle:   { fontSize: 14, fontWeight: 700, margin: '2px 0 0', color: '#1a1a18' } as React.CSSProperties,
  stepExplain: { fontSize: 12, color: '#5a5a55', lineHeight: 1.55, marginBottom: 10 } as React.CSSProperties,
  reqLine:     { display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 } as React.CSSProperties,
  methodBadge: { fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4 } as React.CSSProperties,
  reqPath:     { fontSize: 12, fontFamily: '"DM Mono", monospace', color: '#555', wordBreak: 'break-all' as const } as React.CSSProperties,
  duration:    { fontSize: 11, color: '#aaa', marginLeft: 'auto' as const } as React.CSSProperties,
  headersBlock:{ background: '#faf9f6', border: '1px solid #f0ede5', borderRadius: 4, padding: '6px 10px', marginTop: 6 } as React.CSSProperties,
  headerRow:   { fontSize: 11, fontFamily: '"DM Mono", monospace', color: '#5a5a55', padding: '1px 0', wordBreak: 'break-all' as const } as React.CSSProperties,
  headerKey:   { color: '#8a8a80' } as React.CSSProperties,
  headerVal:   { color: '#1a1a18' } as React.CSSProperties,
  respLine:    { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 } as React.CSSProperties,
  statusBadge: { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6 } as React.CSSProperties,
  respBody:    { background: '#111', color: '#e8e8e8', borderRadius: 8, padding: '10px 12px', fontSize: 11, overflowX: 'auto' as const, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const, margin: 0, lineHeight: 1.5, maxHeight: 320, fontFamily: '"DM Mono", monospace' } as React.CSSProperties,
  btnCurl:     { background: '#f5f2eb', color: '#1a1a18', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
}
