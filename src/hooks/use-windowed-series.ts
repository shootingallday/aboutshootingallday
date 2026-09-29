import * as React from "react"

export type WindowedMetrics = { ticks: number; commits: number; dropped: number }

export type WindowedSeries<T> = {
  data: T[]
  push: (point: T | T[]) => void
  reset: (seed?: T[]) => void
  metrics: React.RefObject<WindowedMetrics>
}

/**
 * A capped, frame-coalesced series buffer for a streaming chart.
 *
 * The cost of a live chart is per React commit, not per tick: a quote feed can deliver dozens of
 * prints between two frames, and rendering each one costs a full reconcile the screen never
 * shows. Ticks are staged in a plain array and flushed once per animation frame, so the commit
 * rate is bounded by the display no matter how fast the socket runs, and the buffer is trimmed
 * to `limit` at the flush rather than on every push, which keeps push O(1).
 *
 * 600 points is the budget the #19 spike measured; a wider window costs path length, not commits.
 * Pair it with `isAnimationActive={false}` and `dot={false}` on the series: recharts 3.10.1
 * defaults to a 1500 ms tween and a rendered dot per point, and both of those, not the data
 * rate, are what drops frames on a live series.
 */
export function useWindowedSeries<T>(seed: T[] = [], limit = 600): WindowedSeries<T> {
  const buffer = React.useRef<T[]>(seed.slice(-limit))
  const pending = React.useRef<T[]>([])
  const frame = React.useRef(0)
  const metrics = React.useRef<WindowedMetrics>({ ticks: 0, commits: 0, dropped: 0 })
  const [data, setData] = React.useState<T[]>(buffer.current)

  const flush = React.useCallback(() => {
    frame.current = 0
    if (!pending.current.length) return
    const next = buffer.current.concat(pending.current)
    pending.current = []
    metrics.current.dropped += Math.max(0, next.length - limit)
    metrics.current.commits += 1
    buffer.current = next.length > limit ? next.slice(next.length - limit) : next
    setData(buffer.current)
  }, [limit])

  const push = React.useCallback(
    (point: T | T[]) => {
      const points = Array.isArray(point) ? point : [point]
      metrics.current.ticks += points.length
      for (const p of points) pending.current.push(p)
      if (!frame.current) frame.current = requestAnimationFrame(flush)
    },
    [flush],
  )

  const reset = React.useCallback(
    (next: T[] = []) => {
      pending.current = []
      buffer.current = next.slice(-limit)
      metrics.current = { ticks: 0, commits: 0, dropped: 0 }
      setData(buffer.current)
    },
    [limit],
  )

  React.useEffect(() => () => cancelAnimationFrame(frame.current), [])

  return { data, push, reset, metrics }
}
