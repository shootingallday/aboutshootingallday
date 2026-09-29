import * as React from "react"

import { brandMark } from "@/lib/brand-mark"
import { cn } from "@/lib/utils"

type PartName = (typeof brandMark.parts)[number]["name"]

const order: Record<PartName, number> = { bar: 0, arm: 0.5, arrow: 1 }
const stagger: Record<PartName, string> = { bar: "[--mark-at:0]", arm: "[--mark-at:0.5]", arrow: "[--mark-at:1]" }
const hidden = 1.05

const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches

const poseKeys = ["strokeDashoffset", "fill", "fillOpacity", "strokeOpacity"] as const
type Pose = Record<(typeof poseKeys)[number], string>

const unDrawn: Pose = { strokeDashoffset: String(hidden), fill: "", fillOpacity: "0", strokeOpacity: "1" }

function pose(paths: SVGPathElement[]): Pose[] {
  return paths.map((path) => {
    const style = getComputedStyle(path)
    return { strokeDashoffset: style.strokeDashoffset, fill: style.fill, fillOpacity: style.fillOpacity, strokeOpacity: style.strokeOpacity }
  })
}

function restart(paths: SVGPathElement[], from?: Pose[]) {
  for (const [index, path] of paths.entries()) {
    path.style.transition = "none"
    for (const key of poseKeys) path.style[key] = (from?.[index] ?? unDrawn)[key]
  }
  if (paths[0]) void getComputedStyle(paths[0]).strokeDashoffset
  for (const path of paths) {
    path.style.transition = ""
    for (const key of poseKeys) path.style[key] = ""
  }
}

function AnimatedMark({
  loading = false,
  label = "Loading",
  className,
  ...props
}: Omit<React.ComponentProps<"svg">, "children"> & { loading?: boolean; label?: string }) {
  const svg = React.useRef<SVGSVGElement>(null)
  const loops = React.useRef<Animation[]>([])
  const left = React.useRef<Pose[] | undefined>(undefined)

  React.useLayoutEffect(() => {
    const node = svg.current
    if (!node) return
    const paths = [...node.querySelectorAll("path")]
    const cancel = () => {
      for (const loop of loops.current) loop.cancel()
      loops.current = []
    }
    const sync = () => {
      cancel()
      if (!loading || still()) return
      const style = getComputedStyle(node)
      const beat = parseFloat(style.getPropertyValue("--px-spring-smooth-duration"))
      const easing = style.getPropertyValue("--px-spring-smooth").trim()
      for (const path of paths) {
        for (const running of path.getAnimations()) if (running instanceof CSSTransition && running.transitionProperty === "stroke-dashoffset") running.cancel()
        const start = order[path.dataset.part as PartName] / 4
        loops.current.push(
          path.animate(
            [
              { offset: 0, strokeDashoffset: hidden },
              { offset: start, strokeDashoffset: hidden, easing },
              { offset: start + 0.25, strokeDashoffset: 0 },
              { offset: start + 0.5, strokeDashoffset: 0, easing },
              { offset: start + 0.75, strokeDashoffset: -hidden },
              { offset: 1, strokeDashoffset: -hidden },
            ],
            { duration: beat * 4, iterations: Infinity }
          )
        )
      }
    }
    if (!loading) restart(paths, left.current)
    sync()
    const motion = matchMedia("(prefers-reduced-motion: reduce)")
    motion.addEventListener("change", sync)
    return () => {
      motion.removeEventListener("change", sync)
      left.current = pose(paths)
      cancel()
    }
  }, [loading])

  return (
    <svg
      ref={svg}
      data-slot="animated-mark"
      data-loading={loading ? "" : undefined}
      viewBox={brandMark.viewBox}
      role={loading ? "status" : "img"}
      aria-label={loading ? label : "PX"}
      focusable="false"
      className={cn("group/mark size-16 shrink-0 [stroke-linejoin:round] [stroke-width:4]", className)}
      {...props}
    >
      <g transform={brandMark.transform}>
        {brandMark.parts.map((part) => (
          <path
            key={part.name}
            d={part.d}
            fillRule={part.fillRule}
            pathLength={1}
            data-part={part.name}
            className={cn(
              "[stroke-dasharray:1_1.1] [stroke-dashoffset:0] [stroke-opacity:0] [transition-property:stroke-dashoffset,fill,fill-opacity,stroke-opacity] spring-smooth",
              "[transition-delay:calc(var(--px-spring-smooth-duration)*var(--mark-at)),calc(var(--px-spring-smooth-duration)*(var(--mark-at)_+_1)),calc(var(--px-spring-smooth-duration)*(var(--mark-at)_+_1)),calc(var(--px-spring-smooth-duration)*(var(--mark-at)_+_1))]",
              "motion-safe:group-data-loading/mark:fill-(--skeleton) motion-safe:group-data-loading/mark:[stroke-opacity:1] motion-safe:group-data-loading/mark:[transition-delay:0s]",
              stagger[part.name],
              part.tone === "accent" ? "fill-(--brand-accent) stroke-(--brand-accent)" : "fill-(--brand-ink) stroke-(--brand-ink)"
            )}
          />
        ))}
      </g>
    </svg>
  )
}

export { AnimatedMark }
