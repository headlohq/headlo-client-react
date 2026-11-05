// Shared publishable-key resolution across all debug pages
// (/abs-test, /pricing-debug, /services-debug, /scope-test, /scope-data-test).
//
// Precedence:
//   1. ?pk=pk_live_... URL param — highest. Writes to shared LS so it sticks
//      across page navigations without re-appending the query string.
//   2. Shared localStorage key `headlo:pk-override`.
//   3. VITE_HEADLO_PUBLISHABLE_KEY env var.
//   4. Empty string (caller decides fallback).
//
// Before this helper each page had its own LS key, which meant switching
// pks required re-setting on every debug page. Now one URL override or one
// setSharedPk() call flows to every page.

export const SHARED_PK_LS_KEY = 'headlo:pk-override'

export type PkSource = 'url' | 'localStorage' | 'env' | 'empty'

/**
 * Read the shared pk with precedence url > LS > env. URL param wins AND is
 * copied to LS so subsequent page loads honor it without the query string.
 */
export function resolveSharedPk(): { pk: string; source: PkSource } {
  if (typeof window === 'undefined') {
    const envPk = (import.meta.env.VITE_HEADLO_PUBLISHABLE_KEY as string | undefined) ?? ''
    return { pk: envPk, source: envPk ? 'env' : 'empty' }
  }
  const url = new URL(window.location.href)
  const fromUrl = url.searchParams.get('pk')
  if (fromUrl) {
    try { localStorage.setItem(SHARED_PK_LS_KEY, fromUrl) } catch { /* private mode */ }
    return { pk: fromUrl, source: 'url' }
  }
  try {
    const stored = localStorage.getItem(SHARED_PK_LS_KEY)
    if (stored) return { pk: stored, source: 'localStorage' }
  } catch { /* private mode */ }
  const envPk = (import.meta.env.VITE_HEADLO_PUBLISHABLE_KEY as string | undefined) ?? ''
  return { pk: envPk, source: envPk ? 'env' : 'empty' }
}

/**
 * Write a new pk to shared LS. Called by debug pages when the user edits
 * the pk field. Source flips to 'localStorage' after this.
 */
export function setSharedPk(pk: string): void {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(SHARED_PK_LS_KEY, pk) } catch { /* private mode */ }
}

/**
 * Remove the shared pk override entirely. On next read, precedence falls
 * back to env (or empty). Useful for "reset to defaults" buttons.
 */
export function clearSharedPk(): void {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(SHARED_PK_LS_KEY) } catch { /* private mode */ }
}
