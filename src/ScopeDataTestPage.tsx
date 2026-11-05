// Test page for the Phase 1 scoped data endpoints (headlo-scope-endpoints-plan.md).
//
// Covers 8 endpoints across 3 scopes:
//   user:read           GET   /v1/scope/user/profile
//   user:write          PATCH /v1/scope/user/profile
//   content:read        GET   /v1/scope/records/:collection_id
//                       GET   /v1/scope/records/:collection_id/:record_id
//   content:write       POST  /v1/scope/records/:collection_id
//                       PATCH /v1/scope/records/:collection_id/:record_id
//   collection:read     GET   /v1/scope/collections
//                       GET   /v1/scope/collections/:collection_id
//
// Auth model: page is wrapped in HeadloProviderV2 (DPoP + cookie-less). When
// signed in, the V2 access token is attached as `Authorization: Bearer <token>`
// to the /v1/prop/token/exchange call PLUS a `DPoP:` proof signed by the same
// IndexedDB keypair. The exchange endpoint verifies the bearer, requires the
// DPoP proof (because the bearer has cnf.jkt), extracts `sub`, and mints the
// PROP access token with that sub populated. Panels then hit /v1/scope/* with
// the PROP token and — because sub is present — the requireSub guards pass
// instead of returning 400 REQUIRES_SIGNED_IN_USER.
//
// DPoP enforcement on the exchange closes a downgrade: without it, a stolen
// V2 bearer JWT alone would be enough to mint a user-flavored PROP token.
// Requiring a proof means the caller must also hold the extractable:false
// private key living in IndexedDB.
//
// Signed out = anonymous exchange (no bearer attached) — same behavior as
// before: /v1/scope/* endpoints still return 400 REQUIRES_SIGNED_IN_USER on
// the anon PROP token. Both flows exercised on the same page.

import React, { useState } from 'react'
import { HeadloProviderV2, useHeadloAuth, useHeadloUser as useUser, SignInButton, SignOutButton, SignedIn, SignedOut, getExistingKeyPair, signDpopProof } from 'headlo-auth'
import { resolveSharedPk } from './lib/shared-pk'

// Shared with other debug pages via lib/shared-pk. URL param wins, then
// shared LS (headlo:pk-override), then VITE_HEADLO_PUBLISHABLE_KEY env.
const publishableKey = resolveSharedPk().pk
const authIssuer     = import.meta.env.VITE_HEADLO_AUTH_ISSUER     as string
const apiUrl         = import.meta.env.VITE_HEADLO_API_URL         as string

interface ApiResult {
  status: number
  body:   unknown
  used_token: boolean
}

export default function ScopeDataTestPage() {
  return (
    <HeadloProviderV2
      publishableKey={publishableKey}
      issuer={authIssuer}
      signInFallbackRedirectUrl="/scope-data-test"
      signUpFallbackRedirectUrl="/scope-data-test"
    >
      <ScopeDataTestPageInner />
    </HeadloProviderV2>
  )
}

function ScopeDataTestPageInner() {
  const { isLoaded, isSignedIn, getToken } = useHeadloAuth()
  const user = useUser()

  const [scope, setScope] = useState('user:read user:write content:read content:write collection:read')
  const [token, setToken] = useState<string | null>(null)
  const [tokenSub, setTokenSub] = useState<string | null>(null)
  const [tokenRoles, setTokenRoles] = useState<string[] | null>(null)
  const [tokenScope, setTokenScope] = useState<string | null>(null)
  const [exchangeErr, setExchangeErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Per-endpoint state
  const [profileGet,       setProfileGet]       = useState<ApiResult | null>(null)
  const [profilePatch,     setProfilePatch]     = useState<ApiResult | null>(null)
  const [profileNameDraft, setProfileNameDraft] = useState('New name from /scope-data-test')

  const [collectionsList,  setCollectionsList]  = useState<ApiResult | null>(null)
  const [collectionGet,    setCollectionGet]    = useState<ApiResult | null>(null)
  const [collectionIdDraft, setCollectionIdDraft] = useState('')

  const [recordsList,      setRecordsList]      = useState<ApiResult | null>(null)
  const [recordGet,        setRecordGet]        = useState<ApiResult | null>(null)
  const [recordCreate,     setRecordCreate]     = useState<ApiResult | null>(null)
  const [recordUpdate,     setRecordUpdate]     = useState<ApiResult | null>(null)
  const [recordCollDraft,  setRecordCollDraft]  = useState('')
  const [recordIdDraft,    setRecordIdDraft]    = useState('')
  const [recordDataDraft,  setRecordDataDraft]  = useState('{"hello":"world"}')

  async function exchange() {
    setBusy(true)
    setExchangeErr(null)
    setToken(null)
    setTokenSub(null)
    setTokenRoles(null)
    setTokenScope(null)
    try {
      const url = `${apiUrl}/v1/prop/token/exchange`
      const headers: Record<string, string> = {
        'Content-Type':                    'application/json',
        'X-Headlo-Prop-Publishable-Key':   publishableKey,
      }
      // If signed in via V2, attach the DPoP-bound user JWT so the exchange
      // endpoint can extract sub + cnf and mint a user-flavored PROP token.
      // The V2 token has cnf.jkt → server also requires a DPoP proof signed
      // by the same IndexedDB keypair (analogous to middleware/auth.ts § A.5.1).
      // Signed out = no header = anon exchange (unchanged behavior).
      if (isSignedIn) {
        const v2 = await getToken()
        if (v2) {
          headers['Authorization'] = `Bearer ${v2}`
          const kp = await getExistingKeyPair()
          if (kp) {
            headers['DPoP'] = await signDpopProof(kp, { url, method: 'POST' })
          }
        }
      }
      const r = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ scope }),
      })
      const body = await r.json()
      if (r.ok && body.access_token) {
        setToken(body.access_token)
        try {
          const [, payloadB64] = String(body.access_token).split('.')
          const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')))
          setTokenSub((payload.sub as string | undefined) ?? null)
          setTokenRoles(Array.isArray(payload.roles) ? (payload.roles as string[]) : null)
          setTokenScope((payload.scope as string | undefined) ?? null)
        } catch { /* ignore */ }
      } else {
        setExchangeErr(`HTTP ${r.status}: ${body.error ?? 'unknown'} ${body.detail ?? ''}`)
      }
    } catch (e) {
      setExchangeErr(`NETWORK: ${String(e)}`)
    }
    setBusy(false)
  }

  async function call(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    setter: (r: ApiResult) => void,
    body?: unknown,
    attachToken = true,
  ) {
    setBusy(true)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (attachToken && token) headers['Authorization'] = `Bearer ${token}`
      const r = await fetch(`${apiUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      let parsed: unknown
      try { parsed = await r.json() } catch { parsed = await r.text() }
      setter({ status: r.status, body: parsed, used_token: attachToken && !!token })
    } catch (e) {
      setter({ status: 0, body: { error: 'NETWORK', detail: String(e) }, used_token: attachToken && !!token })
    }
    setBusy(false)
  }

  const wrap:     React.CSSProperties = { fontFamily: 'system-ui, sans-serif', maxWidth: 900, margin: '40px auto', padding: '0 16px', color: '#111' }
  const section:  React.CSSProperties = { border: '1px solid #e0ddd8', borderRadius: 12, padding: 20, marginBottom: 16, background: '#fff' }
  const label:    React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#333' }
  const input:    React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13, fontFamily: 'ui-monospace, monospace', boxSizing: 'border-box' }
  const btn:      React.CSSProperties = { padding: '8px 14px', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: '#1a1a18', color: '#faf9f6' }
  const btnDis:   React.CSSProperties = { ...btn, background: '#8a8a80', cursor: 'default' }
  const btnWarn:  React.CSSProperties = { ...btn, background: '#7a2323' }
  const codeBox:  React.CSSProperties = { background: '#f5f2eb', padding: 10, borderRadius: 6, fontFamily: 'ui-monospace, monospace', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#111' }
  const statusOk:  React.CSSProperties = { color: '#166534', fontWeight: 600 }
  const statusBad: React.CSSProperties = { color: '#b91c1c', fontWeight: 600 }

  function StatusHint({ res, expectedOK }: { res: ApiResult; expectedOK?: number }) {
    const isOk = res.status >= 200 && res.status < 300
    return (
      <span style={{ fontSize: 11, marginLeft: 8 }}>
        {isOk && expectedOK === res.status && <span style={statusOk}>✓ expected {expectedOK}</span>}
        {res.status === 401 && <span style={statusBad}>✓ correctly rejected — no token</span>}
        {res.status === 400 && <span style={statusBad}>✓ correctly rejected — anonymous token (needs sub)</span>}
        {res.status === 403 && <span style={statusBad}>✓ correctly rejected — missing scope</span>}
        {res.status === 404 && <span style={statusBad}>not found</span>}
        {res.status >= 500 && <span style={statusBad}>server error</span>}
      </span>
    )
  }

  function EndpointPanel({
    title, method, path, scopeName, expectedOK, controls, res, onFire, onFireNoToken,
  }: {
    title: string
    method: string
    path: string
    scopeName: string
    expectedOK?: number
    controls?: React.ReactNode
    res: ApiResult | null
    onFire: () => void
    onFireNoToken?: () => void
  }) {
    return (
      <div style={section}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{title}</span>
          <code style={{ fontSize: 11, background: '#f5f2eb', padding: '2px 8px', borderRadius: 3 }}>{method} {path}</code>
          <span style={{ fontSize: 11, color: '#666' }}>requires scope <code>{scopeName}</code></span>
        </div>
        {controls}
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <button style={busy || !token ? btnDis : btn} onClick={onFire} disabled={busy || !token}>
            Fire with token
          </button>
          {onFireNoToken && (
            <button style={busy ? btnDis : btnWarn} onClick={onFireNoToken} disabled={busy}>
              Fire WITHOUT token
            </button>
          )}
        </div>
        {res && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, marginBottom: 4 }}>
              <span style={res.status >= 200 && res.status < 300 ? statusOk : statusBad}>HTTP {res.status}</span>
              <span style={{ fontSize: 10, color: '#8a8a80', marginLeft: 8 }}>
                {res.used_token ? 'with Bearer token' : 'no Authorization header'}
              </span>
              <StatusHint res={res} expectedOK={expectedOK} />
            </div>
            <div style={codeBox}>{JSON.stringify(res.body, null, 2)}</div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Scope data endpoints — Phase 1</h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 8 }}>
        Tests the 8 endpoints under <code>/v1/scope/user/profile</code>, <code>/v1/scope/records/*</code>, and <code>/v1/scope/collections/*</code> shipped for Phase 1 of the scope endpoints plan.
      </p>

      {/* Auth panel — HeadloProviderV2 (DPoP + cookie-less) */}
      <div style={section}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Sign in (HeadloProviderV2)</div>
          <div style={{ fontSize: 11, color: '#666' }}>
            isLoaded <code>{String(isLoaded)}</code> · isSignedIn <code>{String(isSignedIn)}</code>
          </div>
        </div>
        <p style={{ fontSize: 12, color: '#666', margin: '0 0 12px' }}>
          When signed in, the exchange call below attaches your V2 access token as <code>Authorization: Bearer</code> <strong>plus</strong> a <code>DPoP:</code> proof signed by the IndexedDB keypair (extractable: false). Server verifies both, requires the proof to match <code>cnf.jkt</code>, extracts <code>sub</code>, and mints a PROP token with your user id populated — turning the anon <code>400 REQUIRES_SIGNED_IN_USER</code> panels into real <code>200</code>s. A stolen bearer alone won't work: no key, no proof, no PROP token.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <SignedOut>
            <SignInButton style={btn}>Sign in with Headlo</SignInButton>
          </SignedOut>
          <SignedIn>
            <SignOutButton style={{ ...btn, background: '#7a2323' }}>Sign out</SignOutButton>
            <span style={{ fontSize: 12, color: '#333' }}>
              <span style={{ color: '#666' }}>signed in as </span>
              <code>{user?.email ?? user?.id ?? '(no email)'}</code>
              {user?.id && <span style={{ color: '#666', marginLeft: 6 }}>sub={user.id.slice(0, 12)}…</span>}
            </span>
          </SignedIn>
        </div>
      </div>

      <div style={{ padding: 12, background: '#fef8ee', border: '1px solid #f5e0b8', borderRadius: 6, fontSize: 12, color: '#111', marginBottom: 16 }}>
        <strong>How it works:</strong> Signed out → exchange returns an anon token (no sub) → every panel returns <code>400 REQUIRES_SIGNED_IN_USER</code> (auth wall proven). Signed in → exchange attaches your V2 bearer → server sets <code>sub</code> on the PROP token → panels return real <code>200</code>s. Both paths exercised on the same page. No custom header — the bearer piggybacks on standard OAuth 2 machinery.
      </div>

      {/* Panel 0 — exchange */}
      <div style={section}>
        <h2 style={{ fontSize: 16, marginTop: 0, marginBottom: 12 }}>0. Exchange for a scoped token</h2>
        <div style={{ marginBottom: 10 }}>
          <label style={label}>Requested scopes (space-separated)</label>
          <input style={input} value={scope} onChange={e => setScope(e.target.value)} spellCheck={false} />
        </div>
        <button style={busy ? btnDis : btn} onClick={exchange} disabled={busy}>
          {busy ? 'Exchanging…' : `POST /v1/prop/token/exchange ${isSignedIn ? '(with V2 bearer)' : '(anon)'}`}
        </button>
        {token && (
          <div style={{ marginTop: 10, fontSize: 11, color: '#166534' }}>
            ✓ token acquired ({token.length} chars) — every panel below uses this
            {tokenSub
              ? <> · <strong>sub</strong>=<code>{tokenSub.slice(0, 12)}…</code> (signed-in) — <span style={{ color: '#166534' }}>scope panels should now return 200</span></>
              : <> · <strong>sub</strong>=<em>anon</em> — <span style={{ color: '#b91c1c' }}>scope panels will 400 REQUIRES_SIGNED_IN_USER</span></>}
            {tokenScope !== null && (
              <div style={{ marginTop: 4, color: '#333' }}>
                <strong>granted scope</strong>=<code>{tokenScope || '(empty)'}</code>
              </div>
            )}
            {tokenRoles !== null
              ? <div style={{ marginTop: 4, color: '#333' }}>
                  <strong>roles</strong>=<code>[{tokenRoles.join(', ')}]</code> — role gate applied, requested scopes were intersected with your role's allow-list
                </div>
              : tokenSub
                ? <div style={{ marginTop: 4, color: '#8a5a00' }}>
                    <strong>roles</strong>=<em>none assigned</em> — grandfathered permissive (no <code>prop_server.user_role</code> row for you in this agency). Assign yourself a role to enable per-user scope filtering.
                  </div>
                : null}
          </div>
        )}
        {exchangeErr && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#b91c1c' }}>{exchangeErr}</div>
        )}
      </div>

      <h2 style={{ fontSize: 18, margin: '24px 0 12px' }}>User profile ({'user:read'} / {'user:write'})</h2>

      <EndpointPanel
        title="Get profile"
        method="GET" path="/v1/scope/user/profile" scopeName="user:read" expectedOK={200}
        res={profileGet}
        onFire={() => call('GET', '/v1/scope/user/profile', setProfileGet)}
        onFireNoToken={() => call('GET', '/v1/scope/user/profile', setProfileGet, undefined, false)}
      />

      <EndpointPanel
        title="Update profile name"
        method="PATCH" path="/v1/scope/user/profile" scopeName="user:write" expectedOK={200}
        controls={
          <div>
            <label style={label}>Name (body)</label>
            <input style={input} value={profileNameDraft} onChange={e => setProfileNameDraft(e.target.value)} />
          </div>
        }
        res={profilePatch}
        onFire={() => call('PATCH', '/v1/scope/user/profile', setProfilePatch, { name: profileNameDraft })}
      />

      <h2 style={{ fontSize: 18, margin: '24px 0 12px' }}>Collections ({'collection:read'})</h2>

      <EndpointPanel
        title="List collections"
        method="GET" path="/v1/scope/collections" scopeName="collection:read" expectedOK={200}
        res={collectionsList}
        onFire={() => call('GET', '/v1/scope/collections', setCollectionsList)}
      />

      <EndpointPanel
        title="Get single collection"
        method="GET" path="/v1/scope/collections/:collection_id" scopeName="collection:read" expectedOK={200}
        controls={
          <div>
            <label style={label}>collection_id</label>
            <input style={input} value={collectionIdDraft} onChange={e => setCollectionIdDraft(e.target.value)} placeholder="a UUID from the list above" />
          </div>
        }
        res={collectionGet}
        onFire={() => call('GET', `/v1/scope/collections/${encodeURIComponent(collectionIdDraft)}`, setCollectionGet)}
      />

      <h2 style={{ fontSize: 18, margin: '24px 0 12px' }}>Records ({'content:read'} / {'content:write'})</h2>

      <EndpointPanel
        title="List records"
        method="GET" path="/v1/scope/records/:collection_id" scopeName="content:read" expectedOK={200}
        controls={
          <div>
            <label style={label}>collection_id</label>
            <input style={input} value={recordCollDraft} onChange={e => setRecordCollDraft(e.target.value)} placeholder="a UUID" />
          </div>
        }
        res={recordsList}
        onFire={() => call('GET', `/v1/scope/records/${encodeURIComponent(recordCollDraft)}`, setRecordsList)}
      />

      <EndpointPanel
        title="Get single record"
        method="GET" path="/v1/scope/records/:collection_id/:record_id" scopeName="content:read" expectedOK={200}
        controls={
          <div style={{ display: 'grid', gap: 6 }}>
            <div>
              <label style={label}>collection_id</label>
              <input style={input} value={recordCollDraft} onChange={e => setRecordCollDraft(e.target.value)} />
            </div>
            <div>
              <label style={label}>record_id</label>
              <input style={input} value={recordIdDraft} onChange={e => setRecordIdDraft(e.target.value)} placeholder="a UUID" />
            </div>
          </div>
        }
        res={recordGet}
        onFire={() => call('GET', `/v1/scope/records/${encodeURIComponent(recordCollDraft)}/${encodeURIComponent(recordIdDraft)}`, setRecordGet)}
      />

      <EndpointPanel
        title="Create record"
        method="POST" path="/v1/scope/records/:collection_id" scopeName="content:write" expectedOK={201}
        controls={
          <div style={{ display: 'grid', gap: 6 }}>
            <div>
              <label style={label}>collection_id</label>
              <input style={input} value={recordCollDraft} onChange={e => setRecordCollDraft(e.target.value)} />
            </div>
            <div>
              <label style={label}>data (JSON, body <code>{'{ data }'}</code>)</label>
              <input style={input} value={recordDataDraft} onChange={e => setRecordDataDraft(e.target.value)} />
            </div>
          </div>
        }
        res={recordCreate}
        onFire={() => {
          let data: unknown
          try { data = JSON.parse(recordDataDraft) } catch { data = { _parse_error: recordDataDraft } }
          void call('POST', `/v1/scope/records/${encodeURIComponent(recordCollDraft)}`, setRecordCreate, { data })
        }}
      />

      <EndpointPanel
        title="Update record"
        method="PATCH" path="/v1/scope/records/:collection_id/:record_id" scopeName="content:write" expectedOK={200}
        controls={
          <div style={{ display: 'grid', gap: 6 }}>
            <div>
              <label style={label}>collection_id</label>
              <input style={input} value={recordCollDraft} onChange={e => setRecordCollDraft(e.target.value)} />
            </div>
            <div>
              <label style={label}>record_id</label>
              <input style={input} value={recordIdDraft} onChange={e => setRecordIdDraft(e.target.value)} />
            </div>
            <div>
              <label style={label}>data (JSON, body <code>{'{ data }'}</code>)</label>
              <input style={input} value={recordDataDraft} onChange={e => setRecordDataDraft(e.target.value)} />
            </div>
          </div>
        }
        res={recordUpdate}
        onFire={() => {
          let data: unknown
          try { data = JSON.parse(recordDataDraft) } catch { data = { _parse_error: recordDataDraft } }
          void call('PATCH', `/v1/scope/records/${encodeURIComponent(recordCollDraft)}/${encodeURIComponent(recordIdDraft)}`, setRecordUpdate, { data })
        }}
      />

      <div style={{ marginTop: 24, padding: 16, background: '#f0f6ff', border: '1px solid #cfe0f7', borderRadius: 8, fontSize: 12 }}>
        <strong>Related:</strong>{' '}
        <a href="/scope-test" style={{ color: '#2a6a3a' }}>/scope-test</a> (token exchange + scoped LLM chat + bundle inspection) ·{' '}
        <a href="/abs-test" style={{ color: '#2a6a3a' }}>/abs-test</a> (V2 provider primitives) ·{' '}
        <a href="https://www.npmjs.com/package/headlo-server" target="_blank" rel="noreferrer" style={{ color: '#2a6a3a' }}>headlo-server</a> npm ·{' '}
        <a href="https://www.headlo.com/docs/headlo-server" target="_blank" rel="noreferrer" style={{ color: '#2a6a3a' }}>docs</a>
      </div>
    </div>
  )
}
