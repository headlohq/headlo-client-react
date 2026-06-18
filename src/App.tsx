import AuthCard from './components/AuthCard'
import PropCard from './components/PropCard'

export default function App() {
  return (
    <div style={{ background: '#faf9f6', minHeight: '100vh' }}>
      <header style={{
        borderBottom: '1px solid #e8e5df',
        padding: '0 24px',
        height: 52,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'sans-serif' }}>
          Headlo React Example
        </span>
      </header>

      <main style={{ maxWidth: 640, margin: '40px auto', padding: '0 24px' }}>
        <AuthCard />
        <PropCard />
      </main>
    </div>
  )
}
