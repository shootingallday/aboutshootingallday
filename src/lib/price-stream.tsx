import { useId, useSyncExternalStore } from "react"
import { PauseIcon } from "lucide-react"

import { Toggle } from "@/components/ui/toggle"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

export type Instrument = { symbol: string; venue: string; open: number; increment: number; fraction: number; range: [number, number]; sigma: number }
export type Quote = Instrument & { price: number }
export type Feed = { seed: number; tick: number; playing: boolean; rate: number; quotes: Quote[] }

export const RATES = [4, 20] as const

export const INSTRUMENTS: Instrument[] = [
  { symbol: "NQ", venue: "CME", open: 21418.25, increment: 0.25, fraction: 2, range: [15000, 29999.75], sigma: 6 },
  { symbol: "ES", venue: "CME", open: 6012.5, increment: 0.25, fraction: 2, range: [4000, 7999.75], sigma: 2 },
  { symbol: "YM", venue: "CBOT", open: 44210, increment: 1, fraction: 0, range: [30000, 59999], sigma: 12 },
  { symbol: "RTY", venue: "CME", open: 2284.3, increment: 0.1, fraction: 1, range: [1500, 3999.9], sigma: 2 },
  { symbol: "CL", venue: "NYMEX", open: 71.84, increment: 0.01, fraction: 2, range: [40, 119.99], sigma: 2 },
  { symbol: "GC", venue: "COMEX", open: 2651.4, increment: 0.1, fraction: 1, range: [1500, 3999.9], sigma: 3 },
]

export function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function walk(quote: Quote, random: () => number): Quote {
  const gauss = Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random())
  const [low, high] = quote.range
  let next = quote.price + Math.round(gauss * quote.sigma) * quote.increment
  if (next > high) next = 2 * high - next
  if (next < low) next = 2 * low - next
  return { ...quote, price: Number((Math.round(next / quote.increment) * quote.increment).toFixed(quote.fraction)) }
}

export function createPriceStream({ seed = 281, rate = 4 }: { seed?: number; rate?: number } = {}) {
  const random = seeded(seed)
  let feed: Feed = { seed, tick: 0, playing: true, rate, quotes: INSTRUMENTS.map((instrument) => ({ ...instrument, price: instrument.open })) }
  const listeners = new Set<() => void>()
  let timer: ReturnType<typeof setInterval> | undefined

  const emit = (next: Partial<Feed>) => {
    feed = { ...feed, ...next }
    for (const listener of listeners) listener()
  }
  const schedule = () => {
    clearInterval(timer)
    timer = feed.playing && listeners.size ? setInterval(() => step(), 1000 / feed.rate) : undefined
  }
  const step = (count = 1) => {
    for (let n = 0; n < count; n += 1) emit({ tick: feed.tick + 1, quotes: feed.quotes.map((quote) => walk(quote, random)) })
  }

  return {
    get: () => feed,
    subscribe(listener: () => void) {
      listeners.add(listener)
      schedule()
      return () => {
        listeners.delete(listener)
        schedule()
      }
    },
    step,
    play(playing: boolean) {
      emit({ playing })
      schedule()
    },
    setRate(rate: number) {
      emit({ rate })
      schedule()
    },
  }
}

export type PriceStream = ReturnType<typeof createPriceStream>

const requested = Number(new URLSearchParams(location.search).get("seed"))

export const priceStream = createPriceStream({ seed: Number.isInteger(requested) && requested > 0 ? requested : 281 })

declare global {
  interface Window {
    pxPriceStream: PriceStream
  }
}
window.pxPriceStream = priceStream

export function usePriceStream() {
  return useSyncExternalStore(priceStream.subscribe, priceStream.get)
}

export function quoteOf(feed: Feed, symbol: string) {
  const quote = feed.quotes.find((candidate) => candidate.symbol === symbol)
  if (!quote) throw new Error(`the price stream carries no ${symbol}`)
  return quote
}

export function PriceStreamControls() {
  const playing = useSyncExternalStore(priceStream.subscribe, () => priceStream.get().playing)
  const rate = useSyncExternalStore(priceStream.subscribe, () => priceStream.get().rate)
  const id = useId()
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Toggle variant="outline" size="sm" pressed={!playing} onPressedChange={(paused) => priceStream.play(!paused)}>
        <PauseIcon aria-hidden="true" />
        Pause feed
      </Toggle>
      <span id={id} className="text-[length:var(--px-text-sm)] text-muted-foreground">
        Ticks a second
      </span>
      <ToggleGroup aria-labelledby={id} variant="outline" size="sm" value={[String(rate)]} onValueChange={(value) => value[0] && priceStream.setRate(Number(value[0]))}>
        {RATES.map((rate) => (
          <ToggleGroupItem key={rate} value={String(rate)}>
            {rate}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
