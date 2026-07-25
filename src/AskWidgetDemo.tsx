import React from 'react'
import { useService, useComponent } from 'headlo-react'

// Type contract for the service:llm-chat:v1 client stub. This is the shape
// the worker's llmChatV1Handler returns (see claude/headlo-ask-widget-prop-plan.md).
interface LlmChatService {
  chat: (args: {
    messages:     Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
    systemPrompt: string
    temperature?: number
  }) => Promise<{ answer: string; provider?: string; model?: string }>
}

type Msg = { role: 'user' | 'assistant'; text: string }

const DEMO_SYSTEM_PROMPT =
  'You are the Headlo demo assistant. Be terse, friendly, and specific. ' +
  'Never invent product features. If unsure, say you\'re unsure.'

// ─── Hard-coded widget — proves the PROP service call in raw form ───────
// Same UI shape the eventual <headlo-ask-widget> custom element will ship.
// Widget owns its state and calls the LLM service directly — not the old
// contract pattern where the host owns messages/loading/onSubmit.
interface HardcodedWidgetProps {
  displayName?:  string
  tagline?:      string
  accentColor?:  string
}

function HardcodedAskWidget({
  displayName = 'Ask Headlo',
  tagline     = 'Powered by service:llm-chat:v1',
  accentColor = '#5dcaa5',
}: HardcodedWidgetProps) {
  const llm = useService<LlmChatService>('llm-chat', 'v1')

  const [q,          setQ]          = React.useState('')
  const [focused,    setFocused]    = React.useState(false)
  const [messages,   setMessages]   = React.useState<Msg[]>([])
  const [loading,    setLoading]    = React.useState(false)
  const endRef = React.useRef<HTMLDivElement | null>(null)

  const ac = accentColor
  const hasMessages = messages.length > 0

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSubmit() {
    const trimmed = q.trim()
    if (!trimmed || loading || !llm) return

    setQ('')
    setLoading(true)
    const newHistory: Msg[] = [...messages, { role: 'user', text: trimmed }]
    setMessages(newHistory)

    try {
      const { answer } = await llm.chat({
        messages:     newHistory.map(m => ({ role: m.role, content: m.text })),
        systemPrompt: DEMO_SYSTEM_PROMPT,
      })
      setMessages([...newHistory, { role: 'assistant', text: answer }])
    } catch (e) {
      setMessages([...newHistory, { role: 'assistant', text: `Error: ${String(e)}` }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', background: '#f5f2eb', padding: '24px 16px', display: 'flex', justifyContent: 'center' }}>
      <style>{`
        @keyframes aw-spin { to { transform: rotate(360deg); } }
        @keyframes aw-fadein { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
      <div style={{ width: '100%', maxWidth: 440, background: '#fff', borderRadius: 18, boxShadow: '0 8px 40px rgba(0,0,0,.13)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 'min(600px, calc(100vh - 48px))' }}>

        {/* Header */}
        <div style={{ padding: '18px 20px 16px', borderBottom: '1px solid #f0ede8', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: '#111' }}>{displayName}</span>
          {tagline && <span style={{ color: '#999', fontSize: 14, marginLeft: 8 }}>{tagline}</span>}
        </div>

        {/* Messages */}
        {hasMessages && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ animation: 'aw-fadein .18s ease' }}>
                {m.role === 'user' ? (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ background: '#f0ede8', padding: '10px 14px', borderRadius: '16px 16px 4px 16px', fontSize: 15, color: '#222', maxWidth: '78%', lineHeight: 1.5 }}>
                      {m.text}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 15, color: '#222', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{m.text}</div>
                )}
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#aaa', fontSize: 14, animation: 'aw-fadein .18s ease' }}>
                <span style={{ display: 'inline-block', width: 13, height: 13, border: '2px solid rgba(0,0,0,0.1)', borderTopColor: '#aaa', borderRadius: '50%', animation: 'aw-spin 0.7s linear infinite', flexShrink: 0 }} />
                Thinking…
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}

        {/* Input */}
        <div style={{ padding: '12px 20px 8px', borderTop: hasMessages ? '1px solid #f0ede8' : 'none', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', border: focused ? `2px solid ${ac}` : '1.5px solid #e0ddd8', borderRadius: 12, overflow: 'hidden', background: '#fafaf8', transition: 'border-color .15s' }}>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleSubmit() }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              disabled={!llm}
              placeholder={llm ? `Ask ${displayName} a question` : 'Loading LLM service…'}
              style={{ flex: 1, padding: '14px 16px', border: 'none', outline: 'none', fontSize: 15, background: 'transparent', fontFamily: 'inherit', color: '#111' }}
            />
            <button
              onClick={handleSubmit}
              disabled={!q.trim() || loading || !llm}
              style={{ padding: '0 18px', height: 50, border: 'none', background: 'none', cursor: q.trim() && !loading && llm ? 'pointer' : 'default', fontSize: 20, color: q.trim() && !loading && llm ? ac : '#ccc' }}
            >
              →
            </button>
          </div>
          <p style={{ fontSize: 11, color: '#ccc', margin: '8px 0 4px', textAlign: 'center' }}>
            By using chat, you agree to the Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Custom-element version — proves the same UX ships as PROP too ──────
// Uses the (future) <headlo-ask-widget> tag. If the component isn't seeded
// yet, we show a note explaining the plan.
function CustomElementAskWidget() {
  const { loaded, error } = useComponent('headlo-ask-widget')

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.title}>&lt;headlo-ask-widget&gt;</div>
        <div style={s.tag}>PROP custom element — same UX, embeddable on any HTML page</div>
      </div>
      <div style={{ padding: 16 }}>
        {error && (
          <div style={{ ...s.empty, color: '#991b1b' }}>
            Component not yet published. See claude/headlo-ask-widget-prop-plan.md — the
            <code style={{ background: '#f5f2eb', padding: '2px 6px', borderRadius: 4, margin: '0 4px' }}>
              prod-seed.sql
            </code>
            UPSERT for slug <code>headlo-ask-widget</code> needs to be added.
          </div>
        )}
        {!error && !loaded && <div style={s.empty}>Loading component bundle…</div>}
        {loaded && (
          <headlo-ask-widget
            display-name="Ask Headlo"
            tagline="PROP component — same UX"
            accent-color="#5dcaa5"
            style={{ display: 'block', minHeight: 260 }}
          />
        )}
      </div>
    </div>
  )
}

export default function AskWidgetDemo() {
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
          Ask Widget demo — PROP service integration
        </span>
      </header>

      <main style={{ maxWidth: 720, margin: '40px auto', padding: '0 24px', display: 'grid', gap: 16 }}>
        <section>
          <h2 style={s.h2}>1. Hard-coded React widget</h2>
          <p style={s.p}>
            A normal React component in this app. Calls the PROP LLM service via the SDK's
            <code style={s.inlineCode}>useService('llm-chat', 'v1')</code> hook. The provider
            is chosen server-side by the agency's <code style={s.inlineCode}>prop_service.subscription</code>{' '}
            row — swap OpenAI for Anthropic without touching this file.
          </p>
          <HardcodedAskWidget />
        </section>

        <section>
          <h2 style={s.h2}>2. Custom-element PROP component</h2>
          <p style={s.p}>
            The identical UX shipped as a <code style={s.inlineCode}>&lt;headlo-ask-widget&gt;</code>{' '}
            custom element served from <code style={s.inlineCode}>/v1/prop/component/headlo-ask-widget/bundle</code>.
            Drop it into any HTML page (including this one) with the same two script tags used for the auth button.
            The tag internally calls the same LLM service via the client stub.
          </p>
          <CustomElementAskWidget />
        </section>
      </main>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  h2:         { fontSize: 15, fontWeight: 700, marginBottom: 6, color: '#1a1a18' },
  p:          { fontSize: 13, color: '#6b6a62', lineHeight: 1.55, marginBottom: 12 },
  inlineCode: { background: '#f5f2eb', padding: '1px 5px', borderRadius: 4, fontSize: 12, fontFamily: 'monospace' },
  wrap:       { fontFamily: 'inherit', border: '1px solid #e8e5df', borderRadius: 10, background: '#fff', overflow: 'hidden' },
  header:     { padding: '14px 16px', borderBottom: '1px solid #e8e5df' },
  title:      { fontSize: 14, fontWeight: 700 },
  tag:        { fontSize: 11, color: '#6b6a62', marginTop: 4 },
  msgs:       { padding: '14px 16px', minHeight: 140, maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 },
  empty:      { color: '#8a8a80', fontSize: 13, alignSelf: 'center' },
  userMsg:    { alignSelf: 'flex-end',   background: '#e8e5df', padding: '8px 12px', borderRadius: 10, fontSize: 13, maxWidth: '85%' },
  botMsg:     { alignSelf: 'flex-start', background: '#faf9f6', padding: '8px 12px', borderRadius: 10, fontSize: 13, maxWidth: '85%', border: '1px solid #e8e5df' },
  thinking:   { alignSelf: 'flex-start', color: '#8a8a80', fontSize: 13, fontStyle: 'italic' },
  row:        { display: 'flex', gap: 8, padding: '12px 16px', borderTop: '1px solid #e8e5df', background: '#fff' },
  input:      { flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid #e8e5df', fontSize: 13, fontFamily: 'inherit' },
  send:       { padding: '8px 16px', color: '#faf9f6', background: '#1a1a18', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
}
