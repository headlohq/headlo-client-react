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
  // { refresh: true } → SDK appends ?_r=<timestamp> to bundle + def URLs on
  // every mount so a hard reload always fetches fresh. Matches the
  // dashboard preview's cache-busting behavior. Without this, edits to
  // Impl App / attributes take TWO hard refreshes to surface: first
  // refresh serves browser-cached stale bundle, second refresh escapes
  // both browser cache and Cloudflare KV eventual-consistency window.
  const { loaded, error } = useComponent('headlo-ask-widget', version, { refresh: true })

  // Raw URL values — `null` when the query param wasn't provided. Kept
  // separately from the fallback-defaulted values below so the code panel
  // can honestly show "only attributes the URL provided" without inheriting
  // this page's opinion about defaults.
  //
  // Each key accepts BOTH kebab (?accent-color=) and camel (?accentColor=)
  // forms — matches how humans naturally type either — with kebab winning
  // when both are set for the same key.
  const readParam = (kebab: string, camel: string): string | null =>
    params.get(kebab) ?? params.get(camel)
  const displayNameRaw    = readParam('display-name',    'displayName')
  const taglineRaw        = readParam('tagline',         'tagline')
  const accentColorRaw    = readParam('accent-color',    'accentColor')
  const placeholderRaw    = readParam('placeholder',     'placeholder')
  const knowledgeScopeRaw = readParam('knowledge-scope', 'knowledgeScope')

  const publishableKey = (import.meta.env.VITE_HEADLO_PUBLISHABLE_KEY as string | undefined) ?? 'pk_live_YOUR_KEY'
  const [codeOpen, setCodeOpen] = React.useState(false)
  const [codeTab,  setCodeTab]  = React.useState<'html' | 'react'>('html')
  const [codeCopied, setCodeCopied] = React.useState(false)

  // Bundle mount timestamp — snapshots when `loaded` first flips to true so
  // the header can show "loaded HH:MM:SS" as a visible cache-hit indicator.
  // Same timestamp survives re-renders (only re-captures on a fresh mount).
  const [loadedAt, setLoadedAt] = React.useState<Date | null>(null)
  React.useEffect(() => {
    if (loaded && !loadedAt) setLoadedAt(new Date())
  }, [loaded, loadedAt])

  // Cache bust — hard-reloads the page and clears Cache Storage on the way
  // out. Also nudges React to remount by rotating a `_t` search param, so
  // any downstream state that keys on URL restarts too. Doesn't touch the
  // worker's KV cache — for that, save the component in the editor (delete
  // hooks live in editor.ts:4036-4063).
  const bustCache = React.useCallback(async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map(k => caches.delete(k)))
      }
    } catch { /* CacheStorage unavailable or perms — reload anyway */ }
    const url = new URL(window.location.href)
    url.searchParams.set('_t', String(Date.now()))
    window.location.replace(url.toString())
  }, [])

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
          {/* pk badge — visible confirmation of which publishable key is
             driving App Install lookups + impl-app resolution on this page.
             Click to copy the full value; hover for the full string. */}
          <button
            type="button"
            style={s.pkBadge}
            title={`pk: ${publishableKey}   (click to copy)`}
            onClick={() => void navigator.clipboard.writeText(publishableKey)}
          >
            pk: {publishableKey.slice(0, 20)}…{publishableKey.slice(-6)}
          </button>
        </span>
        <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <a href="/view/askwidget?version=v1"       style={version === 'v1' ? s.versionLinkActive : s.versionLink}>v1</a>
          <a href="/view/askwidget?version=v2"       style={version === 'v2' ? s.versionLinkActive : s.versionLink}>v2</a>
          <a href="/view/askwidget?version=design-1" style={version === 'design-1' ? s.versionLinkActive : s.versionLink}>design-1</a>
          <button style={s.viewCodeBtn} onClick={() => setCodeOpen(v => !v)}>
            {codeOpen ? '× Close code' : '</> View code'}
          </button>
          {loadedAt && (
            <span style={s.loadedAtBadge} title={`Bundle loaded at ${loadedAt.toISOString()}`}>
              loaded {loadedAt.toLocaleTimeString([], { hour12: false })}
            </span>
          )}
          <button style={s.viewCodeBtn} onClick={() => void bustCache()} title="Clear Cache Storage + hard-reload with new _t param">
            ⟳ Bust cache
          </button>
          {/* Sibling zero-framework embed — same widget, no React harness. */}
          <a href="/askwidget-v2-local.html" style={s.compare}>Plain HTML →</a>
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
          // Pass raw URL values (nullable) → converted to undefined via `??`
          // so React skips the attribute entirely when the caller didn't set
          // it. Skipping lets the compiler-emitted DEFAULT_ATTRS (impl app)
          // supply the fallback. Passing our own string default here would
          // silently defeat the impl-app default.
          <headlo-ask-widget
            display-name={displayNameRaw ?? undefined}
            tagline={taglineRaw ?? undefined}
            accent-color={accentColorRaw ?? undefined}
            placeholder={placeholderRaw ?? undefined}
            knowledge-scope={knowledgeScopeRaw ?? undefined}
          />
        )}

        {codeOpen && (
          <CodePanel
            version={version}
            apiUrl={API_URL}
            publishableKey={publishableKey}
            displayName={displayNameRaw}
            tagline={taglineRaw}
            accentColor={accentColorRaw}
            placeholder={placeholderRaw}
            knowledgeScope={knowledgeScopeRaw}
            tab={codeTab}
            setTab={setCodeTab}
            copied={codeCopied}
            setCopied={setCodeCopied}
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

// ─── Code panel — how to load + configure the widget on any page ─────────
// Two flavors of the same three-step story:
//   1. Load the component runtime (script tag or `useComponent` hook)
//   2. Configure the auth surface (publishable key + api url)
//   3. Drop the custom element with attribute props
//
// Both flavors render the SAME <headlo-ask-widget> custom element under the
// hood — the only variation is HOW you get the browser to define the tag
// and where the pk/api-url globals come from. Attributes on the tag are
// identical in both worlds (attributes-only design).

interface CodePanelProps {
  version:        string
  apiUrl:         string
  publishableKey: string
  // Raw URL values — null when the query param wasn't provided. Attributes
  // are only emitted in the code snippets when the caller explicitly set
  // them; unset stays unset (widget uses its own internal default).
  displayName:    string | null
  tagline:        string | null
  accentColor:    string | null
  placeholder:    string | null
  knowledgeScope: string | null
  tab:            'html' | 'react'
  setTab:         (t: 'html' | 'react') => void
  copied:         boolean
  setCopied:      (v: boolean) => void
}

function CodePanel({
  version, apiUrl, publishableKey,
  displayName, tagline, accentColor, placeholder, knowledgeScope,
  tab, setTab, copied, setCopied,
}: CodePanelProps) {
  const bundlePath = version === 'v1'
    ? `${apiUrl}/v1/prop/component/headlo-ask-widget/bundle`
    : `${apiUrl}/v1/prop/component/headlo-ask-widget/${encodeURIComponent(version)}/bundle`

  // Emit an attribute only when the caller actually provided a value via
  // the URL. Unset params → widget uses its own internal defaults; showing
  // them in the snippet would falsely suggest they're required. Formatting
  // uses `\n  attr="val"` so the tag body only grows when needed.
  const htmlAttrs: Array<[string, string | null]> = [
    ['display-name',    displayName],
    ['tagline',         tagline],
    ['accent-color',    accentColor],
    ['placeholder',     placeholder],
    ['knowledge-scope', knowledgeScope],
  ]
  const attrLines = htmlAttrs
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `\n  ${k}="${v}"`)
    .join('')

  // HTML custom elements can NOT self-close (`<tag/>` in HTML is parsed as
  // an open tag, `/` ignored). So we emit paired open+close either compactly
  // on one line (no attrs) or multi-line (with attrs).
  const htmlTag = attrLines
    ? `<headlo-ask-widget${attrLines}>\n</headlo-ask-widget>`
    : `<headlo-ask-widget></headlo-ask-widget>`

  const htmlCode =
`<!-- 1. Load the widget bundle. Registers <headlo-ask-widget> as a custom
     element. Once loaded, the tag works anywhere on the page — nothing
     else needs to change to "wire" it. -->
<script src="${bundlePath}" async></script>

<!-- 2. Configure auth. <headlo-init> sets window.__headlo_prop_key and
     __headlo_api_url synchronously on mount, so any PROP element that
     upgrades AFTER it picks up the right key + api URL. Once per page. -->
<script src="${apiUrl}/v1/prop/component/headlo-init/v1/bundle" async></script>
<headlo-init
  publishable-key="${publishableKey}"
  api-url="${apiUrl}">
</headlo-init>

<!-- 3. Drop the widget anywhere. All config is HTML attributes — no
     server round-trip on mount, no per-widget DB row. Change an
     attribute, the widget re-renders. Attributes are optional; omit
     them to use the widget's own defaults. -->
${htmlTag}`

  const reactCode =
`// 1. Wrap your app once in <PropServer>. This is the React-idiomatic
//    equivalent of <headlo-init> — it plants the pk + api URL in a
//    Context so useComponent() and the custom-element runtime can read
//    them without global variables leaking around.
import { PropServer, useComponent } from 'headlo-react'

export default function App() {
  return (
    <PropServer
      publishableKey="${publishableKey}"
      url="${apiUrl}"
    >
      <AskWidget />
    </PropServer>
  )
}

// 2. useComponent('slug', 'version') fetches the compiled bundle and
//    registers the custom element. Same code path as the HTML <script>
//    tag — it just triggers from React lifecycle instead of the parser.
//    loaded === true when the tag is safe to render.
function AskWidget() {
  const { loaded } = useComponent('headlo-ask-widget', '${version}')
  if (!loaded) return null

  // 3. Render the custom element like any React JSX. Attributes are
  //    identical to the HTML flavor above — attributes-only design.
  //    Omitted attributes fall back to the widget's own defaults.
  //    JSX allows self-closing; HTML does NOT (HTML parses <tag/> as an
  //    open tag with the / ignored, breaking sibling nesting).
  return ${attrLines ? `(
    <headlo-ask-widget${attrLines}
    />
  )` : `<headlo-ask-widget />`}
}`

  const code = tab === 'html' ? htmlCode : reactCode

  function copy() {
    void navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div style={s.codePanel}>
      <div style={s.codeHeader}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            style={tab === 'html' ? s.codeTabActive : s.codeTab}
            onClick={() => setTab('html')}
          >HTML</button>
          <button
            style={tab === 'react' ? s.codeTabActive : s.codeTab}
            onClick={() => setTab('react')}
          >React</button>
        </div>
        <div style={s.codeCaption}>
          Three steps: load the bundle → configure pk + api URL → drop the tag.
          Same custom element in both flavors.
        </div>
        <button style={s.codeCopy} onClick={copy}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre style={s.codeBlock}>{code}</pre>
      <div style={s.codeHint}>
        Values shown reflect the current URL query — <code style={s.codeInline}>?display-name=</code>,{' '}
        <code style={s.codeInline}>?tagline=</code>, <code style={s.codeInline}>?accent-color=</code>.
        The <code style={s.codeInline}>publishable-key</code> is your project's <code style={s.codeInline}>VITE_HEADLO_PUBLISHABLE_KEY</code>.
      </div>
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
  versionLinkActive: { textDecoration: 'none', color: '#faf9f6', fontSize: 12, background: '#0f6e56', padding: '4px 10px', borderRadius: 4, fontWeight: 600 },
  compare:      { textDecoration: 'none', color: '#0f6e56' },
  viewCodeBtn:  { textDecoration: 'none', color: '#1a1a18', fontSize: 12, background: '#f5f2eb', padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontFamily: 'monospace' as const, fontWeight: 600 },
  loadedAtBadge:{ fontSize: 11, background: '#e6f4ea', color: '#1a4a2a', padding: '3px 8px', borderRadius: 4, fontFamily: '"DM Mono", monospace', fontWeight: 500 },
  pkBadge:      { fontSize: 11, background: '#f5f2eb', color: '#5a5a55', padding: '3px 8px', borderRadius: 4, fontFamily: '"DM Mono", monospace', border: '1px solid #e0ddd8', cursor: 'pointer' },

  // Code panel — annotated three-step load + configure recipe.
  codePanel:    { maxWidth: 860, margin: '24px auto 0', background: '#fff', border: '1px solid #e8e5df', borderRadius: 8, overflow: 'hidden' as const },
  codeHeader:   { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid #f0ede5', background: '#faf9f6' },
  codeCaption:  { flex: 1, fontSize: 11, color: '#8a8a80', fontStyle: 'italic' as const, lineHeight: 1.4 },
  codeTab:      { background: '#fff', color: '#5a5a55', border: '1px solid #d8d4cc', borderRadius: 4, padding: '4px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' as const },
  codeTabActive:{ background: '#0f6e56', color: '#faf9f6', border: '1px solid #0f6e56', borderRadius: 4, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' as const },
  codeCopy:     { background: '#f5f2eb', color: '#1a1a18', border: '1px solid #d8d4cc', borderRadius: 4, padding: '4px 10px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' as const },
  codeBlock:    { background: '#0e0e0c', color: '#e8e5df', padding: '14px 16px', margin: 0, fontSize: 12, fontFamily: '"DM Mono", monospace', lineHeight: 1.55, overflowX: 'auto' as const, whiteSpace: 'pre' as const, maxHeight: 560 },
  codeHint:     { padding: '10px 14px', fontSize: 11, color: '#8a8a80', background: '#faf9f6', borderTop: '1px solid #f0ede5' },
  codeInline:   { fontFamily: '"DM Mono", monospace', fontSize: 11, background: '#f5f2eb', padding: '1px 5px', borderRadius: 3 },

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
