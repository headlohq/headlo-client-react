# headlo-client-react

Example React app showing how to integrate the [headlo-react](https://github.com/headlohq/headlo-react) and [headlo-auth](https://github.com/headlohq/headlo-auth) SDKs.

## What it shows

- Wrapping your app in `<HeadloProvider>` (v1, cookie-based) for authentication — see [`src/App.tsx`](src/App.tsx)
- Wrapping with **`<HeadloProviderV2>` (v2, DPoP-anchored, cookie-less)** for the ABS auth flow — see [`src/AbsTestPage.tsx`](src/AbsTestPage.tsx) at route `/abs-test`
- Wrapping with `<SiteProvider>` so CMS hooks (`useHeadloClient`, `useCollection`, `useCmsComponents`) pick up anonKey + apiUrl automatically
- Wrapping with `<PropServer>` to connect your publishable key and API URL
- Using `<PropPreload>` to pre-fetch the component runtime and eliminate first-render flicker
- Rendering `<AuthCard>` and `<PropCard>` in your React tree
- Loading and rendering CMS components with `useCmsComponents` — see [`src/CmsComponentsDemo.tsx`](src/CmsComponentsDemo.tsx)
- Setting `window.__headlo_config` so drop-in custom elements (`<headlo-auth-button>`,
  `<headlo-ask-widget>`, etc.) pick up the same publishable key + API URL without extra wiring
- **`HeadloProviderV2` end-to-end diagnostic surface** at `/abs-test` — sign in/out, live persistent log viewer, storage inspector, token payload decoder. Useful for verifying DPoP flow on your own devices.
- **WebCrypto capability regression check** at `/abs-spike` — 7-test verification that `extractable: false` + IndexedDB + ECDSA P-256 work in the current browser. Run this on any new browser/OS before committing to `HeadloProviderV2`.

## Setup

```bash
npm install
```

Create a `.env` file at the project root:

```
VITE_HEADLO_AUTH_ISSUER=https://auth.headlo.com
VITE_HEADLO_PUBLISHABLE_KEY=pk_live_...
VITE_HEADLO_API_URL=https://api.headlo.com
VITE_HEADLO_ANON_KEY=pk_anon_...   # only needed for CMS data / components (Option A below)
```

### Two keys, two purposes — don't mix them up

Two publishable-style keys ship in the bundle. They look similar, come from
different tables, and are enforced by different code paths. Copying one into
the other's slot fails silently with `401` at request time.

| Env var | Prefix | Where it lives | Where to get it in the dashboard | What it authorizes |
|---|---|---|---|---|
| `VITE_HEADLO_PUBLISHABLE_KEY` | `pk_live_` | `prop_server.api_key` | **Settings → Application → Generate key** at https://www.headlo.com/dashboard/settings. Enter a name + allowed origins, click *Generate key*. **Value is shown once — copy immediately.** | PROP custom elements + OAuth `client_id` (`<HeadloProvider>`, `<PropServer>`, `<headlo-auth-button>`) |
| `VITE_HEADLO_ANON_KEY` | `pk_anon_` | `platform.site.anon_key` | **Settings → Sites** at https://www.headlo.com/dashboard/sites → pick your site → *Anon key* row → copy button. Always visible, no regeneration needed. | CMS reads via `x-headlo-key` header (`useHeadloClient`, `useCollection`, `useCmsComponents`) |

**Generating a `pk_live_*` key** — one form on https://www.headlo.com/dashboard/settings
under *Application*:
1. **Key name** — a label for you (e.g. `Production`, `Staging`). Not sent anywhere.
2. **Allowed origins** — comma-separated list. Every origin that will embed a
   PROP component OR receive an OAuth redirect for this key must be listed
   here. Missing an origin = `401` / `INVALID_HOST` at runtime.
3. Click **Generate key** → the value appears once in a "Copy your publishable
   key now — it won't be shown again" reveal. Paste it into your `.env` file
   immediately. After dismissing the reveal, only the name + origins + created-at
   remain in the dashboard; the key itself is unrecoverable.

**One key per role.** A `pk_live_*` in the `ANON_KEY` slot returns `401
UNAUTHORIZED` from `/v1/components` because the worker looks up
`platform.site` by `anon_key`, not `prop_server.api_key`. A `pk_anon_*` in
the `PUBLISHABLE_KEY` slot fails PROP embed origin checks for the same
inverse reason. Both keys are safe to commit — each is domain-locked via
`allowed_origins` on its owning row, so lifting a value out of the bundle
gets an attacker nothing usable from any other domain.

**Any site's anon key works** — the demo will render whichever agency's
components the key resolves to. If you own multiple sites, pick the one
whose components you want the demo to show.

## Dev server

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Runtime config for PROP custom elements

React components read `VITE_HEADLO_*` env vars directly. But custom-element
bundles served from PROP (`<headlo-auth-button>`, `<headlo-ask-widget>`) run in
their own IIFE and can't reach `import.meta.env` — they read `window.__headlo_config`.

`src/main.tsx` sets it once at startup:

```ts
;(window as any).__headlo_config = {
  prop_key:    import.meta.env.VITE_HEADLO_PUBLISHABLE_KEY,
  api_url:     import.meta.env.VITE_HEADLO_API_URL,
  auth_issuer: import.meta.env.VITE_HEADLO_AUTH_ISSUER,
}
```

Every PROP bundle on the page picks these up automatically. Individual attributes
on the tag (e.g. `<headlo-auth-button auth-issuer="..." return-url="...">`)
override the config values for that tag.

**Legacy flat globals** — `window.__headlo_prop_key`, `__headlo_api_url`,
`__headlo_auth_issuer` — are still mirrored for bundles compiled before the
config-object migration. New code should read from `__headlo_config`.

## Deploying to a new domain — Google auth checklist

Three independent gates. Miss any and Google sign-in fails on the new domain.

### 1. Google Cloud Console — Authorized redirect URIs

Google redirects to the WORKER's callback, never to your app's URL. **Add once per auth issuer, not per client site.** If your app already points at an auth issuer that's registered with Google, skip this step.

Google Cloud Console → Credentials → your OAuth client → **Authorized redirect URIs** → add:
```
https://<your-auth-issuer>/oauth/google/callback
```

For `VITE_HEADLO_AUTH_ISSUER=https://auth.headlo.com`, add `https://auth.headlo.com/oauth/google/callback`.

**"Authorized JavaScript origins" is a red herring for this flow** — only Google's client-side Sign-In library uses that field. The server-side OAuth flow the SDK uses ignores it.

### 2. `.env.production` — `VITE_HEADLO_AUTH_ISSUER`

Point the client at the auth issuer whose callback URL Google trusts:

```
VITE_HEADLO_AUTH_ISSUER=https://auth.headlo.com
```

**If you use Cloudflare Pages with git auto-deploys**, also set this in the Pages dashboard → Settings → Environment variables (Production scope). CF-side builds ignore your local `.env.production` — only your manual `npm run deploy` reads it.

### 3. `prop_server.api_key.allowed_origins` — publishable key origin allowlist

The `pk_live_*` key is safe to expose in your JS bundle (Stripe-style) BECAUSE it's domain-locked. New deploy URL must be added to the key's allowlist, or the OAuth `authorize` request is rejected with `INVALID_HOST` / `ORIGIN_NOT_ALLOWED`.

```sql
UPDATE prop_server.api_key
SET allowed_origins = array_append(allowed_origins, 'https://my-new-domain.com')
WHERE publishable_key = 'pk_live_...'
  AND NOT ('https://my-new-domain.com' = ANY(allowed_origins));
```

**Verify:**
```sql
SELECT publishable_key, allowed_origins
FROM prop_server.api_key
WHERE publishable_key = 'pk_live_...';
```

Same list gates both PROP component requests (`X-Headlo-Prop-Publishable-Key` header) AND OAuth redirect_uri validation. One row, two enforcement points. No worker restart needed — read per-request.

### Symptom → cause

| Error you see | Which gate is broken | Fix |
|---|---|---|
| Google URL shows `error=redirect_uri_mismatch` before user picks account | #1 — Google redirect URI not registered | Google Cloud Console → Authorized redirect URIs |
| Landing back on your app → `INVALID_HOST` / `ORIGIN_NOT_ALLOWED` / redirect blocked | #3 — domain not in `allowed_origins` | Run the UPDATE SQL above |
| `/oauth/authorize` returns 404 or wrong worker response | #2 — `VITE_HEADLO_AUTH_ISSUER` points at wrong host | Fix `.env.production` (and CF Pages env vars if git-deploying) |
| Sign-in completes but session doesn't stick — you're bounced back to sign-in | Cookie SameSite/Secure mismatch (HTTP vs HTTPS) | Deploy over HTTPS; worker sets `SameSite=None; Secure` for cross-site |
| Works locally, breaks only in prod | Any of #1-#3 has the local URL but not the prod URL | Compare local + prod values across all three gates |

**Also for Clerk** (the `/clerk/*` demo routes) — Clerk has its own domain allowlist independent of the three above. If Clerk shows "Invalid host" or infinite redirects, that's Clerk dashboard → Configure → Domains / Restrictions → add your new origin.

### Sanity checks

- Test in an **incognito window** — bypasses stale cookies from prior failed attempts (browsers cache `INVALID_HOST` rejections)
- **Watch the URL bar** during the flow — `error=` params on any redirect tell you exactly which gate rejected
- **Watch the Network tab** for the `/oauth/token` request — 400 there usually means the code was minted but exchanged against the wrong auth issuer

## Provider setup

`headlo-react` hooks read config (anon key, api URL, auth issuer) from context.
The full wrapping tree lives in [`src/App.tsx`](src/App.tsx) — the layers are
independent, mix and match based on what your app actually needs:

```tsx
<HeadloProvider publishableKey={...} issuer={...}>       {/* auth (headlo-auth) — sign in / user state */}
  <SiteProvider anonKey={...} apiUrl={...}>              {/* CMS data + useHeadloClient + useCollection */}
    <PropServer publishableKey={...} url={...}>          {/* PROP custom-element runtime */}
      <PropPreload dist={[...]} components={[...]} />    {/* eliminates first-paint flicker */}
      <YourApp />
    </PropServer>
  </SiteProvider>
</HeadloProvider>
```

Just want to render CMS components? You only need `<SiteProvider>`:

```tsx
import { SiteProvider } from 'headlo-react'

const anonKey = import.meta.env.VITE_HEADLO_ANON_KEY as string
const apiUrl  = import.meta.env.VITE_HEADLO_API_URL  as string | undefined

export default function App() {
  return (
    <SiteProvider anonKey={anonKey} apiUrl={apiUrl}>
      <YourApp />
    </SiteProvider>
  )
}
```

Every hook below (`useHeadloClient`, `useCmsComponents`, `useCollection`, `useRecord`, etc.)
reads from this provider. Skip it and the hooks silently fall back to `undefined` /
`https://api.headlo.com` — safe for prod defaults, wrong for anything else.

---

## HeadloProviderV2 (DPoP, cookie-less) — route `/abs-test`

The `/abs-test` route in this demo uses **`HeadloProviderV2`** (headlo-auth 0.2.0+) instead of `HeadloProvider` v1. Same API surface — different session mechanics under the hood. Purpose: verify that ABS Phase A auth works end-to-end on your target environment (especially iOS Safari on customer domains).

### What's different from v1

| Aspect | v1 (`HeadloProvider`) | v2 (`HeadloProviderV2`) |
|---|---|---|
| Long-lived credential | `HttpOnly` cookie `headlo_refresh` | ECDSA P-256 key in IndexedDB, `extractable: false` |
| Access token storage | React state (memory only) | `sessionStorage` (per-tab, survives page reload) |
| Silent refresh | `POST /oauth/refresh` (cookie-based) | `POST /oauth/token/refresh-dpop` (DPoP-based) |
| New tab / browser restart | Cookie shared across tabs → auto-signed-in | `POST /oauth/dpop/mint` resurrects session from IndexedDB key |
| Works on iOS Safari on customer bare domain | ✗ (ITP blocks refresh cookie) | ✓ (no cookies at all) |
| Works on Firefox strict / Brave-Aggressive | ✗ | ✓ |
| Same React API (`<SignedIn>`, `useUser`, etc.) | ✓ | ✓ |

### How the /abs-test route is wired

```tsx
// src/App.tsx — /abs-test bypasses the root <HeadloProvider> v1
if (path.startsWith('/abs-test')) return <AbsTestPage />
```

```tsx
// src/AbsTestPage.tsx — has its own HeadloProviderV2 tree
import { HeadloProviderV2, useAuth, useUser, SignedIn, SignedOut, SignInButton, SignOutButton } from 'headlo-auth'

export default function AbsTestPage() {
  return (
    <HeadloProviderV2 publishableKey={publishableKey} issuer={authIssuer}>
      <AbsTestPageInner />
    </HeadloProviderV2>
  )
}

function AbsTestPageInner() {
  const { isLoaded, isSignedIn } = useAuth()
  const user = useUser()
  // ... standard React auth UI + diagnostic panels
}
```

### What the page includes for debugging

- **Auth state card** — shows `isLoaded`, `isSignedIn`, `user.id`, `user.email`, `user.displayName` live
- **Access token inspector** — click "Inspect" to decode + display the JWT payload; look for `cnf.jkt` (DPoP binding) and `azp` (client-id binding)
- **Storage inspection** — shows what's in `sessionStorage` / `localStorage` / `IndexedDB` for the auth keys, plus checks that no refresh cookie is present (v2 shouldn't have one)
- **Persistent log viewer** — captures all `[headlo-auth-v2]` events across page reloads (writes to localStorage). Copy button dumps the log to clipboard for sharing.
- **Clear all local storage + reload** — nukes sessionStorage / localStorage / IndexedDB to simulate a fresh visitor

### Recommended test flow for a new deployment

1. Deploy your app to your target domain
2. Open `<your-domain>/abs-test` on **iPhone Safari** (or your primary target browser)
3. Click "Sign in with Headlo (v2)" — completes PKCE flow, redirects back
4. Verify auth state shows signed-in with user info populated
5. Click "Inspect" on the access token card — confirm `cnf.jkt` and `azp` claims present
6. Reload the tab — session should persist via silent refresh
7. Navigate away (e.g. type `<your-domain>/` in address bar) and back to `/abs-test` — session persists
8. Close the tab, open a new tab to `/abs-test` — session resurrects via `/oauth/dpop/mint`
9. Click "Sign out" — session cleared, DPoP key deleted, next mount shows signed-out
10. Copy the persistent log at any point to share diagnostic output

If any step doesn't behave as expected, the persistent log + storage inspector give you enough info to file a targeted bug report.

## WebCrypto capability check — route `/abs-spike`

A separate diagnostic page that verifies the WebCrypto primitives ABS depends on actually work in the current browser. **Run this once on any new target browser before committing to v2.** Zero auth surface — just tests browser APIs.

7 tests:
1. Generate ECDSA P-256 key with `extractable: false`
2. `exportKey('jwk', privateKey)` throws (extractable enforced)
3. `exportKey('jwk', publicKey)` succeeds (needed for JWK to server)
4. DPoP-style JWT sign + verify roundtrip
5. IndexedDB stores + retrieves `CryptoKeyPair`
6. Retrieved key preserves `extractable: false`
7. Performance: 100 signs, target < 10ms per sign

Verdict banner at the top says "ABS spike PASSED" or "FAILED" clearly. If any test fails, ABS v2 is not viable in that browser.

**Already verified passing on:** Chrome desktop, Safari desktop, Safari iOS, Firefox desktop.

---

## Using CMS components on your site

Two independent paths depending on whether you're building a React app or dropping
a component onto a plain HTML page. Same components either way — they differ in
auth model, delivery mechanism, and what data you need from the Headlo dashboard.

### Option A — React app with `useCmsComponents` (anon key)

For any app that already uses `headlo-react`. One hook loads the entire agency's
component registry; each entry ships with a compiled `.Component` React function
ready to render inline. See [`src/CmsComponentsDemo.tsx`](src/CmsComponentsDemo.tsx)
for a runnable example (route: `/demo/cms-components`).

```tsx
import { useHeadloClient, useCmsComponents } from 'headlo-react'

function Calculator() {
  // useHeadloClient reads anonKey + apiUrl from SiteProvider context and
  // returns a memoized HeadloClient. Same as `createClient(anonKey, { apiUrl })`
  // without the boilerplate.
  const client = useHeadloClient()
  const { entries, loading, error } = useCmsComponents(client)

  if (loading) return <div>Loading…</div>
  if (error)   return <div>{error}</div>

  const calc = entries.find(e => e.component_id === 'calculator')
  if (!calc) return null

  return (
    <calc.Component
      records={[{ collection_record_id: 'x', ...(calc.sampleData ?? {}) }]}
      options={calc.templateOptions ?? {}}
    />
  )
}
```

- **Endpoint:** `GET /v1/components` with `x-headlo-key: <anon>` header
- **Returns:** every component in the anon key's agency (not filtered by `public`)
- **Public checkbox NOT required** — the anon key is the auth boundary. Only share
  it with sites you own.
- **Compile happens in the browser** via Sucrase — you get real React components
  in your tree, error boundaries work, hot reload works, everything React expects.

### Option B — Plain HTML with `<script>` embed (public flag)

For any HTML page anywhere on the internet. No SDK, no build step, no anon key —
just paste the snippet the dashboard gives you at
`/dashboard/cms/components/<id>` (developer mode → Public embed toggle → Get embed
code).

```html
<div id="calculator-root"></div>
<script
  src="https://api.headlo.com/v1/component/calculator/embed.js"
  data-mount-id="calculator-root"
></script>
```

- **Endpoint:** `GET /v1/component/:id/embed.js` — no auth header
- **Requires `public = true`** on the component row — check "Public embed" in the
  editor. Any component without the flag returns 403.
- **Compile happens on the worker**; the script tag mounts a self-contained bundle
  into `#<mount-id>`. React lives inside the bundle, no version conflict with
  your host page.

### Which one to pick

| You have… | Use |
|---|---|
| A React app you already own | Option A (`useCmsComponents`) |
| A CMS/blog/landing page with just HTML | Option B (`<script>` embed) |
| Multiple components on one page | Option A (one fetch loads all) |
| One component to drop on a third-party site you don't fully control | Option B (works anywhere) |
| Want to render the same component with different data per instance | Either — Option A gives you React props, Option B via `data-*` attrs |
| Want components hidden from public traffic | Option A only (Option B requires `public = true`) |

## Related

- [headlo-react](https://github.com/headlohq/headlo-react) — React SDK
- [headlo-auth](https://github.com/headlohq/headlo-auth) — Auth SDK
- [Headlo](https://headlo.com) — affiliate-powered sales channels
