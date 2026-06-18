import React from 'react'
import { useHeadloAuth, useHeadloUser, SignInButton, SignOutButton } from 'headlo-auth'

export default function AuthCard() {
  const { isLoaded, isSignedIn, getToken } = useHeadloAuth()
  const user = useHeadloUser()
  const [token, setToken] = React.useState<string | null>(null)

  if (!isLoaded) return <div style={s.card}><span style={s.muted}>Loading…</span></div>

  return (
    <div style={s.card}>
      <div style={s.title}>Authentication</div>

      <div style={s.row}>
        <span style={s.label}>Status</span>
        <span style={{ fontWeight: 600, color: isSignedIn ? '#2a7a3a' : '#8a8a80' }}>
          {isSignedIn ? '✓ Signed in' : 'Not signed in'}
        </span>
      </div>

      {user && (
        <>
          <div style={s.row}>
            <span style={s.label}>Email</span>
            <span>{user.email}</span>
          </div>
          <div style={s.row}>
            <span style={s.label}>User ID</span>
            <code style={s.code}>{user.id}</code>
          </div>
          {user.displayName && (
            <div style={s.row}>
              <span style={s.label}>Name</span>
              <span>{user.displayName}</span>
            </div>
          )}
        </>
      )}

      {token && (
        <div style={{ marginTop: 12 }}>
          <div style={s.label}>JWT</div>
          <code style={{ ...s.code, wordBreak: 'break-all', fontSize: 11, display: 'block', marginTop: 4 }}>
            {token}
          </code>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        {!isSignedIn && (
          <SignInButton style={s.btn}>Sign in →</SignInButton>
        )}
        {isSignedIn && (
          <>
            <button style={s.btnSecondary} onClick={async () => setToken(await getToken())}>
              Get JWT
            </button>
            <SignOutButton style={{ ...s.btn, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
              Sign out
            </SignOutButton>
          </>
        )}
      </div>
    </div>
  )
}

const s = {
  card:        { background: '#fff', border: '1px solid #e8e5df', borderRadius: 10, padding: '20px 24px', marginBottom: 16 } as React.CSSProperties,
  title:       { fontSize: 13, fontWeight: 700, marginBottom: 14, color: '#1a1a18' } as React.CSSProperties,
  row:         { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8, fontSize: 14 } as React.CSSProperties,
  label:       { fontSize: 11, color: '#8a8a80', textTransform: 'uppercase' as const, letterSpacing: '.05em', minWidth: 64 },
  code:        { fontSize: 12, fontFamily: 'monospace', color: '#1a1a18' } as React.CSSProperties,
  muted:       { color: '#8a8a80', fontSize: 14 } as React.CSSProperties,
  btn:         { padding: '8px 14px', background: '#1a1a18', color: '#faf9f6', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer' } as React.CSSProperties,
  btnSecondary:{ padding: '8px 14px', background: '#f5f2eb', color: '#1a1a18', border: '1px solid #e8e5df', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer' } as React.CSSProperties,
}
