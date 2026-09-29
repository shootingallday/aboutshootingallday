"use client"

import * as React from "react"

import { AnimatedNumber, type AnimatedNumberProps } from "@/components/ui/animated-number"
import { InstrumentLabel } from "@/components/ui/instrument-label"
import { useMorph } from "@/hooks/use-morph"
import { cn } from "@/lib/utils"
import { MINUS, toneOf } from "@/lib/format"
import { readLocale } from "@/lib/locale"

const figure = "justify-items-end [&>number-flow-react]:text-end"
const toned = "data-[tone=gain]:text-gain data-[tone=loss]:text-loss"

type TickerProps = Omit<React.ComponentProps<"div">, "children"> & {
  symbol: string
  venue?: string
  price: number
  reference: number
  range: [number, number]
  fraction?: number
}

function useFramed<T>(value: T, duration: number) {
  const [shown, setShown] = React.useState({ value, roll: true })
  const latest = React.useRef(value)
  const frame = React.useRef(0)
  const last = React.useRef(-Infinity)

  React.useEffect(() => {
    latest.current = value
    if (frame.current) return
    frame.current = requestAnimationFrame((now) => {
      frame.current = 0
      const roll = now - last.current >= duration
      last.current = now
      setShown((was) => (was.value === latest.current ? was : { value: latest.current, roll }))
    })
  }, [value, duration])

  React.useEffect(
    () => () => {
      cancelAnimationFrame(frame.current)
      frame.current = 0
    },
    []
  )

  return shown
}

function Signed({ value, widest, format, animated }: { value: number; widest: number[]; format: NonNullable<AnimatedNumberProps["format"]>; animated: boolean }) {
  const px = React.useMemo(() => readLocale(), [])
  const write = new Intl.NumberFormat(px.locale, { ...format, signDisplay: "exceptZero" })
  const signOf = (of: number) => write.formatToParts(of).find((part) => part.type === "minusSign" || part.type === "plusSign")?.value.replace(/-/g, MINUS) ?? ""
  const sign = signOf(value)
  return (
    <span role="img" aria-label={write.format(value).replace(/-/g, MINUS)} className="px-num inline-grid grid-cols-[auto_minmax(0,1fr)]">
      <span aria-hidden="true" className="inline-grid">
        {[signOf(1), signOf(-1)].map((glyph) => (
          <span key={glyph} className={cn("col-start-1 row-start-1", glyph !== sign && "invisible")}>
            {glyph}
          </span>
        ))}
      </span>
      <AnimatedNumber aria-hidden="true" value={Math.abs(value)} widest={widest.map(Math.abs)} format={{ ...format, signDisplay: "never" }} tint={false} animated={animated} className={figure} />
    </span>
  )
}

function formats(fraction: number) {
  const digits = { minimumFractionDigits: fraction, maximumFractionDigits: fraction }
  return {
    digits,
    signed: { ...digits, signDisplay: "exceptZero" } as const,
    ratio: { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" } as const,
  }
}

const Figures = React.memo(function Figures({ value, roll, reference, low, high, fraction }: { value: number; roll: boolean; reference: number; low: number; high: number; fraction: number }) {
  const { digits, ratio } = formats(fraction)
  const change = Number((value - reference).toFixed(fraction))
  const share = Number((change / reference).toFixed(4))
  return (
    <span className="grid justify-items-end">
      <AnimatedNumber value={value} widest={[low, high]} format={digits} animated={roll} className={cn("font-semibold", figure)} />
      <span className="flex gap-2 text-[length:var(--px-text-xs)] font-medium text-muted-foreground">
        <span data-tone={toneOf(change)} className={toned}>
          <Signed value={change} widest={[low - reference, high - reference]} format={digits} animated={roll} />
        </span>
        <span data-tone={toneOf(share)} className={toned}>
          <Signed value={share} widest={[(low - reference) / reference, (high - reference) / reference]} format={ratio} animated={roll} />
        </span>
      </span>
    </span>
  )
})

function Ticker({ symbol, venue, price, reference, range, fraction = 2, className, onKeyDown, onBlur, ...props }: TickerProps) {
  const { timing } = useMorph({ spring: "snappy" })
  const shown = useFramed(price, timing?.duration ?? 0)
  const [spoken, setSpoken] = React.useState("")
  const id = React.useId()
  const px = React.useMemo(() => readLocale(), [])

  const speak = (event: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented || event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return
    event.preventDefault()
    const { digits, signed, ratio } = formats(fraction)
    const write = (options: Intl.NumberFormatOptions, value: number) => new Intl.NumberFormat(px.locale, options).format(value).replace(/-/g, MINUS)
    const change = Number((shown.value - reference).toFixed(fraction))
    const text = `${symbol} ${write(digits, shown.value)}, ${write(signed, change)}, ${write(ratio, Number((change / reference).toFixed(4)))}`
    setSpoken((was) => (was === text ? `${text}\u00a0` : text))
  }

  return (
    <div
      role="group"
      tabIndex={0}
      aria-labelledby={`${id}-name`}
      aria-describedby={`${id}-hint`}
      onKeyDown={speak}
      onBlur={(event) => {
        onBlur?.(event)
        setSpoken("")
      }}
      className={cn(
        "inline-grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 rounded-control px-2 py-1.5 outline-none focus-visible:shadow-(--focus-ring)",
        className
      )}
      {...props}
    >
      <InstrumentLabel id={`${id}-name`} symbol={symbol} venue={venue} />
      <Figures value={shown.value} roll={shown.roll} reference={reference} low={range[0]} high={range[1]} fraction={fraction} />
      <span id={`${id}-hint`} hidden>
        Press Enter to hear the price.
      </span>
      <span role="status" className="sr-only">
        {spoken}
      </span>
    </div>
  )
}

export { Ticker, useFramed, type TickerProps }
