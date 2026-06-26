import { useState, useEffect, useRef, createElement } from 'react'
import type { ComponentType } from 'react'
import { transform } from 'sucrase'
import type { PropComponentDef, PropComponentApp, PropServiceConfig } from 'headlo'
import { usePropServer } from './context'

const DEFAULT_API = 'https://api.headlo.com'

export interface UsePropResult {
  def:       PropComponentDef | null
  app:       PropComponentApp | null
  Component: ComponentType<Record<string, unknown>> | null
  loading:   boolean
  error:     string | null
}

// Cache compiled component factories (React) => ComponentFn by component_js string.
const factoryCache = new Map<string, ((react: unknown) => unknown) | null>()

// Cache script load promises to avoid duplicate script injection.
const scriptCache = new Map<string, Promise<void>>()

// Cache bridge components by cacheKey to keep React component identity stable.
const bridgeCache = new Map<string, ComponentType<Record<string, unknown>>>()

function ensureReactLoaded(version: string, apiUrl: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any)[`__headlo_React_${version}`]) return Promise.resolve()
  let p = scriptCache.get(version)
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script')
      s.src = `${apiUrl}/v1/prop/dist/react/${version}/bundle`
      s.onload = () => resolve()
      s.onerror = () => reject(new Error(`[headlo] failed to load React ${version}`))
      document.head.appendChild(s)
    })
    scriptCache.set(version, p)
  }
  return p
}

const PREAMBLE = 'const {useState,useEffect,useMemo,useCallback,useRef,useReducer,useContext,createContext,forwardRef,memo}=React;'

function getFactory(slug: string, js: string): ((react: unknown) => unknown) | null {
  if (factoryCache.has(js)) return factoryCache.get(js) ?? null
  try {
    const compiled = transform(js, { transforms: ['typescript', 'jsx'] }).code
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = new Function('React', `${PREAMBLE}${compiled}; return Component\n//# sourceURL=prop-${slug}.js`) as (react: unknown) => unknown
    factoryCache.set(js, fn)
    return fn
  } catch {
    factoryCache.set(js, null)
    return null
  }
}

// Returns a host-React component that renders the PROP component into its own
// versioned ReactDOM root. The inner tree uses window.__headlo_React_${version}
// so the PROP component is fully isolated from the host app's React instance.
function makeBridgeComponent(
  slug: string,
  js: string,
  reactVersion: string,
): ComponentType<Record<string, unknown>> {
  const cacheKey = `${slug}:${reactVersion}:${js}`
  const cached = bridgeCache.get(cacheKey)
  if (cached) return cached

  const factory = getFactory(slug, js)
  if (!factory) {
    const Null = () => null as unknown
    bridgeCache.set(cacheKey, Null as ComponentType<Record<string, unknown>>)
    return Null as ComponentType<Record<string, unknown>>
  }

  const stableFactory = factory

  function PropBridge(props: Record<string, unknown>) {
    const containerRef = useRef<HTMLDivElement | null>(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rootRef  = useRef<any>(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const innerRef = useRef<any>(null)

    // Re-render inner component on every host render so props stay in sync.
    useEffect(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const R  = (window as any)[`__headlo_React_${reactVersion}`]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const RD = (window as any)[`__headlo_ReactDOM_${reactVersion}`]
      if (!R || !RD || !containerRef.current) return
      if (!innerRef.current) innerRef.current = stableFactory(R)
      if (!rootRef.current)  rootRef.current  = RD.createRoot(containerRef.current)
      rootRef.current.render(R.createElement(innerRef.current, props))
    })

    useEffect(() => () => {
      rootRef.current?.unmount()
      rootRef.current = null
    }, [])

    return createElement('div', { ref: containerRef })
  }

  bridgeCache.set(cacheKey, PropBridge as ComponentType<Record<string, unknown>>)
  return PropBridge as ComponentType<Record<string, unknown>>
}

export function useProp(
  slug: string,
  service?: PropServiceConfig | string,
): UsePropResult {
  const ctx = usePropServer()

  const resolvedUrl            = (typeof service === 'string' ? service : service?.url) ?? ctx.url ?? DEFAULT_API
  const resolvedPublishableKey = (typeof service === 'object' ? service?.publishableKey : undefined) ?? ctx.publishableKey

  const [def,       setDef]       = useState<PropComponentDef | null>(null)
  const [app,       setApp]       = useState<PropComponentApp | null>(null)
  const [Component, setComponent] = useState<ComponentType<Record<string, unknown>> | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    let mounted = true
    setLoading(true)
    setError(null)

    const fetchHeaders: Record<string, string> = resolvedPublishableKey
      ? { 'X-Headlo-Prop-Publishable-Key': resolvedPublishableKey }
      : {}

    fetch(`${resolvedUrl}/v1/prop/component/${encodeURIComponent(slug)}`, { headers: fetchHeaders })
      .then(r => r.json() as Promise<{ error: string | null; def: PropComponentDef; app: PropComponentApp | null }>)
      .then(async res => {
        if (!mounted) return
        if (res.error) { setError(res.error); return }
        setDef(res.def)
        setApp(res.app)

        if (res.app?.component_js) {
          const reactVersion = res.def?.react_version ?? '19'
          await ensureReactLoaded(reactVersion, resolvedUrl)
          if (!mounted) return
          const bridge = makeBridgeComponent(slug, res.app.component_js, reactVersion)
          setComponent(() => bridge)
        }
      })
      .catch(e => { if (mounted) setError(e?.message ?? 'Request failed') })
      .finally(() => { if (mounted) setLoading(false) })

    return () => { mounted = false }
  }, [slug, resolvedUrl, resolvedPublishableKey])

  return { def, app, Component, loading, error }
}
