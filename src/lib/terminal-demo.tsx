import { useEffect, useMemo, useState } from "react"

import type { Candle } from "@/components/ui/candlestick-chart"
import type { BookLevel } from "@/components/ui/order-book"
import { INSTRUMENTS, priceStream, quoteOf, seeded, walk, type Feed, type Quote } from "./price-stream"

const PER = 20
const COUNT = 40
const MINUTE = 60_000
const START = Date.UTC(2026, 8, 28, 14, 30)

function history(symbol: string, seed: number): Candle[] {
  const index = INSTRUMENTS.findIndex((instrument) => instrument.symbol === symbol)
  const instrument = INSTRUMENTS[index]
  const random = seeded(seed * 37 + index + 1)
  let quote = { ...instrument, price: instrument.open }
  const path = [quote.price]
  for (let n = 0; n < PER * (COUNT - 1); n += 1) {
    quote = walk(quote, random)
    path.push(quote.price)
  }
  path.reverse()
  const candles: Candle[] = []
  for (let c = 0; c < COUNT - 1; c += 1) {
    const run = path.slice(c * PER, c * PER + PER + 1)
    const open = run[0]
    const close = run.at(-1)!
    candles.push({ time: START - (COUNT - 1 - c) * MINUTE, open, close, high: Math.max(...run), low: Math.min(...run), volume: Math.round(400 + random() * 900 + (Math.abs(close - open) / instrument.increment) * 12) })
  }
  candles.push({ time: START, open: instrument.open, high: instrument.open, low: instrument.open, close: instrument.open, volume: 0 })
  return candles
}

export function useCandles(symbol: string) {
  const seed = priceStream.get().seed
  const first = useMemo(() => history(symbol, seed), [symbol, seed])
  const [live, setLive] = useState({ symbol, candles: first })
  useEffect(() => {
    let list = first
    let seen = priceStream.get().tick
    return priceStream.subscribe(() => {
      const feed = priceStream.get()
      if (feed.tick === seen) return
      seen = feed.tick
      const price = quoteOf(feed, symbol).price
      const last = list.at(-1)!
      const lot = 20 + (feed.tick % 7) * 9
      list =
        feed.tick % PER === 0
          ? [...list.slice(1), { time: last.time + MINUTE, open: last.close, high: Math.max(last.close, price), low: Math.min(last.close, price), close: price, volume: lot }]
          : [...list.slice(0, -1), { ...last, high: Math.max(last.high, price), low: Math.min(last.low, price), close: price, volume: (last.volume ?? 0) + lot }]
      setLive({ symbol, candles: list })
    })
  }, [first, symbol])
  return live.symbol === symbol ? live.candles : first
}

function hash(...parts: number[]) {
  let h = 2166136261
  for (const part of parts) {
    h ^= part | 0
    h = Math.imul(h, 16777619)
    h ^= h >>> 13
  }
  return (h >>> 0) / 4294967296
}

export function bookOf(feed: Feed, quote: Quote, depth: number, maxSize: number) {
  const at = Math.round(quote.price / quote.increment)
  const level = (ticks: number): BookLevel => {
    const base = 1 + Math.floor(hash(feed.seed, ticks) * maxSize * 0.55)
    const churn = Math.floor(hash(feed.seed, ticks, feed.tick >> 1) * maxSize * 0.45)
    return { price: Number((ticks * quote.increment).toFixed(quote.fraction)), size: Math.min(maxSize, base + churn) }
  }
  return {
    bids: Array.from({ length: depth }, (_, n) => level(at - n)),
    asks: Array.from({ length: depth }, (_, n) => level(at + 1 + n)),
  }
}

export const MULTIPLIER: Record<string, number> = { NQ: 20, ES: 50, YM: 5, RTY: 50, CL: 1000, GC: 100 }

export function openPnl(quote: Quote, side: "long" | "short", size: number, entry: number) {
  return Math.round((quote.price - entry) * size * MULTIPLIER[quote.symbol] * (side === "long" ? 1 : -1) * 100) / 100
}

export function pnlRange(quote: Quote, side: "long" | "short", size: number, entry: number): [number, number] {
  const ends = quote.range.map((price) => openPnl({ ...quote, price }, side, size, entry))
  return [Math.min(...ends), Math.max(...ends)]
}
