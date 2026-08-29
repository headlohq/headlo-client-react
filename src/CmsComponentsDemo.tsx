import React from 'react'
import { useCmsComponents } from 'headlo-react'

// Demo: how to load ALL of an agency's CMS components with `useCmsComponents`
// and render a specific one (`calculator`) on a customer site.
//
// Mirrors what the dashboard does at /dashboard/cms/components/calculator, but
// via the PUBLIC anon-keyed path instead of the editor's Clerk-JWT path:
//
//   Dashboard          /v1/editor/components   auth = Clerk JWT       (agency-wide, all rows)
//   This demo          /v1/components          auth = anon key header (agency-wide, all rows)
//
// Both endpoints ultimately hit the same SQL — one authenticates the caller
// via JWT, the other via anon key. Payload shape is identical: every entry
// comes back with a compiled `Component` React function you can render inline.
//
// Requires VITE_HEADLO_ANON_KEY in headlo-client-react/.env pointing at a site
// in an agency that owns the `calculator` component.

const TARGET_COMPONENT_ID = 'calculator'

export default function CmsComponentsDemo() {
  const anonKey = import.meta.env.VITE_HEADLO_ANON_KEY as string | undefined

  if (!anonKey) {
    return (
      <div style={s.page}>
        <h1 style={s.h1}>useCmsComponents demo</h1>
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
  // builds a HeadloClient under the hood, and calls GET /v1/components with
  // the x-headlo-key header. Same hook the dashboard uses; entries[] is the
  // whole registry with each entry's `.Component` pre-compiled by Sucrase at
  // hydration.
  //
  // Advanced: pass an explicit HeadloClient (from createClient() or
  // useHeadloClient()) or a bare list function to override the source —
  // useful for tests, SSR fixtures, or the editor's Clerk-JWT path.
  const { entries, loading, error } = useCmsComponents()

  const calc = entries.find(e => e.component_id === TARGET_COMPONENT_ID)

  return (
    <div style={s.page}>
      <h1 style={s.h1}>useCmsComponents demo</h1>
      <p style={s.sub}>
        The same registry the editor at <code style={s.code}>/dashboard/cms/components/{TARGET_COMPONENT_ID}</code> uses — loaded here via anon key and rendered inline.
      </p>

      <section style={s.card}>
        <div style={s.label}>hook state</div>
        <div style={s.row}><span style={s.k}>endpoint</span>       <code style={s.code}>GET /v1/components</code></div>
        <div style={s.row}><span style={s.k}>auth</span>           <span style={s.v}>anon key (SiteProvider context)</span></div>
        <div style={s.row}><span style={s.k}>status</span>         <span style={{ ...s.v, color: error ? '#b91c1c' : loading ? '#8a8a80' : '#166534' }}>{error ? `Error: ${error}` : loading ? 'Loading…' : `✓ ${entries.length} component${entries.length === 1 ? '' : 's'}`}</span></div>
        <div style={s.row}><span style={s.k}>target</span>         <code style={s.code}>{TARGET_COMPONENT_ID}</code></div>
        <div style={s.row}><span style={s.k}>target resolved</span><span style={s.v}>{calc ? 'yes' : loading ? '…' : 'not found in registry'}</span></div>
      </section>

      {!loading && !error && calc && <CalculatorRender entry={calc} />}

      {!loading && !error && !calc && entries.length > 0 && (
        <section style={s.card}>
          <div style={s.label}>components in this agency</div>
          <p style={s.note}>
            <code style={s.code}>{TARGET_COMPONENT_ID}</code> isn't in the registry for this anon key's agency. Other components available:
          </p>
          <div style={s.recordList}>
            {entries.map(e => (
              <div key={e.component_id} style={s.record}>
                <code style={s.code}>{e.component_id}</code>
                <span style={s.slug}>· {e.label}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function CalculatorRender({ entry }: { entry: ReturnType<typeof useCmsComponents>['entries'][number] }) {
  // The Component is a plain React function. Pass whatever props the
  // component was written to accept. `records` and `options` are the
  // conventional shapes for CMS components — records is an array of
  // objects (one per collection record), options is the template options
  // map. Both come from the loaded entry so this demo renders the same
  // preview the editor does with its saved sample_data + template_options.
  const records = [{
    collection_record_id: `${entry.component_id}_0`,
    ...(entry.sampleData ?? {}),
  }]
  const options = (entry.templateOptions ?? {}) as Record<string, unknown>

  return (
    <section style={s.card}>
      <div style={s.label}>live render</div>
      <div style={s.previewFrame}>
        <entry.Component records={records} options={options} />
      </div>

      <details style={{ marginTop: 14 }}>
        <summary style={s.summary}>row metadata</summary>
        <div style={{ marginTop: 10 }}>
          <div style={s.row}><span style={s.k}>component_id</span> <code style={s.code}>{entry.component_id}</code></div>
          <div style={s.row}><span style={s.k}>label</span>        <span style={s.v}>{entry.label}</span></div>
          <div style={s.row}><span style={s.k}>template_id</span>  <code style={s.code}>{entry.templateId ?? '(none)'}</code></div>
          <div style={s.row}><span style={s.k}>template_ids</span> <code style={s.code}>[{entry.templateIds.join(', ')}]</code></div>
          <div style={s.row}><span style={s.k}>collection_id</span><code style={s.code}>{entry.collectionId ?? '(custom sample data)'}</code></div>
          <div style={s.row}><span style={s.k}>code bytes</span>   <span style={s.v}>{entry.code.length}</span></div>
        </div>
      </details>
    </section>
  )
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
  previewFrame: { background: '#faf9f6', border: '1px solid #e8e5df', borderRadius: 8, padding: 16, minHeight: 120 } as React.CSSProperties,
  summary:      { fontSize: 11, fontWeight: 600, color: '#8a8a80', textTransform: 'uppercase' as const, letterSpacing: '.06em', cursor: 'pointer' } as React.CSSProperties,
  recordList:   { marginTop: 12, display: 'flex', flexDirection: 'column' as const, gap: 6, paddingTop: 12, borderTop: '1px solid #f0ede5' } as React.CSSProperties,
  record:       { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 } as React.CSSProperties,
  slug:         { color: '#5a5a55' } as React.CSSProperties,
}
