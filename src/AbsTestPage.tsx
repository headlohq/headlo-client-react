import React from 'react'
import { HeadloProviderV2, useHeadloAuth, useUser, SignInButton, SignOutButton, SignedIn, SignedOut, dpopFetch, getExistingKeyPair, signDpopProof } from 'headlo-auth'
import { DpopAuthBridge } from './DpopAuthBridge'

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
const publishableKey = import.meta.env.VITE_HEADLO_PUBLISHABLE_KEY as string

export default function AbsTestPage() {
  return (
    <HeadloProviderV2
      publishableKey={publishableKey}
      issuer={authIssuer}
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
  const { isLoaded, isSignedIn, getToken } = useHeadloAuth()
  const user = useUser()

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

  const [steps, setSteps] = React.useState<{ bearer?: StepState; dpop?: StepState }>({})
  const [runningAll, setRunningAll] = React.useState(false)
  const [copyState, setCopyState] = React.useState<Record<string, boolean>>({})

  function updateStep(id: 'bearer' | 'dpop', patch: Partial<StepState>) {
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
        <h1 style={s.h1}>ABS Phase A Test — HeadloProviderV2 (DPoP + cookie-less)</h1>
        <p style={s.lede}>
          Sibling test to <code>/abs-spike</code>. This page uses <strong>HeadloProviderV2</strong>
          {' '}(DPoP-anchored, no refresh cookie) instead of v1. Verifies the end-to-end
          {' '}session flow works on iOS Safari on this third-party domain — the load-bearing
          {' '}claim of ABS Phase A.
        </p>

        <div style={s.card}>
          <div style={s.cardTitle}>Auth state</div>
          <div style={s.row}><span style={s.label}>isLoaded</span> <code>{String(isLoaded)}</code></div>
          <div style={s.row}><span style={s.label}>isSignedIn</span> <code>{String(isSignedIn)}</code></div>
          <div style={s.row}><span style={s.label}>user.id</span> <code>{user?.id ?? '—'}</code></div>
          <div style={s.row}><span style={s.label}>user.email</span> <code>{user?.email ?? '—'}</code></div>
          <div style={s.row}><span style={s.label}>user.displayName</span> <code>{user?.displayName ?? '—'}</code></div>

          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <SignedOut>
              <SignInButton style={s.btnPrimary}>Sign in with Headlo (v2)</SignInButton>
            </SignedOut>
            <SignedIn>
              <SignOutButton style={s.btnDanger}>Sign out</SignOutButton>
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
