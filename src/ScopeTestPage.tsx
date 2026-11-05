// End-to-end smoke test for per-widget scope enforcement.
// Design: claude/headlo-widget-scope-enforcement.md § 4 Steps 1-6.
//
// Flow this page demonstrates:
//   1. POST /v1/prop/token/exchange with publishable key + requested scope
//      → server checks scope against prop_server.api_key.allowed_scopes
//        (empty = permissive grandfather; populated = strict) + rejects
//        admin-only scopes
//      → returns 15-min JWT with `scope` claim populated
//   2. GET /v1/scope/test?scope=<required> with Authorization: Bearer <jwt>
//      → server verifies token signature + issuer (via /middleware/prop-token)
//      → server enforces scope via requireScope() (from /lib/scopes.ts)
//      → returns 200 { ok, granted_scope, ... } or 403 INSUFFICIENT_SCOPE
//
// Try in the UI:
//   - Request "user:read" → check "user:read" → should return 200 ok
//   - Request "user:read" → check "content:write" → should return 403 INSUFFICIENT_SCOPE
//   - Request "admin:agency" → exchange returns 400 ADMIN_SCOPES_NOT_ISSUABLE
//   - Request scope not in key's allowed_scopes (once merchant populates the
//     allowed_scopes column with a strict list) → 400 SCOPE_NOT_ALLOWED
//
// Publishable key is read from VITE_HEADLO_PUBLISHABLE_KEY. If the dev key's
// allowed_scopes is empty (default), all scopes below except admin: are
// grantable. To test strict mode, run:
//   UPDATE prop_server.api_key
//   SET allowed_scopes = ARRAY['user:read', 'content:read']
//   WHERE publishable_key = '<the key>';

import React, { useState } from 'react'
import { resolveSharedPk, setSharedPk, clearSharedPk } from './lib/shared-pk'

// Per-page publishable key override — accepts ?pk=pk_live_... in the URL
// so you can test against different Applications without editing .env and
// restarting Vite. Persists in localStorage per-page so refresh preserves
// the override. Falls back to VITE_HEADLO_PUBLISHABLE_KEY when no override.
// Same pattern worth applying to other test pages (pricing-debug, cap-expert)
// if you find yourself switching pks often.
// Shared across all debug pages via lib/shared-pk (headlo:pk-override).
// URL param wins, then shared LS, then VITE_HEADLO_PUBLISHABLE_KEY env.
const _pkResolved = resolveSharedPk()
const publishableKey       = _pkResolved.pk
const publishableKeySource = _pkResolved.source === 'empty' ? 'env' : _pkResolved.source
const apiUrl         = import.meta.env.VITE_HEADLO_API_URL         as string

interface ExchangeResponse {
  access_token: string
  token_type:   string
  expires_in:   number
  scope:        string
}

interface ScopeCheckResponse {
  ok:              boolean
  required_scope?: string
  granted_scope?:  string
  sub?:            string | null
  azp?:            string | null
  anonymous?:      boolean
  error?:          string
  detail?:         string
}

interface LlmChatResponse {
  answer?:     string
  provider?:   string
  model?:      string
  tokens_in?:  number
  tokens_out?: number
  error?:      string
  detail?:     string
}

// Decode JWT payload without verifying (client-side inspection).
function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const [, payload] = jwt.split('.')
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(decoded)
  } catch { return null }
}

interface BundleInspection {
  status:              number
  size_bytes:          number
  bundle_url:          string                // for "Open raw" link
  has_token_exchange:  boolean               // presence of the /v1/prop/token/exchange URL string
  has_publishable_key: boolean               // presence of the X-Headlo-Prop-Publishable-Key header string
  has_headlo_ctx:      boolean               // __headlo_endowments_ctx — endowed-mode Provider setup
  action_bindings:     string[]              // 3-colon `slug:version:action` patterns — contract action bindings
  scope_candidates:    string[]              // 1-2-colon `word:word[:word]` patterns — potential scopes
  urls_found:          string[]              // `/v1/prop/...` paths in the bundle
  requires_scopes_raw: string | null         // the actual REQUIRES_SCOPES value if extractable
  first_2000_chars:    string                // more sanity-check bundle text
  search_matches?:     { term: string; count: number; context: string[] }
  error?:              string
}

export default function ScopeTestPage() {
  const [requestedScope, setRequestedScope] = useState('user:read')
  const [checkScope,     setCheckScope]     = useState('user:read')
  const [exchangeLog,    setExchangeLog]    = useState<{ status: number; body: ExchangeResponse | { error: string; detail?: string } } | null>(null)
  const [checkLog,       setCheckLog]       = useState<{ status: number; body: ScopeCheckResponse }                                              | null>(null)
  const [token,          setToken]          = useState<string | null>(null)
  const [tokenClaims,    setTokenClaims]    = useState<Record<string, unknown> | null>(null)
  const [busy,           setBusy]           = useState(false)

  const [llmProvider,    setLlmProvider]    = useState<'openai' | 'anthropic'>('openai')
  const [llmPrompt,      setLlmPrompt]      = useState('Say the single word: OK. Nothing else.')
  const [llmLog,         setLlmLog]         = useState<{ status: number; body: LlmChatResponse; used_token: boolean } | null>(null)

  const [inspectKind,    setInspectKind]    = useState<'component' | 'service'>('component')
  const [inspectSlug,    setInspectSlug]    = useState('')
  const [inspectVersion, setInspectVersion] = useState('v1')
  const [inspectLog,     setInspectLog]     = useState<BundleInspection | null>(null)
  const [inspectSearch,  setInspectSearch]  = useState('')
  const [rawBundle,      setRawBundle]      = useState<string | null>(null)   // cached full text for search

  async function doExchange() {
    setBusy(true)
    setExchangeLog(null); setCheckLog(null); setToken(null); setTokenClaims(null)
    try {
      const r = await fetch(`${apiUrl}/v1/prop/token/exchange`, {
        method: 'POST',
        headers: {
          'Content-Type':                    'application/json',
          'X-Headlo-Prop-Publishable-Key':   publishableKey,
        },
        body: JSON.stringify({ scope: requestedScope }),
      })
      const body = await r.json()
      setExchangeLog({ status: r.status, body })
      if (r.ok && 'access_token' in body) {
        setToken(body.access_token)
        setTokenClaims(decodeJwtPayload(body.access_token))
      }
    } catch (e) {
      setExchangeLog({ status: 0, body: { error: 'NETWORK', detail: String(e) } })
    }
    setBusy(false)
  }

  async function doCheck() {
    if (!token) return
    setBusy(true)
    setCheckLog(null)
    try {
      const r = await fetch(`${apiUrl}/v1/scope/test?scope=${encodeURIComponent(checkScope)}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      const body = await r.json()
      setCheckLog({ status: r.status, body })
    } catch (e) {
      setCheckLog({ status: 0, body: { ok: false, error: 'NETWORK', detail: String(e) } })
    }
    setBusy(false)
  }

  // Fire the first REAL scope-gated production endpoint. Same handler as
  // /v1/prop/llm/chat but wrapped with verifyPropAccessToken + requireScope('ask:query').
  //
  //   attachToken = true  → sends Authorization: Bearer <token>
  //     - token has ask:query  → 200 with LLM response
  //     - token lacks ask:query → 403 INSUFFICIENT_SCOPE
  //   attachToken = false → no Authorization header
  //     - → 401 INVALID_OR_MISSING_TOKEN
  async function doLlmChat(attachToken: boolean) {
    if (attachToken && !token) return
    setBusy(true)
    setLlmLog(null)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (attachToken && token) headers['Authorization'] = `Bearer ${token}`
      const r = await fetch(`${apiUrl}/v1/scope/llm/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          provider:     llmProvider,
          model:        llmProvider === 'openai' ? 'gpt-4o-mini' : 'claude-haiku-4-5-20251001',
          systemPrompt: 'Reply with a very short answer, ideally one word.',
          messages:     [{ role: 'user', content: llmPrompt }],
          max_tokens:   32,
        }),
      })
      const body = await r.json() as LlmChatResponse
      setLlmLog({ status: r.status, body, used_token: attachToken })
    } catch (e) {
      setLlmLog({ status: 0, body: { error: 'NETWORK', detail: String(e) }, used_token: attachToken })
    }
    setBusy(false)
  }

  // Bundle inspection — fetch a compiled widget or service bundle and detect
  // Step 2 compiler injections. Var names get mangled by Terser so we can't
  // reliably match on identifiers; we grep string literals that survive
  // minification unchanged (URL paths + HTTP header names + colon-delimited
  // scope/binding tokens).
  async function doInspect() {
    if (!inspectSlug.trim()) return
    setBusy(true)
    setInspectLog(null)
    setRawBundle(null)
    // Cache-buster — every inspection fetch appends a fresh `?t=<epoch>`.
    // Bypasses any browser HTTP cache / CDN edge cache. Doesn't affect the
    // worker's KV cache (keyed on slug:version, not the full URL) — for that
    // you need to bust the key manually via wrangler, but the diagnostic here
    // still shows you fresh KV-cached content on subsequent inspects.
    const bundleUrlBase = `${apiUrl}/v1/prop/${inspectKind}/${encodeURIComponent(inspectSlug.trim())}/${encodeURIComponent(inspectVersion.trim() || 'v1')}/bundle`
    const bundleUrl = `${bundleUrlBase}?t=${Date.now()}`
    try {
      const r = await fetch(bundleUrl, { cache: 'no-store' })
      if (!r.ok) {
        setInspectLog({
          status: r.status, size_bytes: 0, bundle_url: bundleUrl,
          has_token_exchange: false, has_publishable_key: false, has_headlo_ctx: false,
          action_bindings: [], scope_candidates: [], urls_found: [],
          requires_scopes_raw: null, first_2000_chars: '',
          error: `HTTP ${r.status} fetching ${bundleUrl}`,
        })
        setBusy(false); return
      }
      const text = await r.text()
      setRawBundle(text)

      // Categorize colon-delimited quoted strings:
      //   3+ colons → action binding (`slug:version:action`)
      //   1-2 colons → potential scope
      const allColonStrings = new Set<string>()
      const colonRe = /"([a-z][a-z0-9_-]*(?::[a-z0-9_*-]+)+)"/g
      let m: RegExpExecArray | null
      while ((m = colonRe.exec(text)) !== null) allColonStrings.add(m[1]!)
      const actionBindings: string[] = []
      const scopeCandidates: string[] = []
      for (const s of allColonStrings) {
        const colonCount = (s.match(/:/g) || []).length
        if (colonCount >= 2) actionBindings.push(s)
        else                 scopeCandidates.push(s)
      }

      // URLs — anything under /v1/prop/ or /v1/scope/. The two prefixes matter
      // because the compiler injects both: /v1/prop/token/exchange for the
      // token dance and /v1/scope/* for scope-gated resource calls.
      const urlRe = /"(\/v1\/(?:prop|scope)\/[^"]+)"/g
      const urls = new Set<string>()
      while ((m = urlRe.exec(text)) !== null) urls.add(m[1]!)

      // Try to extract the actual REQUIRES_SCOPES literal. Terser may rename
      // the variable but the array literal often survives with the same
      // string contents nearby. Best-effort — falls back to null if we can't
      // locate a REQUIRES_SCOPES-shaped pattern.
      let requiresScopesRaw: string | null = null
      const rsRe1 = /REQUIRES_SCOPES\s*=\s*(\[[^\]]*\])/     // if var name survived
      const rsMatch1 = text.match(rsRe1)
      if (rsMatch1) requiresScopesRaw = rsMatch1[1] ?? null

      setInspectLog({
        status:              r.status,
        size_bytes:          text.length,
        bundle_url:          bundleUrl,
        has_token_exchange:  text.includes('/v1/prop/token/exchange'),
        has_publishable_key: text.includes('X-Headlo-Prop-Publishable-Key'),
        has_headlo_ctx:      text.includes('__headlo_endowments_ctx'),
        action_bindings:     actionBindings.sort(),
        scope_candidates:    scopeCandidates.sort(),
        urls_found:          Array.from(urls).sort(),
        requires_scopes_raw: requiresScopesRaw,
        first_2000_chars:    text.slice(0, 2000),
      })
    } catch (e) {
      setInspectLog({
        status: 0, size_bytes: 0, bundle_url: bundleUrl,
        has_token_exchange: false, has_publishable_key: false, has_headlo_ctx: false,
        action_bindings: [], scope_candidates: [], urls_found: [],
        requires_scopes_raw: null, first_2000_chars: '',
        error: `NETWORK: ${String(e)}`,
      })
    }
    setBusy(false)
  }

  function runInspectSearch() {
    if (!rawBundle || !inspectSearch.trim() || !inspectLog) return
    const term = inspectSearch.trim()
    const idxs: number[] = []
    let i = 0
    while (i < rawBundle.length) {
      const found = rawBundle.indexOf(term, i)
      if (found < 0) break
      idxs.push(found)
      i = found + term.length
    }
    // Show ~40 chars of context around each match, cap at 10 matches
    const context = idxs.slice(0, 10).map(idx => {
      const start = Math.max(0, idx - 40)
      const end   = Math.min(rawBundle.length, idx + term.length + 40)
      return `…${rawBundle.slice(start, end)}…`
    })
    setInspectLog({ ...inspectLog, search_matches: { term, count: idxs.length, context } })
  }

  const wrap:    React.CSSProperties = { fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '40px auto', padding: '0 16px', color: '#111' }
  const section: React.CSSProperties = { border: '1px solid #e0ddd8', borderRadius: 12, padding: 20, marginBottom: 20, background: '#fff' }
  const label:   React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#333' }
  const input:   React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14, fontFamily: 'ui-monospace, monospace', boxSizing: 'border-box' }
  const btn:     React.CSSProperties = { padding: '10px 18px', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: '#1a1a18', color: '#faf9f6' }
  const btnDis:  React.CSSProperties = { ...btn, background: '#8a8a80', cursor: 'default' }
  const codeBox: React.CSSProperties = { background: '#f5f2eb', padding: 12, borderRadius: 6, fontFamily: 'ui-monospace, monospace', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#111' }
  const statusOk: React.CSSProperties = { color: '#166534', fontWeight: 600 }
  const statusBad: React.CSSProperties = { color: '#b91c1c', fontWeight: 600 }

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Scope enforcement — end-to-end test</h1>
      {/* Full publishable key banner — copyable, monospace. Useful when
          debugging cross-page pk mismatches (e.g. widget uses one pk while
          config was saved for another). Override via ?pk=pk_live_... query;
          persists in localStorage so reload keeps the override until you
          "Clear override" or manually erase the entry. */}
      <div style={{ background: '#f5f2eb', border: '1px solid #e0ddd8', borderRadius: 6, padding: '10px 12px', marginBottom: 12, fontSize: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10, fontWeight: 600 }}>
            Publishable key in use on this page
          </div>
          <div style={{
            fontSize: 9, padding: '1px 6px', borderRadius: 3, fontWeight: 600,
            background: publishableKeySource === 'env' ? '#e0ddd8' : '#0f6e56',
            color:      publishableKeySource === 'env' ? '#666' : '#fff',
          }}>
            {publishableKeySource === 'env' ? 'from env (.env)' :
             publishableKeySource === 'url' ? 'from ?pk= URL param' :
             'from localStorage (prior URL override)'}
          </div>
        </div>
        <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, wordBreak: 'break-all', color: '#0f6e56' }}>
          {publishableKey || '(none — VITE_HEADLO_PUBLISHABLE_KEY not set)'}
        </code>
        <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
          {publishableKey && (
            <button
              onClick={() => void navigator.clipboard.writeText(publishableKey)}
              style={{ padding: '2px 8px', fontSize: 10, borderRadius: 3, background: '#fff', border: '1px solid #d8d4cc', cursor: 'pointer' }}
            >
              Copy
            </button>
          )}
          <button
            onClick={() => {
              const next = prompt('Publishable key override for /scope-test (blank = clear + use env)', publishableKeySource === 'env' ? '' : publishableKey)
              if (next === null) return
              const trimmed = next.trim()
              const url = new URL(window.location.href)
              if (trimmed) {
                url.searchParams.set('pk', trimmed)
                setSharedPk(trimmed)
              } else {
                url.searchParams.delete('pk')
                clearSharedPk()
              }
              window.location.href = url.toString()
            }}
            style={{ padding: '2px 8px', fontSize: 10, borderRadius: 3, background: '#fff', border: '1px solid #d8d4cc', cursor: 'pointer' }}
          >
            {publishableKeySource === 'env' ? 'Override…' : 'Change / clear override'}
          </button>
        </div>
        {publishableKeySource === 'url' && (
          <div style={{ marginTop: 4, fontSize: 10, color: '#666' }}>
            Override is now saved in localStorage — refresh works without <code style={{ fontFamily: 'ui-monospace, monospace' }}>?pk=</code> in the URL.
          </div>
        )}
      </div>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 8 }}>
        Tests the flow from <code>/v1/prop/token/exchange</code> → verify JWT → <code>/v1/scope/test</code> → <code>requireScope()</code>.
      </p>
      <p style={{ color: '#666', fontSize: 12, marginBottom: 32 }}>
        Want to verify Headlo tokens on your own backend? Install{' '}
        <a href="https://www.npmjs.com/package/headlo-server" target="_blank" rel="noreferrer" style={{ color: '#2a6a3a', fontFamily: 'ui-monospace, monospace' }}>headlo-server</a>{' '}
        (Node / Workers / Deno / Bun). Docs:{' '}
        <a href="https://www.headlo.com/docs/headlo-server" target="_blank" rel="noreferrer" style={{ color: '#2a6a3a' }}>headlo.com/docs/headlo-server</a>
        . Announcement:{' '}
        <a href="https://www.headlo.com/blog/headlo-server" target="_blank" rel="noreferrer" style={{ color: '#2a6a3a' }}>blog post</a>.
      </p>

      {/* Step 1 — Exchange */}
      <div style={section}>
        <h2 style={{ fontSize: 18, marginTop: 0, marginBottom: 12 }}>1. Exchange publishable key for scoped token</h2>
        <div style={{ marginBottom: 12 }}>
          <label style={label}>Requested scope (space-separated)</label>
          <input
            style={input}
            value={requestedScope}
            onChange={e => setRequestedScope(e.target.value)}
            placeholder="user:read content:read"
            spellCheck={false}
          />
        </div>
        <button style={busy ? btnDis : btn} onClick={doExchange} disabled={busy}>
          {busy ? 'Exchanging…' : 'POST /v1/prop/token/exchange'}
        </button>

        {exchangeLog && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, marginBottom: 4 }}>
              Response — <span style={exchangeLog.status === 200 ? statusOk : statusBad}>HTTP {exchangeLog.status}</span>
            </div>
            <div style={codeBox}>{JSON.stringify(exchangeLog.body, null, 2)}</div>
          </div>
        )}

        {token && tokenClaims && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, marginBottom: 4 }}>Decoded token claims (client-side, unverified)</div>
            <div style={codeBox}>{JSON.stringify(tokenClaims, null, 2)}</div>
          </div>
        )}
      </div>

      {/* Step 2 — Check */}
      <div style={{ ...section, opacity: token ? 1 : 0.5 }}>
        <h2 style={{ fontSize: 18, marginTop: 0, marginBottom: 12 }}>2. Call the scope-gated endpoint</h2>
        <div style={{ marginBottom: 12 }}>
          <label style={label}>Required scope at the endpoint</label>
          <input
            style={input}
            value={checkScope}
            onChange={e => setCheckScope(e.target.value)}
            placeholder="user:read"
            spellCheck={false}
            disabled={!token}
          />
        </div>
        <button style={busy || !token ? btnDis : btn} onClick={doCheck} disabled={busy || !token}>
          {busy ? 'Checking…' : `GET /v1/scope/test?scope=${checkScope}`}
        </button>

        {checkLog && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, marginBottom: 4 }}>
              Response — <span style={checkLog.status === 200 ? statusOk : statusBad}>HTTP {checkLog.status}</span>
            </div>
            <div style={codeBox}>{JSON.stringify(checkLog.body, null, 2)}</div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 32, padding: 16, background: '#f0f6ff', border: '1px solid #cfe0f7', borderRadius: 8, fontSize: 13, color: '#111' }}>
        <strong>Test scenarios:</strong>
        <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 20 }}>
          <li>Request <code>user:read</code> → Check <code>user:read</code> → <strong>200 ok</strong> (scope matches)</li>
          <li>Request <code>user:read</code> → Check <code>content:write</code> → <strong>403 INSUFFICIENT_SCOPE</strong> (scope missing)</li>
          <li>Request <code>admin:agency</code> → exchange fails with <strong>400 ADMIN_SCOPES_NOT_ISSUABLE</strong> (never widget-issuable)</li>
          <li>Request scope not in the key's <code>allowed_scopes</code> (once populated in DB) → <strong>400 SCOPE_NOT_ALLOWED</strong></li>
        </ul>
      </div>

      {/* Panel 4 — REAL scope-gated production endpoint. First endpoint that
          actually enforces a scope on live traffic. Same LLM handler as
          /v1/prop/llm/chat but wrapped with verifyPropAccessToken +
          requireScope('ask:query'). */}
      <div style={{ ...section, opacity: token ? 1 : 0.5, marginTop: 32, borderColor: '#5dcaa5', borderWidth: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>4. Fire a real scope-gated endpoint</h2>
          <span style={{ fontSize: 10, background: '#5dcaa5', color: '#0e0e0c', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>PRODUCTION</span>
        </div>
        <p style={{ color: '#666', fontSize: 13, marginTop: 0, marginBottom: 12 }}>
          <code>POST /v1/scope/llm/chat</code> — first real endpoint gated with <code>requireScope('ask:query')</code>.
          Uses the token from Panel 1. Cycle Panel 1 with different requested scopes to see how this responds:
          exchange with <code>ask:query</code> → 200; exchange with <code>user:read</code> only → 403; exchange with none → still 200 if the key
          has an empty <code>allowed_scopes</code> (permissive grandfather).
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div style={{ flex: '0 0 auto' }}>
            <label style={label}>Provider</label>
            <select
              style={{ ...input, width: 'auto' }}
              value={llmProvider}
              onChange={e => setLlmProvider(e.target.value as 'openai' | 'anthropic')}
              disabled={!token}
            >
              <option value="openai">openai (gpt-4o-mini)</option>
              <option value="anthropic">anthropic (claude-haiku-4-5)</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Prompt</label>
            <input
              style={input}
              value={llmPrompt}
              onChange={e => setLlmPrompt(e.target.value)}
              placeholder="Say the single word: OK."
              disabled={!token}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={busy || !token ? btnDis : btn} onClick={() => doLlmChat(true)} disabled={busy || !token}>
            {busy && llmLog?.used_token ? 'Firing…' : 'Fire with token'}
          </button>
          <button style={busy ? btnDis : { ...btn, background: '#7a2323' }} onClick={() => doLlmChat(false)} disabled={busy}>
            {busy && llmLog?.used_token === false ? 'Firing…' : 'Fire WITHOUT token (expect 401)'}
          </button>
        </div>

        {llmLog && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, marginBottom: 4, display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span>Response — <span style={llmLog.status === 200 ? statusOk : statusBad}>HTTP {llmLog.status}</span></span>
              <span style={{ fontSize: 11, color: '#8a8a80' }}>
                {llmLog.used_token ? 'with Bearer token' : 'no Authorization header'}
              </span>
              {llmLog.status === 200 && <span style={statusOk}>✓ scope check passed, provider responded</span>}
              {llmLog.status === 401 && <span style={statusBad}>✓ correctly rejected — no valid token</span>}
              {llmLog.status === 403 && <span style={statusBad}>✓ correctly rejected — token lacks ask:query</span>}
              {llmLog.status >= 500 && <span style={statusBad}>server / provider error (not a scope failure)</span>}
            </div>
            <div style={codeBox}>{JSON.stringify(llmLog.body, null, 2)}</div>
          </div>
        )}

        <div style={{ marginTop: 12, padding: 10, background: '#f5f2eb', borderRadius: 6, fontSize: 11, color: '#666' }}>
          To trigger the 403 path: scroll up, exchange with <code>user:read</code> only (or any scope other than <code>ask:query</code>), then click Fire.
          To trigger 200: exchange with <code>ask:query</code>, then Fire. To trigger 401: click Fire WITHOUT token (works with any Panel-1 state).
        </div>
      </div>

      {/* Step 3 — Bundle inspection */}
      <div style={{ ...section, marginTop: 32 }}>
        <h2 style={{ fontSize: 18, marginTop: 0, marginBottom: 12 }}>3. Verify compiler injection in a compiled bundle</h2>
        <p style={{ color: '#666', fontSize: 13, marginTop: 0, marginBottom: 16 }}>
          Fetches a widget or service bundle and looks for the Step-2 markers Terser can't mangle away —
          the <code>/v1/prop/token/exchange</code> URL string and the <code>X-Headlo-Prop-Publishable-Key</code>
          header string. Also greps for scope-shaped literals (<code>word:word</code>) baked into the config or
          <code>REQUIRES_SCOPES</code>. Widget bundles only inject the token-exchange path when
          <code>isolation_model = 'endowed'</code>; legacy bundles won't show it.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div style={{ flex: '0 0 auto' }}>
            <label style={label}>Kind</label>
            <select
              style={{ ...input, width: 'auto' }}
              value={inspectKind}
              onChange={e => setInspectKind(e.target.value as 'component' | 'service')}
            >
              <option value="component">component</option>
              <option value="service">service</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Slug</label>
            <input
              style={input}
              value={inspectSlug}
              onChange={e => setInspectSlug(e.target.value)}
              placeholder="headlo-ask-widget"
              spellCheck={false}
            />
          </div>
          <div style={{ flex: '0 0 100px' }}>
            <label style={label}>Version</label>
            <input
              style={input}
              value={inspectVersion}
              onChange={e => setInspectVersion(e.target.value)}
              placeholder="v1"
              spellCheck={false}
            />
          </div>
        </div>

        <button style={busy || !inspectSlug.trim() ? btnDis : btn} onClick={doInspect} disabled={busy || !inspectSlug.trim()}>
          {busy ? 'Fetching…' : `GET /v1/prop/${inspectKind}/${inspectSlug || '<slug>'}/${inspectVersion}/bundle`}
        </button>

        {inspectLog && (
          <div style={{ marginTop: 16 }}>
            {inspectLog.error ? (
              <div style={{ ...codeBox, color: '#b91c1c' }}>{inspectLog.error}</div>
            ) : (
              <>
                <div style={{ fontSize: 12, marginBottom: 8, display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span>Fetched — <span style={statusOk}>HTTP {inspectLog.status}</span>, {inspectLog.size_bytes.toLocaleString()} bytes</span>
                  <a href={inspectLog.bundle_url} target="_blank" rel="noreferrer" style={{ color: '#2a6a3a', fontSize: 11 }}>Open raw bundle →</a>
                  <code style={{ fontSize: 10, color: '#8a8a80', background: '#f5f2eb', padding: '2px 6px', borderRadius: 3 }}>?t={inspectLog.bundle_url.match(/[?&]t=(\d+)/)?.[1] ?? 'none'}</code>
                </div>

                {/* Presence indicators */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                  <div style={{ padding: '8px 12px', background: inspectLog.has_token_exchange ? '#e6f4ea' : '#fef2f2', borderRadius: 6, fontSize: 12 }}>
                    <strong>{inspectLog.has_token_exchange ? '✓' : '✗'}</strong> <code>/v1/prop/token/exchange</code>
                    <div style={{ color: '#666', marginTop: 2, fontSize: 11 }}>Step 2 injection landed</div>
                  </div>
                  <div style={{ padding: '8px 12px', background: inspectLog.has_publishable_key ? '#e6f4ea' : '#fef2f2', borderRadius: 6, fontSize: 12 }}>
                    <strong>{inspectLog.has_publishable_key ? '✓' : '✗'}</strong> <code>X-Headlo-Prop-Publishable-Key</code>
                    <div style={{ color: '#666', marginTop: 2, fontSize: 11 }}>Publishable-key header on fetches</div>
                  </div>
                  <div style={{ padding: '8px 12px', background: inspectLog.has_headlo_ctx ? '#e6f4ea' : '#fef2f2', borderRadius: 6, fontSize: 12 }}>
                    <strong>{inspectLog.has_headlo_ctx ? '✓' : '✗'}</strong> <code>__headlo_endowments_ctx</code>
                    <div style={{ color: '#666', marginTop: 2, fontSize: 11 }}>Endowed-mode Provider setup</div>
                  </div>
                </div>

                {/* REQUIRES_SCOPES literal — if extractable */}
                {inspectLog.requires_scopes_raw !== null && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, marginBottom: 4 }}><strong>REQUIRES_SCOPES literal (var name survived Terser):</strong></div>
                    <div style={codeBox}>{inspectLog.requires_scopes_raw}</div>
                  </div>
                )}
                {inspectLog.requires_scopes_raw === null && (
                  <div style={{ marginBottom: 12, padding: 10, background: '#fef8ee', border: '1px solid #f5e0b8', borderRadius: 6, fontSize: 12 }}>
                    <strong>REQUIRES_SCOPES literal not extractable</strong> — Terser likely mangled the variable name.
                    Check the scope candidates + URLs sections below for the actual scope values baked into the bundle.
                    You can also open the raw bundle (link above) and grep for the scope strings you expect.
                  </div>
                )}

                {/* Scope candidates + action bindings — separated for clarity */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>
                      <strong>Scope candidates</strong> ({inspectLog.scope_candidates.length}) — 1-2 colons, likely <code>resource:action</code>
                    </div>
                    <div style={codeBox}>{inspectLog.scope_candidates.length === 0 ? '(none)' : inspectLog.scope_candidates.join('\n')}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>
                      <strong>Action bindings</strong> ({inspectLog.action_bindings.length}) — 3+ colons, <code>slug:version:action</code>
                    </div>
                    <div style={codeBox}>{inspectLog.action_bindings.length === 0 ? '(none)' : inspectLog.action_bindings.join('\n')}</div>
                  </div>
                </div>

                {/* URLs — great for confirming which endpoints get called */}
                <div style={{ fontSize: 12, marginBottom: 4 }}>
                  <strong>PROP URLs found in bundle</strong> ({inspectLog.urls_found.length}):
                </div>
                <div style={codeBox}>{inspectLog.urls_found.length === 0 ? '(none)' : inspectLog.urls_found.join('\n')}</div>

                {/* Free-text search */}
                <div style={{ marginTop: 16, padding: 12, background: '#faf9f6', borderRadius: 6 }}>
                  <div style={{ fontSize: 12, marginBottom: 4 }}><strong>Search bundle text</strong></div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      style={{ ...input, flex: 1 }}
                      value={inspectSearch}
                      onChange={e => setInspectSearch(e.target.value)}
                      placeholder="e.g. ask:query, REQUIRES_SCOPES, __headlo_get_scoped_token"
                      onKeyDown={e => { if (e.key === 'Enter') runInspectSearch() }}
                    />
                    <button style={rawBundle ? btn : btnDis} onClick={runInspectSearch} disabled={!rawBundle}>Search</button>
                  </div>
                  {inspectLog.search_matches && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>
                        <strong>{inspectLog.search_matches.count}</strong> match{inspectLog.search_matches.count === 1 ? '' : 'es'} for <code>{inspectLog.search_matches.term}</code>
                        {inspectLog.search_matches.count > 10 ? ' (showing first 10)' : ''}
                      </div>
                      <div style={codeBox}>{inspectLog.search_matches.context.length === 0 ? '(no matches)' : inspectLog.search_matches.context.join('\n\n')}</div>
                    </div>
                  )}
                </div>

                <div style={{ fontSize: 12, marginTop: 12, marginBottom: 4 }}>First 2000 chars (sanity check):</div>
                <div style={{ ...codeBox, maxHeight: 400, overflow: 'auto' }}>{inspectLog.first_2000_chars}</div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Info panel — what Step 2 auto-wires */}
      <div style={{ marginTop: 32, padding: 20, background: '#fef8ee', border: '1px solid #f5e0b8', borderRadius: 8, fontSize: 13, color: '#111' }}>
        <strong>What Step 2 auto-wires (invisible in the network unless you look)</strong>
        <p style={{ marginTop: 8, marginBottom: 8 }}>
          The compiler bakes token-exchange logic into any widget or service that declares required scopes.
          You don't hand-write the <code>/v1/prop/token/exchange</code> call — the emitted bundle does it lazily on first API call.
        </p>
        <div style={{ marginBottom: 12 }}>
          <strong>Widget (endowed mode) — add to <code>attributes-raw.json</code>:</strong>
          <div style={{ ...codeBox, marginTop: 4 }}>{`{
  "display-name": "Ask Headlo",
  "accent-color": "#5dcaa5",
  "_requires_scopes": ["ask:query", "user:read"]
}`}</div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <strong>Service — add to <code>config.local.json</code> / <code>config.prod.json</code>:</strong>
          <div style={{ ...codeBox, marginTop: 4 }}>{`{
  "provider":        "openai",
  "model":           "gpt-4o-mini",
  "requires_scopes": ["ask:query"]
}`}</div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <strong>Service client — call the scoped endpoint via the injected runtime:</strong>
          <div style={{ ...codeBox, marginTop: 4 }}>{`const runtime = getHeadloRuntime()   // compiler-injected
const r = await runtime.authFetch('/v1/scope/llm/chat', {
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },
  body:    JSON.stringify({ provider, model, messages }),
})`}</div>
          <div style={{ marginTop: 4, fontSize: 11, color: '#666' }}>
            <code>getHeadloRuntime()</code> is the service-side counterpart to widgets' <code>useHeadloRuntime()</code>.
            authFetch handles token exchange + Bearer + publishable-key header per request.
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <strong>Verify at runtime:</strong>
          <ul style={{ marginTop: 4, marginBottom: 0, paddingLeft: 20 }}>
            <li>Load a page that mounts the widget or invokes the service</li>
            <li>Open DevTools → Network → filter for <code>token/exchange</code></li>
            <li>First API call from the widget/service triggers <code>POST /v1/prop/token/exchange</code></li>
            <li>Every subsequent request carries <code>Authorization: Bearer &lt;jwt&gt;</code></li>
          </ul>
        </div>
        <div style={{ marginBottom: 0 }}>
          <strong>Verify at compile time:</strong> use the bundle-inspection panel above with the slug + version — the
          <code>/v1/prop/token/exchange</code> string appearing in the fetched bundle proves the compiler injected the flow.
        </div>
      </div>

      {/* Third-party backend — headlo-server plug */}
      <div style={{ marginTop: 20, padding: 20, background: '#f0f6ff', border: '1px solid #cfe0f7', borderRadius: 8, fontSize: 13, color: '#111' }}>
        <strong>Gating YOUR OWN backend with the same token</strong>
        <p style={{ marginTop: 8, marginBottom: 12 }}>
          Panels 1–4 above test tokens against Headlo's <code>/v1/scope/*</code> endpoints. If you want your own backend at <code>api.customer.com/orders</code> to
          verify the same token and enforce a scope like <code>myapp:orders:read</code>, install{' '}
          <a href="https://www.npmjs.com/package/headlo-server" target="_blank" rel="noreferrer" style={{ color: '#2a6a3a', fontFamily: 'ui-monospace, monospace' }}>headlo-server</a>{' '}
          (Node / Cloudflare Workers / Deno / Bun).
        </p>
        <div style={{ ...codeBox, marginTop: 4 }}>{`import { verifyHeadloToken, requireScope } from 'headlo-server/auth'

const claims = await verifyHeadloToken(request.headers.get('Authorization')!, {
  publishableKey: 'pk_live_...',
})
requireScope(claims, 'myapp:orders:read')  // throws InsufficientScopeError`}</div>
        <div style={{ marginTop: 10, fontSize: 12 }}>
          Full docs at{' '}
          <a href="https://www.headlo.com/docs/headlo-server" target="_blank" rel="noreferrer" style={{ color: '#2a6a3a' }}>headlo.com/docs/headlo-server</a>
          {' '}(quick-start, framework adapters for Express/Hono/Next.js, error handling, key rotation). Custom scope names for your own backend can be added to your publishable key via the{' '}
          <a href="/dashboard/settings" target="_blank" rel="noreferrer" style={{ color: '#2a6a3a' }}>Publishable Keys dashboard</a>{' '}
          — no SQL required.
        </div>
      </div>
    </div>
  )
}
