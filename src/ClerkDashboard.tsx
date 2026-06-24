import { useUser, useAuth, useClerk, UserButton } from '@clerk/clerk-react'
import { useState } from 'react'

export default function ClerkDashboard() {
  const { isLoaded, isSignedIn } = useUser()
  const { user } = useUser()
  const { getToken, signOut } = useAuth()
  const clerk = useClerk()
  const [token, setToken] = useState<string | null>(null)

  if (!isLoaded) {
    return <div style={s.container}><div style={s.muted}>Loading Clerk…</div></div>
  }

  if (!isSignedIn || !user) {
    return (
      <div style={s.container}>
        <header style={s.header}>
          <a href="/clerk" style={s.backLink}>← Back to Clerk landing</a>
          <span style={s.headerTitle}>Clerk dashboard</span>
        </header>
        <main style={s.main}>
          <div style={s.card}>
            <div style={s.cardTitle}>Authentication (Clerk)</div>
            <div style={s.row}>
              <span style={s.label}>Status</span>
              <span style={s.statusMuted}>Not signed in</span>
            </div>
            <button style={s.btn} onClick={() => clerk.openSignIn()}>Sign in via Clerk →</button>
          </div>
        </main>
      </div>
    )
  }

  const primaryEmail = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress

  return (
    <div style={s.container}>
      <header style={s.header}>
        <a href="/clerk" style={s.backLink}>← Back to Clerk landing</a>
        <span style={s.headerTitle}>Clerk dashboard</span>
        <div style={{ marginLeft: 'auto' }}>
          <UserButton afterSignOutUrl="/clerk" />
        </div>
      </header>

      <main style={s.main}>
        <div style={s.card}>
          <div style={s.cardTitle}>Authentication (Clerk)</div>

          <div style={s.row}>
            <span style={s.label}>Status</span>
            <span style={{ fontWeight: 600, color: '#2a7a3a' }}>✓ Signed in</span>
          </div>
          <div style={s.row}>
            <span style={s.label}>Email</span>
            <span>{primaryEmail}</span>
          </div>
          <div style={s.row}>
            <span style={s.label}>User ID</span>
            <code style={s.code}>{user.id}</code>
          </div>
          {user.fullName && (
            <div style={s.row}>
              <span style={s.label}>Name</span>
              <span>{user.fullName}</span>
            </div>
          )}
          <div style={s.row}>
            <span style={s.label}>Created</span>
            <span style={s.muted}>{user.createdAt?.toLocaleString()}</span>
          </div>

          {token && (
            <div style={{ marginTop: 12 }}>
              <div style={s.label}>JWT (60-sec TTL)</div>
              <code style={{ ...s.code, wordBreak: 'break-all', fontSize: 11, display: 'block', marginTop: 4 }}>
                {token}
              </code>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button style={s.btnSecondary} onClick={async () => setToken(await getToken())}>
              Get JWT
            </button>
            <button style={s.btnDanger} onClick={() => signOut()}>
              Sign out
            </button>
          </div>
        </div>

        <div style={s.card}>
          <div style={s.cardTitle}>What this page demonstrates</div>
          <ul style={s.list}>
            <li>Clerk's <code>useUser</code> / <code>useAuth</code> hooks for signed-in state</li>
            <li>Clerk-rendered <code>&lt;UserButton&gt;</code> with avatar + dropdown</li>
            <li>60-second JWT (<code>getToken()</code> returns a fresh one each call)</li>
            <li>Session lives in HttpOnly cookie at Clerk's domain</li>
          </ul>
          <p style={s.note}>
            Compare against <a href="/dashboard" style={s.link}>the headlo-auth dashboard</a> — same
            features, different provider. The migration plan is: build feature parity in headlo-auth
            (MFA, social SSO, magic link, passwordless), then cut over user-by-user.
          </p>
        </div>
      </main>
    </div>
  )
}

const s = {
  container: { background: '#faf9f6', minHeight: '100vh', fontFamily: '-apple-system, sans-serif' } as React.CSSProperties,
  header: {
    borderBottom: '1px solid #e8e5df', padding: '0 24px', height: 52,
    display: 'flex', alignItems: 'center', gap: 16, background: '#fff',
  } as React.CSSProperties,
  backLink: { textDecoration: 'none', color: '#1a1a18', fontSize: 13 } as React.CSSProperties,
  headerTitle: { fontSize: 14, fontWeight: 600 } as React.CSSProperties,
  main: { maxWidth: 640, margin: '40px auto', padding: '0 24px' } as React.CSSProperties,
  card: {
    background: '#fff', border: '1px solid #e8e5df', borderRadius: 10,
    padding: '20px 24px', marginBottom: 16,
  } as React.CSSProperties,
  cardTitle: { fontSize: 13, fontWeight: 700, marginBottom: 14, color: '#1a1a18' } as React.CSSProperties,
  row: { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8, fontSize: 14 } as React.CSSProperties,
  label: { fontSize: 11, color: '#8a8a80', textTransform: 'uppercase' as const, letterSpacing: '.05em', minWidth: 64 } as React.CSSProperties,
  code: { fontSize: 12, fontFamily: 'monospace', color: '#1a1a18' } as React.CSSProperties,
  muted: { color: '#8a8a80', fontSize: 14 } as React.CSSProperties,
  statusMuted: { color: '#8a8a80', fontWeight: 600 } as React.CSSProperties,
  btn: {
    padding: '8px 14px', background: '#6c47ff', color: '#fff',
    border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', marginTop: 12,
  } as React.CSSProperties,
  btnSecondary: {
    padding: '8px 14px', background: '#f5f2eb', color: '#1a1a18',
    border: '1px solid #e8e5df', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
  } as React.CSSProperties,
  btnDanger: {
    padding: '8px 14px', background: '#fef2f2', color: '#991b1b',
    border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
  } as React.CSSProperties,
  list:  { margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.7, color: '#5a5a55' } as React.CSSProperties,
  note:  { marginTop: 14, fontSize: 13, color: '#5a5a55', lineHeight: 1.6 } as React.CSSProperties,
  link:  { color: '#2a6a3a', textDecoration: 'underline' } as React.CSSProperties,
}
