import * as React from "react"
import { PauseIcon, PlayIcon } from "lucide-react"

import { IconMorph } from "@/components/ui/icon-morph"
import { Toggle } from "@/components/ui/toggle"
import { useMorph } from "@/hooks/use-morph"
import { cn } from "@/lib/utils"

const still = "(prefers-reduced-motion: reduce)"
const subscribe = (change: () => void) => {
  const query = matchMedia(still)
  query.addEventListener("change", change)
  return () => query.removeEventListener("change", change)
}
const useStill = () => React.useSyncExternalStore(subscribe, () => matchMedia(still).matches, () => false)

const focusable = ["a[href]", "button", "input", "select", "textarea", "summary", "[tabindex]", "[contenteditable]"].map((one) => `[data-clone] ${one}`).join()

type Hold = "hover" | "focus" | "drag" | "paused"

type MarqueeProps = Omit<React.ComponentProps<"section">, "children"> & {
  label: string
  children: React.ReactNode
  speed?: number
  reverse?: boolean
  pauseOnHover?: boolean
  draggable?: boolean
}

function Marquee({ label, children, speed = 40, reverse = false, pauseOnHover = true, draggable = true, className, ...props }: MarqueeProps) {
  const isStill = useStill()
  const viewport = React.useRef<HTMLDivElement>(null)
  const track = React.useRef<HTMLDivElement>(null)
  const set = React.useRef<HTMLDivElement>(null)
  const [copies, setCopies] = React.useState(2)
  const [paused, setPaused] = React.useState(false)
  const { transition } = useMorph({ spring: "smooth" })
  const flight = React.useRef(transition)
  flight.current = transition
  const run = React.useRef({ holds: new Set<Hold>(), nudge: 0, glide: 0, apply: (_hold: Hold, _on: boolean) => {} })

  React.useLayoutEffect(() => {
    const box = viewport.current
    const line = track.current
    const first = set.current
    if (isStill && box) {
      const show = (event: FocusEvent) => event.target instanceof Element && event.target.scrollIntoView({ block: "nearest", inline: "nearest" })
      box.addEventListener("focusin", show)
      return () => box.removeEventListener("focusin", show)
    }
    if (!box || !line || !first) return
    const state = run.current
    let anim: Animation | undefined
    let span = 0
    let sign = 1
    const duration = () => (span / Math.max(speed, 1)) * 1000
    const wrap = (time: number) => ((time % duration()) + duration()) % duration()
    const shiftBy = (dx: number) => {
      if (!anim || !span) return
      anim.currentTime = wrap(Number(anim.currentTime ?? 0) - (dx * duration()) / (sign * span))
    }
    const setNudge = (value: number) => {
      state.nudge = value
      line.style.translate = value ? `${value}px 0px` : ""
    }
    const fold = () => {
      cancelAnimationFrame(state.glide)
      if (state.nudge) shiftBy(state.nudge)
      setNudge(0)
    }
    const settle = () => {
      if (!anim) return
      if (state.holds.size) anim.pause()
      else {
        fold()
        anim.play()
      }
    }
    state.apply = (hold, on) => {
      if (on) state.holds.add(hold)
      else state.holds.delete(hold)
      settle()
    }
    const build = () => {
      const width = first.getBoundingClientRect().width
      if (!width) return
      setCopies(Math.ceil(box.clientWidth / width) + 1)
      if (anim && Math.abs(width - span) < 0.01) return
      const progress = anim && span ? wrap(Number(anim.currentTime ?? 0)) / duration() : 0
      anim?.cancel()
      span = width
      sign = (getComputedStyle(line).direction === "rtl" ? -1 : 1) * (reverse ? -1 : 1)
      anim = line.animate([{ transform: "translateX(0px)" }, { transform: `translateX(${-sign * span}px)` }], { duration: duration(), iterations: Infinity, easing: "linear" })
      anim.currentTime = progress * duration()
      settle()
    }
    const observer = new ResizeObserver(build)
    observer.observe(box)
    observer.observe(first)
    build()

    const reveal = (target: Element) => {
      const edge = parseFloat(getComputedStyle(box).getPropertyValue("--marquee-fade")) || 0
      const frame = box.getBoundingClientRect()
      const item = target.getBoundingClientRect()
      const start = frame.left + edge
      const end = frame.right - edge
      const delta = item.left < start || item.width > end - start ? start - item.left : item.right > end ? end - item.right : 0
      if (!delta) return
      cancelAnimationFrame(state.glide)
      const from = state.nudge
      const to = from + delta
      const { duration: seconds = 0, ease = (t: number) => t } = flight.current ?? {}
      if (!seconds) return setNudge(to)
      const begun = performance.now()
      const step = (now: number) => {
        const t = Math.min((now - begun) / (seconds * 1000), 1)
        setNudge(from + (to - from) * ease(t))
        if (t < 1) state.glide = requestAnimationFrame(step)
      }
      state.glide = requestAnimationFrame(step)
    }

    let press: { id: number; x: number; moved: boolean } | undefined
    let dragged = false
    const enter = (event: PointerEvent) => pauseOnHover && event.pointerType === "mouse" && state.apply("hover", true)
    const leave = (event: PointerEvent) => event.pointerType === "mouse" && state.apply("hover", false)
    const focusIn = (event: FocusEvent) => {
      if (!(event.target instanceof Element) || !event.target.matches(":focus-visible")) return
      state.apply("focus", true)
      reveal(event.target)
    }
    const focusOut = (event: FocusEvent) => {
      if (!box.contains(event.relatedTarget as Node | null)) state.apply("focus", false)
    }
    const down = (event: PointerEvent) => {
      if (!draggable || event.button !== 0) return
      press = { id: event.pointerId, x: event.clientX, moved: false }
      dragged = false
    }
    const move = (event: PointerEvent) => {
      if (!press || event.pointerId !== press.id) return
      const dx = event.clientX - press.x
      if (!press.moved && Math.abs(dx) < 4) return
      if (!press.moved) {
        press.moved = true
        dragged = true
        box.setPointerCapture(event.pointerId)
        state.apply("drag", true)
      }
      press.x = event.clientX
      shiftBy(dx)
    }
    const up = (event: PointerEvent) => {
      if (!press || event.pointerId !== press.id) return
      const was = press.moved
      press = undefined
      if (was) state.apply("drag", false)
    }
    const click = (event: MouseEvent) => {
      if (!dragged) return
      dragged = false
      event.preventDefault()
      event.stopPropagation()
    }
    const hold = (event: DragEvent) => event.preventDefault()
    const keep = (event: MouseEvent) => event.target instanceof Element && event.target.closest("[data-clone]") && event.preventDefault()
    box.addEventListener("pointerenter", enter)
    box.addEventListener("pointerleave", leave)
    box.addEventListener("focusin", focusIn)
    box.addEventListener("focusout", focusOut)
    box.addEventListener("pointerdown", down)
    box.addEventListener("pointermove", move)
    box.addEventListener("pointerup", up)
    box.addEventListener("pointercancel", up)
    box.addEventListener("click", click, true)
    box.addEventListener("dragstart", hold)
    box.addEventListener("mousedown", keep)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(state.glide)
      anim?.cancel()
      setNudge(0)
      state.holds.delete("hover")
      state.holds.delete("focus")
      state.holds.delete("drag")
      state.apply = () => {}
      box.removeEventListener("pointerenter", enter)
      box.removeEventListener("pointerleave", leave)
      box.removeEventListener("focusin", focusIn)
      box.removeEventListener("focusout", focusOut)
      box.removeEventListener("pointerdown", down)
      box.removeEventListener("pointermove", move)
      box.removeEventListener("pointerup", up)
      box.removeEventListener("pointercancel", up)
      box.removeEventListener("click", click, true)
      box.removeEventListener("dragstart", hold)
      box.removeEventListener("mousedown", keep)
    }
  }, [isStill, speed, reverse, pauseOnHover, draggable])

  React.useLayoutEffect(() => run.current.apply("paused", paused), [paused, isStill])

  React.useLayoutEffect(() => {
    for (const node of viewport.current?.querySelectorAll<HTMLElement>(focusable) ?? []) node.tabIndex = -1
  })

  const setClass = "flex shrink-0 items-center gap-(--marquee-gap) pe-(--marquee-gap)"
  return (
    <section
      aria-label={label}
      data-slot="marquee"
      data-state={isStill ? "still" : paused ? "paused" : "running"}
      className={cn("flex min-w-0 items-center gap-2 [--marquee-fade:var(--px-space-12)] [--marquee-gap:var(--px-space-8)]", className)}
      {...props}
    >
      <div
        ref={viewport}
        data-slot="marquee-viewport"
        className={cn(
          "relative min-w-0 flex-1",
          isStill
            ? "overflow-x-auto"
            : "overflow-clip py-1 [mask-image:linear-gradient(to_right,transparent,black_var(--marquee-fade),black_calc(100%_-_var(--marquee-fade)),transparent)]",
          !isStill && draggable && "cursor-grab touch-pan-y select-none active:cursor-grabbing"
        )}
      >
        <div ref={track} data-slot="marquee-track" className="relative flex w-max">
          {!isStill && (
            <div aria-hidden data-slot="marquee-set" data-clone="" className={cn(setClass, "absolute inset-y-0 end-full w-max")}>
              {children}
            </div>
          )}
          <div ref={set} data-slot="marquee-set" className={setClass}>
            {children}
          </div>
          {!isStill &&
            Array.from({ length: copies }, (_, index) => (
              <div key={index} aria-hidden data-slot="marquee-set" data-clone="" className={setClass}>
                {children}
              </div>
            ))}
        </div>
      </div>
      {!isStill && (
        <Toggle size="sm" aria-label="Pause" pressed={paused} onPressedChange={setPaused}>
          <IconMorph icon={paused ? PlayIcon : PauseIcon} />
        </Toggle>
      )}
    </section>
  )
}

export { Marquee, type MarqueeProps }
