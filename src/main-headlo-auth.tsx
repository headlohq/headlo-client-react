import React from 'react'
import ReactDOM from 'react-dom/client'
import { HeadloProvider, useHeadloAuth, useHeadloUser, SignInButton, SignOutButton } from 'headlo-auth'
import { createService } from 'headlo'
import { PropServer, PropPreload, useComponent } from 'headlo-react'

const issuer  = import.meta.env.VITE_HEADLO_AUTH_ISSUER as string | undefined ?? 'http://localhost:8788'
const authKey = import.meta.env.VITE_HEADLO_AUTH_KEY    as string | undefined ?? 'pk_test_local'
const propKey = import.meta.env.VITE_HEADLO_PROP_KEY    as string | undefined ?? ''
const propApi = import.meta.env.VITE_HEADLO_API_URL     as string | undefined ?? 'http://localhost:8787'

const prop = createService({ publishableKey: propKey, url: propApi })

// ── Auth test ────────────────────────────────────────────────────────────────

function AuthTest() {
  const { isLoaded, isSignedIn, getToken } = useHeadloAuth()
  const user = useHeadloUser()
  const [token, setToken] = React.useState<string | null>(null)

  if (!isLoaded) return <p style={s.muted}>Loading…</p>

  return (
    <div style={s.section}>
      <div style={s.sectionTitle}>HeadloProvider — headlo-auth</div>
      <div style={s.card}>
        <div style={s.label}>Issuer</div>
        <code style={s.code}>{issuer}</code>
      </div>
      <div style={s.card}>
        <div style={s.label}>Status</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: isSignedIn ? '#2a7a3a' : '#8a8a80' }}>
          {isSignedIn ? '✓ Signed in' : 'Not signed in'}
        </div>
      </div>
      {user && (
        <div style={s.card}>
          <div style={s.label}>User</div>
          <div style={{ fontSize: 14 }}>{user.email}</div>
          <div style={{ fontSize: 12, color: '#8a8a80', marginTop: 2 }}>id: {user.id}</div>
          {user.displayName && <div style={{ fontSize: 12, color: '#8a8a80' }}>name: {user.displayName}</div>}
        </div>
      )}
      {token && (
        <div style={s.card}>
          <div style={s.label}>JWT</div>
          <code style={{ ...s.code, wordBreak: 'break-all' as const, fontSize: 11 }}>{token}</code>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        {!isSignedIn && <SignInButton style={s.btn}>Sign in with headlo-oauth →</SignInButton>}
        {isSignedIn && (
          <>
            <button style={{ ...s.btn, background: '#f5f2eb', color: '#1a1a18', border: '1px solid #e8e5df' }}
              onClick={async () => setToken(await getToken())}>
              Get token
            </button>
            <SignOutButton style={{ ...s.btn, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
              Sign out
            </SignOutButton>
          </>
        )}
      </div>
    </div>
  )
}

// ── PROP service test ─────────────────────────────────────────────────────────

function PropServiceTest() {
  const [result,  setResult]  = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  async function fetchManifest() {
    setLoading(true); setResult(null)
    try {
      setResult(JSON.stringify(await prop.service('headlo-auth', 'v1').manifest(), null, 2))
    } catch (e) { setResult(String(e)) }
    finally { setLoading(false) }
  }

  async function fetchBundle() {
    setLoading(true); setResult(null)
    try {
      const url  = prop.service('headlo-auth', 'v1').bundleUrl()
      const text = await fetch(url).then(r => r.text())
      setResult(text.slice(0, 800) + (text.length > 800 ? '\n…' : ''))
    } catch (e) { setResult(String(e)) }
    finally { setLoading(false) }
  }

  return (
    <div style={s.section}>
      <div style={s.sectionTitle}>
        PROP Service — <code style={s.inline}>import {'{ auth }'} from 'prop:service:auth'</code>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button style={s.btn} onClick={fetchManifest} disabled={loading}>
          prop.service('headlo-auth', 'v1').manifest()
        </button>
        <button style={{ ...s.btn, background: '#2a4a7a' }} onClick={fetchBundle} disabled={loading}>
          prop.service('headlo-auth', 'v1').bundleUrl()
        </button>
      </div>
      {result && <pre style={s.pre}>{result}</pre>}
    </div>
  )
}

// ── PROP component test ───────────────────────────────────────────────────────

function PropComponentTest() {
  const { loaded, error } = useComponent('headlo-auth-button')
  const [defResult, setDefResult] = React.useState<string | null>(null)
  const [loading,   setLoading]   = React.useState(false)

  async function fetchDef() {
    setLoading(true); setDefResult(null)
    try {
      setDefResult(JSON.stringify(await prop.component('headlo-auth-button').def(), null, 2))
    } catch (e) { setDefResult(String(e)) }
    finally { setLoading(false) }
  }

  return (
    <div style={s.section}>
      <div style={s.sectionTitle}>
        PROP Component — <code style={s.inline}>import AuthButton from 'prop:component:headlo-auth-button'</code>
      </div>
      <div style={{ fontSize: 12, color: loaded ? '#2a6a3a' : error ? '#991b1b' : '#8a8a80', marginTop: 8, fontFamily: 'DM Mono, monospace' }}>
        {loaded ? '✓ bundle loaded — custom element registered' : error ? String(error) : 'loading…'}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button style={s.btn} onClick={fetchDef} disabled={loading}>
          prop.component('headlo-auth-button').def()
        </button>
      </div>
      {loaded && (
        <div style={{ marginTop: 16, padding: '16px', background: '#f5f2eb', borderRadius: 8 }}>
          <div style={s.label}>Mounted custom element — {'<headlo-auth-button>'}</div>
          {/* @ts-ignore */}
          <headlo-auth-button style={{ marginTop: 8, display: 'block' }} />
        </div>
      )}
      {defResult && <pre style={s.pre}>{defResult}</pre>}
    </div>
  )
}

// ── styles ───────────────────────────────────────────────────────────────────

const s = {
  wrap:        { maxWidth: 640, margin: '40px auto', padding: '0 24px', fontFamily: "'DM Sans', sans-serif" } as React.CSSProperties,
  section:     { background: '#fff', border: '1px solid #e8e5df', borderRadius: 10, padding: '20px 24px', marginBottom: 16 } as React.CSSProperties,
  sectionTitle:{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: '#1a1a18' } as React.CSSProperties,
  card:        { background: '#faf9f6', border: '1px solid #e8e5df', borderRadius: 6, padding: '10px 14px', marginBottom: 8 } as React.CSSProperties,
  label:       { fontSize: 11, color: '#8a8a80', textTransform: 'uppercase' as const, letterSpacing: '.05em', marginBottom: 4 },
  code:        { fontSize: 12, fontFamily: "'DM Mono', monospace", color: '#1a1a18', display: 'block' } as React.CSSProperties,
  inline:      { fontSize: 11, fontFamily: "'DM Mono', monospace", background: '#f0ede6', padding: '1px 5px', borderRadius: 3 } as React.CSSProperties,
  muted:       { color: '#8a8a80', fontFamily: 'sans-serif', padding: 40 } as React.CSSProperties,
  btn:         { padding: '8px 14px', background: '#1a1a18', color: '#faf9f6', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer' } as React.CSSProperties,
  pre:         { marginTop: 12, background: '#111', color: '#e8e8e8', borderRadius: 8, padding: '12px 14px', fontSize: 11, fontFamily: 'DM Mono, monospace', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 320, overflowY: 'auto' } as React.CSSProperties,
}

// ── mount ────────────────────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById('root')!).render(
  <HeadloProvider publishableKey={authKey} issuer={issuer}>
    <PropServer publishableKey={propKey} url={propApi}>
      <PropPreload
        dist={[{ runtime: 'react', version: '19' }]}
        components={['headlo-auth-button']}
      />
      <div style={{ background: '#faf9f6', minHeight: '100vh' }}>
        <div style={{ borderBottom: '1px solid #e8e5df', padding: '0 24px', height: 52, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'DM Sans, sans-serif' }}>headlo-auth + PROP test</span>
          <span style={{ fontSize: 12, color: '#8a8a80', fontFamily: 'DM Mono, monospace' }}>{propApi}</span>
        </div>
        <div style={s.wrap}>
          <AuthTest />
          <PropServiceTest />
          <PropComponentTest />
        </div>
      </div>
    </PropServer>
  </HeadloProvider>
)
