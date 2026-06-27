import { useAuth as useHeadloAuth, useUser as useHeadloUser, SignOutButton as HeadloSignOut } from 'headlo-auth'
import { useAuth as useClerkAuth, useUser as useClerkUser, SignOutButton as ClerkSignOut } from '@clerk/clerk-react'
import React from 'react'

// Simulates a migration scenario: both auth systems can authenticate the same
// dashboard, with headlo-auth taking priority. Demonstrates the dual-acceptance
// pattern a customer would use during a Clerk → headlo-auth migration window.
//
// Priority: headlo-auth wins if both sessions are present (reflects migration
// direction — new system has authority).

type ActiveProvider = 'headlo' | 'clerk' | null

export default function MultiAuthDashboard() {
  const headloAuth = useHeadloAuth()
  const headloUser = useHeadloUser()
  const clerkAuth  = useClerkAuth()
  const { user: clerkUser } = useClerkUser()

  // Wait for both to resolve before deciding — otherwise we might flash to
  // "unauthenticated" while one provider is still hydrating its session.
  const bothLoaded = headloAuth.isLoaded && clerkAuth.isLoaded

  let active: ActiveProvider = null
  if (bothLoaded) {
    if (headloAuth.isSignedIn)     active = 'headlo'
    else if (clerkAuth.isSignedIn) active = 'clerk'
  }

  // Redirect to chooser when nothing matches
  React.useEffect(() => {
    if (bothLoaded && active === null) {
      window.location.replace('/multiauth/onboarding')
    }
  }, [bothLoaded, active])

  if (!bothLoaded) {
    return <div style={s.loading}><span style={{ opacity: 0.5 }}>Loading…</span></div>
  }
  if (active === null) {
    return null  // redirect in flight
  }

  // ── Banner color reflects which system authenticated ───────────────────────
  const bannerStyle = active === 'headlo'
    ? { ...s.banner, ...s.bannerHeadlo }
    : { ...s.banner, ...s.bannerClerk }
  const bannerLabel = active === 'headlo'
    ? 'Signed in via Headlo (primary)'
    : 'Signed in via Clerk (legacy — migrate when ready)'

  // Normalize identity across providers
  const identity = active === 'headlo'
    ? {
        email: headloUser?.email ?? '—',
        name:  headloUser?.displayName ?? '—',
        id:    headloUser?.id ?? '—',
      }
    : {
        email: clerkUser?.primaryEmailAddress?.emailAddress ?? clerkUser?.emailAddresses[0]?.emailAddress ?? '—',
        name:  clerkUser?.fullName ?? '—',
        id:    clerkUser?.id ?? '—',
      }

  return (
    <div style={s.page}>
      <div style={bannerStyle}>
        <strong>{bannerLabel}</strong> — this dashboard accepts either Headlo or Clerk tokens. Headlo wins when both are present.
      </div>

      <nav style={s.nav}>
        <a href="/" style={s.logo}>
          <span style={s.logoMark}>m</span>
          <span>headlo-client (multi-auth)</span>
        </a>
        <div style={s.navRight}>
          <span style={s.userBadge}>
            <span style={active === 'headlo' ? s.userDotHeadlo : s.userDotClerk} />
            {identity.name !== '—' ? identity.name : identity.email}
          </span>
          {active === 'headlo'
            ? <HeadloSignOut style={s.signOut as React.CSSProperties}>Sign out (Headlo)</HeadloSignOut>
            : <ClerkSignOut><button style={s.signOut as React.CSSProperties}>Sign out (Clerk)</button></ClerkSignOut>
          }
        </div>
      </nav>

      <main style={s.main}>
        <header style={s.heroHeader}>
          <h1 style={s.h1}>Migration-mode dashboard</h1>
          <p style={s.lede}>
            This route checks <strong>headlo-auth first</strong>, then falls back to <strong>Clerk</strong>. Use it as the
            template for migrating customers off Clerk: accept both during a transition window, then drop Clerk once
            usage has shifted.
          </p>
        </header>

        <section style={s.grid}>
          <div style={s.card}>
            <div style={s.cardLabel}>Active provider</div>
            <div style={s.rows}>
              <Row label="Source"  value={active === 'headlo' ? 'headlo-auth' : 'Clerk'} />
              <Row label="Resolved at" value={new Date().toLocaleTimeString()} />
            </div>
            <p style={s.note}>
              Priority: headlo-auth → Clerk → unauthenticated. Sign out of the active provider
              to see the other one (if present) take over on next refresh.
            </p>
          </div>

          <div style={s.card}>
            <div style={s.cardLabel}>Identity (normalized)</div>
            <div style={s.rows}>
              <Row label="Email"        value={identity.email} />
              <Row label="Display name" value={identity.name} />
              <Row label="User ID"      value={identity.id} mono />
            </div>
          </div>
        </section>

        <section style={s.grid}>
          <div style={s.card}>
            <div style={s.cardLabel}>Both session states</div>
            <div style={s.rows}>
              <Row label="headlo-auth signed in?" value={headloAuth.isSignedIn ? 'yes' : 'no'} />
              <Row label="Clerk signed in?"      value={clerkAuth.isSignedIn ? 'yes' : 'no'} />
            </div>
            <p style={s.note}>
              Both providers can be active concurrently — sign-out is per-provider. Real migrations
              would consolidate identity via a <code>clerk_sub</code> column on the Headlo user
              table (deferred — see <code>headlo-auth-do-later.md</code>).
            </p>
          </div>

          <div style={s.card}>
            <div style={s.cardLabel}>What to test</div>
            <ul style={s.list}>
              <li>Visit <code>/clerk</code> and sign in → return here → "Signed in via Clerk"</li>
              <li>Then <code>/onboarding</code> → "Sign in with Headlo" → return here → "Signed in via Headlo" (priority kicks in)</li>
              <li>Sign out of Headlo → next refresh falls back to Clerk</li>
              <li>Sign out of both → redirect to <code>/multiauth/onboarding</code></li>
            </ul>
          </div>
        </section>

        <section style={s.linkSection}>
          <a href="/dashboard" style={s.linkCard}>
            <div style={s.linkCardTitle}>→ Headlo-only dashboard</div>
            <div style={s.linkCardBody}>The <code>/dashboard</code> route, gated by headlo-auth only.</div>
          </a>
          <a href="/clerk/dashboard" style={s.linkCard}>
            <div style={s.linkCardTitle}>→ Clerk-only dashboard</div>
            <div style={s.linkCardBody}>The <code>/clerk/dashboard</code> route, gated by Clerk only.</div>
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
  loading: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    minHeight:      '100vh',
    fontSize:       14,
    color:          '#8a8a80',
  } as React.CSSProperties,
  banner: {
    padding:    '10px 24px',
    fontSize:   12,
    textAlign:  'center' as const,
    borderBottom: '1px solid transparent',
  } as React.CSSProperties,
  bannerHeadlo: {
    background:   '#f0fdf4',
    color:        '#166534',
    borderBottomColor: '#bbf7d0',
  } as React.CSSProperties,
  bannerClerk: {
    background:   '#f5f3ff',
    color:        '#5b21b6',
    borderBottomColor: '#ddd6fe',
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
    background:     'linear-gradient(135deg, #1a1a18 50%, #6c47ff 50%)',
    color:          '#fff',
    fontSize:       15,
    fontWeight:     800,
  } as React.CSSProperties,
  navRight: { display: 'flex', alignItems: 'center', gap: 14 } as React.CSSProperties,
  userBadge: { display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#5a5a55' } as React.CSSProperties,
  userDotHeadlo: { width: 7, height: 7, borderRadius: '50%', background: '#2a7a3a' } as React.CSSProperties,
  userDotClerk:  { width: 7, height: 7, borderRadius: '50%', background: '#6c47ff' } as React.CSSProperties,
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
  main: { maxWidth: 880, margin: '48px auto', padding: '0 32px' } as React.CSSProperties,
  heroHeader: { marginBottom: 32 } as React.CSSProperties,
  h1: { fontSize: 28, fontWeight: 700, margin: 0, lineHeight: 1.2, letterSpacing: -0.5 } as React.CSSProperties,
  lede: { fontSize: 15, color: '#5a5a55', lineHeight: 1.6, marginTop: 12 } as React.CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 16 } as React.CSSProperties,
  card: { background: '#fff', border: '1px solid #e8e5df', borderRadius: 10, padding: '20px 24px' } as React.CSSProperties,
  cardLabel: { fontSize: 11, fontWeight: 700, color: '#8a8a80', textTransform: 'uppercase' as const, letterSpacing: '.06em', marginBottom: 14 } as React.CSSProperties,
  rows: { display: 'flex', flexDirection: 'column' as const, gap: 8 } as React.CSSProperties,
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 } as React.CSSProperties,
  rowLabel: { fontSize: 12, color: '#8a8a80' } as React.CSSProperties,
  rowValue: { fontSize: 13, color: '#1a1a18', textAlign: 'right' as const, wordBreak: 'break-all' as const } as React.CSSProperties,
  mono: { fontFamily: '"DM Mono", monospace', fontSize: 11, color: '#5a5a55' } as React.CSSProperties,
  note: { marginTop: 12, fontSize: 12, color: '#8a8a80', lineHeight: 1.6 } as React.CSSProperties,
  list: { margin: 0, paddingLeft: 18, fontSize: 12, color: '#5a5a55', lineHeight: 1.8 } as React.CSSProperties,
  linkSection: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginTop: 24 } as React.CSSProperties,
  linkCard: { background: '#fff', border: '1px solid #e8e5df', borderRadius: 10, padding: '16px 18px', textDecoration: 'none', color: '#1a1a18' } as React.CSSProperties,
  linkCardTitle: { fontSize: 14, fontWeight: 600, marginBottom: 4 } as React.CSSProperties,
  linkCardBody:  { fontSize: 12, color: '#5a5a55', lineHeight: 1.5 } as React.CSSProperties,
}
