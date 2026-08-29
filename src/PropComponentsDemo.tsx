import React from 'react'
import { usePropComponents } from 'headlo-react'

// Demo: how to load ALL of an agency's PUBLIC PROP components with
// `usePropComponents` — one HTTP call, all metadata for every published
// custom-element component.
//
// Symmetric to CmsComponentsDemo — same anon-key auth flavor, same zero-arg
// hook shape, but for PROP custom elements instead of CMS React components:
//
//   Dashboard (Clerk JWT)   /v1/editor/prop/components   agency-wide, all rows including drafts
//   This demo (anon key)    /v1/prop/components          agency-wide, is_public = true only
//
// Requires VITE_HEADLO_ANON_KEY in headlo-client-react/.env pointing at a site
// in an agency that has at least one PROP component published (is_public = true).

export default function PropComponentsDemo() {
  const anonKey = import.meta.env.VITE_HEADLO_ANON_KEY as string | undefined

  if (!anonKey) {
    return (
      <div style={s.page}>
        <h1 style={s.h1}>usePropComponents demo</h1>
        <div style={s.card}>
          <p style={s.note}>
            Set <code style={s.code}>VITE_HEADLO_ANON_KEY</code> in <code style={s.code}>headlo-client-react/.env</code> and restart the dev server.
          </p>
        </div>
      </div>
    )
  }

  return <Demo />
}

function Demo() {
  // Zero-arg — reads anonKey + apiUrl from <SiteProvider> context internally,
  // builds a HeadloClient under the hood, and calls GET /v1/prop/components
  // with the x-headlo-key header. One HTTP request; response is filtered
  // server-side to is_public = true.
  //
  // Advanced: pass a HeadloClient (from createClient() or useHeadloClient())
  // or a bare list function to override the source — useful for tests, SSR
  // fixtures, or the editor's Clerk-JWT path.
  const { components, loading, error } = usePropComponents()

  return (
    <div style={s.page}>
      <h1 style={s.h1}>usePropComponents demo</h1>
      <p style={s.sub}>
        The same registry the dashboard at <code style={s.code}>/dashboard/prop/components</code> uses — loaded here via anon key, filtered to public components only.
      </p>

      <section style={s.card}>
        <div style={s.label}>hook state</div>
        <div style={s.row}><span style={s.k}>endpoint</span>       <code style={s.code}>GET /v1/prop/components</code></div>
        <div style={s.row}><span style={s.k}>auth</span>           <span style={s.v}>anon key (SiteProvider context)</span></div>
        <div style={s.row}><span style={s.k}>filter</span>          <code style={s.code}>is_public = true</code></div>
        <div style={s.row}><span style={s.k}>status</span>         <span style={{ ...s.v, color: error ? '#b91c1c' : loading ? '#8a8a80' : '#166534' }}>{error ? `Error: ${error}` : loading ? 'Loading…' : `✓ ${components.length} component${components.length === 1 ? '' : 's'}`}</span></div>
      </section>

      {!loading && !error && components.length === 0 && (
        <section style={s.card}>
          <div style={s.label}>empty registry</div>
          <p style={s.note}>
            No PROP components published for this anon key's agency. Publish one in <code style={s.code}>/dashboard/prop/components</code> (mark as public) and reload.
          </p>
        </section>
      )}

      {!loading && !error && components.length > 0 && (
        <section style={s.card}>
          <div style={s.label}>components in this agency</div>
          <div style={s.recordList}>
            {components.map(c => (
              <details key={`${c.slug}@${c.version}`} style={s.componentDetails}>
                <summary style={s.componentSummary}>
                  <code style={s.code}>&lt;{c.slug}&gt;</code>
                  <span style={s.slug}>· {c.name}</span>
                  <span style={s.versionBadge}>v{c.version}</span>
                  <span style={s.reactBadge}>React {c.framework_version}</span>
                </summary>
                <div style={s.componentMeta}>
                  <div style={s.row}><span style={s.k}>slug</span>              <code style={s.code}>{c.slug}</code></div>
                  <div style={s.row}><span style={s.k}>version</span>           <code style={s.code}>{c.version}</code></div>
                  <div style={s.row}><span style={s.k}>name</span>              <span style={s.v}>{c.name}</span></div>
                  <div style={s.row}><span style={s.k}>framework_version</span> <span style={s.v}>React {c.framework_version}</span></div>
                  <div style={s.row}><span style={s.k}>requires</span>          <code style={s.code}>[{c.requires.join(', ') || '(none)'}]</code></div>
                  <div style={s.row}><span style={s.k}>is_public</span>         <span style={s.v}>{String(c.is_public)}</span></div>
                  <div style={s.row}><span style={s.k}>contract</span>          <span style={s.v}>{c.contract ? Object.keys(c.contract).join(', ') : '(none)'}</span></div>
                  <div style={s.row}><span style={s.k}>default_attrs</span>     <code style={s.code}>{c.default_attrs ? JSON.stringify(c.default_attrs) : '(none)'}</code></div>
                  <div style={s.row}><span style={s.k}>bundle_bytes</span>      <span style={s.v}>{c.component_bundle?.length ?? 0}</span></div>
                  <div style={s.row}><span style={s.k}>updated_at</span>        <span style={s.v}>{c.updated_at}</span></div>
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      <section style={s.card}>
        <div style={s.label}>using a component from this registry</div>
        <p style={s.note}>
          The registry gives you slug + version + contract. To actually render a component, drop the custom element into your JSX (the bundle loads on demand):
        </p>
        <pre style={s.pre}>{`<script src="https://api.headlo.com/v1/prop/react/19/bundle"></script>
<script src="https://api.headlo.com/v1/prop/component/<slug>/bundle"></script>
<${'<slug>'} publishable-key="pk_live_..." />`}</pre>
        <p style={s.note}>
          Or from React with <code style={s.code}>useComponent(slug)</code>, which handles the script loading for you:
        </p>
        <pre style={s.pre}>{`import { PropServer, useComponent } from 'headlo-react'

<PropServer publishableKey="pk_live_..." url="https://api.headlo.com">
  <MyPage />
</PropServer>

function MyPage() {
  const { loaded } = useComponent('headlo-auth-button')
  if (!loaded) return null
  return <headlo-auth-button />
}`}</pre>
      </section>
    </div>
  )
}

const s = {
  page:             { maxWidth: 780, margin: '32px auto', padding: '0 24px', fontFamily: '-apple-system, sans-serif', color: '#1a1a18' } as React.CSSProperties,
  h1:               { fontSize: 22, fontWeight: 700, margin: 0 } as React.CSSProperties,
  sub:              { fontSize: 13, color: '#5a5a55', marginTop: 4, marginBottom: 20, lineHeight: 1.5 } as React.CSSProperties,
  card:             { background: '#fff', border: '1px solid #e8e5df', borderRadius: 10, padding: '20px 24px', marginBottom: 16 } as React.CSSProperties,
  label:            { fontSize: 11, fontWeight: 700, color: '#8a8a80', textTransform: 'uppercase' as const, letterSpacing: '.06em', marginBottom: 14 } as React.CSSProperties,
  row:              { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 6 } as React.CSSProperties,
  k:                { fontSize: 12, color: '#8a8a80' } as React.CSSProperties,
  v:                { fontSize: 13, color: '#1a1a18', textAlign: 'right' as const, wordBreak: 'break-all' as const } as React.CSSProperties,
  note:             { fontSize: 12, color: '#8a8a80', lineHeight: 1.6, marginTop: 6 } as React.CSSProperties,
  code:             { fontFamily: '"DM Mono", monospace', fontSize: 11, color: '#1a1a18', background: '#f5f2eb', padding: '1px 6px', borderRadius: 4 } as React.CSSProperties,
  pre:              { fontFamily: '"DM Mono", monospace', fontSize: 11, background: '#faf9f6', border: '1px solid #e8e5df', borderRadius: 6, padding: '10px 12px', overflow: 'auto' as const, marginTop: 8, lineHeight: 1.55 } as React.CSSProperties,
  recordList:       { display: 'flex', flexDirection: 'column' as const, gap: 8 } as React.CSSProperties,
  slug:             { color: '#5a5a55', fontSize: 12 } as React.CSSProperties,
  versionBadge:     { fontSize: 10, fontWeight: 600, background: '#eef4ff', color: '#1e40af', padding: '2px 6px', borderRadius: 4, marginLeft: 'auto' as const } as React.CSSProperties,
  reactBadge:       { fontSize: 10, fontWeight: 600, background: '#ecfdf5', color: '#166534', padding: '2px 6px', borderRadius: 4 } as React.CSSProperties,
  componentDetails: { border: '1px solid #f0ede5', borderRadius: 6, padding: '10px 12px', background: '#fdfcf8' } as React.CSSProperties,
  componentSummary: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 } as React.CSSProperties,
  componentMeta:    { marginTop: 12, paddingTop: 10, borderTop: '1px solid #f0ede5', display: 'flex', flexDirection: 'column' as const, gap: 4 } as React.CSSProperties,
}
