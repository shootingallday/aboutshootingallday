import * as React from "react"

import { readLocale } from "@/lib/locale"
import { cn } from "@/lib/utils"

type Slot = { id: number; text: string; phase: "held" | "in" | "out" }
type Place = { inline: number; block: number }

const cutters = new Map<string, Intl.Segmenter>()
const apart = /^[\p{Script=Common}\p{Script=Inherited}\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]*$/u

/** The pieces a value can be carried in. A script that joins or reorders its letters is drawn from
 *  the run they sit in, and a letter in a box of its own is not in that run any more, so those
 *  values travel as whole words. Everywhere else the piece is the grapheme cluster, which keeps a
 *  letter and the marks above it together whatever the value is made of. */
function segment(text: string, locale: string, words = false) {
  const granularity = words || !apart.test(text) ? "word" : "grapheme"
  const key = `${locale} ${granularity}`
  let cutter = cutters.get(key)
  if (!cutter) cutters.set(key, (cutter = new Intl.Segmenter(locale, { granularity })))
  return [...cutter.segment(text)].map((part) => part.segment)
}

/** How the two values line up, as new place to old place. The longest run they have in common is
 *  matched first and the parts either side of it are matched the same way, so the run travels
 *  together: "USD" crosses the slash as three characters that were beside each other and still are,
 *  rather than being picked apart to collect one more match from somewhere else in the value. */
function pair(from: string[], to: string[], kept = new Map<number, number>(), at = { from: 0, to: 0 }) {
  const runs = Array.from({ length: from.length + 1 }, () => new Array<number>(to.length + 1).fill(0))
  let best = { length: 0, from: 0, to: 0 }
  for (let i = 0; i < from.length; i++)
    for (let j = 0; j < to.length; j++)
      if (from[i] === to[j]) {
        const length = (runs[i + 1][j + 1] = runs[i][j] + 1)
        if (length > best.length) best = { length, from: i + 1 - length, to: j + 1 - length }
      }
  if (!best.length) return kept
  for (let n = 0; n < best.length; n++) kept.set(at.to + best.to + n, at.from + best.from + n)
  pair(from.slice(0, best.from), to.slice(0, best.to), kept, at)
  pair(from.slice(best.from + best.length), to.slice(best.to + best.length), kept, { from: at.from + best.from + best.length, to: at.to + best.to + best.length })
  return kept
}

const still = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches
const duration = (el: HTMLElement) => parseFloat(getComputedStyle(el).transitionDuration) * 1000 || 0
const parts = (value: string) => (value === "none" ? [] : value.split(" ").map(parseFloat))
const place = (node: HTMLElement, frame: DOMRect, rtl: boolean): Place => {
  const rect = node.getBoundingClientRect()
  const [tx = 0, ty = 0] = parts(getComputedStyle(node).translate)
  return { inline: rtl ? frame.right - rect.right + tx : rect.left - tx - frame.left, block: rect.top - ty - frame.top }
}

const face = "group/morph inline-block whitespace-pre transition-[opacity,translate] spring-snappy data-settling:transition-none"
const grain = "inline-block transition-[scale] spring-snappy group-data-settling/morph:transition-none"
const inner = (node: HTMLElement) => node.firstElementChild as HTMLElement

/** One value becoming another in place, carrying the characters they share.
 *
 *  The two values are cut into pieces in the reader's locale — a grapheme cluster, or a whole word
 *  where the script joins — and paired by their longest common run, so "EUR/USD" becoming
 *  "USD/JPY" keeps U, S and D on screen and carries them across the slash: the shared characters
 *  are the same elements before and after, never a replacement drawn in the same place. Only the
 *  difference travels, what is leaving pinned where it stood and lifting away as what arrives rises
 *  into its place. The box travels between the two measured widths instead of jumping, so the line
 *  around it is never handed a new width in one frame.
 *
 *  `reserve` is every value this can hold. The space it takes is the widest of them, drawn out of
 *  sight in the pieces the value itself is drawn in, since a run of boxes and the same run of text
 *  do not measure the same to the last sixty-fourth of a pixel. The travel between the two measured
 *  widths then happens inside a reservation that never changes, and nothing beside the value moves.
 *
 *  `direction` is the author's to set and says which way the value moved: `up` lifts what is
 *  leaving and brings what arrives up from below.
 *
 *  It is for one value becoming another and never for a state becoming a different state: a status
 *  change wants its own colour and its own announcement, not a swap smooth enough to miss. The
 *  characters are hidden from the accessibility tree and the value is carried once beside them, so
 *  a reader is told the new value rather than spelled it, and the outgoing one is never announced.
 */
function TextMorph({ children, direction = "up", reserve, wrap = false, className, ...props }: Omit<React.ComponentProps<"span">, "children"> & { children: string; direction?: "up" | "down"; reserve?: string[]; wrap?: boolean }) {
  const px = React.useMemo(() => readLocale(), [])
  const box = React.useRef<HTMLSpanElement>(null)
  const rail = React.useRef<HTMLSpanElement>(null)
  const [shown, setShown] = React.useState(() => ({ text: children, slots: segment(children, px.locale, wrap).map((text, index): Slot => ({ id: index, text, phase: "held" })) }))
  const minted = React.useRef(shown.slots.length)
  const pending = React.useRef<{ text: string; width: number; places: Map<number, Place> } | null>(null)
  const settle = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  const release = React.useRef(0)

  React.useLayoutEffect(
    () => () => {
      clearTimeout(settle.current)
      cancelAnimationFrame(release.current)
    },
    []
  )

  React.useLayoutEffect(() => {
    const frame = box.current
    const line = rail.current
    if (children === shown.text || !frame || !line) return
    const parts = segment(children, px.locale, wrap)
    const held = shown.slots.filter((slot) => slot.phase !== "out")
    const kept = pair(
      held.map((slot) => slot.text),
      parts
    )
    const quiet = still()
    const next = parts.map((text, index): Slot => {
      const was = kept.get(index)
      return was === undefined ? { id: (minted.current += 1), text, phase: quiet ? "held" : "in" } : { ...held[was], phase: "held" }
    })
    if (quiet) return setShown({ text: children, slots: next })

    const rtl = getComputedStyle(frame).direction === "rtl"
    const drawn = [...line.children] as HTMLElement[]
    const carried = shown.slots.map((slot, index) => [slot, drawn[index]] as const).filter(([slot, node]) => node && slot.phase !== "out")
    const change = () => {
      const outline = frame.getBoundingClientRect()
      const places = new Map<number, Place>()
      for (const [slot, node] of carried) places.set(slot.id, place(node, outline, rtl))
      pending.current = { text: children, width: outline.width, places }
      const taken = new Set(kept.values())
      const leaving = held.filter((_, index) => !taken.has(index)).map((slot): Slot => ({ ...slot, phase: "out" }))
      setShown({ text: children, slots: [...next, ...leaving, ...shown.slots.filter((slot) => slot.phase === "out")] })
    }
    if (!carried.some(([, node]) => node.getAnimations().length)) return change()

    for (const [, node] of carried) {
      const { translate, opacity } = getComputedStyle(node)
      const { scale } = getComputedStyle(inner(node))
      node.dataset.settling = ""
      Object.assign(node.style, { translate, opacity })
      inner(node).style.scale = scale
    }
    if (!wrap) frame.style.inlineSize = `${frame.getBoundingClientRect().width}px`
    frame.dataset.settling = ""
    clearTimeout(settle.current)
    cancelAnimationFrame(release.current)
    release.current = requestAnimationFrame(() => {
      release.current = requestAnimationFrame(change)
    })
  }, [children, shown, px.locale, wrap])

  /** Read where the characters were, let React place them, then play each one from where it used
   *  to be. The work waits for the render that draws the new value, since both of these run in the
   *  commit the one above hands the places over in, where the characters are still the old ones. The
   *  settling attribute holds the transition off for the frame the starting values are written in,
   *  and the release waits for that frame to be drawn, otherwise the character animates into the
   *  offset before it animates out of it. Both measurements are taken at the width the box is
   *  leaving, because a box that centres its content moves every character under the travel while
   *  it resizes. */
  React.useLayoutEffect(() => {
    const job = pending.current
    const frame = box.current
    const line = rail.current
    if (!job || !frame || !line || job.text !== shown.text) return
    pending.current = null
    const rtl = getComputedStyle(frame).direction === "rtl"
    const rise = direction === "up" ? -1 : 1
    const drawn = [...line.children] as HTMLElement[]
    const moving = shown.slots.map((slot, index) => [slot, drawn[index]] as const).filter(([slot, node]) => node && (slot.phase === "in" || job.places.has(slot.id)))

    for (const [, node] of moving) {
      const { translate, opacity } = getComputedStyle(node)
      const { scale } = getComputedStyle(inner(node))
      node.dataset.settling = ""
      Object.assign(node.style, { translate, opacity })
      inner(node).style.scale = scale
    }
    frame.dataset.settling = ""
    frame.style.inlineSize = ""
    const grown = frame.getBoundingClientRect().width
    if (!wrap) frame.style.inlineSize = `${job.width}px`
    const outline = frame.getBoundingClientRect()

    for (const [slot, node] of moving) {
      const was = job.places.get(slot.id)
      if (slot.phase === "in") {
        node.style.opacity = "0"
        inner(node).style.scale = "0.85"
        node.style.translate = `0 ${-rise * 0.5}em`
      } else if (!was) continue
      else if (slot.phase === "out") {
        node.style.insetInlineStart = `${was.inline}px`
        node.style.top = `${was.block}px`
      } else {
        const now = place(node, outline, rtl)
        const [tx = 0, ty = 0] = parts(node.style.translate)
        const travel = was.inline - now.inline
        const dx = tx + (rtl ? -travel : travel)
        const dy = ty + was.block - now.block
        node.style.translate = dx || dy ? `${dx}px ${dy}px` : ""
      }
    }

    void frame.offsetWidth
    clearTimeout(settle.current)
    cancelAnimationFrame(release.current)
    release.current = requestAnimationFrame(() => {
      delete frame.dataset.settling
      if (!wrap) frame.style.inlineSize = `${grown}px`
      for (const [slot, node] of moving) {
        delete node.dataset.settling
        if (slot.phase !== "out") {
          node.style.translate = ""
          node.style.opacity = ""
          inner(node).style.scale = ""
        } else {
          node.style.opacity = "0"
          inner(node).style.scale = "0.85"
          node.style.translate = `0 ${rise * 0.5}em`
        }
      }
      settle.current = setTimeout(() => {
        frame.style.inlineSize = ""
        setShown((was) => ({ ...was, slots: was.slots.filter((slot) => slot.phase !== "out").map((slot) => (slot.phase === "in" ? { ...slot, phase: "held" } : slot)) }))
      }, duration(frame))
    })
  })

  return (
    <span data-slot="text-morph" className={cn(wrap ? "grid grid-cols-1" : "inline-grid grid-cols-1 align-bottom", className)} {...props}>
      <span className="sr-only select-none">{shown.text}</span>
      {reserve?.length ? (
        <span aria-hidden="true" data-slot="text-morph-reserve" className="invisible col-start-1 row-start-1 grid grid-cols-1 select-none whitespace-pre">
          {reserve.map((value) => (
            <span key={value} className="col-start-1 row-start-1">
              {segment(value, px.locale).map((piece, index) => (
                <span key={index} className="inline-block">
                  <span className="inline-block">{piece}</span>
                </span>
              ))}
            </span>
          ))}
        </span>
      ) : null}
      <span
        ref={box}
        dir="auto"
        data-slot="text-morph-box"
        className={cn("relative col-start-1 row-start-1 text-start [clip-path:inset(0)] transition-[inline-size] spring-snappy data-settling:transition-none", wrap ? "w-full" : "w-fit")}
      >
        <span ref={rail} aria-hidden="true" className={wrap ? "whitespace-pre-wrap" : "whitespace-pre"}>
          {shown.slots.map((slot) => (
            <span key={slot.id} data-morph={slot.phase} className={cn(face, slot.phase === "out" && "absolute")}>
              <span className={grain}>{slot.text}</span>
            </span>
          ))}
        </span>
      </span>
    </span>
  )
}

export { TextMorph, segment }
