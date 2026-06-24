import { SignedIn, SignedOut, SignInButton, useUser } from '@clerk/clerk-react'

export default function ClerkLanding() {
  return (
    <div style={s.page}>
      <ProviderBanner />

      {/* Nav */}
      <nav style={s.nav}>
        <a href="/clerk" style={s.logo}>
          <span style={s.logoMark}>c</span>
          <span>headlo-client (Clerk)</span>
        </a>

        <div style={s.navLinks}>
          <a href="/" style={s.navLink}>← headlo-auth variant</a>
          <a href="/clerk/dashboard" style={s.navLink}>Dashboard</a>
          <SignedOut>
            <SignInButton mode="modal">
              <button style={s.cta}>Sign in →</button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <a href="/clerk/dashboard" style={s.cta}>Dashboard →</a>
          </SignedIn>
        </div>
      </nav>

      {/* Hero */}
      <main style={s.hero}>
        <h1 style={s.h1}>
          The same sample app, using <span style={s.accent}>Clerk</span>.
        </h1>
        <p style={s.lede}>
          Same UX, different provider underneath. Click <strong>Sign in</strong> to see the
          Clerk-hosted flow. Compare against the <a href="/" style={s.inlineLink}>headlo-auth variant</a> to
          evaluate UX, performance, and feature parity ahead of migration.
        </p>

        <SignedIn>
          <ClerkUserStatus />
        </SignedIn>

        {/* What this app demonstrates */}
        <section style={s.features}>
          <div style={s.featureCard}>
            <div style={s.featureNum}>1</div>
            <div style={s.featureTitle}>Hosted by Clerk</div>
            <div style={s.featureBody}>
              Sign-in form rendered as a modal by Clerk's JS. Form lives on
              <code>clerk.accounts.dev</code>, not your domain.
            </div>
          </div>
          <div style={s.featureCard}>
            <div style={s.featureNum}>2</div>
            <div style={s.featureTitle}>60-second JWTs</div>
            <div style={s.featureBody}>
              Clerk's default access token TTL is 60 seconds. Every API call refreshes the JWT —
              no in-memory caching.
            </div>
          </div>
          <div style={s.featureCard}>
            <div style={s.featureNum}>3</div>
            <div style={s.featureTitle}>Session in HttpOnly cookie</div>
            <div style={s.featureBody}>
              Same model as headlo-auth Phase 3. Session lives in a cookie at
              <code>clerk.headlo.com</code>; JWTs in memory only.
            </div>
          </div>
        </section>

        <div style={s.testLink}>
          <a href="/clerk/dashboard" style={s.testLinkAnchor}>
            → Open the Clerk dashboard page
          </a>
        </div>

        <div style={s.compareGrid}>
          <CompareCol title="Clerk">
            <li>Hosted sign-in form (modal or hosted page)</li>
            <li>Built-in MFA, social login, magic link</li>
            <li>$25/mo + $0.02/MAU after 10k included</li>
            <li>Their domain in the consent screen (until production)</li>
            <li>Battle-tested at scale</li>
          </CompareCol>
          <CompareCol title="headlo-auth">
            <li>Self-rendered sign-in form on api.headlo.com</li>
            <li>Magic link / passkey / social SSO (in progress)</li>
            <li>CF Workers cost only — ~$5-25/mo at 100k MAU</li>
            <li>Your domain in the consent screen by default</li>
            <li>Built in-house — same architecture, your control</li>
          </CompareCol>
        </div>
      </main>

      <footer style={s.footer}>
        <span>
          Same shell as <a href="/" style={s.footerLink}>the headlo-auth version</a> — different provider underneath.
          Use this side-by-side to evaluate migration.
        </span>
      </footer>
    </div>
  )
}

function ProviderBanner() {
  return (
    <div style={s.banner}>
      <strong>Clerk variant</strong> — auth handled by <code>@clerk/clerk-react</code>.
      Toggle via the nav to compare against <a href="/" style={s.bannerLink}>headlo-auth</a>.
    </div>
  )
}

function ClerkUserStatus() {
  const { user } = useUser()
  if (!user) return null
  const primaryEmail = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress
  return (
    <div style={s.statusCard}>
      <div style={s.statusLabel}>Signed in as (Clerk)</div>
      <div style={s.statusValue}>{user.fullName ?? primaryEmail}</div>
      <div style={s.statusSub}>{primaryEmail}</div>
      <div style={s.statusMeta}>User ID <code style={s.code}>{user.id}</code></div>
    </div>
  )
}

function CompareCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={s.compareCol}>
      <div style={s.compareTitle}>{title}</div>
      <ul style={s.compareList}>{children}</ul>
    </div>
  )
}

const s = {
  banner: {
    background:    '#fff7e6',
    borderBottom:  '1px solid #f5d589',
    padding:       '10px 24px',
    fontSize:      12,
    color:         '#7a5a18',
    textAlign:     'center' as const,
  } as React.CSSProperties,
  bannerLink: { color: '#7a5a18', textDecoration: 'underline' } as React.CSSProperties,
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
    background:     '#6c47ff',  // Clerk purple
    color:          '#fff',
    fontSize:       15,
    fontWeight:     800,
  } as React.CSSProperties,
  navLinks: { display: 'flex', alignItems: 'center', gap: 20 } as React.CSSProperties,
  navLink:  { fontSize: 13, color: '#5a5a55', textDecoration: 'none' } as React.CSSProperties,
  cta: {
    padding: '8px 14px', background: '#6c47ff', color: '#fff', border: 'none',
    borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
    textDecoration: 'none', display: 'inline-block', fontFamily: 'inherit',
  } as React.CSSProperties,
  hero:  { maxWidth: 880, margin: '64px auto', padding: '0 32px' } as React.CSSProperties,
  h1:    { fontSize: 36, fontWeight: 700, margin: 0, lineHeight: 1.2, letterSpacing: -0.5 } as React.CSSProperties,
  accent: { color: '#6c47ff' } as React.CSSProperties,
  lede:  { fontSize: 16, color: '#5a5a55', lineHeight: 1.6, marginTop: 16 } as React.CSSProperties,
  inlineLink: { color: '#2a6a3a', textDecoration: 'underline' } as React.CSSProperties,
  statusCard: {
    background: '#fff', border: '1px solid #e8e5df', borderRadius: 10,
    padding: '20px 24px', marginTop: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  } as React.CSSProperties,
  statusLabel: { fontSize: 11, color: '#8a8a80', textTransform: 'uppercase' as const, letterSpacing: '.05em', marginBottom: 4 } as React.CSSProperties,
  statusValue: { fontSize: 18, fontWeight: 600, color: '#1a1a18' } as React.CSSProperties,
  statusSub:   { fontSize: 14, color: '#5a5a55', marginTop: 2 } as React.CSSProperties,
  statusMeta:  { fontSize: 12, color: '#8a8a80', marginTop: 12 } as React.CSSProperties,
  code: { fontFamily: '"DM Mono", monospace', color: '#1a1a18', background: '#f5f2eb', padding: '2px 6px', borderRadius: 4, fontSize: 11 } as React.CSSProperties,
  features: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 48 } as React.CSSProperties,
  featureCard: { background: '#fff', border: '1px solid #e8e5df', borderRadius: 10, padding: '20px 22px' } as React.CSSProperties,
  featureNum: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 24, height: 24, borderRadius: 12, background: '#f5f2eb', color: '#5a5a55',
    fontSize: 12, fontWeight: 700, marginBottom: 12,
  } as React.CSSProperties,
  featureTitle: { fontSize: 14, fontWeight: 600, color: '#1a1a18', marginBottom: 6 } as React.CSSProperties,
  featureBody:  { fontSize: 13, color: '#5a5a55', lineHeight: 1.5 } as React.CSSProperties,
  testLink: { marginTop: 40, textAlign: 'center' as const } as React.CSSProperties,
  testLinkAnchor: { fontSize: 13, color: '#6c47ff', textDecoration: 'none', borderBottom: '1px dotted #6c47ff' } as React.CSSProperties,
  compareGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 56 } as React.CSSProperties,
  compareCol:  { background: '#fff', border: '1px solid #e8e5df', borderRadius: 10, padding: '22px 26px' } as React.CSSProperties,
  compareTitle:{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: '#1a1a18' } as React.CSSProperties,
  compareList: { margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: '#5a5a55' } as React.CSSProperties,
  footer: {
    borderTop: '1px solid #e8e5df', padding: '20px 32px', fontSize: 12,
    color: '#8a8a80', textAlign: 'center' as const, marginTop: 80,
  } as React.CSSProperties,
  footerLink: { color: '#5a5a55', textDecoration: 'underline' } as React.CSSProperties,
}
