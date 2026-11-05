import React from 'react'
import { HeadloProviderV2, useHeadloAuth, useHeadloUser as useUser, SignInButton, SignOutButton, SignedIn, SignedOut } from 'headlo-auth'
import { DpopAuthBridge } from './DpopAuthBridge'
import { HardcodedAskWidget, CustomElementAskWidget } from './AskWidgetDemo'

// V2 (ABS / DPoP) version of the Ask Widget demo.
//
// Compared to /demo/askwidget (v1 root provider):
//
//   - Wraps in HeadloProviderV2   → DPoP-anchored session, cookie-less
//   - Wraps in DpopAuthBridge     → any future data-hook call auto-DPoPs
//   - Personalizes the widget with the signed-in user's display name
//   - Reuses HardcodedAskWidget + CustomElementAskWidget from the v1 demo
//     so both routes stay in sync when the widget UI evolves
//
// The PROP service call (llm-chat:v1) still goes through PropServer's own
// fetch path — that's an anon-key / publishable-key surface, not a JWT
// endpoint. The V2 wrapping proves the auth surface composes cleanly with
// the PROP layer; it doesn't change how the LLM call itself is authenticated.

const authIssuer     = import.meta.env.VITE_HEADLO_AUTH_ISSUER     as string
const publishableKey = import.meta.env.VITE_HEADLO_PUBLISHABLE_KEY as string

export default function AskWidgetDemoV2() {
  return (
    <HeadloProviderV2
      publishableKey={publishableKey}
      issuer={authIssuer}
      signInFallbackRedirectUrl="/demo/auth-v2/askwidget"
      signUpFallbackRedirectUrl="/demo/auth-v2/askwidget"
    >
      <DpopAuthBridge>
        <Inner />
      </DpopAuthBridge>
    </HeadloProviderV2>
  )
}

function Inner() {
  const { isLoaded, isSignedIn } = useHeadloAuth()
  const user = useUser()

  const firstName    = user?.displayName?.split(' ')[0]
  const personalized = isSignedIn && firstName ? `Ask Headlo, ${firstName}` : 'Ask Headlo'

  return (
    <div style={{ background: '#faf9f6', minHeight: '100vh' }}>
      <header style={s.header}>
        <a href="/" style={s.backLink}>← Back to landing</a>
        <span style={s.headerTitle}>Ask Widget demo — V2 (DPoP)</span>
      </header>

      <main style={s.main}>
        <section style={s.card}>
          <div style={s.label}>V2 auth state</div>
          <div style={s.row}><span style={s.k}>isLoaded</span>   <code style={s.code}>{String(isLoaded)}</code></div>
          <div style={s.row}><span style={s.k}>isSignedIn</span> <code style={s.code}>{String(isSignedIn)}</code></div>
          <div style={s.row}><span style={s.k}>user.email</span> <span style={s.v}>{user?.email ?? '—'}</span></div>
          <div style={s.row}><span style={s.k}>user.displayName</span> <span style={s.v}>{user?.displayName ?? '—'}</span></div>

          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <SignedOut>
              <SignInButton style={s.btnPrimary}>Sign in with Headlo (V2)</SignInButton>
            </SignedOut>
            <SignedIn>
              <SignOutButton style={s.btnDanger}>Sign out</SignOutButton>
            </SignedIn>
          </div>
        </section>

        <section>
          <h2 style={s.h2}>1. Hard-coded React widget</h2>
          <p style={s.p}>
            Reuses <code style={s.inlineCode}>HardcodedAskWidget</code> from the v1 demo — same PROP service call via <code style={s.inlineCode}>useService('llm-chat', 'v1')</code>. When signed in via V2, the widget's display name is personalized with your first name so you can see the auth composition at work.
          </p>
          <HardcodedAskWidget displayName={personalized} tagline="V2 + DPoP · llm-chat service via PROP" accentColor="#5dcaa5" />
        </section>

        <section>
          <h2 style={s.h2}>2. Custom-element PROP component</h2>
          <p style={s.p}>
            Same <code style={s.inlineCode}>&lt;headlo-ask-widget&gt;</code> custom element as the v1 demo. Wrapping in the V2 auth tree doesn't change how the component loads (bundle served via <code style={s.inlineCode}>publishableKey</code>), but it demonstrates that PROP components compose cleanly under any auth provider.
          </p>
          <CustomElementAskWidget />
        </section>

        <section style={s.card}>
          <div style={s.label}>what this proves</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#5a5a55', lineHeight: 1.6 }}>
            <li><code style={s.code}>HeadloProviderV2</code> and <code style={s.code}>PropServer</code> compose without conflict — both providers can wrap the same tree.</li>
            <li><code style={s.code}>DpopAuthBridge</code> provides <code style={s.code}>authFetch</code> to any data hook in the subtree — even though this page doesn't consume it, the plumbing is available for future DPoP-authenticated widget calls.</li>
            <li>PROP service calls (<code style={s.code}>useService</code>) go through the publishable-key path, orthogonal to DPoP auth. Same widget code works under v1, V2, or no auth at all.</li>
            <li>V2 auth state is available via <code style={s.code}>useUser()</code> — used here to personalize the widget's <code style={s.code}>displayName</code>.</li>
          </ul>
        </section>
      </main>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  header:       { borderBottom: '1px solid #e8e5df', padding: '0 24px', height: 52, display: 'flex', alignItems: 'center', gap: 10 },
  backLink:     { textDecoration: 'none', color: '#1a1a18', fontSize: 13 },
  headerTitle:  { fontSize: 14, fontWeight: 600, marginLeft: 16 },
  main:         { maxWidth: 720, margin: '40px auto', padding: '0 24px', display: 'grid', gap: 16 },
  card:         { background: '#fff', border: '1px solid #e8e5df', borderRadius: 10, padding: '20px 24px' },
  label:        { fontSize: 11, fontWeight: 700, color: '#8a8a80', textTransform: 'uppercase' as const, letterSpacing: '.06em', marginBottom: 14 },
  row:          { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 6 },
  k:            { fontSize: 12, color: '#8a8a80' },
  v:            { fontSize: 13, color: '#1a1a18', textAlign: 'right' as const, wordBreak: 'break-all' as const },
  code:         { fontFamily: '"DM Mono", monospace', fontSize: 11, color: '#1a1a18', background: '#f5f2eb', padding: '1px 6px', borderRadius: 4 },
  h2:           { fontSize: 15, fontWeight: 700, marginBottom: 6, color: '#1a1a18' },
  p:            { fontSize: 13, color: '#6b6a62', lineHeight: 1.55, marginBottom: 12 },
  inlineCode:   { background: '#f5f2eb', padding: '1px 5px', borderRadius: 4, fontSize: 12, fontFamily: 'monospace' },
  btnPrimary:   { background: '#1a1a18', color: '#faf9f6', border: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnDanger:    { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
}
