"use client"

import * as React from "react"
import NumberFlow, { NumberFlowGroup } from "@number-flow/react"

import { useMorph } from "@/hooks/use-morph"
import { cn } from "@/lib/utils"
import { MINUS } from "@/lib/format"
import { readLocale } from "@/lib/locale"

type AnimatedNumberProps = React.ComponentProps<typeof NumberFlow> & { tint?: boolean; widest?: number | number[] }

const writers = new Map<string, Intl.NumberFormat>()

function writer(locales: Intl.LocalesArgument, options: Intl.NumberFormatOptions) {
  const key = JSON.stringify([locales, options])
  let write = writers.get(key)
  if (!write) writers.set(key, (write = new Intl.NumberFormat(locales, options)))
  return write
}

const useRenderedEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect

function useRoll() {
  const { timing } = useMorph({ spring: "snappy" })
  return timing && { transformTiming: timing, spinTiming: timing, opacityTiming: timing }
}

/** A value that rolls digit to digit when it changes.
 *
 *  `widest` is the bound or bounds the value can reach, and the numeral reserves the room they need:
 *  each one is written out in the same format behind the figure on screen, out of the accessibility
 *  tree and invisible, so the box is the width of the widest value the caller says is possible
 *  rather than the width of the one being shown, and a figure that gains a digit or a sign moves
 *  nothing beside it. The digits still morph inside that reservation, and a reader who asked for
 *  stillness still gets them snapped. Without it the box follows the current value. */
function AnimatedNumber({ value, className, format, locales, tint = true, widest, ...props }: AnimatedNumberProps) {
  const host = React.useRef<HTMLSpanElement>(null)
  const previous = React.useRef(value)
  const px = React.useMemo(() => readLocale(), [])
  const roll = useRoll()
  const write = writer(locales ?? px.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2, ...format })
  const reserved = widest === undefined ? [] : [...new Set([widest].flat().map((bound) => write.format(bound).replace(/-/g, MINUS)))]

  React.useEffect(() => {
    const was = previous.current
    previous.current = value
    const el = host.current
    if (!tint || !el || value === was) return
    el.removeAttribute("data-direction")
    void el.offsetWidth
    el.dataset.direction = value > was ? "up" : "down"
  }, [value, tint])

  useRenderedEffect(() => {
    const root = host.current?.querySelector("number-flow-react")?.shadowRoot
    for (const glyph of root?.querySelectorAll('[part~="sign"] > *') ?? [])
      if (glyph.textContent === "-") glyph.textContent = MINUS
  })

  return (
    <span ref={host} className={cn("px-num", reserved.length && "inline-grid grid-cols-1 grid-rows-1 justify-items-center", className)}>
      {reserved.map((bound) => (
        <span key={bound} aria-hidden="true" className="invisible col-start-1 row-start-1 select-none">
          {bound}
        </span>
      ))}
      <NumberFlow
        value={value}
        locales={locales ?? px.locale}
        format={{ minimumFractionDigits: 2, maximumFractionDigits: 2, ...format }}
        className={reserved.length ? "col-start-1 row-start-1 justify-self-stretch text-center contain-inline-size" : undefined}
        {...roll}
        {...props}
      />
    </span>
  )
}

type AnimatedClockProps = Omit<React.ComponentProps<"span">, "children"> & { value: Date; seconds?: boolean }

const clockFields = ["hour", "minute", "second"] as const

/** A time that rolls each field forward as it ticks, in the locale's time zone and hour cycle. Every
 *  field holds two tabular digits and the day period holds the room of the widest one, so the clock
 *  keeps one box through every second of the day. */
function AnimatedClock({ value, seconds = true, className, ...props }: AnimatedClockProps) {
  const px = React.useMemo(() => readLocale(), [])
  const roll = useRoll()
  const options: Intl.DateTimeFormatOptions = { timeZone: px.timeZone, hourCycle: px.hourCycle, hour: "2-digit", minute: "2-digit", second: seconds ? "2-digit" : undefined }
  const shown = new Intl.DateTimeFormat(px.locale, options)
  const count = Object.fromEntries(new Intl.DateTimeFormat("en-US", { ...options, numberingSystem: "latn" }).formatToParts(value).map((part) => [part.type, part.value]))
  const periods = [...new Set([0, 12].map((hour) => shown.formatToParts(new Date(Date.UTC(2000, 0, 1, hour))).find((part) => part.type === "dayPeriod")?.value ?? ""))]

  return (
    <span role="img" aria-label={shown.format(value)} className={cn("px-num inline-flex items-baseline whitespace-pre", className)} {...props}>
      <NumberFlowGroup>
        {shown.formatToParts(value).map((part, index) =>
          clockFields.includes(part.type as (typeof clockFields)[number]) ? (
            <NumberFlow
              key={part.type}
              aria-hidden="true"
              value={Number(count[part.type])}
              locales={px.locale}
              format={{ minimumIntegerDigits: 2, useGrouping: false }}
              digits={{ 1: { max: part.type !== "hour" ? 5 : px.hourCycle === "h23" ? 2 : 1 } }}
              trend={1}
              {...roll}
            />
          ) : part.type === "dayPeriod" ? (
            <span key={part.type} aria-hidden="true" className="inline-grid">
              {periods.map((period) => (
                <span key={period} className={cn("col-start-1 row-start-1", period !== part.value && "invisible")}>
                  {period}
                </span>
              ))}
            </span>
          ) : (
            <span key={`${part.type}-${index}`} aria-hidden="true">
              {part.value}
            </span>
          )
        )}
      </NumberFlowGroup>
    </span>
  )
}

export { AnimatedClock, AnimatedNumber, type AnimatedClockProps, type AnimatedNumberProps }
