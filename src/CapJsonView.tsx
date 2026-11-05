import React from 'react'
import { useAuth, useUser, useClerk } from '@clerk/clerk-react'

// GET /v1/plugin/cap/:cap_id inspector.
//
// Uses Clerk auth because that's what capGetHandler resolves against
// (routes/cap.ts:652 resolveClerkUser). Owner-gated: if the cap_id you
// enter wasn't submitted by the signed-in Clerk user, the server returns
// 403 FORBIDDEN — that's the endpoint's own rule, not a page bug.

const apiUrl = import.meta.env.VITE_HEADLO_API_URL as string

export default function CapJsonView() {
  const { isLoaded, isSignedIn }  = useUser()
  const { getToken, signOut }     = useAuth()
  const clerk                     = useClerk()

  const [capId, setCapId] = React.useState<string>(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('cap_id')
    const envDefault = import.meta.env.VITE_HEADLO_DEFAULT_CAP_ID as string | undefined
    return fromUrl ?? envDefault ?? '89ac1e46060d'
  })
  const [apiOverride, setApiOverride] = React.useState<string>(apiUrl ?? '')
  const [status, setStatus]           = React.useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [httpStatus, setHttpStatus]   = React.useState<number | null>(null)
  const [tookMs, setTookMs]           = React.useState<number | null>(null)
  const [response, setResponse]       = React.useState<string>('')
  const [error, setError]             = React.useState<string>('')
  const [copied, setCopied]           = React.useState<string | null>(null)

  const url = `${apiOverride.replace(/\/$/, '')}/v1/plugin/cap/${encodeURIComponent(capId)}`

  async function fetchCap() {
    if (!isSignedIn) { setError('Sign in with Clerk first'); return }
    if (!capId.trim()) { setError('Enter a cap_id'); return }
    setStatus('loading'); setError(''); setResponse(''); setHttpStatus(null); setTookMs(null)
    const t0 = Date.now()
    try {
      const jwt = await getToken()
      if (!jwt) { setStatus('error'); setError('No Clerk token — try refreshing sign-in'); return }
      const r = await fetch(url, { headers: { Authorization: `Bearer ${jwt}` } })
      const text = await r.text()
      let pretty = text
      try { pretty = JSON.stringify(JSON.parse(text), null, 2) } catch { /* leave as-is */ }
      setHttpStatus(r.status)
      setTookMs(Date.now() - t0)
      setResponse(pretty)
      setStatus(r.ok ? 'ok' : 'error')
    } catch (e) {
      setStatus('error')
      setError(String(e))
      setTookMs(Date.now() - t0)
    }
  }

  async function copyCurl(kind: 'sh' | 'ps') {
    const jwt = await getToken()
    if (!jwt) return
    const cmd = kind === 'sh'
      ? `curl -i -H "Authorization: Bearer ${jwt}" \\\n  ${url}`
      : `curl.exe -i -H "Authorization: Bearer ${jwt}" ${url}`
    await navigator.clipboard.writeText(cmd)
    setCopied(kind); setTimeout(() => setCopied(null), 1500)
  }

  const statusBg    = httpStatus === null ? '#f5f5f0' : httpStatus >= 200 && httpStatus < 300 ? '#e6f4ea' : '#fdecea'
  const statusColor = httpStatus === null ? '#444'    : httpStatus >= 200 && httpStatus < 300 ? '#1a4a2a' : '#7a1a10'

  return (
    <div style={s.page}>
      <div style={s.container}>
        <h1 style={s.h1}>CAP JSON inspector</h1>
        <p style={s.lede}>
          Hits <code>GET /v1/plugin/cap/:cap_id</code> with your Clerk JWT and shows the raw response.
          Owner-gated: 403 if the CAP wasn't submitted by your Clerk user.
        </p>

        <div style={s.card}>
          <div style={s.cardTitle}>Auth</div>
          {!isLoaded ? (
            <div style={s.remark}>Loading Clerk…</div>
          ) : isSignedIn ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={s.pill}>Signed in via Clerk</span>
              <button style={s.btnSmall} onClick={() => void signOut()}>Sign out</button>
            </div>
          ) : (
            <button style={s.btnPrimary} onClick={() => clerk.openSignIn()}>Sign in via Clerk →</button>
          )}
        </div>

        <div style={s.card}>
          <div style={s.cardTitle}>Request</div>
          <label style={s.label}>cap_id</label>
          <input
            style={s.input}
            value={capId}
            onChange={(e) => setCapId(e.target.value)}
            placeholder="89ac1e46060d"
            spellCheck={false}
          />

          <label style={{ ...s.label, marginTop: 10 }}>API URL</label>
          <input
            style={s.input}
            value={apiOverride}
            onChange={(e) => setApiOverride(e.target.value)}
            placeholder="http://127.0.0.1:8787"
            spellCheck={false}
          />

          <div style={s.reqLine}>
            <span style={{ ...s.methodBadge, background: '#e6f4ea', color: '#1a4a2a' }}>GET</span>
            <code style={s.reqPath}>{url}</code>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button style={s.btnPrimary} onClick={fetchCap} disabled={status === 'loading' || !isSignedIn}>
              {status === 'loading' ? 'Fetching…' : 'Fetch →'}
            </button>
            <button style={s.btnSmall} onClick={() => void copyCurl('sh')} disabled={!isSignedIn}>
              {copied === 'sh' ? '✓ curl (bash)' : 'Copy curl (bash)'}
            </button>
            <button style={s.btnSmall} onClick={() => void copyCurl('ps')} disabled={!isSignedIn}>
              {copied === 'ps' ? '✓ curl (PowerShell)' : 'Copy curl (PowerShell)'}
            </button>
          </div>
        </div>

        {(status === 'ok' || status === 'error' || error) && (
          <div style={s.card}>
            <div style={s.cardTitle}>Response</div>
            {error && <div style={s.err}>{error}</div>}
            {httpStatus !== null && (
              <div style={s.respLine}>
                <span style={{ ...s.statusBadge, background: statusBg, color: statusColor }}>
                  {httpStatus}
                </span>
                {tookMs !== null && <span style={s.duration}>{tookMs}ms</span>}
              </div>
            )}
            {response && <pre style={s.respBody}>{response}</pre>}
          </div>
        )}
      </div>
    </div>
  )
}

const s = {
  page:        { background: '#faf9f6', minHeight: '100vh', fontFamily: '-apple-system, sans-serif', color: '#1a1a18', padding: '24px 16px' } as React.CSSProperties,
  container:   { maxWidth: 720, margin: '0 auto' } as React.CSSProperties,
  h1:          { fontSize: 22, fontWeight: 700, margin: '0 0 12px', lineHeight: 1.3 } as React.CSSProperties,
  lede:        { fontSize: 14, color: '#5a5a55', lineHeight: 1.6, margin: '0 0 20px' } as React.CSSProperties,
  card:        { background: '#fff', border: '1px solid #e8e5df', borderRadius: 8, padding: '14px 16px', marginBottom: 12 } as React.CSSProperties,
  cardTitle:   { fontSize: 13, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.05em', color: '#5a5a55', marginBottom: 10 } as React.CSSProperties,
  label:       { display: 'block', fontSize: 11, color: '#8a8a80', marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '.06em' } as React.CSSProperties,
  input:       { width: '100%', boxSizing: 'border-box' as const, fontFamily: '"DM Mono", monospace', fontSize: 13, padding: '8px 10px', border: '1px solid #d8d4cc', borderRadius: 4, background: '#faf9f6' } as React.CSSProperties,
  pill:        { fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: '#e6f4ea', color: '#1a4a2a' } as React.CSSProperties,
  btnPrimary:  { background: '#1a1a18', color: '#faf9f6', border: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
  btnSmall:    { background: '#f5f2eb', color: '#1a1a18', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, fontWeight: 500, cursor: 'pointer' } as React.CSSProperties,
  remark:      { fontSize: 12, color: '#8a8a80', fontStyle: 'italic' as const } as React.CSSProperties,
  err:         { color: '#991b1b', fontSize: 12, padding: 6, background: '#fef2f2', borderRadius: 4, marginBottom: 8 } as React.CSSProperties,
  reqLine:     { display: 'flex', gap: 6, alignItems: 'center', marginTop: 12, padding: '6px 8px', background: '#f5f2eb', borderRadius: 4 } as React.CSSProperties,
  methodBadge: { fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4 } as React.CSSProperties,
  reqPath:     { fontSize: 12, fontFamily: '"DM Mono", monospace', color: '#333', wordBreak: 'break-all' as const } as React.CSSProperties,
  respLine:    { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } as React.CSSProperties,
  statusBadge: { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6 } as React.CSSProperties,
  duration:    { fontSize: 11, color: '#aaa' } as React.CSSProperties,
  respBody:    { background: '#111', color: '#e8e8e8', borderRadius: 8, padding: '10px 12px', fontSize: 11, overflowX: 'auto' as const, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const, margin: 0, lineHeight: 1.5, maxHeight: 480, fontFamily: '"DM Mono", monospace' } as React.CSSProperties,
}
