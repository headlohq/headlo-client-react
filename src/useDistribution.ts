import { useState, useEffect } from 'react'
import { usePropService } from './context'

export interface UseDistributionResult {
  loaded: boolean
  error:  Error | null
}

export function useDistribution(runtime: string, version: string): UseDistributionResult {
  const prop = usePropService()
  const [loaded, setLoaded] = useState(false)
  const [error,  setError]  = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    prop.dist(runtime, version).load()
      .then(() => { if (!cancelled) setLoaded(true) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e : new Error(String(e))) })
    return () => { cancelled = true }
  }, [prop, runtime, version])

  return { loaded, error }
}
