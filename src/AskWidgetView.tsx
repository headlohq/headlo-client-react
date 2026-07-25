import React from 'react'
import { useComponent } from 'headlo-react'

const API_URL = import.meta.env.VITE_HEADLO_API_URL as string

// /view/askwidget?version=X&display-name=Y&tagline=Z&accent-color=…
//
// Loads a specific version of <headlo-ask-widget> from PROP.
//   ?version=v1       → /v1/prop/component/headlo-ask-widget/bundle       (default)
//   ?version=design-1 → /v1/prop/component/headlo-ask-widget/design-1/bundle
//
// Only one version registers the tag per page; use ?version to A/B swap.
// All widget config lives in HTML attributes on the tag — no DB row per
// widget, no server round-trip on mount. Attributes ARE the config surface.
//
// Debug panel at the bottom lets you inspect the exact source (`component_js`)
// stored in the DB and the exact compiled bundle the browser executed.
export default function AskWidgetView() {
  const params = new URLSearchParams(window.location.search)

  const version = params.get('version') ?? 'v1'
  const { loaded, error } = useComponent('headlo-ask-widget', version)

  const displayName    = params.get('display-name')    ?? 'Ask Headlo'
  const tagline        = params.get('tagline')         ?? ''
  const accentColor    = params.get('accent-color')    ?? '#5dcaa5'
  const placeholder    = params.get('placeholder')     ?? undefined
  const knowledgeScope = params.get('knowledge-scope') ?? undefined

  // v1 uses the un-versioned URL so the KV keying and browser cache line up
  // with the SDK's default; any other version uses the /:version/ path form
  // (also accepted by the worker via /v1/prop/component/:slug/:version).
  const bundleUrl = version === 'v1'
    ? `${API_URL}/v1/prop/component/headlo-ask-widget/bundle`
    : `${API_URL}/v1/prop/component/headlo-ask-widget/${encodeURIComponent(version)}/bundle`
  const defUrl = version === 'v1'
    ? `${API_URL}/v1/prop/component/headlo-ask-widget`
    : `${API_URL}/v1/prop/component/headlo-ask-widget/${encodeURIComponent(version)}`

  return (
    <div style={s.page}>
      <header style={s.header}>
        <a href="/" style={s.back}>← Back</a>
        <span style={s.title}>
          <code style={s.code}>&lt;headlo-ask-widget&gt;</code>
          {version !== 'v1' && <span style={s.versionBadge}>version: {version}</span>}
        </span>
        <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <a href="/view/askwidget?version=v1" style={s.versionLink}>v1</a>
          <a href="/view/askwidget?version=design-1" style={s.versionLink}>design-1</a>
          <a href="/demo/askwidget" style={s.compare}>Demo →</a>
        </span>
      </header>

      <main style={s.main}>
        {error && (
          <div style={s.error}>
            Failed to load PROP component: {String(error)}
            <div style={s.errorHint}>
              Have you seeded version <code>{version}</code> of <code>headlo-ask-widget</code> in{' '}
              <code>tables-seed.sql</code> and busted the KV cache?
            </div>
          </div>
        )}

        {!error && !loaded && (
          <div style={s.loading}>Loading component bundle (version: {version})…</div>
        )}

        {loaded && (
          <headlo-ask-widget
            display-name={displayName}
            tagline={tagline}
            accent-color={accentColor}
            placeholder={placeholder}
            knowledge-scope={knowledgeScope}
          />
        )}
      </main>

      <DebugPanel
        version={version}
        bundleUrl={bundleUrl}
        defUrl={defUrl}
      />
    </div>
  )
}

// ─── Debug panel — pin down what the browser is actually running ──────────
// Two views:
//   1. Source — the raw `component_js` stored in `prop_component.app` for
//      this (slug, version). Fetches /v1/prop/component/:slug?version=X and
//      pulls `body.app.component_js`. If this doesn't match your seed file,
//      the UPDATE didn't run (or hit the wrong row).
//   2. Bundle — the exact minified JS the browser downloaded and executed.
//      Fetches /v1/prop/component/:slug/:version/bundle. If this is stale,
//      KV wasn't busted.

interface DebugPanelProps {
  version:   string
  bundleUrl: string
  defUrl:    string
}

function DebugPanel({ version, bundleUrl, defUrl }: DebugPanelProps) {
  const [open, setOpen]       = React.useState(false)
  const [tab,  setTab]        = React.useState<'source' | 'bundle'>('source')
  const [text, setText]       = React.useState<string | null>(null)
  const [meta, setMeta]       = React.useState<string | null>(null)
  const [busy, setBusy]       = React.useState(false)
  const [errm, setErr]        = React.useState<string | null>(null)

  async function fetchSource() {
    setBusy(true); setErr(null); setText(null); setMeta(null)
    try {
      // Service stubs and this fetch read the flat global. Components read
      // attributes only — attributes-only design does not extend to non-
      // component call sites yet. See headlo-runtime-config.md.
      const key = (window as any).__headlo_prop_key ?? ''
      const res = await fetch(defUrl, { headers: { 'X-Headlo-Prop-Publishable-Key': key } })
      const ct  = `${res.status} ${res.statusText}  ·  ${res.headers.get('content-type') ?? ''}`
      const body = await res.json() as { app?: { component_js?: string; version?: string; app_id?: string }; def?: { contract?: unknown } }
      setMeta(`HTTP ${ct}  ·  version="${body.app?.version ?? '?'}"  ·  app_id="${body.app?.app_id ?? '?'}"`)
      setText(body.app?.component_js ?? '(no component_js field in response)')
    } catch (e) {
      setErr(`Fetch failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setBusy(false) }
  }

  async function fetchBundle() {
    setBusy(true); setErr(null); setText(null); setMeta(null)
    try {
      const res = await fetch(bundleUrl)
      const ct  = `${res.status} ${res.statusText}  ·  ${res.headers.get('content-type') ?? ''}  ·  ${res.headers.get('cache-control') ?? ''}`
      const body = await res.text()
      setMeta(`HTTP ${ct}  ·  ${body.length.toLocaleString()} bytes`)
      setText(body)
    } catch (e) {
      setErr(`Fetch failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setBusy(false) }
  }

  function copy() {
    if (!text) return
    void navigator.clipboard.writeText(text)
  }

  return (
    <div style={s.debug}>
      <div style={s.debugBar}>
        <button style={s.debugToggle} onClick={() => setOpen(v => !v)}>
          {open ? '▾' : '▸'} Debug ({version})
        </button>
        {open && (
          <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              style={tab === 'source' ? s.tabActive : s.tab}
              onClick={() => { setTab('source'); void fetchSource() }}
              disabled={busy}
            >
              Source (component_js)
            </button>
            <button
              style={tab === 'bundle' ? s.tabActive : s.tab}
              onClick={() => { setTab('bundle'); void fetchBundle() }}
              disabled={busy}
            >
              Bundle (served JS)
            </button>
            {text && (
              <button style={s.tab} onClick={copy}>Copy</button>
            )}
          </span>
        )}
      </div>

      {open && (
        <div style={s.debugBody}>
          <div style={s.debugUrls}>
            <div>Source URL: <code style={s.code}>{defUrl}</code></div>
            <div>Bundle URL: <code style={s.code}>{bundleUrl}</code></div>
          </div>

          {errm && <div style={s.debugErr}>{errm}</div>}
          {busy && <div style={s.debugMeta}>Fetching…</div>}
          {!busy && meta && <div style={s.debugMeta}>{meta}</div>}
          {!busy && !text && !errm && (
            <div style={s.debugHint}>Pick a tab to fetch and view.</div>
          )}
          {!busy && text && (
            <pre style={s.debugPre}>{text}</pre>
          )}
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: {
    background:   '#faf9f6',
    minHeight:    '100vh',
    fontFamily:   'system-ui, -apple-system, sans-serif',
    color:        '#1a1a18',
    paddingBottom: 400,   // leave room for the debug panel
  },
  header: {
    borderBottom: '1px solid #e8e5df',
    padding:      '0 24px',
    height:       52,
    display:      'flex',
    alignItems:   'center',
    justifyContent: 'space-between',
    fontSize:     13,
  },
  back:         { textDecoration: 'none', color: '#1a1a18' },
  title:        { flex: 1, textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 },
  code:         { fontFamily: 'monospace', fontSize: 12, background: '#f5f2eb', padding: '3px 8px', borderRadius: 4 },
  versionBadge: { fontSize: 11, background: '#0f6e56', color: '#faf9f6', padding: '2px 8px', borderRadius: 4, fontWeight: 500 },
  versionLink:  { textDecoration: 'none', color: '#6b6a62', fontSize: 12, background: '#f5f2eb', padding: '4px 10px', borderRadius: 4 },
  compare:      { textDecoration: 'none', color: '#0f6e56' },
  main:         { padding: '0' },
  loading:      { padding: 32, color: '#8a8a80', textAlign: 'center' as const, fontSize: 14 },
  error:        { padding: 16, margin: 24, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13 },
  errorHint:    { marginTop: 8, color: '#6b6a62', fontSize: 12 },

  // Debug panel
  debug: {
    position:     'fixed',
    left:         0,
    right:        0,
    bottom:       0,
    background:   '#0e0e0c',
    color:        '#faf9f6',
    borderTop:    '1px solid #2a2a26',
    fontFamily:   'system-ui, -apple-system, sans-serif',
    fontSize:     12,
    maxHeight:    '50vh',
    display:      'flex',
    flexDirection:'column',
    zIndex:       9999,
  },
  debugBar: {
    display:     'flex',
    alignItems:  'center',
    gap:         12,
    padding:     '10px 16px',
    borderBottom:'1px solid #2a2a26',
    flexShrink:  0,
  },
  debugToggle: {
    background:  'transparent',
    color:       '#5dcaa5',
    border:      '1px solid #2a2a26',
    borderRadius: 6,
    padding:     '4px 10px',
    cursor:      'pointer',
    fontSize:    12,
    fontWeight:  600,
    fontFamily:  'inherit',
  },
  tab: {
    background:   '#1a1a18',
    color:        '#e8e5df',
    border:       '1px solid #2a2a26',
    borderRadius: 6,
    padding:      '4px 10px',
    cursor:       'pointer',
    fontSize:     12,
    fontFamily:   'inherit',
  },
  tabActive: {
    background:   '#5dcaa5',
    color:        '#0e0e0c',
    border:       '1px solid #5dcaa5',
    borderRadius: 6,
    padding:      '4px 10px',
    cursor:       'pointer',
    fontSize:     12,
    fontWeight:   600,
    fontFamily:   'inherit',
  },
  debugBody: {
    padding:  '12px 16px 16px',
    overflow: 'auto',
    flex:     1,
  },
  debugUrls: {
    display:      'flex',
    flexDirection:'column',
    gap:          4,
    marginBottom: 10,
    color:        '#8a8a80',
    fontSize:     11,
  },
  debugMeta: {
    color:      '#5dcaa5',
    fontSize:   11,
    marginBottom: 8,
    fontFamily: 'monospace',
  },
  debugHint: {
    color:    '#8a8a80',
    fontStyle:'italic',
  },
  debugErr: {
    color:      '#f87171',
    marginBottom: 8,
  },
  debugPre: {
    background:   '#000',
    color:        '#e8e5df',
    padding:      12,
    borderRadius: 6,
    fontSize:     11,
    fontFamily:   'monospace',
    lineHeight:   1.5,
    whiteSpace:   'pre-wrap',
    wordBreak:    'break-all',
    margin:       0,
    maxHeight:    'calc(50vh - 100px)',
    overflow:     'auto',
  },
}
