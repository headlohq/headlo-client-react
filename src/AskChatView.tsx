import React from 'react'
import { useComponent } from 'headlo-react'

// /view/askchat?version=X&display-name=Y&tagline=Z&accent-color=…&service=…
//
// Renders the same <headlo-ask-chat> component but bound via the
// action-binding pattern to the `headlo-ask-chat` service (widget → onAsk
// → service client_js → /v1/prop/llm/chat → LLM).
//
// Distinct from /view/askwidget so both patterns can run side-by-side while
// the widget's old direct-global consumer is being retired.
//
// Overridable via query string:
//   ?service=headlo-ask-chat:v2   → binds on-ask/on-reset to that service+version
//   ?service=other-slug:v1        → try a different service impl entirely
export default function AskChatView() {
  const params = new URLSearchParams(window.location.search)

  const version = params.get('version') ?? 'v1'
  const { loaded, error } = useComponent('headlo-ask-chat', version)

  const displayName    = params.get('display-name')    ?? 'Ask Phil'
  const tagline        = params.get('tagline')         ?? ''
  const accentColor    = params.get('accent-color')    ?? '#5dcaa5'
  const placeholder    = params.get('placeholder')     ?? 'Ask Phil a question'
  const knowledgeScope = params.get('knowledge-scope') ?? undefined

  // Service binding — defaults to headlo-ask-chat:v1. Format is <slug>:<version>.
  // Widget attribute values become "<slug>:<version>:<action>" for the action
  // resolver — action name comes from contract.actions.
  const serviceRef = params.get('service') ?? 'headlo-ask-chat:v1'
  const onAskAttr   = `${serviceRef}:ask`
  const onResetAttr = `${serviceRef}:reset`

  return (
    <div style={s.page}>
      <header style={s.header}>
        <a href="/" style={s.back}>← Back</a>
        <span style={s.title}>
          <code style={s.code}>&lt;headlo-ask-chat&gt;</code>
          <span style={s.serviceBadge}>service: {serviceRef}</span>
        </span>
        <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <a href="/view/askwidget"                                style={s.versionLink}>askwidget (legacy)</a>
          <a href="/view/askchat?service=headlo-ask-chat:v1"       style={s.versionLink}>v1</a>
        </span>
      </header>

      <main style={s.main}>
        {error && (
          <div style={s.error}>
            Failed to load PROP component: {String(error)}
            <div style={s.errorHint}>
              Have you seeded version <code>{version}</code> of <code>headlo-ask-chat</code> and
              published the <code>{serviceRef}</code> service? Also confirm KV cache is busted for
              both.
            </div>
          </div>
        )}

        {!error && !loaded && (
          <div style={s.loading}>Loading widget bundle (version: {version})…</div>
        )}

        {loaded && (
          <headlo-ask-chat
            display-name={displayName}
            tagline={tagline}
            accent-color={accentColor}
            placeholder={placeholder}
            knowledge-scope={knowledgeScope}
            on-ask={onAskAttr}
            on-reset={onResetAttr}
          />
        )}
      </main>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: {
    background:  '#faf9f6',
    minHeight:   '100vh',
    fontFamily:  'system-ui, -apple-system, sans-serif',
    color:       '#1a1a18',
  },
  header: {
    borderBottom:   '1px solid #e8e5df',
    padding:        '0 24px',
    height:         52,
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    fontSize:       13,
  },
  back:          { textDecoration: 'none', color: '#1a1a18' },
  title:         { flex: 1, textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 },
  code:          { fontFamily: 'monospace', fontSize: 12, background: '#f5f2eb', padding: '3px 8px', borderRadius: 4 },
  serviceBadge:  { fontSize: 11, background: '#0f6e56', color: '#faf9f6', padding: '2px 8px', borderRadius: 4, fontWeight: 500 },
  versionLink:   { textDecoration: 'none', color: '#6b6a62', fontSize: 12, background: '#f5f2eb', padding: '4px 10px', borderRadius: 4 },
  main:          { padding: '0' },
  loading:       { padding: 32, color: '#8a8a80', textAlign: 'center' as const, fontSize: 14 },
  error:         { padding: 16, margin: 24, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13 },
  errorHint:     { marginTop: 8, color: '#6b6a62', fontSize: 12 },
}
