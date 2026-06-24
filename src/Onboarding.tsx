import { useAuth, SignInButton } from 'headlo-auth'
import React from 'react'

export default function Onboarding() {
  const { isLoaded, isSignedIn } = useAuth()

  // If already signed in (e.g. user navigated here directly), send them to dashboard
  React.useEffect(() => {
    if (isLoaded && isSignedIn) {
      window.location.replace('/dashboard')
    }
  }, [isLoaded, isSignedIn])

  return (
    <div style={s.page}>
      <nav style={s.nav}>
        <a href="/" style={s.logo}>
          <span style={s.logoMark}>h</span>
          <span>headlo-client</span>
        </a>
      </nav>

      <main style={s.main}>
        <div style={s.card}>
          <div style={s.eyebrow}>Welcome</div>
          <h1 style={s.h1}>Sign in to continue</h1>
          <p style={s.lede}>
            The dashboard is for signed-in users only. Sign in with Headlo to
            access it — passwordless, takes about 5 seconds.
          </p>

          <div style={s.ctaRow}>
            <SignInButton style={s.cta as React.CSSProperties}>
              Sign in with Headlo →
            </SignInButton>
          </div>

          <div style={s.divider}>
            <span style={s.dividerText}>What you'll get</span>
          </div>

          <ul style={s.list}>
            <li>A signed-in session that lasts 30 days</li>
            <li>Auto-refreshing JWTs — no random re-prompts</li>
            <li>Sign-out across all your tabs at once</li>
            <li>HttpOnly cookie storage — XSS-resistant</li>
          </ul>

          <div style={s.footer}>
            <a href="/" style={s.footerLink}>← Back to landing</a>
            <span style={s.footerSep}>·</span>
            <a href="/clerk" style={s.footerLink}>See the Clerk variant</a>
          </div>
        </div>
      </main>
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
    display:      'flex',
    alignItems:   'center',
    padding:      '14px 32px',
    borderBottom: '1px solid #e8e5df',
    background:   '#fff',
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
  main: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    padding:        '80px 24px',
  } as React.CSSProperties,
  card: {
    background:    '#fff',
    border:        '1px solid #e8e5df',
    borderRadius:  12,
    padding:       '40px 36px',
    maxWidth:      460,
    width:         '100%',
    boxShadow:     '0 1px 4px rgba(0,0,0,.04)',
  } as React.CSSProperties,
  eyebrow: {
    fontSize:       11,
    fontWeight:     700,
    color:          '#2a6a3a',
    textTransform:  'uppercase' as const,
    letterSpacing:  '.08em',
    marginBottom:   8,
  } as React.CSSProperties,
  h1: {
    fontSize:    26,
    fontWeight:  700,
    margin:      0,
    lineHeight:  1.2,
    letterSpacing: -0.3,
  } as React.CSSProperties,
  lede: {
    fontSize:   15,
    color:      '#5a5a55',
    lineHeight: 1.6,
    marginTop:  12,
  } as React.CSSProperties,
  ctaRow: {
    marginTop: 24,
  } as React.CSSProperties,
  cta: {
    width:          '100%',
    padding:        '12px 16px',
    background:     '#1a1a18',
    color:          '#faf9f6',
    border:         'none',
    borderRadius:   8,
    fontSize:       14,
    fontWeight:     600,
    cursor:         'pointer',
    fontFamily:     'inherit',
  } as React.CSSProperties,
  divider: {
    display:    'flex',
    alignItems: 'center',
    gap:        12,
    margin:     '28px 0 16px',
  } as React.CSSProperties,
  dividerText: {
    fontSize:       11,
    fontWeight:     600,
    color:          '#8a8a80',
    textTransform:  'uppercase' as const,
    letterSpacing:  '.06em',
  } as React.CSSProperties,
  list: {
    margin:      0,
    paddingLeft: 18,
    fontSize:    13,
    color:       '#5a5a55',
    lineHeight:  1.8,
  } as React.CSSProperties,
  footer: {
    marginTop:   28,
    paddingTop:  20,
    borderTop:   '1px solid #f0ede5',
    fontSize:    12,
    color:       '#8a8a80',
    textAlign:   'center' as const,
  } as React.CSSProperties,
  footerLink: {
    color:          '#5a5a55',
    textDecoration: 'none',
  } as React.CSSProperties,
  footerSep: {
    margin:    '0 8px',
    color:     '#d0d0c8',
  } as React.CSSProperties,
}
