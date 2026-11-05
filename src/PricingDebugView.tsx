import React from 'react'
import { useComponent } from 'headlo-react'
import { HeadloProviderV2 } from 'headlo-auth'
import { DpopAuthBridge } from './DpopAuthBridge'
import { resolveSharedPk, setSharedPk, clearSharedPk, type PkSource } from './lib/shared-pk'

// /pricing-debug — dev-only test harness for the Wave 11 pricing flow.
//
// Wraps the two Headlo endpoints backing <headlo-pricing-table>:
//   GET  /v1/prop/plans                          list active plans for a pk
//   POST /v1/prop/plans/:plan_id/checkout        create Stripe Checkout Session
//
// Plus a "Render actual widget" section that mounts <headlo-pricing-table>
// with the same values, so you can go from raw-API debugging → real UI in
// one page without ceremony.
//
// Stripe Product/Price creation isn't exposed here (sk_test_ can't ship to
// browser JS). Do those two steps via curl per the setup docs, then this
// page drives everything downstream.
//
// Values are seeded from localStorage so the page remembers what you had
// last time. First-time load uses conservative defaults; adjust and click
// buttons to fire calls. Response JSON renders inline for inspection.

// pk is shared across debug pages via lib/shared-pk. Everything else on this
// page (planId, redirect URLs) stays per-page under LS_KEY.
const LS_KEY = 'headlo_pricing_debug'
type Persisted = { planId: string; successUrl: string; cancelUrl: string }

function loadPersisted(): Persisted {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Persisted> & { pk?: string }
      // pk field on legacy blobs is ignored — shared-pk owns it now.
      return {
        planId:     parsed.planId     ?? 'pln_7bbe8b108a324fe0a983',
        successUrl: parsed.successUrl ?? 'http://localhost:5174/?ok=1',
        cancelUrl:  parsed.cancelUrl  ?? 'http://localhost:5174/?cancel=1',
      }
    }
  } catch { /* corrupt entry — fall through to defaults */ }
  return {
    planId:     'pln_7bbe8b108a324fe0a983',
    successUrl: 'http://localhost:5174/?ok=1',
    cancelUrl:  'http://localhost:5174/?cancel=1',
  }
}

// Wrap in HeadloProviderV2 so cross-tab signout works consistently with
// /abs-test, /services-debug, /scope-data-test. The embedded
// <headlo-pricing-table> widget already loads headlo-auth:v2 via script tag
// for the Subscribe click, so upgrading the page-level provider to v2 aligns
// the two auth states — one signout clears both.
const _pdPkResolved = resolveSharedPk()
const pdPublishableKey = _pdPkResolved.pk
const pdAuthIssuer     = import.meta.env.VITE_HEADLO_AUTH_ISSUER as string

export default function PricingDebugView() {
  return (
    <HeadloProviderV2
      publishableKey={pdPublishableKey}
      issuer={pdAuthIssuer}
      signInFallbackRedirectUrl="/pricing-debug"
      signUpFallbackRedirectUrl="/pricing-debug"
    >
      <DpopAuthBridge>
        <PricingDebugInner />
      </DpopAuthBridge>
    </HeadloProviderV2>
  )
}

function PricingDebugInner() {
  const initial = loadPersisted()
  const initialPk = resolveSharedPk()
  const [pk,         setPkState]    = React.useState(initialPk.pk)
  const [pkSource,   setPkSource]   = React.useState<PkSource>(initialPk.source)
  const setPk = (val: string) => { setPkState(val); setSharedPk(val); setPkSource('localStorage') }
  const [planId,     setPlanId]     = React.useState(initial.planId)
  const [successUrl, setSuccessUrl] = React.useState(initial.successUrl)
  const [cancelUrl,  setCancelUrl]  = React.useState(initial.cancelUrl)

  // Persist on any change (pk lives in shared-pk, not this blob).
  React.useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify({ planId, successUrl, cancelUrl } satisfies Persisted))
  }, [planId, successUrl, cancelUrl])

  const apiUrl = (import.meta.env.VITE_HEADLO_API_URL as string | undefined) ?? 'http://127.0.0.1:8787'

  // Per-panel state — we render each response inline as { status, body }
  // so the user sees exactly what the endpoint returned including error
  // shape (paired with what a real widget would parse).
  type Panel = { status?: number; body?: unknown; error?: string; loading?: boolean }
  const [listResp,     setListResp]     = React.useState<Panel>({})
  const [checkoutResp, setCheckoutResp] = React.useState<Panel>({})
  const [showWidget,     setShowWidget]     = React.useState(false)
  const [showBareWidget, setShowBareWidget] = React.useState(false)
  // Custom elements can only be defined once per page load, so v1 and v2 share
  // one selector — whichever version loads first wins for both section 3 & 4.
  // Reload the page to switch after loading. Starts as null so useComponent
  // stays dormant until the user clicks a Load-widget button; otherwise the
  // default would eagerly register v1 and shadow any later v2 click.
  const [pricingVersion, setPricingVersion] = React.useState<'v1' | 'v2' | null>(null)

  async function runList() {
    setListResp({ loading: true })
    try {
      const r = await fetch(`${apiUrl}/v1/prop/plans`, {
        headers: { 'X-Headlo-Prop-Publishable-Key': pk },
      })
      const body = await r.json().catch(() => null)
      setListResp({ status: r.status, body })
    } catch (e) {
      setListResp({ error: String(e) })
    }
  }

  async function runCheckout(openInBrowser: boolean) {
    setCheckoutResp({ loading: true })
    try {
      const r = await fetch(`${apiUrl}/v1/prop/plans/${encodeURIComponent(planId)}/checkout`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-Headlo-Prop-Publishable-Key': pk },
        body:    JSON.stringify({ success_url: successUrl, cancel_url: cancelUrl }),
      })
      const body = await r.json().catch(() => null) as { url?: string } | null
      setCheckoutResp({ status: r.status, body })
      if (openInBrowser && r.ok && body?.url) window.open(body.url, '_blank', 'noopener')
    } catch (e) {
      setCheckoutResp({ error: String(e) })
    }
  }

  // <headlo-pricing-table> needs its bundle to be present in prop_component.app.
  // If not yet published, useComponent will surface `error` and we render a
  // hint pointing at the publish step. Successful load registers the custom
  // element and the tag below upgrades.
  // Pass empty slug until the user picks a version — useComponent early-returns
  // on falsy slug so no bundle is fetched and no custom element is registered.
  const { loaded: widgetLoaded, error: widgetErr } = useComponent(
    pricingVersion ? 'headlo-pricing-table' : '',
    pricingVersion ?? 'v1',
  )

  // Also load headlo-init so the widget picks up publishable-key + api-url
  // from window globals set by <headlo-init>. Same pattern CapExpertView uses.
  useComponent('headlo-init', 'v1')

  // Load headlo-service-config so we can override headlo-billing:v1's baked
  // defaultSuccessUrl / defaultCancelUrl at the page level. Only meaningful
  // for the v2 pricing-table (v1 takes redirect URLs from tag attributes).
  useComponent('headlo-service-config', 'v1')

  // Redirect URL overrides — sent to headlo-billing:v1 via <headlo-service-config>.
  // Land back on this debug page so the ?status= param can be inspected without
  // bouncing through the dashboard app.
  const billingSuccessUrl = `${window.location.origin}/pricing-debug?status=success`
  const billingCancelUrl  = `${window.location.origin}/pricing-debug?status=cancel`

  React.useEffect(() => {
    // Sync window globals so <headlo-pricing-table> reads them at mount.
    ;(window as unknown as Record<string, string>).__headlo_prop_key = pk
    ;(window as unknown as Record<string, string>).__headlo_api_url  = apiUrl
  }, [pk, apiUrl])

  // Load headlo-auth:v2 service so the widget's authFetch path can attach
  // Bearer + DPoP on Subscribe clicks. Without this, the widget silently
  // falls through to anon fetch → webhook can't set client_reference_id →
  // role assignment silent-drops. Runs once when the widget section is
  // shown; script tag inject is idempotent (window global check).
  const [authSvcLoaded, setAuthSvcLoaded] = React.useState<boolean>(
    typeof window !== 'undefined' && !!(window as { __headlo_service_headlo_auth_v2?: unknown }).__headlo_service_headlo_auth_v2,
  )
  React.useEffect(() => {
    if (!showWidget && !showBareWidget) return
    if (authSvcLoaded) return
    const s = document.createElement('script')
    s.src   = `${apiUrl}/v1/prop/service/headlo-auth/v2/bundle`
    s.async = true
    s.onload  = () => setAuthSvcLoaded(true)
    s.onerror = () => console.error('[pricing-debug] failed to load headlo-auth:v2 bundle')
    document.head.appendChild(s)
  }, [showWidget, showBareWidget, apiUrl, authSvcLoaded])

  // Poll V2 signed-in state after the service loads. Mirrors what the widget
  // itself will check on Subscribe click — surfaces which auth path will
  // actually fire so it's not a mystery. null = still checking.
  const [v2SignedIn, setV2SignedIn] = React.useState<boolean | null>(null)
  React.useEffect(() => {
    if (!authSvcLoaded) { setV2SignedIn(null); return }
    let cancelled = false
    void (async () => {
      const svc = (window as unknown as { __headlo_service_headlo_auth_v2?: { isSignedIn?: () => Promise<{ signedIn: boolean }> } }).__headlo_service_headlo_auth_v2
      if (!svc || typeof svc.isSignedIn !== 'function') { if (!cancelled) setV2SignedIn(false); return }
      try {
        const r = await svc.isSignedIn()
        if (!cancelled) setV2SignedIn(!!r?.signedIn)
      } catch {
        if (!cancelled) setV2SignedIn(false)
      }
    })()
    return () => { cancelled = true }
  }, [authSvcLoaded])

  return (
    <div style={s.page}>
      <header style={s.header}>
        <a href="/" style={s.back}>← Back</a>
        <div style={s.title}>Pricing debug — Wave 11</div>
      </header>

      <main style={s.main}>
        {/* Full publishable key banner — same pattern as /scope-test. Shows
            the pk in use with source badge (URL param wins → localStorage →
            env). Override via ?pk=pk_live_... query or the Override button. */}
        <section style={{ ...s.panel, background: '#f5f2eb', borderColor: '#e0ddd8' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10, fontWeight: 600 }}>
              Publishable key in use on this page
            </div>
            <div style={{
              fontSize: 9, padding: '1px 6px', borderRadius: 3, fontWeight: 600,
              background: pkSource === 'env' ? '#e0ddd8' : '#0f6e56',
              color:      pkSource === 'env' ? '#666' : '#fff',
            }}>
              {pkSource === 'env' ? 'from env (.env)' :
               pkSource === 'url' ? 'from ?pk= URL param' :
               'from localStorage'}
            </div>
          </div>
          <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, wordBreak: 'break-all', color: '#0f6e56' }}>
            {pk || '(none — VITE_HEADLO_PUBLISHABLE_KEY not set)'}
          </code>
          <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
            {pk && (
              <button
                onClick={() => void navigator.clipboard.writeText(pk)}
                style={{ padding: '2px 8px', fontSize: 10, borderRadius: 3, background: '#fff', border: '1px solid #d8d4cc', cursor: 'pointer' }}
              >
                Copy
              </button>
            )}
            <button
              onClick={() => {
                const next = prompt('Publishable key override for /pricing-debug (blank = revert to env)', pkSource === 'env' ? '' : pk)
                if (next === null) return
                const trimmed = next.trim()
                const url = new URL(window.location.href)
                if (trimmed) {
                  url.searchParams.set('pk', trimmed)
                  setPk(trimmed)
                  setPkSource('url')
                } else {
                  url.searchParams.delete('pk')
                  clearSharedPk()
                  const envPk = (import.meta.env.VITE_HEADLO_PUBLISHABLE_KEY as string | undefined) ?? ''
                  setPkState(envPk)
                  setPkSource(envPk ? 'env' : 'empty')
                }
                window.history.replaceState({}, '', url.toString())
              }}
              style={{ padding: '2px 8px', fontSize: 10, borderRadius: 3, background: '#fff', border: '1px solid #d8d4cc', cursor: 'pointer' }}
            >
              {pkSource === 'env' ? 'Override…' : 'Change / clear override'}
            </button>
          </div>
        </section>

        <section style={s.panel}>
          <h2 style={s.h2}>Shared inputs</h2>
          <div style={s.grid}>
            <label style={s.label}>Publishable key
              <input
                value={pk}
                onChange={e => setPk(e.target.value)}
                style={s.input}
                spellCheck={false}
              />
            </label>
            <label style={s.label}>Plan ID
              <input value={planId} onChange={e => setPlanId(e.target.value)} style={s.input} spellCheck={false} />
            </label>
            <label style={s.label}>Success URL
              <input value={successUrl} onChange={e => setSuccessUrl(e.target.value)} style={s.input} spellCheck={false} />
            </label>
            <label style={s.label}>Cancel URL
              <input value={cancelUrl} onChange={e => setCancelUrl(e.target.value)} style={s.input} spellCheck={false} />
            </label>
          </div>
          <div style={s.metaLine}>API base: <code>{apiUrl}</code> · Values persist in localStorage under <code>{LS_KEY}</code></div>
        </section>

        <section style={s.panel}>
          <h2 style={s.h2}>1. List plans <span style={s.methodTag}>GET /v1/prop/plans</span></h2>
          <button style={s.btn} onClick={runList} disabled={listResp.loading}>
            {listResp.loading ? 'Fetching…' : 'Fetch plans'}
          </button>
          <Response panel={listResp} />
        </section>

        <section style={s.panel}>
          <h2 style={s.h2}>2. Create Checkout URL <span style={s.methodTag}>POST /v1/prop/plans/:plan_id/checkout</span></h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={s.btn} onClick={() => runCheckout(false)} disabled={checkoutResp.loading}>
              {checkoutResp.loading ? 'Requesting…' : 'Create session URL'}
            </button>
            <button style={s.btnSecondary} onClick={() => runCheckout(true)} disabled={checkoutResp.loading}>
              Create + open in new tab
            </button>
          </div>
          <Response panel={checkoutResp} />
          {typeof (checkoutResp.body as { url?: unknown } | null)?.url === 'string' && (
            <div style={s.hint}>
              → Open the <code>url</code> field in a browser, complete with card <code>4242 4242 4242 4242</code>,
              exp <code>12/34</code>, CVC <code>123</code>. Watch your <code>stripe listen</code> terminal for the webhook.
            </div>
          )}
        </section>

        <section style={s.panel}>
          <h2 style={s.h2}>3. Render <code>&lt;headlo-pricing-table&gt;</code> with prop-key attribute</h2>
          <div style={{ ...s.hint, marginBottom: 8 }}>
            Host page passes <code>prop-key</code> explicitly. Precedence:
            host attr wins over install values wins over default_attrs.
            Use this variant when the embedding page controls the pk (e.g.
            multi-tenant SaaS with per-request pk injection).
          </div>
          {!showWidget && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                style={s.btn}
                onClick={() => { setPricingVersion('v1'); setShowWidget(true) }}
              >
                Load widget (with prop-key)
              </button>
              <button
                style={s.btnSecondary}
                onClick={() => { setPricingVersion('v2'); setShowWidget(true) }}
              >
                Load widget v2
              </button>
            </div>
          )}
          {showWidget && (
            <div style={{ ...s.hint, marginTop: 8, fontSize: 11 }}>
              Loaded version: <strong>{pricingVersion}</strong> (custom element is defined once per page — reload to switch)
            </div>
          )}
          {showWidget && widgetErr && (
            <div style={s.err}>
              Failed to load bundle: {String(widgetErr)}
              <div style={s.hint}>Publish the component in dashboard first: create <code>headlo-pricing-table</code> def + {pricingVersion} app, mark def public, paste component.tsx into Component JS.</div>
            </div>
          )}
          {showWidget && widgetLoaded && (
            <div style={{ marginTop: 12 }}>
              <div style={{ ...s.hint, marginBottom: 8 }}>
                <div>headlo-auth:v2 service: {authSvcLoaded ? '✓ loaded' : 'loading…'}</div>
                <div>Subscribe path will be: <strong>{v2SignedIn === null ? 'checking…' : v2SignedIn ? 'AUTHENTICATED (Bearer + DPoP)' : 'ANON (email-based pending grant, reconciles on V2 sign-in)'}</strong></div>
                {v2SignedIn === false && (
                  <div style={{ marginTop: 4, fontSize: 11 }}>
                    Not signed in via V2. To test the authenticated path, sign in first at <a href="/abs-test" style={{ color: '#0f6e56' }}>/abs-test</a> (same origin), then return here.
                  </div>
                )}
              </div>
              <div style={s.hint}>Rendered markup ({pricingVersion}):</div>
              <pre style={s.pre}>{pricingVersion === 'v2'
                ? `<headlo-init
  publishable-key="${pk}"
  api-url="${apiUrl}"
/>
<headlo-service-config
  service="headlo-billing:v1"
  default-success-url="${billingSuccessUrl}"
  default-cancel-url="${billingCancelUrl}"
/>
<headlo-pricing-table
  prop-key="${pk}"
  layout="default"
/>`
                : `<headlo-init
  publishable-key="${pk}"
  api-url="${apiUrl}"
/>
<headlo-pricing-table
  prop-key="${pk}"
  new-subscription-redirect-url="${successUrl}"
  cancel-redirect-url="${cancelUrl}"
  layout="default"
/>`}</pre>
              <headlo-init
                publishable-key={pk}
                api-url={apiUrl}
              />
              {pricingVersion === 'v2' && (
                <headlo-service-config
                  service="headlo-billing:v1"
                  default-success-url={billingSuccessUrl}
                  default-cancel-url={billingCancelUrl}
                />
              )}
              <headlo-pricing-table
                prop-key={pk}
                new-subscription-redirect-url={successUrl}
                cancel-redirect-url={cancelUrl}
                layout="default"
              />
            </div>
          )}
        </section>

        <section style={s.panel}>
          <h2 style={s.h2}>4. Render <code>&lt;headlo-pricing-table&gt;</code> with NO attributes</h2>
          <div style={{ ...s.hint, marginBottom: 8 }}>
            Bare embed — no host attributes. Widget resolves everything from
            layers below: <code>window.__headlo_prop_key</code> (set by <code>&lt;headlo-init&gt;</code>) or
            <code> app_install.values</code> (per-Application config fetched from
            <code> /v1/prop/install</code>). Use this variant to test what a merchant's
            bare embed on their own site actually sees — the failure mode of
            "install value is bad" surfaces here because the host attribute
            isn't there to shadow it.
          </div>
          {!showBareWidget && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                style={s.btn}
                onClick={() => { if (!pricingVersion) setPricingVersion('v1'); setShowBareWidget(true) }}
              >
                Load widget (no attributes)
              </button>
              <button
                style={s.btnSecondary}
                onClick={() => { if (!pricingVersion) setPricingVersion('v2'); setShowBareWidget(true) }}
              >
                Load widget v2 (no attributes)
              </button>
            </div>
          )}
          {showBareWidget && widgetErr && (
            <div style={s.err}>
              Failed to load bundle: {String(widgetErr)}
            </div>
          )}
          {showBareWidget && widgetLoaded && (
            <div style={{ marginTop: 12 }}>
              <div style={s.hint}>Rendered markup (no attributes):</div>
              <pre style={s.pre}>{pricingVersion === 'v2'
                ? `<headlo-init
  publishable-key="${pk}"
  api-url="${apiUrl}"
/>
<headlo-service-config
  service="headlo-billing:v1"
  default-success-url="${billingSuccessUrl}"
  default-cancel-url="${billingCancelUrl}"
/>
<headlo-pricing-table />`
                : `<headlo-init
  publishable-key="${pk}"
  api-url="${apiUrl}"
/>
<headlo-pricing-table />`}</pre>
              <div style={{ ...s.hint, marginTop: 4 }}>
                <code>&lt;headlo-init&gt;</code> is still required to set
                <code> window.__headlo_prop_key</code> — otherwise the widget
                doesn't know which pk to use for its own outgoing calls.
                Without any pk source at all, the widget renders an error.
              </div>
              <headlo-init
                publishable-key={pk}
                api-url={apiUrl}
              />
              {pricingVersion === 'v2' && (
                <headlo-service-config
                  service="headlo-billing:v1"
                  default-success-url={billingSuccessUrl}
                  default-cancel-url={billingCancelUrl}
                />
              )}
              <headlo-pricing-table />
            </div>
          )}
        </section>

        <section style={s.panel}>
          <h2 style={s.h2}>Reference — what you'd curl for these calls</h2>
          <pre style={s.pre}>{`# List plans
curl.exe -s "${apiUrl}/v1/prop/plans" \\
  -H "X-Headlo-Prop-Publishable-Key: ${pk}"

# Create checkout URL
curl.exe -s -X POST "${apiUrl}/v1/prop/plans/${planId}/checkout" \\
  -H "Content-Type: application/json" \\
  -H "X-Headlo-Prop-Publishable-Key: ${pk}" \\
  -d '{"success_url":"${successUrl}","cancel_url":"${cancelUrl}"}'`}</pre>
        </section>
      </main>
    </div>
  )
}

type ResponsePanel = { status?: number; body?: unknown; error?: string; loading?: boolean }

function Response({ panel }: { panel: ResponsePanel }) {
  if (panel.loading)              return <div style={s.hint}>Loading…</div>
  if (typeof panel.error === 'string') return <div style={s.err}>Network error: {panel.error}</div>
  if (panel.status == null && panel.body == null) return null
  const ok = panel.status != null && panel.status >= 200 && panel.status < 300
  return (
    <div style={{ marginTop: 12 }}>
      <div style={ok ? s.statusOk : s.statusBad}>HTTP {panel.status}</div>
      <pre style={s.pre}>{JSON.stringify(panel.body, null, 2)}</pre>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page:       { background: '#faf9f6', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1a1a18' },
  header:     { borderBottom: '1px solid #e8e5df', padding: '0 24px', height: 52, display: 'flex', alignItems: 'center', gap: 24, fontSize: 13 },
  back:       { textDecoration: 'none', color: '#1a1a18' },
  title:      { fontWeight: 600 },
  main:       { padding: '24px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900, margin: '0 auto' },
  panel:      { background: '#fff', border: '1px solid #e8e5df', borderRadius: 8, padding: 16 },
  h2:         { margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#1a1a18', display: 'flex', gap: 8, alignItems: 'center' },
  methodTag:  { fontSize: 10, fontWeight: 500, background: '#0f6e56', color: '#faf9f6', padding: '2px 6px', borderRadius: 3, fontFamily: 'ui-monospace, monospace' },
  grid:       { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 8 },
  label:      { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#666' },
  input:      { padding: '6px 8px', border: '1px solid #d8d4cc', borderRadius: 4, fontSize: 12, fontFamily: 'ui-monospace, monospace', outline: 'none' },
  metaLine:   { marginTop: 8, fontSize: 11, color: '#8a8a80' },
  btn:        { padding: '8px 14px', background: '#1a1a18', color: '#faf9f6', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnSecondary: { padding: '8px 14px', background: '#f5f2eb', color: '#1a1a18', border: '1px solid #d8d4cc', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  pre:        { background: '#1a1a18', color: '#c8e6c9', padding: 12, borderRadius: 4, fontSize: 11, overflow: 'auto', margin: '8px 0 0' },
  statusOk:   { display: 'inline-block', padding: '2px 8px', background: '#0f6e56', color: '#faf9f6', borderRadius: 3, fontSize: 11, fontFamily: 'ui-monospace, monospace', fontWeight: 600 },
  statusBad:  { display: 'inline-block', padding: '2px 8px', background: '#c00',    color: '#faf9f6', borderRadius: 3, fontSize: 11, fontFamily: 'ui-monospace, monospace', fontWeight: 600 },
  hint:       { marginTop: 8, fontSize: 12, color: '#666', lineHeight: 1.5 },
  err:        { marginTop: 8, padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', fontSize: 12 },
}
