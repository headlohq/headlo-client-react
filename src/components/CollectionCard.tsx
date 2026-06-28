import React from 'react'
import { useCollection, UserIdentity } from 'headlo-react'

// Tests the zero-arg useCollection pattern: anonKey + apiUrl come from
// <SiteProvider> in App.tsx, getToken comes from <MultiAuthBridge>. The hook
// call here has no auth args at all.
//
// Requires VITE_HEADLO_ANON_KEY in .env to point at the site that owns the
// `mac_wallpaper` collection. If unset, the call returns 401 and we render an
// instructional message instead of records.
export default function CollectionCard() {
  const anonKey = import.meta.env.VITE_HEADLO_ANON_KEY as string | undefined

  if (!anonKey) {
    return (
      <section style={s.card}>
        <div style={s.label}>useCollection('mac_wallpaper')</div>
        <p style={s.note}>
          Set <code style={s.code}>VITE_HEADLO_ANON_KEY</code> in <code style={s.code}>headlo-client-react/.env</code> to
          the anon key of the site that owns the <code style={s.code}>mac_wallpaper</code> collection, then restart{' '}
          <code style={s.code}>npm run dev</code>.
        </p>
      </section>
    )
  }

  return <CollectionLoader />
}

function CollectionLoader() {
  const { records, count, loading, error } = useCollection('mac_wallpaper')

  return (
    <section style={s.card}>
      <div style={s.label}>useCollection('mac_wallpaper')</div>

      <div style={s.row}>
        <span style={s.k}>Hook</span>
        <code style={s.code}>useCollection('mac_wallpaper')</code>
      </div>
      <div style={s.row}>
        <span style={s.k}>anonKey source</span>
        <span style={s.v}>SiteProvider context</span>
      </div>
      <div style={s.row}>
        <span style={s.k}>getToken source</span>
        <span style={s.v}>MultiAuthBridge (headlo &gt; clerk &gt; anon)</span>
      </div>
      <div style={s.row}>
        <span style={s.k}>End-user identity</span>
        <UserIdentity />
      </div>
      <div style={s.row}>
        <span style={s.k}>Status</span>
        <span style={{ ...s.v, color: error ? '#b91c1c' : loading ? '#8a8a80' : '#166534' }}>
          {error ? `Error: ${error}` : loading ? 'Loading…' : `✓ ${count ?? records.length} record${records.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {!loading && !error && records.length > 0 && (
        <div style={s.recordList}>
          {records.slice(0, 5).map(r => (
            <div key={r.collection_record_id} style={s.record}>
              <code style={s.code}>{r.collection_record_id}</code>
              {r.slug && <span style={s.slug}>· {r.slug}</span>}
              <span style={s.status}>{r.status}</span>
            </div>
          ))}
          {records.length > 5 && <div style={s.note}>… and {records.length - 5} more</div>}
        </div>
      )}
    </section>
  )
}

const s = {
  card:       { background: '#fff', border: '1px solid #e8e5df', borderRadius: 10, padding: '20px 24px', marginBottom: 16 } as React.CSSProperties,
  label:      { fontSize: 11, fontWeight: 700, color: '#8a8a80', textTransform: 'uppercase' as const, letterSpacing: '.06em', marginBottom: 14 } as React.CSSProperties,
  row:        { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 6 } as React.CSSProperties,
  k:          { fontSize: 12, color: '#8a8a80' } as React.CSSProperties,
  v:          { fontSize: 13, color: '#1a1a18', textAlign: 'right' as const, wordBreak: 'break-all' as const } as React.CSSProperties,
  note:       { fontSize: 12, color: '#8a8a80', lineHeight: 1.6, marginTop: 6 } as React.CSSProperties,
  code:       { fontFamily: '"DM Mono", monospace', fontSize: 11, color: '#1a1a18', background: '#f5f2eb', padding: '1px 6px', borderRadius: 4 } as React.CSSProperties,
  recordList: { marginTop: 12, display: 'flex', flexDirection: 'column' as const, gap: 6, paddingTop: 12, borderTop: '1px solid #f0ede5' } as React.CSSProperties,
  record:     { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 } as React.CSSProperties,
  slug:       { color: '#5a5a55' } as React.CSSProperties,
  status:     { marginLeft: 'auto', fontSize: 11, color: '#8a8a80', textTransform: 'uppercase' as const } as React.CSSProperties,
}
