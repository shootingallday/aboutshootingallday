"use client"

import * as React from "react"

import { segment } from "@/components/ui/text-morph"
import { readLocale } from "@/lib/locale"
import { cn } from "@/lib/utils"

const pools = ["fijlrt", "abcdeghkmnopqsuvwxyz", "IJ", "ABCDEFGHKLMNOPQRSTUVWXYZ", "0123456789"]

const poolOf = (piece: string) => (piece.length === 1 ? pools.find((pool) => pool.includes(piece)) : undefined)

function draw(pool: string, not: string) {
  const pick = pool[Math.floor(Math.random() * (pool.length - 1))]
  return pick === not ? pool.at(-1)! : pick
}

type Mark = { text: string; glyph?: string; left: number; top: number; height: number }

function TextScramble({ children, className, ...props }: Omit<React.ComponentProps<"span">, "children"> & { children: string }) {
  const px = React.useMemo(() => readLocale(), [])
  const pieces = React.useMemo(() => segment(children, px.locale).flatMap((piece) => (/^[\x21-\x7e]+$/.test(piece) ? [...piece] : [piece])), [children, px.locale])
  const host = React.useRef<HTMLSpanElement>(null)
  const layer = React.useRef<HTMLSpanElement>(null)
  const played = React.useRef(false)
  const [shown, setShown] = React.useState<{ pieces: string[]; marks?: Mark[] }>()

  React.useLayoutEffect(() => {
    const el = host.current
    if (played.current || !el) return
    const duration = parseFloat(getComputedStyle(el).getPropertyValue("--px-duration-reveal")) || 0
    const order = pieces.flatMap((piece, index) => (poolOf(piece) ? [index] : []))
    if (!duration || !order.length) return setShown(undefined)
    const starts = pieces.map((_, index) => pieces.slice(0, index).join("").length)
    const scramble = (settled: number) => {
      const text = el.firstChild
      const origin = layer.current?.getBoundingClientRect()
      if (!(text instanceof Text) || !origin) return { pieces }
      const range = document.createRange()
      const left = new Set(order.slice(settled))
      const marks = pieces.flatMap((piece, index): Mark[] => {
        if (!piece.trim()) return []
        range.setStart(text, starts[index])
        range.setEnd(text, starts[index] + piece.length)
        const box = range.getBoundingClientRect()
        return [{ text: piece, glyph: left.has(index) ? draw(poolOf(piece)!, piece) : undefined, left: box.left - origin.left, top: box.top - origin.top, height: box.height }]
      })
      return { pieces, marks }
    }
    setShown({ pieces })
    let frame = 0
    let gone = false
    const seen = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        seen.disconnect()
        document.fonts.ready.then(() => {
          if (gone) return
          played.current = true
          setShown(scramble(0))
          let start: number | undefined
          let step = 0
          frame = requestAnimationFrame(function tick(now) {
            start ??= now
            const settled = Math.min(order.length, Math.floor(((now - start) / duration) * order.length))
            if (settled !== step) setShown(settled < order.length ? scramble(settled) : undefined)
            step = settled
            if (settled < order.length) frame = requestAnimationFrame(tick)
          })
        })
      },
      { threshold: 0.5 }
    )
    seen.observe(el)
    return () => {
      gone = true
      seen.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [pieces])

  const now = shown?.pieces === pieces ? shown : undefined

  return (
    <span
      ref={host}
      data-slot="text-scramble"
      data-scrambling={now ? "" : undefined}
      className={cn("data-scrambling:not-print:[-webkit-text-fill-color:transparent]", className)}
      {...props}
    >
      {children}
      <span ref={layer} aria-hidden="true" className="pointer-events-none absolute select-none print:hidden">
        {now?.marks?.map((mark, index) => (
          <span
            key={index}
            data-glyph={mark.glyph}
            className="absolute whitespace-pre [direction:ltr] [-webkit-text-fill-color:currentColor] data-glyph:text-muted-foreground"
            style={{ left: mark.left, top: mark.top, lineHeight: `${mark.height}px` }}
          >
            {mark.glyph ?? mark.text}
          </span>
        ))}
      </span>
    </span>
  )
}

export { TextScramble }
