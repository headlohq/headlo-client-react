import React from 'react'
import { useCmsComponents } from 'headlo-react'
import { HeadloProviderV2, useHeadloAuth, useUser, SignInButton, SignOutButton, SignedIn, SignedOut } from 'headlo-auth'
import { HeadloAuthContext } from 'headlo-react'
import { DpopAuthBridge } from './DpopAuthBridge'

// V2 (ABS / DPoP) version of the CMS components demo.
//
// Compared to /demo/cms-components (v1 root provider + zero-arg useCmsComponents
// hitting anon-key /v1/components):
//
//   - Wraps in HeadloProviderV2  → DPoP-anchored session, cookie-less
//   - Wraps in DpopAuthBridge    → any data hook inside auto-attaches DPoP proofs
//   - Hits the EDITOR path /v1/editor/components with V2 access token + DPoP
//     via a custom source function. Exercises the full A.5.1 middleware
//     enforcement branch AND the A.5.2 authFetch wire simultaneously.
//
// End-to-end proof of ABS + Phase A.5.1 + Phase A.5.2 working together on a
// real headlo-react hook (useCmsComponents) using the same registry the
// dashboard uses.

const authIssuer     = import.meta.env.VITE_HEADLO_AUTH_ISSUER     as string
const publishableKey = import.meta.env.VITE_HEADLO_PUBLISHABLE_KEY as string
const apiUrl         = import.meta.env.VITE_HEADLO_API_URL         as string

export default function CmsComponentsDemoV2() {
  return (
    <HeadloProviderV2
      publishableKey={publishableKey}
      issuer={authIssuer}
      signInFallbackRedirectUrl="/demo/auth-v2/cms-components"
      signUpFallbackRedirectUrl="/demo/auth-v2/cms-components"
    >
      <DpopAuthBridge>
        <Inner />
      </DpopAuthBridge>
    </HeadloProviderV2>
  )
}

function Inner() {
  const { isLoaded, isSignedIn } = useHeadloAuth()
  const user = useUser()

  return (
    <div style={s.page}>
      <h1 style={s.h1}>useCmsComponents demo — V2 (DPoP)</h1>
      <p style={s.sub}>
        Loads the agency's CMS component registry via <code style={s.code}>/v1/editor/components</code> using a V2-minted access token and a fresh DPoP proof per request. Exercises Phase A.5.1 middleware enforcement + Phase A.5.2 <code style={s.code}>authFetch</code> wire on a real <code style={s.code}>useCmsComponents</code> call.
      </p>

      <section style={s.card}>
        <div style={s.label}>V2 auth state</div>
        <div style={s.row}><span style={s.k}>isLoaded</span>   <code style={s.code}>{String(isLoaded)}</code></div>
        <div style={s.row}><span style={s.k}>isSignedIn</span> <code style={s.code}>{String(isSignedIn)}</code></div>
        <div style={s.row}><span style={s.k}>user.email</span> <span style={s.v}>{user?.email ?? '—'}</span></div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <SignedOut>
            <SignInButton style={s.btnPrimary}>Sign in with Headlo (V2)</SignInButton>
          </SignedOut>
          <SignedIn>
            <SignOutButton style={s.btnDanger}>Sign out</SignOutButton>
          </SignedIn>
        </div>
      </section>

      <SignedIn>
        <RegistrySection />
      </SignedIn>
      <SignedOut>
        <section style={s.card}>
          <div style={s.note}>
            Sign in above to load the CMS components registry.
          </div>
        </section>
      </SignedOut>
    </div>
  )
}

function RegistrySection() {
  // Source function closes over authFetch from HeadloAuthContext. Fires
  // /v1/editor/components with V2 access token + DPoP proof — the exact
  // same code path headlo-react data hooks use for their own requests via
  // the A.5.2 authFetch wire. When Phase A.5.1 flag is on, this hits the
  // enforcement branch and validates cnf.jkt binding.
  const auth = React.useContext(HeadloAuthContext)

  const source = React.useCallback(async () => {
    const fetcher = auth?.authFetch ?? fetch
    const r = await fetcher(`${apiUrl}/v1/editor/components`, { method: 'GET' })
    const body = await r.text()
    if (!r.ok) return { components: [], signature: null, error: `HTTP ${r.status}: ${body.slice(0, 200)}` }
    try {
      return JSON.parse(body) as { components: []; signature: string | null; error: string | null }
    } catch {
      return { components: [], signature: null, error: `Non-JSON response: ${body.slice(0, 200)}` }
    }
  }, [auth?.authFetch])

  const { entries, loading, error } = useCmsComponents(source)

  return (
    <>
      <section style={s.card}>
        <div style={s.label}>hook state</div>
        <div style={s.row}><span style={s.k}>endpoint</span> <code style={s.code}>GET /v1/editor/components</code></div>
        <div style={s.row}><span style={s.k}>auth</span>     <span style={s.v}>V2 access token + DPoP proof (via authFetch)</span></div>
        <div style={s.row}><span style={s.k}>status</span>   <span style={{ ...s.v, color: error ? '#b91c1c' : loading ? '#8a8a80' : '#166534' }}>
          {error ? `Error: ${error}` : loading ? 'Loading…' : `✓ ${entries.length} component${entries.length === 1 ? '' : 's'}`}
        </span></div>
      </section>

      {error && (
        <section style={s.card}>
          <div style={s.label}>what the error tells us</div>
          <div style={s.note}>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li><strong>401 UNAUTHORIZED: dpop_dpop_missing</strong> — enforcement flag is ON and the request didn't send a DPoP header. Means the A.5.2 authFetch wire isn't attached (unexpected — DpopAuthBridge should be providing it).</li>
              <li><strong>401 UNAUTHORIZED: dpop_jkt_mismatch</strong> — proof was signed by a different key than the token was minted for. Local session drift; sign out + back in.</li>
              <li><strong>403 FORBIDDEN: no_headlo_membership</strong> — enforcement passed but your V2 <code>sub</code> isn't linked to a <code>core.agency_member</code> row. Link it via SQL and reload (see /abs-test for the SQL snippet).</li>
              <li><strong>Anything else</strong> — network / worker / SQL issue. Check <code>wrangler tail</code> for <code>[auth:a5.1]</code> lines.</li>
            </ul>
          </div>
        </section>
      )}

      {!loading && !error && entries.length > 0 && (
        <section style={s.card}>
          <div style={s.label}>components loaded via V2 + DPoP</div>
          <div style={s.remark}>
            Each entry expands to show metadata + a live render. The rendered React component was compiled from server-fetched TSX by the SDK (via Sucrase) at hook resolution — same pipeline the dashboard uses, hit here via V2 + DPoP.
          </div>
          <div style={s.recordList}>
            {entries.map(e => (
              <details key={e.component_id} style={s.componentDetails}>
                <summary style={s.componentSummary}>
                  <code style={s.code}>{e.component_id}</code>
                  <span style={s.slug}>· {e.label}</span>
                  <span style={s.tplBadge}>{e.templateId ?? '(no template)'}</span>
                </summary>
                <div style={s.componentMeta}>
                  <div style={s.row}><span style={s.k}>component_id</span> <code style={s.code}>{e.component_id}</code></div>
                  <div style={s.row}><span style={s.k}>label</span>        <span style={s.v}>{e.label}</span></div>
                  <div style={s.row}><span style={s.k}>template_ids</span> <code style={s.code}>[{e.templateIds.join(', ')}]</code></div>
                  <div style={s.row}><span style={s.k}>collection_id</span><code style={s.code}>{e.collectionId ?? '(custom sample)'}</code></div>
                  <div style={s.row}><span style={s.k}>code bytes</span>   <span style={s.v}>{e.code.length}</span></div>
                </div>

                <div style={s.livePreviewLabel}>live render</div>
                <div style={s.previewFrame}>
                  <LiveRender entry={e} />
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      <section style={s.card}>
        <div style={s.label}>what this proves</div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#5a5a55', lineHeight: 1.6 }}>
          <li><code style={s.code}>HeadloProviderV2</code> gives us a DPoP-anchored session (cookie-less, XSS-resistant refresh).</li>
          <li><code style={s.code}>DpopAuthBridge</code> exposes a fetch-shaped function that signs a fresh DPoP proof per request.</li>
          <li><code style={s.code}>HeadloAuthProvider</code> forwards that function as <code style={s.code}>authFetch</code> to every hook in scope.</li>
          <li><code style={s.code}>useCmsComponents</code>'s custom source function reads it from context and uses it for the underlying <code style={s.code}>/v1/editor/components</code> call.</li>
          <li>Result: end-to-end DPoP-authenticated hook call with zero hand-rolled auth code — the SDK plumbing did everything.</li>
        </ul>
      </section>
    </>
  )
}

// Renders one CMS component instance with its own saved sample data +
// template options — same shape the editor's preview pane uses. Wrapped in
// a small error boundary so a single misbehaving component doesn't nuke
// the whole demo page.
function LiveRender({ entry }: { entry: ReturnType<typeof useCmsComponents>['entries'][number] }) {
  const records = [{
    collection_record_id: `${entry.component_id}_0`,
    ...(entry.sampleData ?? {}),
  }]
  const options = (entry.templateOptions ?? {}) as Record<string, unknown>

  return (
    <RenderErrorBoundary componentId={entry.component_id}>
      <entry.Component records={records} options={options} />
    </RenderErrorBoundary>
  )
}

class RenderErrorBoundary extends React.Component<{ componentId: string; children: React.ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { err } }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#b91c1c', fontSize: 12, fontFamily: 'monospace' }}>
          <strong>{this.props.componentId}</strong>: runtime error<br />
          {this.state.err.message}
        </div>
      )
    }
    return this.props.children
  }
}

const s = {
  page:         { maxWidth: 780, margin: '32px auto', padding: '0 24px', fontFamily: '-apple-system, sans-serif', color: '#1a1a18' } as React.CSSProperties,
  h1:           { fontSize: 22, fontWeight: 700, margin: 0 } as React.CSSProperties,
  sub:          { fontSize: 13, color: '#5a5a55', marginTop: 4, marginBottom: 20, lineHeight: 1.5 } as React.CSSProperties,
  card:         { background: '#fff', border: '1px solid #e8e5df', borderRadius: 10, padding: '20px 24px', marginBottom: 16 } as React.CSSProperties,
  label:        { fontSize: 11, fontWeight: 700, color: '#8a8a80', textTransform: 'uppercase' as const, letterSpacing: '.06em', marginBottom: 14 } as React.CSSProperties,
  row:          { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 6 } as React.CSSProperties,
  k:            { fontSize: 12, color: '#8a8a80' } as React.CSSProperties,
  v:            { fontSize: 13, color: '#1a1a18', textAlign: 'right' as const, wordBreak: 'break-all' as const } as React.CSSProperties,
  note:         { fontSize: 12, color: '#8a8a80', lineHeight: 1.6, marginTop: 6 } as React.CSSProperties,
  code:         { fontFamily: '"DM Mono", monospace', fontSize: 11, color: '#1a1a18', background: '#f5f2eb', padding: '1px 6px', borderRadius: 4 } as React.CSSProperties,
  btnPrimary:   { background: '#1a1a18', color: '#faf9f6', border: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
  btnDanger:    { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
  recordList:   { display: 'flex', flexDirection: 'column' as const, gap: 8 } as React.CSSProperties,
  slug:         { color: '#5a5a55', fontSize: 12 } as React.CSSProperties,
  tplBadge:     { fontSize: 10, fontWeight: 600, background: '#eef4ff', color: '#1e40af', padding: '2px 6px', borderRadius: 4, marginLeft: 'auto' as const } as React.CSSProperties,
  componentDetails: { border: '1px solid #f0ede5', borderRadius: 6, padding: '10px 12px', background: '#fdfcf8' } as React.CSSProperties,
  componentSummary: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 } as React.CSSProperties,
  componentMeta:    { marginTop: 12, paddingTop: 10, borderTop: '1px solid #f0ede5', display: 'flex', flexDirection: 'column' as const, gap: 4 } as React.CSSProperties,
  livePreviewLabel: { fontSize: 10, fontWeight: 700, color: '#8a8a80', textTransform: 'uppercase' as const, letterSpacing: '.06em', marginTop: 14, marginBottom: 6 } as React.CSSProperties,
  previewFrame:     { background: '#faf9f6', border: '1px solid #e8e5df', borderRadius: 6, padding: 12, minHeight: 60 } as React.CSSProperties,
  remark:           { fontSize: 12, color: '#8a8a80', lineHeight: 1.55, marginBottom: 10 } as React.CSSProperties,
}
