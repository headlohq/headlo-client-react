import { useAuth, useUser, SignOutButton } from 'headlo-auth'
import React from 'react'

export default function Dashboard() {
  const { getToken } = useAuth()
  const user = useUser()
  const [tokenSnippet, setTokenSnippet] = React.useState<string | null>(null)
  const [exp, setExp] = React.useState<string | null>(null)

  async function refreshTokenView() {
    const t = await getToken()
    if (!t) return
    setTokenSnippet(t.slice(0, 40) + '…')
    try {
      const [, payload] = t.split('.')
      const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
      setExp(new Date(claims.exp * 1000).toLocaleTimeString())
    } catch {}
  }

  return (
    <div style={s.page}>
      <nav style={s.nav}>
        <a href="/" style={s.logo}>
          <span style={s.logoMark}>h</span>
          <span>headlo-client</span>
        </a>
        <div style={s.navRight}>
          <span style={s.userBadge}>
            <span style={s.userDot} />
            {user?.displayName ?? user?.email}
          </span>
          <SignOutButton style={s.signOut as React.CSSProperties}>Sign out</SignOutButton>
        </div>
      </nav>

      <main style={s.main}>
        <header style={s.heroHeader}>
          <h1 style={s.h1}>Welcome back{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}.</h1>
          <p style={s.lede}>
            You're signed in. This route (<code>/dashboard</code>) is protected — if you sign out,
            you'll be redirected to <a href="/onboarding" style={s.inlineLink}>/onboarding</a>.
          </p>
        </header>

        <section style={s.grid}>
          <div style={s.card}>
            <div style={s.cardLabel}>Your identity</div>
            <div style={s.rows}>
              <Row label="Email"        value={user?.email ?? '—'} />
              <Row label="Display name" value={user?.displayName ?? '—'} />
              <Row label="User ID"      value={user?.id ?? '—'} mono />
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardLabel}>Access token (live)</div>
            <div style={s.rows}>
              <Row label="JWT (first 40 chars)" value={tokenSnippet ?? 'Click below to fetch'} mono />
              <Row label="Expires at"           value={exp ?? '—'} />
            </div>
            <button style={s.btn} onClick={refreshTokenView}>
              Fetch fresh token via getToken()
            </button>
            <p style={s.note}>
              Each call refreshes the token automatically if it's near expiry. This is the
              defensive <code>getToken()</code> pattern in action.
            </p>
          </div>
        </section>

        <section style={s.linkSection}>
          <a href="/test" style={s.linkCard}>
            <div style={s.linkCardTitle}>→ Test page</div>
            <div style={s.linkCardBody}>
              Inspect PROP components, fetch service manifests, debug the auth flow.
            </div>
          </a>
          <a href="/clerk/dashboard" style={s.linkCard}>
            <div style={s.linkCardTitle}>→ Clerk variant dashboard</div>
            <div style={s.linkCardBody}>
              Same shell, but the auth provider is Clerk. Side-by-side comparison.
            </div>
          </a>
        </section>
      </main>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={s.row}>
      <span style={s.rowLabel}>{label}</span>
      <span style={mono ? { ...s.rowValue, ...s.mono } : s.rowValue}>{value}</span>
    </div>
  )
}

const s = {
  page: {
    background:  '#faf9f6',
    minHeight:   '100vh',
    fontFamily:  '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color:       '#1a1a18',
  } as React.CSSProperties,
  nav: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    padding:        '14px 32px',
    borderBottom:   '1px solid #e8e5df',
    background:     '#fff',
  } as React.CSSProperties,
  logo: {
    display:        'flex',
    alignItems:     'center',
    gap:            10,
    fontSize:       16,
    fontWeight:     700,
    color:          '#1a1a18',
    textDecoration: 'none',
  } as React.CSSProperties,
  logoMark: {
    display:        'inline-flex',
    alignItems:     'center',
    justifyContent: 'center',
    width:          28,
    height:         28,
    borderRadius:   6,
    background:     '#1a1a18',
    color:          '#faf9f6',
    fontSize:       15,
    fontWeight:     800,
  } as React.CSSProperties,
  navRight: {
    display:    'flex',
    alignItems: 'center',
    gap:        14,
  } as React.CSSProperties,
  userBadge: {
    display:    'inline-flex',
    alignItems: 'center',
    gap:        8,
    fontSize:   13,
    color:      '#5a5a55',
  } as React.CSSProperties,
  userDot: {
    width:        7,
    height:       7,
    borderRadius: '50%',
    background:   '#2a7a3a',
  } as React.CSSProperties,
  signOut: {
    padding:      '6px 12px',
    background:   '#fef2f2',
    color:        '#991b1b',
    border:       '1px solid #fecaca',
    borderRadius: 6,
    fontSize:     12,
    fontWeight:   600,
    cursor:       'pointer',
    fontFamily:   'inherit',
  } as React.CSSProperties,
  main: {
    maxWidth: 880,
    margin:   '48px auto',
    padding:  '0 32px',
  } as React.CSSProperties,
  heroHeader: {
    marginBottom: 40,
  } as React.CSSProperties,
  h1: {
    fontSize:     30,
    fontWeight:   700,
    margin:       0,
    lineHeight:   1.2,
    letterSpacing: -0.5,
  } as React.CSSProperties,
  lede: {
    fontSize:   15,
    color:      '#5a5a55',
    lineHeight: 1.6,
    marginTop:  12,
  } as React.CSSProperties,
  inlineLink: {
    color:          '#2a6a3a',
    textDecoration: 'underline',
  } as React.CSSProperties,
  grid: {
    display:             'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap:                 16,
    marginBottom:        24,
  } as React.CSSProperties,
  card: {
    background:    '#fff',
    border:        '1px solid #e8e5df',
    borderRadius:  10,
    padding:       '20px 24px',
  } as React.CSSProperties,
  cardLabel: {
    fontSize:       11,
    fontWeight:     700,
    color:          '#8a8a80',
    textTransform:  'uppercase' as const,
    letterSpacing:  '.06em',
    marginBottom:   14,
  } as React.CSSProperties,
  rows: {
    display:       'flex',
    flexDirection: 'column' as const,
    gap:           8,
  } as React.CSSProperties,
  row: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'baseline',
    gap:            12,
  } as React.CSSProperties,
  rowLabel: {
    fontSize: 12,
    color:    '#8a8a80',
  } as React.CSSProperties,
  rowValue: {
    fontSize:   13,
    color:      '#1a1a18',
    textAlign:  'right' as const,
    wordBreak:  'break-all' as const,
  } as React.CSSProperties,
  mono: {
    fontFamily: '"DM Mono", monospace',
    fontSize:   11,
    color:      '#5a5a55',
  } as React.CSSProperties,
  btn: {
    marginTop:    14,
    padding:      '8px 12px',
    background:   '#f5f2eb',
    color:        '#1a1a18',
    border:       '1px solid #e8e5df',
    borderRadius: 6,
    fontSize:     12,
    fontWeight:   500,
    cursor:       'pointer',
    fontFamily:   'inherit',
  } as React.CSSProperties,
  note: {
    marginTop:  10,
    fontSize:   12,
    color:      '#8a8a80',
    lineHeight: 1.6,
  } as React.CSSProperties,
  linkSection: {
    display:             'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap:                 12,
    marginTop:           24,
  } as React.CSSProperties,
  linkCard: {
    background:     '#fff',
    border:         '1px solid #e8e5df',
    borderRadius:   10,
    padding:        '16px 18px',
    textDecoration: 'none',
    color:          '#1a1a18',
    transition:     'background .15s',
  } as React.CSSProperties,
  linkCardTitle: {
    fontSize:     14,
    fontWeight:   600,
    marginBottom: 4,
  } as React.CSSProperties,
  linkCardBody: {
    fontSize:   12,
    color:      '#5a5a55',
    lineHeight: 1.5,
  } as React.CSSProperties,
}
