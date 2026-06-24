import AuthCard from './components/AuthCard'
import PropCard from './components/PropCard'

export default function TestPage() {
  return (
    <div style={{ background: '#faf9f6', minHeight: '100vh' }}>
      <header style={{
        borderBottom: '1px solid #e8e5df',
        padding:      '0 24px',
        height:       52,
        display:      'flex',
        alignItems:   'center',
        gap:          10,
      }}>
        <a href="/" style={{ textDecoration: 'none', color: '#1a1a18', fontSize: 13 }}>
          ← Back to landing
        </a>
        <span style={{ fontSize: 14, fontWeight: 600, marginLeft: 16 }}>
          Headlo React — test page
        </span>
      </header>

      <main style={{ maxWidth: 640, margin: '40px auto', padding: '0 24px' }}>
        <AuthCard />
        <PropCard />
      </main>
    </div>
  )
}
