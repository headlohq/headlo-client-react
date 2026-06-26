import { useState, useEffect } from 'react'
import { createClient } from 'headlo'
import type { SitePage } from 'headlo'

const DEFAULT_API = 'https://api.headlo.com'

export function useSite(anonKey?: string, apiUrl?: string) {
  const key = anonKey ?? (typeof window !== 'undefined' ? (window as Window & { __HEADLO_ANON_KEY__?: string }).__HEADLO_ANON_KEY__ : undefined) ?? ''

  const [pages,   setPages]   = useState<SitePage[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    if (!key) return
    setLoading(true)
    createClient(key, { apiUrl: apiUrl ?? DEFAULT_API })
      .site()
      .pages()
      .then(res => { setPages(res.pages ?? []); setError(res.error) })
      .catch(e  => setError(e?.message ?? 'Request failed'))
      .finally(() => setLoading(false))
  }, [key])

  return { pages, loading, error }
}
