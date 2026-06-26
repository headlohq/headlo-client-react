import React from 'react'
import { transform } from 'sucrase'
import { createClient, verifyComponentCode } from 'headlo'
import type { HeadloClient, ComponentRow, ComponentUtils } from 'headlo'

type FlatComponentType = React.ComponentType<{
  records?:   Record<string, any>[]
  options?:   Record<string, any>
  fetch?:     ComponentUtils['fetch']
  token?:     ComponentUtils['token']
  navigate?:  ComponentUtils['navigate']
  onClick?:   ComponentUtils['onClick']
  emit?:      ComponentUtils['emit']
  loading?:   boolean
  subId?:     string
}>

export interface RegistryEntry {
  component_id:          string
  agencyId:              string
  workspaceId:           string
  label:                 string
  description:           string
  templateIds:           string[]
  templateId:            string | null
  collectionId:          string | null
  collectionRecordIds:   string[] | null
  sampleData:            Record<string, unknown>
  templateOptions:       Record<string, unknown> | null
  templateOptionsSchema: Record<string, unknown> | null
  code:                  string
  Component:             FlatComponentType
}

export const componentUtils: ComponentUtils = {
  fetch: (url, init) => window.fetch(url, init),
  token: null,
  navigate: (path: string) => {
    history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  },
}

export function configureComponentUtils(config: {
  proxyBaseUrl:  string
  anonKey?:      string
  getToken?:     () => Promise<string | null>
}) {
  componentUtils.fetch = async (url, init) => {
    const { cache_ttl, ...fetchInit } = (init ?? {}) as RequestInit & { cache_ttl?: number }
    const headers: Record<string, string> = {}
    if (config.anonKey) headers['x-headlo-key'] = config.anonKey
    if (config.getToken) {
      const token = await config.getToken()
      if (token) headers['Authorization'] = 'Bearer ' + token
    }
    // Call Headlo API URLs directly — routing them through the proxy creates a self-loop
    if (url.startsWith(config.proxyBaseUrl)) {
      return window.fetch(url, { ...fetchInit, headers: { ...(fetchInit as RequestInit).headers, ...headers } })
    }
    const proxyUrl = config.proxyBaseUrl + '/v1/proxy?url=' + encodeURIComponent(url)
      + (cache_ttl !== undefined ? '&cache_ttl=' + cache_ttl : '')
    return window.fetch(
      proxyUrl,
      { ...fetchInit, headers: { ...(fetchInit as RequestInit).headers, ...headers } }
    )
  }

  componentUtils.headlo = createClient(config.anonKey ?? '', {
    apiUrl:      config.proxyBaseUrl,
    customFetch: (url, init) => componentUtils.fetch(url, init as RequestInit & { cache_ttl?: number }),
  })
}

export function tryCompileComponentCode(
  componentId: string,
  code: string,
  consoleOverride?: Partial<Pick<typeof console, 'log' | 'warn' | 'error' | 'info'>>
): FlatComponentType {
  const { code: compiled } = transform(code, { transforms: ['typescript', 'jsx'] })
  const preamble = 'const {useState,useEffect,useMemo,useCallback,useRef,useReducer,useContext,createContext,forwardRef,memo}=React;'
  const cons = consoleOverride ? { ...console, ...consoleOverride } : console
  // eslint-disable-next-line no-new-func
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return new Function('React', 'fetch', 'headlo', 'console', `${preamble}${compiled}; return Component\n//# sourceURL=component-${componentId}.js`)(React, componentUtils.fetch, componentUtils.headlo, cons) as FlatComponentType
}

export function compileComponentCode(
  componentId: string,
  code: string,
  consoleOverride?: Partial<Pick<typeof console, 'log' | 'warn' | 'error' | 'info'>>
): FlatComponentType {
  try {
    return tryCompileComponentCode(componentId, code, consoleOverride)
  } catch (e) {
    console.error('Component compile error:', e)
    const message = e instanceof Error ? e.message : String(e)
    const ErrorComponent: React.FC = () => React.createElement('div', { 'data-headlo-compile-error': true, style: { padding: '1rem', color: '#b91c1c', fontSize: 12, fontFamily: 'monospace', background: '#fef2f2', borderRadius: 6 } },
      React.createElement('strong', null, `${componentId}: Compile error`), React.createElement('br'), message
    )
    return ErrorComponent as FlatComponentType
  }
}

function compileComponent(componentId: string, code: string): FlatComponentType {
  return compileComponentCode(componentId, code)
}

function toEntry<T extends ComponentRow>(row: T): RegistryEntry {
  const Component = compileComponent(row.component_id, row.code)
  return {
    component_id:          row.component_id,
    agencyId:              row.agency_id,
    workspaceId:           (row as any).workspace_id ?? '',
    label:                 row.label,
    description:           row.description ?? '',
    templateIds:           row.template_ids ?? [],
    templateId:            row.template_id ?? null,
    collectionId:          row.collection_id ?? null,
    collectionRecordIds:   row.collection_record_ids ?? [],
    sampleData:            row.sample_data ?? {},
    templateOptions:       row.template_options ?? null,
    templateOptionsSchema: row.template_options_schema ?? null,
    code:                  row.code,
    Component,
  }
}

type ListFn<T> = () => Promise<{ components: T[]; signature: string | null; error: string | null }>

export function useCmsComponents<T extends ComponentRow>(
  source: HeadloClient | ListFn<T>,
  opts?: {
    publicKey?:      JsonWebKey | null
    localOverrides?: Record<string, T>
  }
) {
  const [entries,  setEntries]  = React.useState<RegistryEntry[]>([])
  const [loading,  setLoading]  = React.useState(true)
  const [error,    setError]    = React.useState<string | null>(null)

  React.useEffect(() => {
    let listComponents: ListFn<T>
    if (typeof source === 'object' && source !== null) {
      configureComponentUtils({ proxyBaseUrl: source.apiUrl, anonKey: source.anonKey })
      listComponents = () => source.components()() as Promise<{ components: T[]; signature: string | null; error: string | null }>
    } else {
      listComponents = source
    }

    let mounted = true
    listComponents().then(async res => {
      if (!mounted) return
      if (res.error) { setError(res.error); return }
      if (res.signature && opts?.publicKey) {
        const ok = await verifyComponentCode(JSON.stringify(res.components), res.signature, opts.publicKey)
        if (!ok) { setError('Component signature verification failed'); return }
      }
      const rows = opts?.localOverrides
        ? [
            ...res.components.map(c => {
              const local = opts.localOverrides![c.component_id]
              // API wins for all data fields; local provides code only (fast dev iteration without SQL)
              return (local ? { ...c, code: local.code } : c) as T
            }),
            ...Object.values(opts.localOverrides).filter(o => !res.components.some(c => c.component_id === o.component_id)) as T[],
          ]
        : res.components
      if (!mounted) return
      setEntries(rows.flatMap(r => { const e = toEntry(r); return e ? [e] : [] }))
    }).catch(e => { if (mounted) setError(String(e)) })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const reloadEntry = React.useCallback((component_id: string, code: string): RegistryEntry | null => {
    let updated: RegistryEntry | null = null
    setEntries(prev => prev.map(e => {
      if (e.component_id !== component_id) return e
      updated = { ...e, code, Component: compileComponent(component_id, code) }
      return updated
    }))
    return updated
  }, [])

  const patchEntry = React.useCallback((component_id: string, patch: Partial<Omit<RegistryEntry, 'component_id' | 'Component'>>): void => {
    setEntries(prev => prev.map(e =>
      e.component_id === component_id ? { ...e, ...patch } : e
    ))
  }, [])

  return { entries, loading, error, reloadEntry, patchEntry }
}

export function findComponents(templateId: string, entries: RegistryEntry[]): RegistryEntry[] {
  return entries.filter(r => r.templateIds.includes(templateId))
}
