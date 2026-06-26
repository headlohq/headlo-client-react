import { useState, useEffect, useContext } from 'react'
import { createClient } from 'headlo'
import type { HeadloResult, CollectionListResponse, ListOptions } from 'headlo'
import { HeadloAuthContext } from './context'

const DEFAULT_API = 'https://api.headlo.com'

export function useCollection(
  collectionId: string,
  opts?: ListOptions,
  anonKey?: string,
  apiUrl?: string,
  getToken?: () => Promise<string | null>,
  userToken?: string,
) {
  const key = anonKey ?? (typeof window !== 'undefined' ? (window as Window & { __HEADLO_ANON_KEY__?: string }).__HEADLO_ANON_KEY__ : undefined) ?? ''
  const authCtx = useContext(HeadloAuthContext)
  const resolvedGetToken = getToken ?? authCtx?.getToken

  const [data,        setData]        = useState<HeadloResult<CollectionListResponse> | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [cursor,      setCursor]      = useState<string | undefined>(undefined)
  const [cursorStack, setCursorStack] = useState<string[]>([])

  // Stable key — excludes cursor so changing limit/filter resets to page 1
  const stableKey = JSON.stringify({ ...opts, cursor: undefined })

  // Reset to page 1 when collection or non-cursor opts change
  useEffect(() => {
    setCursor(undefined)
    setCursorStack([])
  }, [collectionId, key, stableKey])

  useEffect(() => {
    if (!key || !collectionId) return
    setLoading(true)
    createClient(key, { apiUrl: apiUrl ?? DEFAULT_API, getToken: resolvedGetToken, userToken })
      .collection(collectionId, { ...opts, cursor })
      .list()
      .then(res => { setData(res); setError(res.error) })
      .catch(e  => setError(e?.message ?? 'Request failed'))
      .finally(() => setLoading(false))
  }, [collectionId, key, cursor, stableKey])

  const count       = data?.count ?? 0
  const nextCursor  = data?.next_cursor ?? null
  const limit       = opts?.limit ?? 50
  const currentPage = cursorStack.length + 1
  const totalPages  = Math.ceil(count / limit) || 1

  function goNext() {
    if (!nextCursor) return
    setCursorStack(s => [...s, cursor ?? ''])
    setCursor(nextCursor)
  }

  function goPrev() {
    const p = cursorStack[cursorStack.length - 1]
    setCursorStack(s => s.slice(0, -1))
    setCursor(p || undefined)
  }

  return { records: data?.records ?? [], count, nextCursor, loading, error, goNext, goPrev, currentPage, totalPages }
}
