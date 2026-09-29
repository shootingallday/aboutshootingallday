"use client"

import * as React from "react"

import { Marquee, type MarqueeProps } from "@/components/ui/marquee"
import { Ticker, type TickerProps } from "@/components/ui/ticker"

type TickerTapeQuote = Pick<TickerProps, "symbol" | "venue" | "price" | "reference" | "range" | "fraction">

type TickerTapeProps = Omit<MarqueeProps, "children" | "label" | "onSelect"> & {
  label?: string
  quotes: TickerTapeQuote[]
  onSelect?: (symbol: string) => void
}

const rule = "relative shrink-0 after:pointer-events-none after:absolute after:inset-y-2 after:-end-[calc(var(--marquee-gap)/2)] after:w-px after:bg-border"

function Cell({ price, ...props }: TickerProps) {
  const node = React.useRef<HTMLDivElement>(null)
  const [near, setNear] = React.useState(true)
  const held = React.useRef(price)
  if (near) held.current = price

  React.useEffect(() => {
    const cell = node.current
    const root = cell?.closest<HTMLElement>('[data-slot="marquee-viewport"]')
    if (!cell || !root) return
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { root, rootMargin: "0px 25%" })
    observer.observe(cell)
    return () => observer.disconnect()
  }, [])

  return <Ticker ref={node} price={held.current} {...props} />
}

function TickerTape({ label = "Prices", quotes, onSelect, ...props }: TickerTapeProps) {
  const hint = React.useId()
  const pick = (symbol: string) => (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.target !== event.currentTarget) return
    event.preventDefault()
    onSelect?.(symbol)
  }
  return (
    <>
      <Marquee label={label} {...props}>
        {quotes.map((quote) => (
          <Cell
            key={quote.symbol}
            data-symbol={quote.symbol}
            {...quote}
            className={rule}
            {...(onSelect && { "aria-describedby": hint, onKeyDown: pick(quote.symbol), onClick: () => onSelect(quote.symbol) })}
          />
        ))}
      </Marquee>
      {onSelect && (
        <span id={hint} hidden>
          Press Enter to select it, or Space to hear the price.
        </span>
      )}
    </>
  )
}

export { TickerTape, type TickerTapeProps, type TickerTapeQuote }
