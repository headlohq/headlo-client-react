import React from 'react'

// ABS spike — verifies the load-bearing assumptions behind Anchor-Bound Session
// (see claude/headlo-auth-anchor-bound-session.md + claude/headlo-auth-abs-build-sequencing.md).
//
// Load this page on target browsers (especially iOS Safari) to confirm:
//   1. ECDSA P-256 key generation with extractable: false works
//   2. crypto.subtle.exportKey('jwk', privateKey) throws (extractable:false enforced)
//   3. Public key IS extractable (needed for JWK thumbprint + sending to server)
//   4. DPoP-style JWT signing works with the private key
//   5. IndexedDB persistence survives storage and retrieval
//   6. Retrieved key from IndexedDB still has extractable: false
//   7. Performance benchmark — 100 signs, target < 1000ms total (< 10ms median)
//
// If all 7 pass in iOS Safari, ABS's Layer 1 + Layer 2 assumptions hold.
// If any fail, ABS's design needs revision before Phase A begins.

type TestResult = {
  name:     string
  status:   'pending' | 'pass' | 'fail'
  details?: string
  metric?:  string
}

const DB_NAME     = 'abs_spike_test'
const STORE_NAME  = 'keys'
const KEY_ID      = 'session_key'

function base64url(input: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : input instanceof Uint8Array
      ? input
      : new Uint8Array(input)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

async function idbPut(key: string, value: any): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
  })
}

async function idbGet(key: string): Promise<any> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

async function idbClear(): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).clear()
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
  })
}

export default function AbsSpikePage() {
  const [results, setResults] = React.useState<TestResult[]>([])
  const [running, setRunning] = React.useState(false)
  const [ua, setUa] = React.useState('')

  React.useEffect(() => {
    setUa(navigator.userAgent)
  }, [])

  async function runSpike() {
    setRunning(true)
    const r: TestResult[] = []
    const push = (t: TestResult) => { r.push(t); setResults([...r]) }

    // Cleanup any previous run
    try { await idbClear() } catch { /* first run, no db yet */ }

    // TEST 1 — generate extractable: false ECDSA P-256 keypair
    let keyPair: CryptoKeyPair
    try {
      keyPair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        false, // extractable
        ['sign', 'verify'],
      )
      push({
        name:    '1. Generate ECDSA P-256 key with extractable: false',
        status:  'pass',
        details: `privateKey.extractable = ${keyPair.privateKey.extractable}, publicKey.extractable = ${keyPair.publicKey.extractable}`,
      })
    } catch (e) {
      push({ name: '1. Generate ECDSA P-256 key with extractable: false', status: 'fail', details: String(e) })
      setRunning(false)
      return
    }

    // TEST 2 — exporting the PRIVATE key must throw
    try {
      const leaked = await crypto.subtle.exportKey('jwk', keyPair.privateKey)
      push({
        name:    '2. exportKey(privateKey) throws (extractable:false enforced)',
        status:  'fail',
        details: `LEAK: private key was exported! JWK: ${JSON.stringify(leaked).slice(0, 100)}…`,
      })
    } catch (e) {
      push({
        name:    '2. exportKey(privateKey) throws (extractable:false enforced)',
        status:  'pass',
        details: `Correctly threw: ${(e as Error).name} — ${(e as Error).message}`,
      })
    }

    // TEST 3 — public key IS extractable
    let publicJwk: JsonWebKey
    try {
      publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey)
      push({
        name:    '3. exportKey(publicKey) succeeds (needed for JWK sent to server)',
        status:  'pass',
        details: `kty=${publicJwk.kty}, crv=${publicJwk.crv}, x=${(publicJwk.x || '').slice(0, 20)}…`,
      })
    } catch (e) {
      push({ name: '3. exportKey(publicKey) succeeds', status: 'fail', details: String(e) })
      setRunning(false)
      return
    }

    // TEST 4 — DPoP-style JWT sign roundtrip
    let dpopProof = ''
    try {
      const header = { alg: 'ES256', typ: 'dpop+jwt', jwk: publicJwk }
      const payload = {
        htu: 'https://auth.headlo.com/oauth/token/refresh-dpop',
        htm: 'POST',
        iat: Math.floor(Date.now() / 1000),
        jti: crypto.randomUUID(),
      }
      const signingInput = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(payload))
      const signatureBuf = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        keyPair.privateKey,
        new TextEncoder().encode(signingInput),
      )
      dpopProof = signingInput + '.' + base64url(signatureBuf)

      // Verify with the public key to prove roundtrip works
      const isValid = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        keyPair.publicKey,
        signatureBuf,
        new TextEncoder().encode(signingInput),
      )
      if (!isValid) throw new Error('Signature failed to verify')

      push({
        name:    '4. DPoP-style JWT sign + verify roundtrip',
        status:  'pass',
        details: `Proof length: ${dpopProof.length} bytes; signature verifies with public key`,
      })
    } catch (e) {
      push({ name: '4. DPoP-style JWT sign + verify roundtrip', status: 'fail', details: String(e) })
    }

    // TEST 5 — IndexedDB store + retrieve the CryptoKeyPair
    try {
      await idbPut(KEY_ID, keyPair)
      const retrieved = await idbGet(KEY_ID) as CryptoKeyPair
      if (!retrieved || !retrieved.privateKey || !retrieved.publicKey) {
        throw new Error(`Retrieved value is not a valid CryptoKeyPair: ${JSON.stringify(retrieved)}`)
      }
      push({
        name:    '5. IndexedDB stores + retrieves CryptoKeyPair',
        status:  'pass',
        details: `Retrieved privateKey.type=${retrieved.privateKey.type}, publicKey.type=${retrieved.publicKey.type}`,
      })

      // TEST 6 — retrieved private key still has extractable: false
      if (retrieved.privateKey.extractable === false) {
        push({
          name:    '6. Retrieved key preserves extractable: false',
          status:  'pass',
          details: `retrieved.privateKey.extractable = ${retrieved.privateKey.extractable}`,
        })
      } else {
        push({
          name:    '6. Retrieved key preserves extractable: false',
          status:  'fail',
          details: `LEAK: retrieved.privateKey.extractable = ${retrieved.privateKey.extractable} (should be false)`,
        })
      }
    } catch (e) {
      push({ name: '5. IndexedDB stores + retrieves CryptoKeyPair', status: 'fail', details: String(e) })
      push({ name: '6. Retrieved key preserves extractable: false',    status: 'fail', details: 'Skipped due to test 5 failure' })
    }

    // TEST 7 — Performance benchmark: 100 signs
    try {
      const iters = 100
      const t0 = performance.now()
      for (let i = 0; i < iters; i++) {
        const payload = { iat: Math.floor(Date.now() / 1000), jti: crypto.randomUUID() }
        const signingInput = base64url(JSON.stringify({ alg: 'ES256' })) + '.' + base64url(JSON.stringify(payload))
        await crypto.subtle.sign(
          { name: 'ECDSA', hash: 'SHA-256' },
          keyPair.privateKey,
          new TextEncoder().encode(signingInput),
        )
      }
      const elapsed = performance.now() - t0
      const perSign = elapsed / iters
      const target = 10 // ms per sign — budget from build-sequencing doc gap #3
      push({
        name:    `7. Performance: ${iters} signs`,
        status:  perSign < target ? 'pass' : 'fail',
        details: perSign < target
          ? `${elapsed.toFixed(0)}ms total, ${perSign.toFixed(2)}ms/sign — under ${target}ms budget ✓`
          : `${elapsed.toFixed(0)}ms total, ${perSign.toFixed(2)}ms/sign — EXCEEDS ${target}ms budget`,
        metric: `${perSign.toFixed(2)}ms/sign`,
      })
    } catch (e) {
      push({ name: '7. Performance benchmark', status: 'fail', details: String(e) })
    }

    setRunning(false)
  }

  const passCount = results.filter(r => r.status === 'pass').length
  const failCount = results.filter(r => r.status === 'fail').length
  const allPassed = results.length === 7 && failCount === 0

  return (
    <div style={s.page}>
      <div style={s.container}>
        <h1 style={s.h1}>ABS Spike — DPoP + IndexedDB Cross-Browser Test</h1>
        <p style={s.lede}>
          Verifies the load-bearing assumptions behind <strong>Anchor-Bound Session</strong>
          {' '}(<code>claude/headlo-auth-anchor-bound-session.md</code>).
          {' '}Load this page on <strong>iOS Safari</strong>, desktop Safari, Firefox strict, and Brave
          {' '}to confirm ABS's Layer 1 + Layer 2 assumptions hold before starting Phase A.
        </p>

        <div style={s.uaBox}>
          <div style={s.uaLabel}>User agent</div>
          <div style={s.uaValue}>{ua}</div>
        </div>

        <button style={s.runBtn} onClick={runSpike} disabled={running}>
          {running ? 'Running…' : results.length > 0 ? 'Re-run spike' : 'Run spike'}
        </button>

        {results.length > 0 && (
          <>
            <div style={s.summary}>
              <span style={{ ...s.pill, ...s.pillPass }}>{passCount} pass</span>
              {failCount > 0 && <span style={{ ...s.pill, ...s.pillFail }}>{failCount} fail</span>}
              {allPassed && (
                <span style={s.verdictPass}>
                  ✓ ABS spike PASSED — safe to start Phase A on this browser
                </span>
              )}
              {failCount > 0 && (
                <span style={s.verdictFail}>
                  ✗ ABS spike FAILED — DPoP mechanism has issues in this browser; revise design before Phase A
                </span>
              )}
            </div>

            <ol style={s.list}>
              {results.map((r, i) => (
                <li key={i} style={s.item}>
                  <div style={s.itemHeader}>
                    <span style={{ ...s.status, ...(r.status === 'pass' ? s.statusPass : s.statusFail) }}>
                      {r.status === 'pass' ? '✓' : '✗'}
                    </span>
                    <span style={s.itemName}>{r.name}</span>
                    {r.metric && <span style={s.metric}>{r.metric}</span>}
                  </div>
                  {r.details && <div style={s.itemDetails}>{r.details}</div>}
                </li>
              ))}
            </ol>
          </>
        )}

        <div style={s.reminders}>
          <div style={s.remindersTitle}>What to check next</div>
          <ul style={s.remindersList}>
            <li>Reload this tab — the IndexedDB should still work but a fresh CryptoKey will be generated (spike clears storage on run for clean re-tests).</li>
            <li>Copy the User Agent + test results into <code>headlo-auth-abs-build-sequencing.md</code> under gap #1 findings.</li>
            <li>If test 7 (performance) fails on iPhone: revisit gap #3 mitigations before Phase A.</li>
            <li>If test 2 or test 6 fails: <strong>abandon or radically redesign ABS.</strong> The <code>extractable: false</code> guarantee is the load-bearing security claim.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

const s = {
  page: {
    background:  '#faf9f6',
    minHeight:   '100vh',
    fontFamily:  '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color:       '#1a1a18',
    padding:     '24px 16px',
  } as React.CSSProperties,
  container: {
    maxWidth: 720,
    margin:   '0 auto',
  } as React.CSSProperties,
  h1: {
    fontSize:     22,
    fontWeight:   700,
    margin:       '0 0 12px',
    lineHeight:   1.3,
  } as React.CSSProperties,
  lede: {
    fontSize:   14,
    color:      '#5a5a55',
    lineHeight: 1.6,
    margin:     '0 0 20px',
  } as React.CSSProperties,
  uaBox: {
    background:   '#fff',
    border:       '1px solid #e8e5df',
    borderRadius: 8,
    padding:      '10px 14px',
    marginBottom: 16,
  } as React.CSSProperties,
  uaLabel: {
    fontSize:      10,
    color:         '#8a8a80',
    textTransform: 'uppercase' as const,
    letterSpacing: '.05em',
    marginBottom:  4,
  } as React.CSSProperties,
  uaValue: {
    fontSize:   12,
    fontFamily: '"DM Mono", monospace',
    wordBreak:  'break-all' as const,
    color:      '#1a1a18',
  } as React.CSSProperties,
  runBtn: {
    background:    '#1a1a18',
    color:         '#faf9f6',
    border:        'none',
    borderRadius:  8,
    padding:       '10px 20px',
    fontSize:      14,
    fontWeight:    600,
    cursor:        'pointer',
    fontFamily:    'inherit',
    marginBottom:  16,
  } as React.CSSProperties,
  summary: {
    display:      'flex',
    alignItems:   'center',
    gap:          8,
    marginBottom: 16,
    flexWrap:     'wrap' as const,
  } as React.CSSProperties,
  pill: {
    display:      'inline-block',
    padding:      '4px 10px',
    borderRadius: 100,
    fontSize:     12,
    fontWeight:   600,
  } as React.CSSProperties,
  pillPass: { background: '#d1fae5', color: '#065f46' } as React.CSSProperties,
  pillFail: { background: '#fee2e2', color: '#991b1b' } as React.CSSProperties,
  verdictPass: {
    fontSize:   13,
    color:      '#065f46',
    fontWeight: 600,
  } as React.CSSProperties,
  verdictFail: {
    fontSize:   13,
    color:      '#991b1b',
    fontWeight: 600,
  } as React.CSSProperties,
  list: {
    listStyle:  'none',
    padding:    0,
    margin:     0,
  } as React.CSSProperties,
  item: {
    background:   '#fff',
    border:       '1px solid #e8e5df',
    borderRadius: 8,
    padding:      '12px 14px',
    marginBottom: 8,
  } as React.CSSProperties,
  itemHeader: {
    display:    'flex',
    alignItems: 'center',
    gap:        10,
    marginBottom: 4,
  } as React.CSSProperties,
  status: {
    fontSize:   16,
    fontWeight: 700,
    width:      20,
    flexShrink: 0,
  } as React.CSSProperties,
  statusPass: { color: '#065f46' } as React.CSSProperties,
  statusFail: { color: '#991b1b' } as React.CSSProperties,
  itemName: {
    fontSize:   14,
    fontWeight: 500,
    flex:       1,
  } as React.CSSProperties,
  metric: {
    fontSize:   12,
    fontFamily: '"DM Mono", monospace',
    color:      '#5a5a55',
    background: '#f5f2eb',
    padding:    '2px 8px',
    borderRadius: 4,
  } as React.CSSProperties,
  itemDetails: {
    fontSize:    12,
    color:       '#5a5a55',
    fontFamily:  '"DM Mono", monospace',
    marginLeft:  30,
    wordBreak:   'break-word' as const,
    lineHeight:  1.5,
  } as React.CSSProperties,
  reminders: {
    marginTop:    32,
    background:   '#fffbea',
    border:       '1px solid #fbe7a1',
    borderRadius: 8,
    padding:      '14px 16px',
  } as React.CSSProperties,
  remindersTitle: {
    fontSize:     12,
    fontWeight:   700,
    color:        '#8a5a00',
    marginBottom: 8,
    textTransform: 'uppercase' as const,
    letterSpacing: '.05em',
  } as React.CSSProperties,
  remindersList: {
    margin:      0,
    paddingLeft: 20,
    fontSize:    13,
    color:       '#5a4a20',
    lineHeight:  1.6,
  } as React.CSSProperties,
}
