# Headlo React SDK

React hooks for [Headlo](https://www.headlo.com). Requires `headlo`.

## Install

```bash
npm install headlo headlo-react
```

---

## Authentication

Headlo supports user-scoped queries — records owned by the currently logged-in visitor. There are two ways to provide a JWT token.

### Option A — `HeadloAuthProvider` (recommended)

Wrap your app (or the subtree that needs auth) with `HeadloAuthProvider`. Every `useCollection` and `useRecord` call inside it will automatically pick up the token without you passing `getToken` to each hook.

```tsx
import { HeadloAuthProvider } from 'headlo-react'
import { useAuth } from '@clerk/clerk-react' // or any auth provider

function App() {
  const { getToken } = useAuth()

  return (
    <HeadloAuthProvider getToken={() => getToken()}>
      <YourApp />
    </HeadloAuthProvider>
  )
}
```

`getToken` must return `Promise<string | null>`. The provider memoizes it so hooks don't re-run on every render.

### Option B — per-hook `getToken`

Pass `getToken` directly to each hook. Useful when different parts of your app use different auth contexts.

```tsx
const { records } = useCollection('posts', { limit: 10 }, ANON_KEY, undefined, () => myAuth.getToken())
```

If both are present, the explicit prop takes precedence over the context.

---

## useCollection

Fetches a collection and manages pagination state. Returns navigation functions so you never touch the cursor directly.

```tsx
import { useCollection } from 'headlo-react'

function Blog() {
  const [pageSize, setPageSize] = useState(10)

  const {
    records,
    count,
    loading,
    error,
    goNext,
    goPrev,
    currentPage,
    totalPages,
  } = useCollection('posts', { limit: pageSize }, ANON_KEY)

  if (loading) return <p>Loading...</p>
  if (error)   return <p>Error: {error}</p>

  return (
    <>
      {records.map(r => (
        <div key={r.collection_record_id}>{r.title}</div>
      ))}

      <button onClick={goPrev} disabled={currentPage === 1}>Prev</button>
      <span>Page {currentPage} of {totalPages}</span>
      <button onClick={goNext} disabled={currentPage === totalPages}>Next</button>
    </>
  )
}
```

When wrapped in `HeadloAuthProvider`, the `getToken` param can be omitted — the hook reads it from context automatically.

### Props

| Param | Type | Description |
|---|---|---|
| `collectionId` | `string` | Collection ID |
| `opts` | `ListOptions` | `limit`, `sort`, `dir`, `filter`, `record_ids` |
| `anonKey` | `string` | Your site anon key |
| `getToken` | `() => Promise<string \| null>` | Optional — overrides `HeadloAuthProvider` if both are present |

### Returns

| Key | Type | Description |
|---|---|---|
| `records` | `Record<string, unknown>[]` | Flat records for the current page |
| `count` | `number` | Total matching records |
| `loading` | `boolean` | |
| `error` | `string \| null` | |
| `goNext` | `() => void` | Advance to next page |
| `goPrev` | `() => void` | Go back to previous page |
| `currentPage` | `number` | Current page number (1-based) |
| `totalPages` | `number` | Total pages based on count and limit |

Changing `limit` or any other option automatically resets to page 1.

---

## useList

For when you want to use the `createClient` fluent builder but still get managed pagination. Pass `.pagination()` from the builder and a `{ limit }` option.

```tsx
import { useList } from 'headlo-react'
import { createClient } from 'headlo'

const client = createClient(ANON_KEY)

function Blog() {
  const [pageSize, setPageSize] = useState(10)

  const { records, count, loading, error, goNext, goPrev, currentPage, totalPages } = useList(
    client.collection('posts').sort('created_at', 'desc').pagination(),
    { limit: pageSize },
  )
}
```

`.pagination()` returns a function `(cursor, limit) => Promise<...>` that `useList` calls internally — `limit` and `cursor` are always controlled by the hook. Filter and sort are pre-configured on the builder before calling `.pagination()`.

You can also pass any async function that matches the signature:

```ts
useList(
  async (cursor, limit) => myApi.getPosts({ cursor, limit }),
  { limit: pageSize },
)
```

---

## useRecord

Fetch a single record by ID. Also reads from `HeadloAuthProvider` context when no `getToken` is passed explicitly.

```tsx
import { useRecord } from 'headlo-react'

const { record, loading, error } = useRecord('posts', recordId, ANON_KEY)
```

---

## Routing

Pages in Headlo are the routing mechanism. Each page has a `page_id` that maps to a URL path (`/about`, `/products`, `/checkout/success`). The dashboard resolves which page to render based on the URL.

Every page component receives three routing props automatically:

| Prop | Type | Description |
|---|---|---|
| `query` | `Record<string, string>` | Parsed query string params |
| `path` | `string` | Extra path segments after the page's own path |
| `params` | `string[]` | `path` split by `/` into an array |

### Static routes

A page with `page_id = /about` renders at `/about`. Exact match.

### Dynamic routes — extra path segments

A page with `page_id = /products` catches any URL that starts with `/products/`:

```
/products/detail/abc-123  →  path = "detail/abc-123", params = ["detail", "abc-123"]
/products/checkout/done   →  path = "checkout/done",  params = ["checkout", "done"]
```

```js
function Page({ components, params }) {
  const section = params[0]  // "detail"
  const id      = params[1]  // "abc-123"
}
```

If both `/products` and `/products/detail` exist as pages, the most specific match wins.

### Query string

```
/checkout/success?session_id=cs_test_xxx
```

```js
function Page({ components, query }) {
  const sessionId = query.session_id  // "cs_test_xxx"
}
```

Useful for Stripe's `success_url` — pass `?session_id={CHECKOUT_SESSION_ID}` and Stripe fills it in automatically.

### Stripe checkout example

```js
function Page({ components, query, params }) {
  const status    = params[0]         // "success" or "canceled"
  const sessionId = query.session_id  // Stripe session ID (success only)

  if (status === 'success') return <div>Order confirmed! Session: {sessionId}</div>
  if (status === 'canceled') return <div>Order canceled.</div>
}
```

With success URL: `https://yoursite.com/checkout/success?session_id={CHECKOUT_SESSION_ID}`
And cancel URL: `https://yoursite.com/checkout/canceled`

---

## PROP Components

PROP components are compiled React components published to the Headlo platform. Each has a slug, a public contract (config fields, state fields, actions), and a `react_version` that pins which React major it was built against.

The slug is the identity: it is both the URL path and — for the script tag embed — the HTML tag name. No mapping to learn.

### React version isolation

PROP components **never depend on whatever React the host page or app has installed.** Headlo hosts a separate React bundle for each major version at `/prop/embed/react/:version`. The component always loads and runs against its own pinned React instance via version-scoped globals:

```
window.__headlo_React_19     ← React 19 UMD
window.__headlo_ReactDOM_19  ← ReactDOM 19 UMD
```

These globals are isolated from `window.React` so a host page on React 16 and a PROP component compiled for React 19 coexist on the same page without conflict. Each React bundle is fetched from unpkg once on first use, stored permanently in Headlo's edge KV cache, and served with `Cache-Control: immutable` — zero third-party dependency at runtime after the first load.

The only thing that breaks a compiled component is a change to its injected props contract. React version upgrades never break existing components because breaking changes always produce a new def slug — old slugs keep running on their pinned version forever.

---

### Script tag embed

Drop a PROP component onto any page — no npm install, no bundler, no React setup required. Two script tags: one to load the React bundle for the component's pinned version, one to load the component itself.

```html
<!-- Load Headlo-hosted React 19 (cached forever at the edge) -->
<script src="https://api.headlo.com/prop/embed/react/19"></script>

<!-- Load the component — slug IS the custom element tag name -->
<script src="https://api.headlo.com/prop/embed/component/headlo-auth-signin"></script>

<headlo-auth-signin></headlo-auth-signin>
```

The component script is a self-contained IIFE that:
1. Reads `window.__headlo_React_19` (set by the react script above)
2. Runs the compiled component code
3. Registers it as a custom element via `customElements.define`

If multiple PROP components on the same page share a React version, they share the same already-loaded bundle — only one script tag needed per version.

### useProp — React hook for PROP components

If you're inside a React app, use `useProp`. It does not use the script tag path — it fetches the component definition directly, auto-loads the version-specific React bundle if not already present, and returns a bridge component that renders the PROP component in its own isolated React root:

```tsx
import { useProp } from 'headlo-react'

function AuthBlock() {
  const { Component, def, loading, error } = useProp('headlo-auth-signin')

  if (loading) return null
  if (error || !Component) return null

  return <Component />
}
```

`Component` renders as a `<div>` container in the host React tree, but inside that div the PROP component runs in its own `ReactDOM.createRoot` using the version-specific global. The host app's React version is irrelevant — even if the host is React 16 and the PROP component targets React 19, both run without conflict.

The compiled component function and the bridge wrapper are both cached by JS string, so React never remounts on re-renders.

### useProp — client ID

Pass your client ID to identify your agency. Safe to expose in browser code.

**Get your keys** at [headlo.com/dashboard/settings](https://headlo.com/dashboard/settings) → **PROP Keys**:

| Key | Header | Use |
|---|---|---|
| `cid_xxx` | `X-Headlo-Prop-Client-Id` | Browser — `VITE_HEADLO_PROP_CLIENT_ID` |
| `sk_xxx` | `X-Headlo-Prop-Secret` | Server-side only — no client ID needed alongside it |

Generate a client ID, set your allowed origins, then copy `cid_xxx`.

**Option A — `<PropServer>` provider (recommended)**

Wrap your app once. Every `useProp` call below it picks up the client ID and URL automatically.

```tsx
import { PropServer } from 'headlo-react'

// main.tsx or App.tsx
export default function App() {
  return (
    <PropServer clientId={import.meta.env.VITE_HEADLO_PROP_CLIENT_ID}>
      <MyPage />
    </PropServer>
  )
}

// anywhere inside the tree
function MyPage() {
  const { Component } = useProp('headlo-auth-button')  // client ID comes from context
  return Component ? <Component /> : null
}
```

```bash
# .env.production
VITE_HEADLO_PROP_CLIENT_ID=cid_xxx
```

**Option B — pass per-call**

```ts
// lib/prop.ts
import { createService } from 'headlo'

export const service = createService({
  clientId: import.meta.env.VITE_HEADLO_PROP_CLIENT_ID
})
```

```tsx
import { service } from './lib/prop'

function MyPage() {
  const { Component } = useProp('headlo-auth-button', service)
  return Component ? <Component /> : null
}
```

headlo-worker validates the client ID against the `Origin` header. Requests from domains not in your allowlist are rejected — copying your `cid_xxx` is useless outside your registered domains.

### useProp with a self-hosted prop server

To point at a private `headlo-prop-server`, add `url` to the service config:

```ts
import { createService } from 'headlo'

// Fully private — components and service calls both from your server
const service = createService({
  publishableKey: import.meta.env.VITE_HEADLO_PROP_SERVER_PUBLISHABLE_KEY,
  url:            'https://prop.acme.com'
})

// Hybrid — components from your server, services from Headlo (auth + billing on headlo-worker)
const service = createService({
  publishableKey: import.meta.env.VITE_HEADLO_PROP_SERVER_PUBLISHABLE_KEY,
  url:            'https://prop.acme.com',
  serviceUrl:     'https://api.headlo.com'
})
```

Pass it to `useProp`:

```tsx
const { Component } = useProp('my-component', service)
```

`serviceUrl` determines which server delivers the service client stub. The stub's methods are fetch calls baked with that server's base URL — so whichever server delivers the stub handles every `services.auth.*` and `services.billing.*` call the component makes.

### Script tag embed — URL routing

For script tag embeds the same routing decisions apply, chosen per `<script>` tag:

**Headlo CDN for everything (default):**

```html
<script src="https://api.headlo.com/v1/prop/react/19/bundle"></script>
<script src="https://api.headlo.com/v1/prop/service/headlo-auth/v1/bundle"></script>
<script src="https://api.headlo.com/v1/prop/component/headlo-auth-button/bundle"></script>

<headlo-auth-button></headlo-auth-button>
```

**Hybrid — private component, Headlo services:**

Component JS from your server. Service calls (`auth.signIn`, `billing.checkLimit`) still go to headlo-worker.

```html
<script src="https://api.headlo.com/v1/prop/react/19/bundle"></script>
<script src="https://api.headlo.com/v1/prop/service/headlo-auth/v1/bundle"></script>
<script src="https://prop.acme.com/v1/prop/component/my-component/bundle"></script>

<my-component></my-component>
```

**Fully private — component and services from your server:**

```html
<script src="https://api.headlo.com/v1/prop/react/19/bundle"></script>
<script src="https://prop.acme.com/v1/prop/service/headlo-auth/v1/bundle"></script>
<script src="https://prop.acme.com/v1/prop/component/my-component/bundle"></script>

<my-component></my-component>
```

React is always loaded from Headlo's CDN — version-pinned, immutable, edge-cached. Only service stubs and component definitions vary by server.

### Returns

| Key | Type | Description |
|---|---|---|
| `def` | `PropComponentDef \| null` | Contract — config fields, state fields, actions, `react_version` |
| `app` | `PropComponentApp \| null` | App row — config, runtime version |
| `Component` | `ComponentType \| null` | Bridge component, stable across re-renders |
| `loading` | `boolean` | |
| `error` | `string \| null` | |

---

## useComponents

Load and compile the component registry for a site. Pass the client directly — the hook configures the component sandbox automatically.

```tsx
import { createClient } from 'headlo'
import { useComponents } from 'headlo-react'

const client = createClient(ANON_KEY)

function App() {
  const { entries, loading, error } = useComponents(client)

  const card = entries.find(e => e.component_id === 'card_grid')
  if (!card) return null

  return <card.Component records={records} options={card.templateOptions} />
}
```

## License

[Elastic License 2.0](./LICENSE) — © Headlo Team

Source available. Free for internal use. You may not offer this software as a competing hosted or managed service. See [LICENSE](./LICENSE) for full terms.

Built by [Headlo](https://www.headlo.com).
