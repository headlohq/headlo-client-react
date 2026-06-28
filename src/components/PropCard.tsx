import React from 'react'
import { useComponent, usePropService } from 'headlo-react'

export default function PropCard() {
  const prop = usePropService()
  const { loaded, error } = useComponent('headlo-auth-button')
  const [result, setResult]   = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  async function fetchDef() {
    setLoading(true)
    setResult(null)
    try {
      const json = await prop.component('headlo-auth-button').def()
      setResult(JSON.stringify(json, null, 2))
    } catch (e) {
      setResult(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function fetchManifest() {
    setLoading(true)
    setResult(null)
    try {
      const json = await prop.service('headlo-auth', 'v1').manifest()
      setResult(JSON.stringify(json, null, 2))
    } catch (e) {
      setResult(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.card}>
      <div style={s.title}>PROP Components &amp; Services</div>

      {/* Component status */}
      <div style={s.row}>
        <span style={s.label}>Component</span>
        <code style={s.code}>headlo-auth-button</code>
        <span style={{ fontSize: 12, color: loaded ? '#2a6a3a' : error ? '#991b1b' : '#8a8a80' }}>
          {loaded ? '✓ loaded' : error ? String(error) : 'loading…'}
        </span>
      </div>

      {/* Mounted custom element */}
      {loaded && (
        <div style={s.preview}>
          <div style={s.label}>Live element (default — returns to current page)</div>
          {/* @ts-ignore — custom element not in JSX types */}
          <headlo-auth-button style={{ marginTop: 8, display: 'block' }} />

          <div style={{ ...s.label, marginTop: 16 }}>Live element (return-url="/dashboard")</div>
          {/* @ts-ignore — custom element not in JSX types */}
          <headlo-auth-button return-url="/dashboard" style={{ marginTop: 8, display: 'block' }} />
        </div>
      )}

      {/* API buttons */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <button style={s.btn} onClick={fetchDef} disabled={loading}>
          component('headlo-auth-button').def()
        </button>
        <button style={{ ...s.btn, background: '#2a4a7a' }} onClick={fetchManifest} disabled={loading}>
          service('headlo-auth', 'v1').manifest()
        </button>
      </div>

      {result && <pre style={s.pre}>{result}</pre>}
    </div>
  )
}

const s = {
  card:   { background: '#fff', border: '1px solid #e8e5df', borderRadius: 10, padding: '20px 24px', marginBottom: 16 } as React.CSSProperties,
  title:  { fontSize: 13, fontWeight: 700, marginBottom: 14, color: '#1a1a18' } as React.CSSProperties,
  row:    { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8, fontSize: 14, flexWrap: 'wrap' as const } as React.CSSProperties,
  label:  { fontSize: 11, color: '#8a8a80', textTransform: 'uppercase' as const, letterSpacing: '.05em', minWidth: 80 },
  code:   { fontSize: 12, fontFamily: 'monospace', color: '#1a1a18' } as React.CSSProperties,
  preview:{ marginTop: 12, padding: '14px 16px', background: '#f5f2eb', borderRadius: 8 } as React.CSSProperties,
  btn:    { padding: '8px 14px', background: '#1a1a18', color: '#faf9f6', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer' } as React.CSSProperties,
  pre:    { marginTop: 12, background: '#111', color: '#e8e8e8', borderRadius: 8, padding: '12px 14px', fontSize: 11, fontFamily: 'monospace', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 320, overflowY: 'auto' } as React.CSSProperties,
}
