import { useAuth, useUser } from 'headlo-auth'

export default function Landing() {
  const { isLoaded, isSignedIn } = useAuth()
  const user = useUser()

  return (
    <div style={s.page}>
      {/* Nav */}
      <nav style={s.nav}>
        <a href="/" style={s.logo}>
          <span style={s.logoMark}>h</span>
          <span>headlo-client</span>
        </a>

        <div style={s.navLinks}>
          <a href="https://github.com/headlohq/headlo-client-react" style={s.navLink} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href="/clerk" style={s.navLink}>Clerk variant →</a>
          <a href="/test" style={s.navLink}>Test page</a>

          {!isLoaded ? (
            // Invisible placeholder reserving the space — prevents nav reflow
            // when the real button appears. Width matches "Sign in →" / "Dashboard →".
            <span style={{ ...s.cta, opacity: 0, visibility: 'hidden' }}>Sign in →</span>
          ) : isSignedIn ? (
            <a href="/dashboard" style={s.cta}>Dashboard →</a>
          ) : (
            <a href="/onboarding" style={s.cta}>Sign in →</a>
          )}
        </div>
      </nav>

      {/* Hero */}
      <main style={s.hero}>
        <h1 style={s.h1}>
          A sample app using <span style={s.accent}>headlo-auth</span>.
        </h1>
        <p style={s.lede}>
          Sign in flow, session refresh, and PROP component loading — all wired up in
          ~3 lines of code. Click <strong>Sign in</strong> in the nav to try the full PKCE flow.
        </p>

        {/* Signed-in status panel */}
        {isLoaded && isSignedIn && user && (
          <div style={s.statusCard}>
            <div style={s.statusLabel}>Signed in as</div>
            <div style={s.statusValue}>{user.displayName ?? user.email}</div>
            <div style={s.statusSub}>{user.email}</div>
            <div style={s.statusMeta}>User ID <code style={s.code}>{user.id}</code></div>
          </div>
        )}

        {/* What this app demonstrates */}
        <section style={s.features}>
          <div style={s.featureCard}>
            <div style={s.featureNum}>1</div>
            <div style={s.featureTitle}>Passwordless via PKCE</div>
            <div style={s.featureBody}>
              Click Sign in → redirect to <code>auth.headlo.com</code> → returns with auth code →
              session created. HttpOnly refresh cookie.
            </div>
          </div>
          <div style={s.featureCard}>
            <div style={s.featureNum}>2</div>
            <div style={s.featureTitle}>Auto refresh</div>
            <div style={s.featureBody}>
              Access JWT refreshes silently before expiry. No re-prompts. Works across browser
              tabs via BroadcastChannel.
            </div>
          </div>
          <div style={s.featureCard}>
            <div style={s.featureNum}>3</div>
            <div style={s.featureTitle}>PROP components</div>
            <div style={s.featureBody}>
              Custom elements like <code>&lt;headlo-auth-button&gt;</code> served from R2.
              See the test page for component inspection.
            </div>
          </div>
        </section>

        <div style={s.testLink}>
          <a href="/test" style={s.testLinkAnchor}>
            → Open the test page to inspect tokens, components, and the PROP service
          </a>
        </div>
      </main>

      <footer style={s.footer}>
        <span>
          Built with <a href="https://github.com/headlohq/headlo-auth" style={s.footerLink} target="_blank" rel="noreferrer">headlo-auth</a>
          {' '}+{' '}
          <a href="https://github.com/headlohq/headlo-react" style={s.footerLink} target="_blank" rel="noreferrer">headlo-react</a>
        </span>
      </footer>
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
  navLinks: {
    display:    'flex',
    alignItems: 'center',
    gap:        20,
  } as React.CSSProperties,
  navLink: {
    fontSize:       13,
    color:          '#5a5a55',
    textDecoration: 'none',
  } as React.CSSProperties,
  cta: {
    padding:        '8px 14px',
    background:     '#1a1a18',
    color:          '#faf9f6',
    border:         'none',
    borderRadius:   6,
    fontSize:       13,
    fontWeight:     600,
    cursor:         'pointer',
    textDecoration: 'none',
    display:        'inline-block',
    fontFamily:     'inherit',
  } as React.CSSProperties,
  muted: {
    fontSize: 13,
    color:    '#8a8a80',
  } as React.CSSProperties,
  hero: {
    maxWidth: 880,
    margin:   '64px auto',
    padding:  '0 32px',
  } as React.CSSProperties,
  h1: {
    fontSize:     36,
    fontWeight:   700,
    margin:       0,
    lineHeight:   1.2,
    letterSpacing: -0.5,
  } as React.CSSProperties,
  accent: {
    color: '#2a6a3a',
  } as React.CSSProperties,
  lede: {
    fontSize:   16,
    color:      '#5a5a55',
    lineHeight: 1.6,
    marginTop:  16,
  } as React.CSSProperties,
  statusCard: {
    background:    '#fff',
    border:        '1px solid #e8e5df',
    borderRadius:  10,
    padding:       '20px 24px',
    marginTop:     32,
    boxShadow:     '0 1px 3px rgba(0,0,0,0.04)',
  } as React.CSSProperties,
  statusLabel: {
    fontSize:       11,
    color:          '#8a8a80',
    textTransform:  'uppercase' as const,
    letterSpacing:  '.05em',
    marginBottom:   4,
  } as React.CSSProperties,
  statusValue: {
    fontSize:    18,
    fontWeight:  600,
    color:       '#1a1a18',
  } as React.CSSProperties,
  statusSub: {
    fontSize: 14,
    color:    '#5a5a55',
    marginTop: 2,
  } as React.CSSProperties,
  statusMeta: {
    fontSize:  12,
    color:     '#8a8a80',
    marginTop: 12,
  } as React.CSSProperties,
  code: {
    fontFamily: '"DM Mono", monospace',
    color:      '#1a1a18',
    background: '#f5f2eb',
    padding:    '2px 6px',
    borderRadius: 4,
    fontSize:   11,
  } as React.CSSProperties,
  features: {
    display:             'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap:                 16,
    marginTop:           48,
  } as React.CSSProperties,
  featureCard: {
    background:    '#fff',
    border:        '1px solid #e8e5df',
    borderRadius:  10,
    padding:       '20px 22px',
  } as React.CSSProperties,
  featureNum: {
    display:        'inline-flex',
    alignItems:     'center',
    justifyContent: 'center',
    width:          24,
    height:         24,
    borderRadius:   12,
    background:     '#f5f2eb',
    color:          '#5a5a55',
    fontSize:       12,
    fontWeight:     700,
    marginBottom:   12,
  } as React.CSSProperties,
  featureTitle: {
    fontSize:    14,
    fontWeight:  600,
    color:       '#1a1a18',
    marginBottom: 6,
  } as React.CSSProperties,
  featureBody: {
    fontSize:   13,
    color:      '#5a5a55',
    lineHeight: 1.5,
  } as React.CSSProperties,
  testLink: {
    marginTop:  40,
    textAlign:  'center' as const,
  } as React.CSSProperties,
  testLinkAnchor: {
    fontSize:       13,
    color:          '#2a6a3a',
    textDecoration: 'none',
    borderBottom:   '1px dotted #2a6a3a',
  } as React.CSSProperties,
  footer: {
    borderTop:   '1px solid #e8e5df',
    padding:     '20px 32px',
    fontSize:    12,
    color:       '#8a8a80',
    textAlign:   'center' as const,
    marginTop:   80,
  } as React.CSSProperties,
  footerLink: {
    color:          '#5a5a55',
    textDecoration: 'underline',
  } as React.CSSProperties,
}
