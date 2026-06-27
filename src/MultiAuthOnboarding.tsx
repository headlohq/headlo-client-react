import { useAuth as useHeadloAuth, SignInButton as HeadloSignIn } from 'headlo-auth'
import { useAuth as useClerkAuth, SignInButton as ClerkSignIn } from '@clerk/clerk-react'
import React from 'react'

// Sign-in chooser for the dual-acceptance dashboard. Labels both buttons to
// communicate the migration story — new system primary, legacy still accepted.

export default function MultiAuthOnboarding() {
  const headloAuth = useHeadloAuth()
  const clerkAuth  = useClerkAuth()

  // If either system has an active session, jump straight to the dashboard —
  // it'll pick the winner via priority order.
  React.useEffect(() => {
    if ((headloAuth.isLoaded && headloAuth.isSignedIn) ||
        (clerkAuth.isLoaded  && clerkAuth.isSignedIn)) {
      window.location.replace('/multiauth/dashboard')
    }
  }, [headloAuth.isLoaded, headloAuth.isSignedIn, clerkAuth.isLoaded, clerkAuth.isSignedIn])

  return (
    <div style={s.page}>
      <nav style={s.nav}>
        <a href="/" style={s.logo}>
          <span style={s.logoMark}>m</span>
          <span>headlo-client (multi-auth)</span>
        </a>
      </nav>

      <main style={s.main}>
        <div style={s.card}>
          <div style={s.eyebrow}>Migration mode</div>
          <h1 style={s.h1}>Sign in with either provider</h1>
          <p style={s.lede}>
            This demo accepts both Headlo and Clerk sessions during a transition window.
            Pick whichever you'd use today. After signing in, the dashboard reports which
            provider authenticated you.
          </p>

          <div style={s.ctaRow}>
            <HeadloSignIn style={s.ctaPrimary as React.CSSProperties}>
              Sign in with Headlo (new) →
            </HeadloSignIn>
            <div style={s.ctaHint}>Recommended — the new identity system at <code>auth.headlo.com</code>.</div>
          </div>

          <div style={s.orRow}><span style={s.orText}>or</span></div>

          <div style={s.ctaRow}>
            <ClerkSignIn mode="modal" forceRedirectUrl="/multiauth/dashboard">
              <button style={s.ctaSecondary as React.CSSProperties}>
                Sign in with Clerk (legacy) →
              </button>
            </ClerkSignIn>
            <div style={s.ctaHint}>Still accepted while migrating users off Clerk.</div>
          </div>

          <div style={s.divider}><span style={s.dividerText}>How this works</span></div>

          <ul style={s.list}>
            <li><strong>Priority:</strong> headlo-auth wins if both sessions are present</li>
            <li><strong>Dual acceptance:</strong> the dashboard reads both, picks the winner per request</li>
            <li><strong>Sign-out:</strong> per-provider — signing out of one doesn't sign out of the other</li>
            <li><strong>No identity merge yet:</strong> the same email signed into both creates two records (Headlo user + Clerk user). Real migration would unify via <code>clerk_sub</code> on the Headlo user.</li>
          </ul>

          <div style={s.footer}>
            <a href="/" style={s.footerLink}>← Back to landing</a>
            <span style={s.footerSep}>·</span>
            <a href="/onboarding" style={s.footerLink}>Headlo-only onboarding</a>
            <span style={s.footerSep}>·</span>
            <a href="/clerk" style={s.footerLink}>Clerk-only variant</a>
          </div>
        </div>
      </main>
    </div>
  )
}

const s = {
  page: { background: '#faf9f6', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#1a1a18' } as React.CSSProperties,
  nav: { display: 'flex', alignItems: 'center', padding: '14px 32px', borderBottom: '1px solid #e8e5df', background: '#fff' } as React.CSSProperties,
  logo: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 700, color: '#1a1a18', textDecoration: 'none' } as React.CSSProperties,
  logoMark: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, background: 'linear-gradient(135deg, #1a1a18 50%, #6c47ff 50%)', color: '#fff', fontSize: 15, fontWeight: 800 } as React.CSSProperties,
  main: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 24px' } as React.CSSProperties,
  card: { background: '#fff', border: '1px solid #e8e5df', borderRadius: 12, padding: '40px 36px', maxWidth: 500, width: '100%', boxShadow: '0 1px 4px rgba(0,0,0,.04)' } as React.CSSProperties,
  eyebrow: { fontSize: 11, fontWeight: 700, color: '#5b21b6', textTransform: 'uppercase' as const, letterSpacing: '.08em', marginBottom: 8 } as React.CSSProperties,
  h1: { fontSize: 26, fontWeight: 700, margin: 0, lineHeight: 1.2, letterSpacing: -0.3 } as React.CSSProperties,
  lede: { fontSize: 15, color: '#5a5a55', lineHeight: 1.6, marginTop: 12 } as React.CSSProperties,
  ctaRow: { marginTop: 24 } as React.CSSProperties,
  ctaPrimary:   { width: '100%', padding: '12px 16px', background: '#1a1a18', color: '#faf9f6', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  ctaSecondary: { width: '100%', padding: '12px 16px', background: '#6c47ff', color: '#fff',    border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  ctaHint: { marginTop: 8, fontSize: 12, color: '#8a8a80', lineHeight: 1.5 } as React.CSSProperties,
  orRow: { display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 4px' } as React.CSSProperties,
  orText: { fontSize: 11, fontWeight: 600, color: '#a0a098', textTransform: 'uppercase' as const, letterSpacing: '.08em', padding: '0 10px' } as React.CSSProperties,
  divider: { display: 'flex', alignItems: 'center', gap: 12, margin: '32px 0 16px' } as React.CSSProperties,
  dividerText: { fontSize: 11, fontWeight: 600, color: '#8a8a80', textTransform: 'uppercase' as const, letterSpacing: '.06em' } as React.CSSProperties,
  list: { margin: 0, paddingLeft: 18, fontSize: 13, color: '#5a5a55', lineHeight: 1.8 } as React.CSSProperties,
  footer: { marginTop: 28, paddingTop: 20, borderTop: '1px solid #f0ede5', fontSize: 12, color: '#8a8a80', textAlign: 'center' as const } as React.CSSProperties,
  footerLink: { color: '#5a5a55', textDecoration: 'none' } as React.CSSProperties,
  footerSep: { margin: '0 8px', color: '#d0d0c8' } as React.CSSProperties,
}
