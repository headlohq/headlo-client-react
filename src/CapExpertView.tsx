import React from 'react'
import { useComponent } from 'headlo-react'

// /view/cap-expert-widget?capId=X&service=cap-expert:v1
//
// Renders <cap-expert-widget> bound via action attributes to the
// cap-expert service. Walks a buyer through a Capture Protocol (CAP) — a
// merchant-authored questionnaire that ends with a synthesized answer.
//
// Same three-layer pattern as ask-chat:
//   widget (dumb)  →  service client_js (holds sessions Map, keyed by capId)
//                  →  MCP tool cap_capture_expert (pure server function)
//
// Requires:
//   - <cap-expert-widget> component published + public
//   - cap-expert service published + public
//   - A CAP row in plugin.cap with cap_id matching ?capId=
export default function CapExpertView() {
  const params = new URLSearchParams(window.location.search)

  const version = params.get('version') ?? 'v1'
  const { loaded, error } = useComponent('cap-expert-widget', version)
  // Load <headlo-init> in parallel so its bundle is ready by the time the
  // widget mounts. Fetches happen concurrently — no serial cost. If the
  // headlo-init component isn't published in the dashboard yet, we still
  // render the tag; the fetch just errors quietly and downstream globals
  // fall back to whatever main.tsx set from Vite env vars.
  const { loaded: initLoaded } = useComponent('headlo-init', 'v1')

  // Read the config values from Vite env — same source main.tsx uses. In
  // production this same shape can come from a build-time replacement or a
  // window global set by an inline <script>.
  const publishableKey = import.meta.env.VITE_HEADLO_PUBLISHABLE_KEY as string | undefined
  const apiUrl         = import.meta.env.VITE_HEADLO_API_URL         as string | undefined

  const capId      = params.get('capId')   ?? '89ac1e46060d'
  // Default to v2 — routes through headlo-auth:v2 authFetch so the widget
  // works for any signed-in user (sign in at /demo/prop-auth-v2 first).
  // v1 is available via ?service=cap-expert:v1 for the legacy editor-JWT
  // path used inside the dashboard.
  const serviceRef = params.get('service') ?? 'cap-expert:v2'
  const onAskAttr  = `${serviceRef}:ask`

  // Runtime capId override for cap-expert:v3. v3 reads its capId from
  // window.__headlo_service_config['cap-expert:v3'] at bundle-init time,
  // falling back to __HEADLO_SERVICE_CONFIG. Setting the global here BEFORE
  // the widget mounts lets us test different CAPs against one v3 app
  // without touching dashboard config. URL-driven so the override survives
  // reloads and is shareable.
  const overrideCapId = params.get('overrideCapId') ?? ''
  const [overrideOn,       setOverrideOn]       = React.useState<boolean>(!!overrideCapId)
  const [overrideCapIdDraft, setOverrideCapIdDraft] = React.useState<string>(overrideCapId)

  // Runtime publishable-key override. Sets window.__headlo_prop_key BEFORE
  // headlo-auth:v2 loads so its sign-in flow uses the overridden pk. Useful
  // for testing an embed under a different agency's key without redeploying
  // the app or editing .env. Independent of capId — you can combine them.
  //
  // Sessions minted with the previous pk stay valid at the MCP layer (azp
  // is inside the token), but if you sign out + sign in fresh, the new
  // session belongs to the overridden pk's agency.
  const overridePk = params.get('overridePk') ?? ''
  const [overridePkOn,    setOverridePkOn]    = React.useState<boolean>(!!overridePk)
  const [overridePkDraft, setOverridePkDraft] = React.useState<string>(overridePk)

  // Set window globals synchronously during render — fires BEFORE the
  // widget's connectedCallback which triggers auth + service loads. Both
  // reads happen at module init; setting later wouldn't retroactively
  // update, so we set them at the earliest possible point.
  if (overrideCapId) {
    const w = window as unknown as Record<string, Record<string, Record<string, string>>>
    if (!w.__headlo_service_config) w.__headlo_service_config = {}
    if (!w.__headlo_service_config['cap-expert:v3']) w.__headlo_service_config['cap-expert:v3'] = {}
    w.__headlo_service_config['cap-expert:v3'].capId = overrideCapId
  }
  if (overridePk) {
    (window as unknown as Record<string, string>).__headlo_prop_key = overridePk
  }

  const applyOverride = () => {
    const next = new URLSearchParams(window.location.search)
    if (overrideOn && overrideCapIdDraft.trim()) next.set('overrideCapId', overrideCapIdDraft.trim())
    else                                          next.delete('overrideCapId')
    if (overridePkOn && overridePkDraft.trim())   next.set('overridePk', overridePkDraft.trim())
    else                                          next.delete('overridePk')
    // Full reload — the service bundles read config at module init, not
    // per-call, so the page needs to re-execute with the new globals. Cheap
    // for a dev-only test surface; wouldn't fly in production.
    window.location.search = next.toString()
  }

  return (
    <div style={s.page}>
      <header style={s.header}>
        <a href="/" style={s.back}>← Back</a>
        <span style={s.title}>
          <code style={s.code}>&lt;cap-expert-widget&gt;</code>
          <span style={s.serviceBadge}>capId: {capId}</span>
          <span style={s.serviceBadge}>service: {serviceRef}</span>
          {overridePk    && <span style={{ ...s.serviceBadge, background: '#f59e0b' }}>pk: {overridePk.slice(0, 16)}…</span>}
          {overrideCapId && <span style={{ ...s.serviceBadge, background: '#f59e0b' }}>capId: {overrideCapId}</span>}
        </span>
        <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <a href="/view/askchat" style={s.versionLink}>askchat</a>
        </span>
      </header>

      {/* Runtime overrides — dev/preview surface for testing this widget
         against different config without editing .env or dashboard rows.
         Both overrides land in window globals BEFORE the widget mounts and
         require a page reload to take effect (service bundles read at
         module init). Combine freely: override PK + capId together to
         simulate an entirely different agency's embed. */}
      <div style={s.overrideBar}>
        {/* Publishable-key override — always available. Sets
           window.__headlo_prop_key so headlo-auth:v2 sign-in uses the
           overridden key. Existing sessions stay valid (azp is inside the
           token), but a fresh sign-in binds to the overridden pk's agency. */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={overridePkOn}
            onChange={e => setOverridePkOn(e.target.checked)}
          />
          Override publishable key
        </label>
        {overridePkOn && (
          <input
            type="text"
            value={overridePkDraft}
            onChange={e => setOverridePkDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') applyOverride() }}
            placeholder="pk_live_..."
            style={s.overrideInput}
            autoComplete="off"
            spellCheck={false}
          />
        )}

        {/* capId override — only meaningful when service=cap-expert:v3
           since v3 reads window.__headlo_service_config['cap-expert:v3'].capId.
           For v1/v2 the widget passes capId as an ask arg, so this override
           does nothing. */}
        {serviceRef === 'cap-expert:v3' && (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', marginLeft: 12 }}>
              <input
                type="checkbox"
                checked={overrideOn}
                onChange={e => setOverrideOn(e.target.checked)}
              />
              Override capId
            </label>
            {overrideOn && (
              <input
                type="text"
                value={overrideCapIdDraft}
                onChange={e => setOverrideCapIdDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') applyOverride() }}
                placeholder="custom cap-id (e.g. abc123...)"
                style={s.overrideInput}
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </>
        )}

        {/* Single Apply button handles both overrides so pressing Enter or
           clicking commits everything in one reload. Only shown when
           there's actually something to apply or clear. */}
        {(overrideOn || overrideCapId || overridePkOn || overridePk) && (
          <button onClick={applyOverride} style={{ ...s.overrideBtn, marginLeft: 'auto' }}>
            Apply (reloads)
          </button>
        )}
      </div>

      <main style={s.main}>
        {error && (
          <div style={s.error}>
            Failed to load PROP component: {String(error)}
            <div style={s.errorHint}>
              Confirm the <code>cap-expert-widget</code> component and{' '}
              <code>{serviceRef}</code> service are both published + public, and
              that the CAP row for <code>capId={capId}</code> exists in{' '}
              <code>plugin.cap</code>.
            </div>
          </div>
        )}

        {!error && !loaded && (
          <div style={s.loading}>Loading widget bundle (version: {version})…</div>
        )}

        {/* <headlo-init> sets window.__headlo_prop_key + __headlo_api_url
           declaratively. Rendered above the widget so its connectedCallback
           fires first (custom-element upgrade follows document order).
           Idempotent — if main.tsx already set the globals from Vite env,
           this just re-sets them to the same values. */}
        {initLoaded && (
          <headlo-init
            publishable-key={publishableKey}
            api-url={apiUrl}
          />
        )}

        {loaded && (
          <cap-expert-widget
            capId={capId}
            on-ask={onAskAttr}
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
  title:         { flex: 1, textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const },
  code:          { fontFamily: 'monospace', fontSize: 12, background: '#f5f2eb', padding: '3px 8px', borderRadius: 4 },
  serviceBadge:  { fontSize: 11, background: '#0f6e56', color: '#faf9f6', padding: '2px 8px', borderRadius: 4, fontWeight: 500 },
  versionLink:   { textDecoration: 'none', color: '#6b6a62', fontSize: 12, background: '#f5f2eb', padding: '4px 10px', borderRadius: 4 },
  main:          { padding: '24px' },
  loading:       { padding: 32, color: '#8a8a80', textAlign: 'center' as const, fontSize: 14 },
  error:         { padding: 16, margin: 24, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13 },
  errorHint:     { marginTop: 8, color: '#6b6a62', fontSize: 12 },
  overrideBar:   { display: 'flex', gap: 8, alignItems: 'center', padding: '10px 24px', background: '#fef9e7', borderBottom: '1px solid #f5e6a8', fontSize: 12 },
  overrideInput: { flex: 1, maxWidth: 360, border: '1px solid #d4c68a', borderRadius: 4, padding: '4px 8px', fontSize: 12, fontFamily: 'monospace', outline: 'none' },
  overrideBtn:   { background: '#0f6e56', color: '#faf9f6', border: 'none', borderRadius: 4, padding: '4px 12px', fontSize: 11, cursor: 'pointer', fontWeight: 500 },
}
