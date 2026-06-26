import { useState, useEffect } from 'react'
import { usePropService } from './context'

export interface UseComponentResult {
  loaded: boolean
  tag:    string   // custom element tag name = slug
  error:  Error | null
}

export function useComponent(slug: string): UseComponentResult {
  const prop = usePropService()
  const [loaded, setLoaded] = useState(false)
  const [error,  setError]  = useState<Error | null>(null)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    prop.component(slug).load()
      .then(() => { if (!cancelled) setLoaded(true) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e : new Error(String(e))) })
    return () => { cancelled = true }
  }, [prop, slug])

  return { loaded, tag: slug, error }
}
