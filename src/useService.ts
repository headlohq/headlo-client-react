import { useEffect, useState } from 'react'
import { usePropService } from './context'

/**
 * useService — load a PROP service's client stub and return the runtime API.
 *
 * Bridge between the React world and the Service Import API used inside
 * PROP components. Where a PROP component author writes:
 *   import { auth } from 'prop:service:auth'
 * a React app author writes:
 *   const auth = useService<AuthService>('auth')
 *
 * Both end up with the same runtime object (window.__headlo_service_<slug>_<version>),
 * just retrieved through React idiom vs compile-time transform.
 *
 * Returns `null` until the service bundle has loaded. After load, returns the
 * service's global API object — call methods on it directly.
 *
 * Usage:
 *   interface AuthService {
 *     signIn:  () => Promise<void>
 *     signOut: () => Promise<void>
 *     me:      () => Promise<{ id: string; email: string }>
 *   }
 *
 *   const auth = useService<AuthService>('auth')
 *   if (!auth) return <span>Loading…</span>
 *   return <button onClick={() => auth.signIn()}>Sign in</button>
 */
export function useService<T = unknown>(slug: string, version = 'v1'): T | null {
  const prop = usePropService()
  const [service, setService] = useState<T | null>(null)

  useEffect(() => {
    if (!slug) return
    let cancelled = false

    prop.service(slug, version).load()
      .then(() => {
        if (cancelled) return
        const key = `__headlo_service_${slug}_${version}`
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const global = (window as any)[key]
        if (global) setService(global as T)
        else console.warn(`[headlo-react] useService('${slug}', '${version}') — service bundle loaded but window.${key} is not set`)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.warn(`[headlo-react] useService('${slug}', '${version}') failed to load:`, err)
      })

    return () => { cancelled = true }
  }, [prop, slug, version])

  return service
}
