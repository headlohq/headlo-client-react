import { useState, useEffect } from 'react'
import type { HeadloResult, CollectionListResponse } from 'headlo'

type ListFn = (cursor: string | undefined, limit: number) => Promise<HeadloResult<CollectionListResponse>>

export function useList(fn: ListFn, opts?: { limit?: number }) {
  const limit = opts?.limit ?? 50

  const [data,        setData]        = useState<HeadloResult<CollectionListResponse> | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [cursor,      setCursor]      = useState<string | undefined>(undefined)
  const [cursorStack, setCursorStack] = useState<string[]>([])

  useEffect(() => {
    setCursor(undefined)
    setCursorStack([])
  }, [limit])

  useEffect(() => {
    setLoading(true)
    fn(cursor, limit)
      .then(res => { setData(res); setError(res.error) })
      .catch(e  => setError(e?.message ?? 'Request failed'))
      .finally(() => setLoading(false))
  }, [cursor, limit]) // eslint-disable-line react-hooks/exhaustive-deps

  const count       = data?.count ?? 0
  const nextCursor  = data?.next_cursor ?? null
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
