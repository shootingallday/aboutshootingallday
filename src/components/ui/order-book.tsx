"use client"

import * as React from "react"

import { AnimatedNumber } from "@/components/ui/animated-number"
import { InstrumentLabel } from "@/components/ui/instrument-label"
import { useFramed } from "@/components/ui/ticker"
import { useMorph } from "@/hooks/use-morph"
import { MINUS } from "@/lib/format"
import { readLocale } from "@/lib/locale"
import { cn } from "@/lib/utils"

type BookSide = "bid" | "ask"
type BookLevel = { price: number; size: number }
type BookPick = BookLevel & { side: BookSide }

type OrderBookProps = Omit<React.ComponentProps<"section">, "children" | "onSelect"> & {
  symbol: string
  venue?: string
  bids: BookLevel[]
  asks: BookLevel[]
  last?: number
  range: [number, number]
  maxSize: number
  fraction?: number
  depth?: number
  label?: string
  onPick?: (pick: BookPick) => void
}

type Slot = { side: BookSide; level?: BookLevel }

const SIDE: Record<BookSide, string> = { bid: "Bid", ask: "Ask" }
const figure = "justify-items-end [&>number-flow-react]:text-end"
const row =
  "relative isolate grid h-control-sm w-full grid-cols-2 items-center gap-4 px-(--cell-px) text-start outline-none transition-colors duration-fast ease-out pointer-coarse:h-control-lg focus-visible:z-(--z-raised) focus-visible:shadow-(--focus-ring) enabled:hover:bg-muted aria-disabled:cursor-default aria-disabled:hover:bg-transparent"

const writers = new Map<string, Intl.NumberFormat>()
function write(locale: string, options: Intl.NumberFormatOptions, value: number) {
  const key = JSON.stringify([locale, options])
  let writer = writers.get(key)
  if (!writer) writers.set(key, (writer = new Intl.NumberFormat(locale, options)))
  return writer.format(value).replace(/-/g, MINUS)
}

function OrderBook({ symbol, venue, bids, asks, last, range, maxSize, fraction = 2, depth = 8, label = "Order book", onPick, className, ...props }: OrderBookProps) {
  const id = React.useId()
  const px = React.useMemo(() => readLocale(), [])
  const { timing } = useMorph({ spring: "snappy" })
  const book = React.useMemo(() => ({ bids, asks, last }), [bids, asks, last])
  const shown = useFramed(book, timing?.duration ?? 0)
  const [active, setActive] = React.useState(depth)
  const [said, setSaid] = React.useState("")
  const buttons = React.useRef<(HTMLButtonElement | null)[]>([])

  const digits = { minimumFractionDigits: fraction, maximumFractionDigits: fraction }
  const whole = { minimumFractionDigits: 0, maximumFractionDigits: 0 }
  const slots: Slot[] = [
    ...Array.from({ length: depth }, (_, n) => ({ side: "ask" as const, level: shown.value.asks[depth - 1 - n] })),
    ...Array.from({ length: depth }, (_, n) => ({ side: "bid" as const, level: shown.value.bids[n] })),
  ]
  const filled = slots.flatMap((slot, n) => (slot.level ? [n] : []))
  const stop = slots[active]?.level ? active : filled.reduce((best, n) => (best === -1 || Math.abs(n - active) < Math.abs(best - active) ? n : best), -1)
  const [bestAsk, bestBid] = [shown.value.asks[0], shown.value.bids[0]]
  const spread = bestAsk && bestBid ? Number((bestAsk.price - bestBid.price).toFixed(fraction)) : null

  const move = (to: number | undefined) => {
    if (to === undefined) return
    setActive(to)
    buttons.current[to]?.focus()
  }

  const keys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const at = filled.indexOf(buttons.current.indexOf(document.activeElement as HTMLButtonElement))
    const to = { ArrowUp: filled[at - 1], ArrowDown: filled[at + 1], Home: filled[0], End: filled.at(-1) }[event.key]
    if (!(event.key in { ArrowUp: 1, ArrowDown: 1, Home: 1, End: 1 })) return
    event.preventDefault()
    move(to)
  }

  const pick = (slot: Slot, n: number) => {
    setActive(n)
    if (!slot.level) return
    const text = `${SIDE[slot.side]} ${write(px.locale, digits, slot.level.price)} picked.`
    setSaid((was) => (was === text ? `${text} ` : text))
    onPick?.({ side: slot.side, price: slot.level.price, size: slot.level.size })
  }

  const level = (slot: Slot, n: number) => {
    const { side, level } = slot
    return (
      <li key={n} className="grid">
        <button
          ref={(el) => {
            buttons.current[n] = el
          }}
          type="button"
          data-side={side}
          tabIndex={n === stop ? 0 : -1}
          aria-disabled={level ? undefined : true}
          aria-label={level ? `${SIDE[side]} ${write(px.locale, digits, level.price)}, size ${write(px.locale, whole, level.size)}` : `${SIDE[side]}, no order`}
          onFocus={() => setActive(n)}
          onClick={() => pick(slot, n)}
          className={row}
        >
          <span
            aria-hidden="true"
            data-slot="order-book-bar"
            style={{ transform: `scaleX(${level ? Math.min(level.size / maxSize, 1) : 0})` }}
            className={cn(
              "absolute inset-y-0.5 end-0 -z-10 w-full origin-end rounded-sm transition-transform spring-snappy rtl:origin-left",
              side === "bid" ? "bg-gain-soft" : "bg-loss-soft"
            )}
          />
          <span className={cn("grid justify-items-start", !level && "invisible")}>
            <AnimatedNumber value={level?.price ?? range[0]} widest={range} format={digits} tint={false} animated={shown.roll} className={cn("font-medium [&>number-flow-react]:text-start", side === "bid" ? "text-gain" : "text-loss")} />
          </span>
          <span className={cn("grid", figure, !level && "invisible")}>
            <AnimatedNumber value={level?.size ?? 0} widest={[0, maxSize]} format={whole} tint={false} animated={shown.roll} className={figure} />
          </span>
        </button>
      </li>
    )
  }

  return (
    <section aria-labelledby={`${id}-title`} data-slot="order-book" className={cn("grid content-start rounded-card border border-border bg-card", className)} {...props}>
      <div className="flex items-center justify-between gap-4 px-(--cell-px) pt-3 pb-2">
        <h3 id={`${id}-title`} className="text-[length:var(--px-text-md)] font-semibold">
          {label}
        </h3>
        <InstrumentLabel symbol={symbol} venue={venue} className="text-[length:var(--px-text-sm)]" />
      </div>
      <div aria-hidden="true" className="grid grid-cols-2 gap-4 border-b border-border px-(--cell-px) pb-1.5 text-[length:var(--px-text-xs)] font-medium text-muted-foreground">
        <span>Price</span>
        <span className="text-end">Size</span>
      </div>
      <div role="group" aria-label={`${label}, ${symbol}`} aria-describedby={onPick ? `${id}-hint` : undefined} onKeyDown={keys} className="relative grid py-1">
        <ul aria-label="Asks" className="grid">
          {slots.slice(0, depth).map((slot, n) => level(slot, n))}
        </ul>
        <div data-slot="order-book-spread" className="my-1 grid h-control-sm grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-y border-border bg-muted px-(--cell-px) pointer-coarse:h-control-lg">
          <span className={cn("grid justify-items-start", last === undefined && "invisible")}>
            <AnimatedNumber value={shown.value.last ?? range[0]} widest={range} format={digits} animated={shown.roll} className="font-semibold [&>number-flow-react]:text-start" />
          </span>
          <span className="flex items-baseline gap-2 text-[length:var(--px-text-xs)] text-muted-foreground">
            Spread
            <span className="grid grid-cols-1 grid-rows-1 justify-items-end">
              <span className={cn("col-start-1 row-start-1 grid", figure, spread === null && "invisible")}>
                <AnimatedNumber value={spread ?? 0} widest={[0, range[1] - range[0]]} format={digits} tint={false} animated={shown.roll} className={figure} />
              </span>
              <span className={cn("col-start-1 row-start-1", spread !== null && "invisible")}>{"—"}</span>
            </span>
          </span>
        </div>
        <ul aria-label="Bids" className="grid">
          {slots.slice(depth).map((slot, n) => level(slot, n + depth))}
        </ul>
        {filled.length ? null : (
          <div className="absolute inset-0 grid place-content-center gap-1 rounded-b-[calc(var(--radius-card)-1px)] bg-card p-4 text-center">
            <p className="font-semibold">No orders</p>
            <p className="text-[length:var(--px-text-sm)] text-muted-foreground">Bids and asks appear here as they arrive.</p>
          </div>
        )}
      </div>
      <p id={`${id}-hint`} className={cn("border-t border-border px-(--cell-px) py-2 text-[length:var(--px-text-xs)] text-muted-foreground", !onPick && "hidden")}>
        Pick a price with a click, or with the arrow keys and Enter.
      </p>
      <span role="status" className="sr-only">
        {said}
      </span>
    </section>
  )
}

export { OrderBook, type BookLevel, type BookPick, type BookSide, type OrderBookProps }
