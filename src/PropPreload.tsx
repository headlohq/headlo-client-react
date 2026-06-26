import { useEffect } from 'react'
import { usePropService } from './context'

interface DistEntry {
  runtime: string
  version: string
}

interface PropPreloadProps {
  components?: string[]
  dist?:       DistEntry[]
}

export function PropPreload({ components = [], dist = [] }: PropPreloadProps) {
  const prop = usePropService()

  useEffect(() => {
    dist.forEach(({ runtime, version }) => prop.dist(runtime, version).preload())
    components.forEach(slug => prop.component(slug).preload())
  }, [prop]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
