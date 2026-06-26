import { useState, useEffect, useContext } from 'react'
import { createClient } from 'headlo'
import type { HeadloResult, CollectionRecordResponse } from 'headlo'
import { HeadloAuthContext } from './context'

const DEFAULT_API = 'https://api.headlo.com'

export function useRecord(
  collectionId: string,
  recordId: string,
  anonKey?: string,
  apiUrl?: string,
  getToken?: () => Promise<string | null>,
  userToken?: string,
) {
  const key = anonKey ?? (typeof window !== 'undefined' ? (window as Window & { __HEADLO_ANON_KEY__?: string }).__HEADLO_ANON_KEY__ : undefined) ?? ''
  const authCtx = useContext(HeadloAuthContext)
  const resolvedGetToken = getToken ?? authCtx?.getToken

  const [data,    setData]    = useState<HeadloResult<CollectionRecordResponse> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    if (!key) return
    setLoading(true)
    createClient(key, { apiUrl: apiUrl ?? DEFAULT_API, getToken: resolvedGetToken, userToken })
      .collection(collectionId)
      .record(recordId)
      .then((res: HeadloResult<CollectionRecordResponse>) => { setData(res); setError(res.error) })
      .catch((e: Error) => setError(e?.message ?? 'Request failed'))
      .finally(() => setLoading(false))
  }, [collectionId, recordId, key])

  return { record: data?.record ?? null, loading, error }
}
