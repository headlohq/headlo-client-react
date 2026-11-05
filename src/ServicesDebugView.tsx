import React from 'react'
import { HeadloProviderV2, useAuth as useHeadloAuth, SignInButton, SignOutButton, SignedIn, SignedOut } from 'headlo-auth'
import { DpopAuthBridge } from './DpopAuthBridge'
import { resolveSharedPk, setSharedPk, type PkSource } from './lib/shared-pk'

// /services-debug — dev-only test harness driven by service contracts.
//
// Fetches GET /v1/prop/service/:slug/:version for each service in SERVICES,
// then renders one card per action with inputs auto-generated from the
// contract's args map + type DSL. Nothing about the individual actions or
// their arg shapes is hardcoded here — add a new action to the contract
// and it shows up automatically.
//
// Server-only actions (contract.actions[].server === true) attach a Bearer
// token from HeadloProviderV2 when signed in.

// Which service defs this debug page exercises. Add another slug:version
// pair and it renders alongside — nothing else in this file changes.
const SERVICES: Array<{ slug: string; version: string }> = [
  { slug: 'headlo-connect', version: 'v1' },
  { slug: 'headlo-credits', version: 'v1' },
]

// Draft args persisted per (slug:version:action:argName) — free-form strings
// (form inputs) coerced to the right JS type at submit.
type ArgDrafts = Record<string, string>
const LS_KEY = 'headlo_services_debug_v2'

function loadDrafts(): ArgDrafts {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as ArgDrafts
  } catch { /* corrupt — fall through */ }
  return {}
}

const st: Record<string, React.CSSProperties> = {
  page:    { fontFamily: 'DM Mono, ui-monospace, monospace', background: '#F7F4EF', minHeight: '100vh', padding: '32px 24px 96px', color: '#1C1A17' },
  inner:   { maxWidth: 780, margin: '0 auto' },
  h1:      { fontFamily: 'Libre Baskerville, Georgia, serif', fontSize: 26, fontWeight: 400, marginBottom: 6 },
  sub:     { fontSize: 11, color: '#8C8680', marginBottom: 20, letterSpacing: '0.03em', lineHeight: 1.6 },
  section: { background: '#fff', border: '1px solid #E5DDD2', padding: '18px 20px', marginBottom: 16 },
  h2:      { fontFamily: 'Libre Baskerville, Georgia, serif', fontSize: 18, fontWeight: 400, marginBottom: 4 },
  h2Sub:   { fontSize: 11, color: '#8C8680', marginBottom: 14, letterSpacing: '0.02em', lineHeight: 1.5 },
  row:     { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' as const },
  label:   { fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#8C8680', minWidth: 100 },
  input:   { flex: 1, minWidth: 220, padding: '7px 10px', border: '1px solid #E5DDD2', borderRadius: 3, fontFamily: 'inherit', fontSize: 12, background: '#fff', color: '#1C1A17' },
  textarea:{ flex: 1, minWidth: 220, padding: '7px 10px', border: '1px solid #E5DDD2', borderRadius: 3, fontFamily: 'ui-monospace, monospace', fontSize: 11, background: '#fff', color: '#1C1A17', resize: 'vertical' as const },
  btn:     { padding: '7px 14px', background: '#1C1A17', color: '#F7F4EF', border: 'none', fontFamily: 'inherit', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' as const, cursor: 'pointer' },
  btnDis:  { padding: '7px 14px', background: '#c9c1b6', color: '#F7F4EF', border: 'none', fontFamily: 'inherit', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' as const, cursor: 'not-allowed' },
  btnSm:   { padding: '4px 10px', background: '#fff', color: '#1C1A17', border: '1px solid #1C1A17', fontFamily: 'inherit', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' as const, cursor: 'pointer' },
  result:  { marginTop: 10, padding: '10px 12px', background: '#FFFCF6', border: '1px solid #E5DDD2', fontSize: 11, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-all' as const, fontFamily: 'ui-monospace, monospace', color: '#1C1A17', maxHeight: 240, overflowY: 'auto' as const },
  err:     { color: '#b91c1c', border: '1px solid #e5c0c0', background: '#fdf0f0' },
  chipDim: { fontSize: 10, padding: '2px 8px', background: '#f3f0ea', color: '#8C8680', border: '1px solid #c9c1b6', borderRadius: 10, letterSpacing: '0.06em' },
  chipServ:{ fontSize: 10, padding: '2px 8px', background: '#fef3c7', color: '#78350f', border: '1px solid #ead9a7', borderRadius: 10, letterSpacing: '0.06em' },
  chipOpt: { fontSize: 9,  padding: '1px 6px', background: '#f3f0ea', color: '#8C8680', border: '1px solid #c9c1b6', borderRadius: 3,  letterSpacing: '0.06em' },
  link:    { color: '#1C1A17', textDecoration: 'underline', fontSize: 12 },
  actionH: { fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#4a4a42', marginTop: 16, marginBottom: 4, paddingTop: 12, borderTop: '1px solid #E5DDD2', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const },
  actionDesc: { fontSize: 11, color: '#8C8680', marginBottom: 10, letterSpacing: '0.02em', lineHeight: 1.5 },
  pkChip:  { fontSize: 10, padding: '2px 8px', background: '#e8f7f2', color: '#0a4a38', border: '1px solid #0f6e56', borderRadius: 10, letterSpacing: '0.06em' },
  signingInBanner: {
    display: 'flex' as const, alignItems: 'center', gap: 10,
    padding: '10px 14px', marginBottom: 16,
    background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e',
    fontSize: 12, fontWeight: 600, borderRadius: 3,
  },
  signingInSpinner: {
    display: 'inline-block' as const, width: 12, height: 12,
    border: '2px solid #f5d38b', borderTopColor: '#92400e', borderRadius: '50%',
    animation: 'svcDebugSpin 0.7s linear infinite',
  },
}

// Keyframes for the sign-in spinner — inject once.
if (typeof document !== 'undefined' && !document.getElementById('svc-debug-spin-kf')) {
  const style = document.createElement('style')
  style.id = 'svc-debug-spin-kf'
  style.textContent = '@keyframes svcDebugSpin { to { transform: rotate(360deg); } }'
  document.head.appendChild(style)
}

type Panel = { status?: number; body?: unknown; error?: string; loading?: boolean }

// Parse the compact type DSL used in action.args values ("string", "string?",
// "number[]", "object?"). Small in-file re-implementation of the same logic
// as headlo-sdk/configFieldShape.parseTypeExpr — kept local because the SDK
// helper handles a wider set of shapes we don't need here.
type ArgType = {
  base:     'string' | 'number' | 'boolean' | 'object' | 'json' | 'unknown'
  array:    boolean
  optional: boolean
}
function parseArgType(expr: string): ArgType {
  let s = String(expr).trim()
  const optional = s.endsWith('?')
  if (optional) s = s.slice(0, -1).trim()
  const array = s.endsWith('[]')
  if (array) s = s.slice(0, -2).trim()
  const base =
      s === 'string'  ? 'string'
    : s === 'number'  ? 'number'
    : s === 'integer' ? 'number'
    : s === 'boolean' ? 'boolean'
    : s === 'object'  ? 'object'
    : s === 'json'    ? 'json'
    :                   'unknown'
  return { base, array, optional }
}

// Coerce a raw input string to the JS value the /call endpoint expects.
// Returns `undefined` to mean "omit this arg from the payload" (used for
// optional-and-empty).
function coerceArg(raw: string, t: ArgType): { value: unknown; error?: string } {
  const trimmed = raw.trim()
  if (trimmed === '') {
    if (t.optional) return { value: undefined }        // omit
    return { value: undefined, error: 'required' }      // signal missing
  }
  if (t.array || t.base === 'object' || t.base === 'json') {
    try { return { value: JSON.parse(trimmed) } }
    catch (e) { return { value: undefined, error: `invalid JSON: ${(e as Error).message.slice(0, 60)}` } }
  }
  if (t.base === 'number') {
    const n = Number(trimmed)
    return Number.isFinite(n) ? { value: n } : { value: undefined, error: 'not a number' }
  }
  if (t.base === 'boolean') return { value: trimmed === 'true' || trimmed === '1' || trimmed === 'yes' }
  return { value: trimmed }
}

// Contract shape returned by GET /v1/prop/service/:slug/:version. Only the
// fields we read.
type ContractAction = {
  name:          string
  args?:         Record<string, string>
  returns?:      unknown
  description?:  string
  server?:       boolean
  buyerScoped?:  boolean
  ownerViaClaim?: boolean
  anon?:         boolean
  publicRead?:   boolean
}
type Contract = {
  description?: string
  actions?:     ContractAction[]
}
type ServiceMeta = {
  def:  { def_id: string; slug: string; name: string; contract: Contract }
  app:  { app_id: string; slug: string; name: string; version: string; stage: string; config: Record<string, unknown> }
}

// Discriminated on `ok` — the /v1/prop/service response body ALWAYS carries
// an `error: null` key on success, so we can't use `'error' in body` to
// distinguish. Explicit ok flag avoids the trap.
type FetchResult = { ok: true; meta: ServiceMeta } | { ok: false; error: string }

const svcCache = new Map<string, FetchResult>()

async function fetchServiceContract(
  apiUrl: string,
  pk:     string,
  slug:   string,
  version: string,
): Promise<FetchResult> {
  const key = `${slug}:${version}:${pk}`
  const hit = svcCache.get(key)
  if (hit) return hit
  try {
    const res = await fetch(`${apiUrl}/v1/prop/service/${slug}/${version}`, {
      headers: { 'X-Headlo-Prop-Publishable-Key': pk },
    })
    if (!res.ok) {
      const t = await res.text()
      const errRes: FetchResult = { ok: false, error: `HTTP ${res.status}: ${t.slice(0, 200) || '(empty body)'}` }
      svcCache.set(key, errRes)
      return errRes
    }
    const body = await res.json() as ServiceMeta
    const okRes: FetchResult = { ok: true, meta: body }
    svcCache.set(key, okRes)
    return okRes
  } catch (e) {
    const msg = (e instanceof Error && e.message) ? e.message : String(e)
    const errRes: FetchResult = { ok: false, error: msg || `Unknown fetch error — is the worker running at ${apiUrl}?` }
    svcCache.set(key, errRes)
    return errRes
  }
}

// Wrap in its own HeadloProviderV2 (DPoP-bound, cookie-less) so:
//   1. server-only actions get V2 tokens (server-only guard passes)
//   2. cross-tab signout via BroadcastChannel works
const _pkResolved = resolveSharedPk()
const svcPublishableKey = _pkResolved.pk
const svcAuthIssuer     = import.meta.env.VITE_HEADLO_AUTH_ISSUER as string

export default function ServicesDebugView() {
  return (
    <HeadloProviderV2
      publishableKey={svcPublishableKey}
      issuer={svcAuthIssuer}
      signInFallbackRedirectUrl="/services-debug"
      signUpFallbackRedirectUrl="/services-debug"
    >
      <DpopAuthBridge>
        <ServicesDebugInner />
      </DpopAuthBridge>
    </HeadloProviderV2>
  )
}

function ServicesDebugInner() {
  const initialPk = resolveSharedPk()
  const [pk,       setPkState]  = React.useState(initialPk.pk)
  const [pkSource, setPkSource] = React.useState<PkSource>(initialPk.source)
  const setPk = (val: string) => { setPkState(val); setSharedPk(val); setPkSource('localStorage') }

  // All action arg values keyed as `${slug}:${version}:${action}:${argName}`.
  // Free-form strings — coerced at submit based on the contract's DSL type.
  const [drafts, setDrafts] = React.useState<ArgDrafts>(() => loadDrafts())
  React.useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(drafts))
  }, [drafts])

  const auth = useHeadloAuth()
  const apiUrl = (import.meta.env.VITE_HEADLO_API_URL as string | undefined) ?? 'http://127.0.0.1:8787'

  // Pull the `sub` claim out of the current DPoP-bound access token whenever
  // auth state flips. useAuth() doesn't expose it directly; decode the middle
  // JWT segment on the fly. Used by the "use my sub" quick-fill affordance.
  //
  // Depend on the primitive booleans only — including the whole `auth`
  // object in deps causes an infinite loop because it's a new identity
  // every render.
  const [mySub, setMySub] = React.useState<string | null>(null)
  const authRefEarly = React.useRef(auth)
  authRefEarly.current = auth
  React.useEffect(() => {
    if (!auth.isLoaded || !auth.isSignedIn) { setMySub(null); return }
    let cancelled = false
    authRefEarly.current.getToken().then(tok => {
      if (cancelled || !tok) return
      try {
        const parts = tok.split('.')
        if (parts.length < 2) return
        const b64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/')
        const padded = b64 + '==='.slice((b64.length + 3) % 4)
        const payload = JSON.parse(atob(padded)) as { sub?: unknown }
        if (typeof payload.sub === 'string') setMySub(payload.sub)
      } catch { /* opaque token or malformed — leave mySub null */ }
    })
    return () => { cancelled = true }
  }, [auth.isLoaded, auth.isSignedIn])

  const [results, setResults] = React.useState<Record<string, Panel>>({})

  // Owner claims for the signed-in caller — populates the ownerViaClaim
  // dropdown so the harness can pick a legitimate ownerId per action.
  //
  // Loop trap: useHeadloAuth() returns a new object identity every render.
  // If we depend on `auth`, useCallback churns → useEffect refires →
  // setClaims → re-render → new auth object → infinite fetch. Depend on
  // primitive booleans (isLoaded, isSignedIn) instead and pin `auth` via
  // a ref for the callable methods.
  type Claim = { claim_id: string; owner_type: string; owner_id: string; granted_at: string; granted_by: string }
  const [claims, setClaims] = React.useState<Claim[]>([])
  const [claimsLoaded, setClaimsLoaded] = React.useState(false)
  const authRef = React.useRef(auth)
  authRef.current = auth

  const refreshClaims = React.useCallback(async () => {
    const a = authRef.current
    if (!a.isLoaded || !a.isSignedIn) { setClaims([]); setClaimsLoaded(true); return }
    try {
      const tok = await a.getToken()
      if (!tok) { setClaims([]); setClaimsLoaded(true); return }
      const res = await fetch(`${apiUrl}/v1/owner-claims`, { headers: { Authorization: `Bearer ${tok}` } })
      if (!res.ok) { setClaims([]); setClaimsLoaded(true); return }
      const body = await res.json() as { claims?: Claim[] }
      setClaims(body.claims ?? [])
      setClaimsLoaded(true)
    } catch { setClaims([]); setClaimsLoaded(true) }
  }, [apiUrl])

  // Only re-fetch when the auth STATE flips (loaded/signed-in booleans),
  // never when the auth object identity changes on unrelated re-renders.
  React.useEffect(() => {
    void refreshClaims()
  }, [refreshClaims, auth.isLoaded, auth.isSignedIn])

  async function selfClaim(ownerType: string, ownerId: string): Promise<{ ok: boolean; error?: string }> {
    const a = authRef.current
    if (!a.isLoaded || !a.isSignedIn) return { ok: false, error: 'not signed in' }
    try {
      const tok = await a.getToken()
      if (!tok) return { ok: false, error: 'no token' }
      const res = await fetch(`${apiUrl}/v1/owner-claims`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ owner_type: ownerType, owner_id: ownerId }),
      })
      if (!res.ok) {
        const t = await res.text()
        return { ok: false, error: `HTTP ${res.status}: ${t.slice(0, 120)}` }
      }
      await refreshClaims()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  // OAuth code-exchange indicator (same pattern as /abs-test).
  const [returningFromOAuth, setReturningFromOAuth] = React.useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('code'),
  )
  React.useEffect(() => {
    if (!returningFromOAuth) return
    if (auth.isSignedIn) { setReturningFromOAuth(false); return }
    const t = window.setTimeout(() => setReturningFromOAuth(false), 20_000)
    return () => window.clearTimeout(t)
  }, [returningFromOAuth, auth.isSignedIn])
  const showSigningIn = returningFromOAuth && !auth.isSignedIn

  async function callService(
    slug:      string,
    version:   string,
    action:    string,
    args:      Record<string, unknown>,
    needsAuth: boolean,
  ) {
    const key = `${slug}:${version}:${action}`
    setResults(r => ({ ...r, [key]: { loading: true } }))
    try {
      const url  = `${apiUrl}/v1/prop/service/${slug}/${version}/call`
      const body = JSON.stringify({ action, args })
      const headers: Record<string, string> = {
        'Content-Type':                    'application/json',
        'X-Headlo-Prop-Publishable-Key':   pk,
        'X-Headlo-Service':                `${slug}:${version}`,
      }
      if (needsAuth && auth.isLoaded && auth.isSignedIn) {
        const token = await auth.getToken()
        if (token) headers['Authorization'] = `Bearer ${token}`
      }
      const res = await fetch(url, { method: 'POST', headers, body })
      const status = res.status
      const text = await res.text()
      let responseBody: unknown
      try { responseBody = JSON.parse(text) } catch { responseBody = text }
      setResults(r => ({ ...r, [key]: { status, body: responseBody } }))
    } catch (e) {
      setResults(r => ({ ...r, [key]: { error: (e as Error).message ?? String(e) } }))
    }
  }

  return (
    <div style={st.page}>
      <div style={st.inner}>
        {showSigningIn && (
          <div style={st.signingInBanner}>
            <span style={st.signingInSpinner} />
            <span>Signing you in…</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#666' }}>
              Exchanging OAuth code for a DPoP-bound token
            </span>
          </div>
        )}

        <h1 style={st.h1}>Services debug</h1>
        <p style={st.sub}>
          Contract-driven harness. Each service section is fetched from{' '}
          <code>GET /v1/prop/service/:slug/:version</code>; every action, arg
          name, and arg type is read from the contract — nothing here is
          hardcoded. Actions marked <code>"server": true</code> attach a
          Bearer JWT from HeadloProviderV2 when signed in.
        </p>

        {/* Auth affordance */}
        <div style={{ ...st.section, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={st.label}>Auth</span>
          <span style={st.chipDim}>
            {!auth.isLoaded ? 'loading' : auth.isSignedIn ? 'signed in' : 'signed out (anon)'}
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <SignedOut>
              <SignInButton style={st.btn}>Sign in</SignInButton>
            </SignedOut>
            <SignedIn>
              <SignOutButton style={{ ...st.btn, background: '#fff', color: '#1C1A17', border: '1px solid #1C1A17' }}>Sign out</SignOutButton>
            </SignedIn>
          </span>
        </div>

        {/* Publishable key (shared across all debug pages) */}
        <div style={st.section}>
          <div style={st.row}>
            <span style={st.label}>Publishable key</span>
            <input
              style={st.input}
              value={pk}
              onChange={e => setPk(e.target.value)}
              placeholder="pk_live_..."
            />
            <span style={st.pkChip}>source: {pkSource}</span>
          </div>
        </div>

        {/* Owner-claim panel — controls what shows up in the dropdown on
            ownerViaClaim actions. Always visible when signed in so the flow
            for "I want to act as shop:briarknits" is discoverable. */}
        {auth.isSignedIn && (
          <OwnerClaimsPanel
            claims={claims}
            loaded={claimsLoaded}
            onSelfClaim={selfClaim}
          />
        )}

        {SERVICES.map(s => (
          <ServiceCard
            key={`${s.slug}:${s.version}`}
            slug={s.slug}
            version={s.version}
            pk={pk}
            apiUrl={apiUrl}
            mySub={mySub}
            claims={claims}
            drafts={drafts}
            setDrafts={setDrafts}
            results={results}
            onCall={callService}
          />
        ))}

        <p style={st.sub}>
          <strong>Testing tips.</strong> Stripe test-mode: use <code>sk_test_...</code> in each service install +
          card <code>4242 4242 4242 4242</code>. Exercise the webhook locally with the Stripe CLI:
          <br />
          <code>stripe listen --forward-to localhost:8787/v1/prop-services/headlo-credits/webhook</code>
        </p>
      </div>
    </div>
  )
}

type Claim = { claim_id: string; owner_type: string; owner_id: string; granted_at: string; granted_by: string }

function ServiceCard({
  slug, version, pk, apiUrl, mySub, claims, drafts, setDrafts, results, onCall,
}: {
  slug:      string
  version:   string
  pk:        string
  apiUrl:    string
  mySub:     string | null
  claims:    Claim[]
  drafts:    ArgDrafts
  setDrafts: React.Dispatch<React.SetStateAction<ArgDrafts>>
  results:   Record<string, Panel>
  onCall:    (slug: string, version: string, action: string, args: Record<string, unknown>, needsAuth: boolean) => void
}) {
  const [res, setRes] = React.useState<FetchResult | null>(null)

  React.useEffect(() => {
    if (!pk) { setRes(null); return }
    let cancelled = false
    fetchServiceContract(apiUrl, pk, slug, version).then(r => {
      if (!cancelled) setRes(r)
    })
    return () => { cancelled = true }
  }, [apiUrl, pk, slug, version])

  // Rules-of-Hooks: every hook MUST run in the same order on every render,
  // so this memo has to be above any early return. Compute over the actions
  // array once we have it; empty array when we don't.
  const actions = res?.ok ? (res.meta.def.contract.actions ?? []) : []
  const sharedArgNames = React.useMemo(() => {
    const counts = new Map<string, number>()
    for (const a of actions) {
      for (const name of Object.keys(a.args ?? {})) {
        counts.set(name, (counts.get(name) ?? 0) + 1)
      }
    }
    const out = new Set<string>()
    for (const [name, n] of counts) if (n >= 2) out.add(name)
    return out
  }, [actions])

  if (!res) {
    return (
      <div style={st.section}>
        <h2 style={st.h2}>{slug}:{version}</h2>
        <p style={st.h2Sub}>{pk ? 'Loading contract…' : 'Enter a publishable key above to load the contract.'}</p>
      </div>
    )
  }
  if (!res.ok) {
    return (
      <div style={st.section}>
        <h2 style={st.h2}>{slug}:{version}</h2>
        <div style={{ ...st.result, ...st.err }}>Contract fetch failed — {res.error}</div>
      </div>
    )
  }

  const meta = res.meta

  return (
    <div style={st.section}>
      <h2 style={st.h2}>{meta.def.name} <span style={st.chipDim}>{slug}:{version}</span></h2>
      <p style={st.h2Sub}>{meta.def.contract.description ?? ''}</p>
      {actions.length === 0 && <p style={st.actionDesc}>No actions declared on this contract.</p>}
      {actions.map(a => (
        <ActionCard
          key={a.name}
          slug={slug}
          version={version}
          action={a}
          sharedArgNames={sharedArgNames}
          mySub={mySub}
          claims={claims}
          drafts={drafts}
          setDrafts={setDrafts}
          result={results[`${slug}:${version}:${a.name}`]}
          onCall={onCall}
        />
      ))}
    </div>
  )
}

// Arg names commonly identifying the current user. When one of these
// appears + user is signed in + input is empty, show a "use my sub" quick-
// fill button. Kept as a small allowlist so we don't accidentally overwrite
// unrelated string args.
const AUTH_ID_ARG_NAMES = new Set(['ownerId', 'userId', 'sub', 'buyerId', 'contributorId'])

function ActionCard({
  slug, version, action, sharedArgNames, mySub, claims, drafts, setDrafts, result, onCall,
}: {
  slug:           string
  version:        string
  action:         ContractAction
  sharedArgNames: Set<string>
  mySub:          string | null
  claims:         Claim[]
  drafts:         ArgDrafts
  setDrafts:      React.Dispatch<React.SetStateAction<ArgDrafts>>
  result?:        Panel
  onCall:         (slug: string, version: string, action: string, args: Record<string, unknown>, needsAuth: boolean) => void
}) {
  const argEntries = Object.entries(action.args ?? {})
  // Auth marker is contract-declared per action. buyerScoped hides ownerId
  // entirely (server injects). ownerViaClaim replaces the free-text input
  // with a dropdown populated from platform.owner_claim (server verifies).
  const isBuyerScoped   = action.buyerScoped   === true
  const isOwnerViaClaim = action.ownerViaClaim === true
  const isServerOnly    = action.server        === true
  const isAnon          = action.anon          === true
  const isPublicRead    = action.publicRead    === true
  // Any of the auth markers except plain-server needs the caller to be
  // signed in. server-marked actions need an agency JWT (still Bearer).
  const needsAuth  = isServerOnly || isBuyerScoped || isOwnerViaClaim
  // Args that appear in ≥2 actions share a draft — filling ownerId in one
  // action fills it everywhere. Args appearing only in this action stay
  // scoped to this action.
  const draftKey   = (name: string) =>
    sharedArgNames.has(name)
      ? `${slug}:${version}:*:${name}`
      : `${slug}:${version}:${action.name}:${name}`

  // Coerce every arg to see whether the submit is blocked.
  const parsed = argEntries.map(([name, expr]) => {
    const t   = parseArgType(expr)
    const raw = drafts[draftKey(name)] ?? ''
    const c   = coerceArg(raw, t)
    return { name, expr, t, raw, ...c }
  })
  const anyRequiredMissing = parsed.some(p => p.error === 'required')
  const anyInvalid         = parsed.some(p => p.error && p.error !== 'required')
  const canSubmit          = !anyRequiredMissing && !anyInvalid

  function submit() {
    const args: Record<string, unknown> = {}
    for (const p of parsed) {
      if (p.value !== undefined) args[p.name] = p.value
    }
    onCall(slug, version, action.name, args, needsAuth)
  }

  // Which auth chip to show. Kept as one badge per action so the header
  // doesn't turn into a chip fruit-salad.
  const authChip =
      isServerOnly    ? { text: 'server · agency JWT', color: 'chipServ' as const }
    : isOwnerViaClaim ? { text: 'owner via claim',    color: 'chipServ' as const }
    : isBuyerScoped   ? { text: 'buyer scoped',        color: 'chipServ' as const }
    : isPublicRead    ? { text: 'public read',         color: 'chipDim'  as const }
    : isAnon          ? { text: 'anon',                color: 'chipDim'  as const }
    :                   null

  return (
    <>
      <div style={st.actionH}>
        <span>{action.name}</span>
        {authChip && <span style={st[authChip.color]}>{authChip.text}</span>}
      </div>
      {action.description && <div style={st.actionDesc}>{action.description}</div>}

      {argEntries.map(([name, expr]) => {
        const t   = parseArgType(expr)
        const key = draftKey(name)
        const val = drafts[key] ?? ''
        const p   = parsed.find(x => x.name === name)!
        const isMultiline = t.array || t.base === 'object' || t.base === 'json'
        const isShared    = sharedArgNames.has(name)
        const canUseSub   = AUTH_ID_ARG_NAMES.has(name) && !!mySub && !isOwnerViaClaim
        const canRandomize = /idempotency|nonce/i.test(name)

        // buyerScoped: server injects ownerId/email — hide these entirely
        // to signal the caller can't influence them.
        if (isBuyerScoped && (name === 'ownerId' || name === 'email')) return null

        // ownerViaClaim + ownerId: swap free-text input for a dropdown
        // populated from the caller's active claims. Free-text fallback
        // still available when the caller has zero claims yet (so they can
        // debug the 403 path).
        if (isOwnerViaClaim && name === 'ownerId') {
          return (
            <div key={name} style={st.row}>
              <span style={st.label}>{name}</span>
              {claims.length > 0 ? (
                <select
                  style={st.input}
                  value={val}
                  onChange={e => setDrafts(d => ({ ...d, [key]: e.target.value }))}
                >
                  <option value="">(choose a claim)</option>
                  {claims.map(c => (
                    <option key={c.claim_id} value={c.owner_id}>
                      {c.owner_type}:{c.owner_id} ({c.granted_by})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  style={st.input}
                  type="text"
                  value={val}
                  onChange={e => setDrafts(d => ({ ...d, [key]: e.target.value }))}
                  placeholder="No claims yet — self-claim above to add one"
                />
              )}
              <span style={st.chipServ}>{expr}</span>
              <span style={st.chipServ} title="Server checks platform.owner_claim before dispatching.">claim-gated</span>
            </div>
          )
        }

        return (
          <div key={name} style={st.row}>
            <span style={st.label}>{name}</span>
            {t.base === 'boolean' ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={val === 'true'}
                  onChange={e => setDrafts(d => ({ ...d, [key]: e.target.checked ? 'true' : 'false' }))}
                />
                <span style={{ color: '#8C8680' }}>{val === 'true' ? 'true' : 'false'}</span>
              </label>
            ) : isMultiline ? (
              <textarea
                style={st.textarea}
                rows={3}
                value={val}
                onChange={e => setDrafts(d => ({ ...d, [key]: e.target.value }))}
                placeholder={expr}
              />
            ) : (
              <input
                style={st.input}
                type={t.base === 'number' ? 'number' : 'text'}
                value={val}
                onChange={e => setDrafts(d => ({ ...d, [key]: e.target.value }))}
                placeholder={expr}
              />
            )}
            {canUseSub && (
              <button
                type="button"
                style={st.btnSm}
                title={`Fill with your signed-in sub: ${mySub}`}
                onClick={() => setDrafts(d => ({ ...d, [key]: mySub! }))}
              >use my sub</button>
            )}
            {canRandomize && (
              <button
                type="button"
                style={st.btnSm}
                title="Generate a fresh random key"
                onClick={() => setDrafts(d => ({ ...d, [key]: `debug-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` }))}
              >randomize</button>
            )}
            <span style={t.optional ? st.chipOpt : st.chipServ}>{expr}</span>
            {isShared && <span style={st.chipDim} title="Filled once — shared across every action on this service.">shared</span>}
            {p.error && p.error !== 'required' && (
              <span style={{ fontSize: 10, color: '#b91c1c' }}>{p.error}</span>
            )}
          </div>
        )
      })}

      <button
        style={canSubmit ? st.btn : st.btnDis}
        disabled={!canSubmit}
        onClick={submit}
        title={
            anyRequiredMissing ? `Fill in required args: ${parsed.filter(p => p.error === 'required').map(p => p.name).join(', ')}`
          : anyInvalid         ? 'Fix arg parse errors before calling'
          :                      undefined
        }
      >
        Call
      </button>
      <ResultPanel r={result} />
    </>
  )
}

// Auto-detect URL-shaped fields in the response body and render them as
// clickable links. Covers every action that returns *Url (onboardingUrl,
// redirectUrl, url, loginUrl, checkoutUrl, ...) without per-action wiring.
function ResultPanel({ r }: { r?: Panel }) {
  if (!r) return null
  if (r.loading) return <div style={st.result}>Calling…</div>
  const isErr = r.error || (typeof r.status === 'number' && r.status >= 400)
  const urls  = extractUrls(r.body)
  return (
    <>
      <div style={{ ...st.result, ...(isErr ? st.err : {}) }}>
        {r.error
          ? `ERROR ${r.error}`
          : `HTTP ${r.status ?? '?'}\n${typeof r.body === 'string' ? r.body : JSON.stringify(r.body, null, 2)}`}
      </div>
      {urls.map(u => (
        <div key={u.key} style={{ marginTop: 6 }}>
          <a href={u.value} target="_blank" rel="noreferrer" style={st.link}>→ open {u.key}</a>
        </div>
      ))}
    </>
  )
}

function extractUrls(body: unknown): Array<{ key: string; value: string }> {
  if (!body || typeof body !== 'object') return []
  const out: Array<{ key: string; value: string }> = []
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (typeof v !== 'string') continue
    const looksLikeUrl = /^https?:\/\//.test(v)
    const named       = /url$/i.test(k) || k === 'url'
    if (looksLikeUrl && named) out.push({ key: k, value: v })
  }
  return out
}

// Panel above the service cards — lists current owner claims + lets the
// caller self-claim new (type, id) tuples. Populates the dropdown that
// appears on any ownerViaClaim action's ownerId slot.
function OwnerClaimsPanel({
  claims, loaded, onSelfClaim,
}: {
  claims: Claim[]
  loaded: boolean
  onSelfClaim: (ownerType: string, ownerId: string) => Promise<{ ok: boolean; error?: string }>
}) {
  const [ownerType, setOwnerType] = React.useState('contributor')
  const [ownerId,   setOwnerId]   = React.useState('')
  const [msg,       setMsg]       = React.useState<string | null>(null)
  const [busy,      setBusy]      = React.useState(false)

  async function submit() {
    if (!ownerType || !ownerId) return
    setBusy(true); setMsg(null)
    const r = await onSelfClaim(ownerType.trim(), ownerId.trim())
    setBusy(false)
    if (r.ok) { setMsg(`Claimed ${ownerType}:${ownerId}`); setOwnerId('') }
    else      { setMsg(r.error ?? 'failed') }
  }

  return (
    <div style={st.section}>
      <h2 style={st.h2}>Owner claims <span style={st.chipDim}>platform.owner_claim</span></h2>
      <p style={st.h2Sub}>
        Any action marked <code>ownerViaClaim</code> checks these before dispatching.
        Self-claim below to add one; first-come first-served per (type, id).
      </p>

      {!loaded ? (
        <p style={st.actionDesc}>Loading…</p>
      ) : claims.length === 0 ? (
        <p style={st.actionDesc}>No active claims. Self-claim one below to unlock <code>ownerViaClaim</code> actions.</p>
      ) : (
        <div style={{ marginBottom: 12 }}>
          {claims.map(c => (
            <div key={c.claim_id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, padding: '3px 0' }}>
              <code style={{ fontFamily: 'var(--font-mono, ui-monospace)', color: '#1C1A17' }}>{c.owner_type}:{c.owner_id}</code>
              <span style={st.chipDim}>{c.granted_by}</span>
              <span style={{ color: '#8C8680', fontSize: 10 }}>{c.granted_at}</span>
            </div>
          ))}
        </div>
      )}

      <div style={st.row}>
        <span style={st.label}>owner_type</span>
        <input
          style={st.input}
          value={ownerType}
          onChange={e => setOwnerType(e.target.value)}
          placeholder="shop | contributor | venue | affiliate"
        />
      </div>
      <div style={st.row}>
        <span style={st.label}>owner_id</span>
        <input
          style={st.input}
          value={ownerId}
          onChange={e => setOwnerId(e.target.value)}
          placeholder="briarknits | phil | acme_venue"
        />
        <button style={busy || !ownerId ? st.btnDis : st.btn} disabled={busy || !ownerId} onClick={submit}>
          {busy ? 'Claiming…' : 'Self-claim'}
        </button>
      </div>
      {msg && <div style={{ fontSize: 11, color: msg.startsWith('Claimed') ? '#166534' : '#b91c1c', marginTop: 4 }}>{msg}</div>}
    </div>
  )
}
