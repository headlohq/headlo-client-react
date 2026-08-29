import React from 'react'

// PROP-service-only auth demo (v2 / DPoP flavor).
//
// Deliberately mounted OUTSIDE any HeadloProvider tree — proves that a page
// can drive full auth (sign-in, sign-out, protected fetch) purely via the
// PROP service bundle, without importing anything from the headlo-auth React
// SDK. Vanilla-HTML pages and non-React frameworks follow the exact same
// pattern.
//
// Route: /demo/prop-auth-v2 (registered in App.tsx before the provider tree).
//
// Load sequence:
//   1. Set window.__headlo_api_url so the runtime script inside the service
//      bundle knows where to fetch /v1/prop/auth-runtime/v2/bundle from.
//   2. Inject <script src=".../v1/prop/service/headlo-auth/v2/bundle">.
//   3. On load, read window.__headlo_service_headlo_auth_v2 → drive UI.
//   4. Listen for `headlo:auth:change` on window → re-read state on any auth
//      transition (sign-in / sign-out / token refresh / cross-instance sync).

const apiUrl = import.meta.env.VITE_HEADLO_API_URL as string

interface AuthSvc {
  getToken:   () => Promise<{ token: string | null; expiresAt: number | null }>
  getUser:    () => Promise<{ userId: string | null; email: string | null; displayName: string | null; verified: boolean }>
  isSignedIn: () => Promise<{ signedIn: boolean }>
  signIn:     (args: { returnUrl?: string }) => Promise<{ url: string | null }>
  signOut:    () => Promise<{ signedOut: boolean }>
  authFetch:  (args: { url: string; options?: RequestInit }) => Promise<{ status: number; ok: boolean; body: unknown; headers: Record<string, string> }>
}

declare global {
  interface Window {
    __headlo_service_headlo_auth_v2?: AuthSvc
    __headlo_api_url?:                string
  }
}

export default function PropAuthV2Demo() {
  const [svc,       setSvc]       = React.useState<AuthSvc | null>(null)
  const [loadErr,   setLoadErr]   = React.useState<string | null>(null)
  const [signedIn,  setSignedIn]  = React.useState<boolean | null>(null)
  const [user,      setUser]      = React.useState<Awaited<ReturnType<AuthSvc['getUser']>> | null>(null)
  const [token,     setToken]     = React.useState<string | null>(null)
  const [fetchOut,  setFetchOut]  = React.useState<string | null>(null)

  React.useEffect(() => {
    window.__headlo_api_url = apiUrl

    if (window.__headlo_service_headlo_auth_v2) {
      setSvc(window.__headlo_service_headlo_auth_v2)
      return
    }

    const s = document.createElement('script')
    s.src   = `${apiUrl}/v1/prop/service/headlo-auth/v2/bundle?t=${Date.now()}`
    s.async = true
    s.onload  = () => {
      const found = window.__headlo_service_headlo_auth_v2
      if (!found) { setLoadErr('bundle loaded but window.__headlo_service_headlo_auth_v2 is missing'); return }
      setSvc(found)
    }
    s.onerror = () => setLoadErr('failed to load v2 bundle')
    document.head.appendChild(s)
  }, [])

  React.useEffect(() => {
    if (!svc) return
    let cancelled = false

    const refresh = async () => {
      const [{ signedIn }, u, t] = await Promise.all([
        svc.isSignedIn(),
        svc.getUser(),
        svc.getToken(),
      ])
      if (cancelled) return
      setSignedIn(signedIn)
      setUser(u)
      setToken(t.token)
    }

    refresh()
    window.addEventListener('headlo:auth:change', refresh as EventListener)
    return () => {
      cancelled = true
      window.removeEventListener('headlo:auth:change', refresh as EventListener)
    }
  }, [svc])

  const handleSignIn  = async () => {
    if (!svc) return
    // Pass path (not full URL) — HeadloAuthClientV2.signIn prepends
    // window.location.origin to build redirect_uri.
    await svc.signIn({ returnUrl: window.location.pathname + window.location.search })
  }
  const handleSignOut = async () => { if (svc) await svc.signOut() }
  const handleAuthFetch = async () => {
    if (!svc) return
    setFetchOut('…')
    const res = await svc.authFetch({ url: `${apiUrl}/oauth/userinfo` })
    setFetchOut(JSON.stringify({ status: res.status, ok: res.ok, body: res.body }, null, 2))
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <div style={titleStyle}>PROP Auth v2 demo</div>
          <div style={subtitleStyle}>Framework-agnostic auth via <code style={codeStyle}>window.__headlo_service_headlo_auth_v2</code></div>
        </div>

        {loadErr && (
          <div style={errStyle}>Bundle load failed: {loadErr}</div>
        )}

        {!svc && !loadErr && (
          <div style={dimStyle}>Loading v2 bundle from <code style={codeStyle}>{apiUrl}/v1/prop/service/headlo-auth/v2/bundle</code>…</div>
        )}

        {svc && (
          <>
            <Row label="isSignedIn" value={signedIn == null ? '…' : String(signedIn)} />
            <Row label="userId"     value={user?.userId      ?? '—'} />
            <Row label="email"      value={user?.email       ?? '—'} />
            <Row label="displayName" value={user?.displayName ?? '—'} />
            <Row label="verified"   value={user == null ? '…' : String(user.verified)} />
            <Row label="token"      value={token ? token.slice(0, 24) + '…' : '—'} mono />

            <div style={btnRowStyle}>
              {signedIn
                ? <button onClick={handleSignOut} style={btnStyle}>Sign out</button>
                : <button onClick={handleSignIn}  style={btnPrimaryStyle}>Sign in</button>
              }
              <button onClick={handleAuthFetch} style={btnStyle} disabled={!signedIn}>
                authFetch /oauth/userinfo
              </button>
            </div>

            {fetchOut && (
              <pre style={preStyle}>{fetchOut}</pre>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={rowStyle}>
      <div style={rowLabelStyle}>{label}</div>
      <div style={{ ...rowValueStyle, fontFamily: mono ? 'var(--font-mono, ui-monospace, Menlo, monospace)' : undefined }}>
        {value}
      </div>
    </div>
  )
}

const pageStyle:     React.CSSProperties = { minHeight: '100vh', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 24px', background: '#faf9f6', fontFamily: '-apple-system, sans-serif' }
const cardStyle:     React.CSSProperties = { width: '100%', maxWidth: 560, background: 'white', border: '1px solid #eaeae0', borderRadius: 12, padding: 24, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }
const headerStyle:   React.CSSProperties = { marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #f0efe6' }
const titleStyle:    React.CSSProperties = { fontSize: 18, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }
const subtitleStyle: React.CSSProperties = { fontSize: 13, color: '#8a8a80' }
const rowStyle:      React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', fontSize: 14, borderBottom: '1px solid #f6f5ec' }
const rowLabelStyle: React.CSSProperties = { color: '#8a8a80', minWidth: 100 }
const rowValueStyle: React.CSSProperties = { color: '#1a1a1a', textAlign: 'right', wordBreak: 'break-all' }
const btnRowStyle:   React.CSSProperties = { display: 'flex', gap: 8, marginTop: 20 }
const btnStyle:      React.CSSProperties = { flex: 1, padding: '10px 14px', background: '#f6f5ec', color: '#1a1a1a', border: '1px solid #eaeae0', borderRadius: 8, fontSize: 14, cursor: 'pointer' }
const btnPrimaryStyle: React.CSSProperties = { ...btnStyle, background: '#1a1a1a', color: 'white', borderColor: '#1a1a1a' }
const codeStyle:     React.CSSProperties = { fontFamily: 'var(--font-mono, ui-monospace, Menlo, monospace)', fontSize: 12, background: '#f6f5ec', padding: '1px 5px', borderRadius: 3 }
const errStyle:      React.CSSProperties = { padding: 12, background: '#fdf0f0', border: '1px solid #f3c1c1', borderRadius: 8, color: '#a11', fontSize: 13 }
const dimStyle:      React.CSSProperties = { padding: 12, color: '#8a8a80', fontSize: 13 }
const preStyle:      React.CSSProperties = { marginTop: 16, padding: 12, background: '#faf9f6', border: '1px solid #eaeae0', borderRadius: 8, fontFamily: 'var(--font-mono, ui-monospace, Menlo, monospace)', fontSize: 12, color: '#1a1a1a', overflowX: 'auto' }
