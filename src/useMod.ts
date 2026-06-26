import { useState, useEffect } from 'react'
import { createClient } from 'headlo'
import type { HeadloResult, SingleModuleResponse } from 'headlo'

const DEFAULT_API = 'https://api.headlo.com'

export function useMod(
  moduleId: string,
  anonKey?: string,
  apiUrl?: string,
) {
  const key = anonKey ?? (typeof window !== 'undefined' ? (window as Window & { __HEADLO_ANON_KEY__?: string }).__HEADLO_ANON_KEY__ : undefined) ?? ''

  const [data,    setData]    = useState<HeadloResult<SingleModuleResponse> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    if (!key) return
    setLoading(true)
    createClient(key, { apiUrl: apiUrl ?? DEFAULT_API })
      .modules(moduleId)
      .then(res => { setData(res); setError(res.error) })
      .catch(e  => setError(e?.message ?? 'Request failed'))
      .finally(() => setLoading(false))
  }, [moduleId, key])

  return { mod: data, fields: data?.fields ?? {}, loading, error }
}
