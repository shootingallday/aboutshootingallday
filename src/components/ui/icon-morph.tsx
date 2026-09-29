import * as React from "react"
import type { LucideIcon } from "lucide-react"

import { useMorph } from "@/hooks/use-morph"
import { cn } from "@/lib/utils"

type Subpath = { pts: number[]; loop: boolean }
type Pair = { a: number[]; b: number[]; loop: boolean }

const svgNS = "http://www.w3.org/2000/svg"
const shapes = "path,circle,ellipse,rect,line,polyline,polygon"
const points = 96

const glyphs = new WeakMap<LucideIcon, Subpath[]>()

/** Where a glyph's shapes run, read from the browser's own geometry engine rather than from a path
 *  parser of our own: every SVG shape answers `getPointAtLength`, so a line, a circle and a curve
 *  all resample into the same fixed run of equidistant points and can be interpolated against each
 *  other. A closed shape's last point lands back on its first, so it draws as a loop without a
 *  command the two sides would have to agree on. */
function resample(shape: SVGGeometryElement) {
  const span = shape.getTotalLength()
  const pts: number[] = []
  for (let i = 0; i < points; i++) {
    const at = shape.getPointAtLength((span * i) / (points - 1))
    pts.push(at.x, at.y)
  }
  return pts
}

/** A `d` holding several movetos is several subpaths, and sampling it whole would draw the jumps
 *  between them. Each piece is measured on its own, and a piece that opens relative keeps every
 *  number it was written with: an absolute move to wherever the pieces before it left off is put in
 *  front of it, which is a subpath of no length and nothing drawn, so the piece carries on from the
 *  point it was authored against. */
function carve(d: string, scratch: SVGPathElement) {
  const chunks = d.match(/[Mm][^Mm]*/g) ?? []
  const out: string[] = []
  let ahead = ""
  for (const chunk of chunks) {
    let piece = chunk
    if (ahead && chunk.startsWith("m")) {
      scratch.setAttribute("d", ahead)
      const at = scratch.getPointAtLength(scratch.getTotalLength())
      piece = `M${at.x},${at.y}${chunk}`
    }
    out.push(piece)
    ahead += chunk
  }
  return out
}

function trace(host: SVGGElement): Subpath[] {
  const scratch = host.ownerDocument.createElementNS(svgNS, "path") as SVGPathElement
  host.appendChild(scratch)
  const out: Subpath[] = []
  try {
    for (const shape of host.querySelectorAll<SVGGeometryElement>(shapes)) {
      if (shape === scratch) continue
      const d = shape.tagName === "path" ? (shape.getAttribute("d") ?? "") : ""
      if (!d) {
        out.push({ pts: resample(shape), loop: !["line", "polyline"].includes(shape.tagName) })
        continue
      }
      for (const piece of carve(d, scratch)) {
        scratch.setAttribute("d", piece)
        out.push({ pts: resample(scratch), loop: /z/i.test(piece) })
      }
    }
  } finally {
    scratch.remove()
  }
  return out
}

const middle = (pts: number[]) => {
  let x = 0
  let y = 0
  for (let i = 0; i < pts.length; i += 2) {
    x += pts[i]
    y += pts[i + 1]
  }
  return [(x * 2) / pts.length, (y * 2) / pts.length]
}

const collapse = (pts: number[]) => {
  const [x, y] = middle(pts)
  return Array.from({ length: pts.length }, (_, i) => (i % 2 ? y : x))
}

const cost = (a: number[], b: number[]) => {
  let sum = 0
  for (let i = 0; i < a.length; i += 2) sum += (a[i] - b[i]) ** 2 + (a[i + 1] - b[i + 1]) ** 2
  return sum
}

const flip = (pts: number[]) => {
  const out: number[] = []
  for (let i = points - 1; i >= 0; i--) out.push(pts[i * 2], pts[i * 2 + 1])
  return out
}

const spin = (pts: number[], by: number) => {
  const out: number[] = []
  for (let i = 0; i < points - 1; i++) {
    const at = ((i + by) % (points - 1)) * 2
    out.push(pts[at], pts[at + 1])
  }
  out.push(out[0], out[1])
  return out
}

/** Which point of the arriving subpath answers which point of the leaving one. A loop can be
 *  entered anywhere and either way round, so every start and both directions are weighed; an open
 *  run has two ends and nothing else to choose between. Without this a circle would turn itself
 *  inside out on the way to another circle drawn from a different corner. */
function orient(from: number[], to: number[], loop: boolean) {
  let best = to
  let score = Infinity
  for (const way of [to, flip(to)]) {
    for (let by = 0; by < (loop ? points - 1 : 1); by++) {
      const tried = by ? spin(way, by) : way
      const now = cost(from, tried)
      if (now < score) {
        score = now
        best = tried
      }
    }
  }
  return best
}

/** The leaving glyph's subpaths against the arriving one's, matched by where each sits rather than
 *  by the order they were drawn in. A subpath with no counterpart shrinks into its own centre, or
 *  grows out of it, so a pair that does not have the same number of strokes still resolves. */
function link(from: Subpath[], to: Subpath[]): Pair[] {
  const options = from.flatMap((one, i) => to.map((other, j) => ({ i, j, gap: cost(collapse(one.pts), collapse(other.pts)) })))
  options.sort((one, other) => one.gap - other.gap)
  const taken = new Map<number, number>()
  const used = new Set<number>()
  for (const option of options) {
    if (taken.has(option.i) || used.has(option.j)) continue
    taken.set(option.i, option.j)
    used.add(option.j)
  }
  const pairs = from.map((one, i): Pair => {
    const j = taken.get(i)
    if (j === undefined) return { a: one.pts, b: collapse(one.pts), loop: one.loop }
    const loop = one.loop && to[j].loop
    return { a: one.pts, b: orient(one.pts, to[j].pts, loop), loop }
  })
  for (const [j, other] of to.entries()) if (!used.has(j)) pairs.push({ a: collapse(other.pts), b: other.pts, loop: other.loop })
  return pairs
}

const round = (value: number) => Math.round(value * 100) / 100

const far = 8
const apart = 3

const cloud = (subs: Subpath[]) => subs.filter((sub) => draw(sub.pts)).flatMap((sub) => sub.pts.flatMap((value, i) => (i % 2 ? [] : [[value, sub.pts[i + 1]]])))

const reach = (from: number[][], to: number[][]) => {
  let sum = 0
  for (const [x, y] of from) {
    let near = Infinity
    for (const [u, v] of to) near = Math.min(near, (x - u) ** 2 + (y - v) ** 2)
    sum += Math.sqrt(near)
  }
  return sum / from.length
}

function corresponds(from: Subpath[], to: Subpath[], pairs: Pair[]) {
  const travel = pairs.filter((pair) => draw(pair.a) && draw(pair.b)).map((pair) => Math.sqrt(cost(pair.a, pair.b) / points))
  const one = cloud(from)
  const other = cloud(to)
  if (!travel.length || !one.length || !other.length) return true
  return travel.reduce((sum, value) => sum + value, 0) / travel.length <= far || Math.max(reach(one, other), reach(other, one)) <= apart
}

type Look = { opacity: string; transform: string; filter: string; transformOrigin: string }

const shown = (): Look => ({ opacity: "1", transform: "scale(1)", filter: "blur(0px)", transformOrigin: "12px 12px" })

const hidden = (svg: SVGSVGElement): Look => ({ opacity: "0", transform: "scale(0.25)", filter: `blur(${(4 * 24) / (svg.getBoundingClientRect().width || 24)}px)`, transformOrigin: "12px 12px" })

const lookOf = (node: Element): Look => {
  const style = getComputedStyle(node)
  return { opacity: style.opacity, transform: style.transform === "none" ? "scale(1)" : style.transform, filter: style.filter === "none" ? "blur(0px)" : style.filter, transformOrigin: "12px 12px" }
}

type Leaving = { id: number; icon: LucideIcon | null; paths: string[]; from: Look }

/** A subpath collapsed onto its own centre has no extent at all, and a round cap would paint that as
 *  a dot, so it draws nothing until it has somewhere to go. Lucide's own dots are a hundredth of a
 *  unit wide rather than nothing, and still draw. */
function draw(pts: number[]) {
  const low = [Infinity, Infinity]
  const high = [-Infinity, -Infinity]
  let out = ""
  for (let i = 0; i < pts.length; i += 2) {
    for (const axis of [0, 1]) {
      low[axis] = Math.min(low[axis], pts[i + axis])
      high[axis] = Math.max(high[axis], pts[i + axis])
    }
    out += `${i ? "L" : "M"}${round(pts[i])} ${round(pts[i + 1])}`
  }
  return Math.max(high[0] - low[0], high[1] - low[1]) < 1e-6 ? "" : out
}

/** One icon becoming another in place, by its paths taking the other's shape.
 *
 *  The two glyphs are resampled into runs of equidistant points, their subpaths matched by where
 *  they sit and entered from the point that costs the least travel, and what the reader sees is the
 *  `path` elements that drew the old glyph, drawing the new one: their `d` changes, and where the
 *  two glyphs are made of the same number of strokes nothing is inserted or removed at all. A glyph
 *  with more strokes than the one before it adds the paths it needs, once, and keeps them; a glyph
 *  with fewer leaves them collapsed and drawing nothing rather than taking them away. The glyph
 *  arriving is measured once, out of sight and before the frame is painted, so the icon holds its
 *  box from the first frame to the last and the layout around it never learns the change happened.
 *
 *  Colour, size and stroke come from the surrounding context exactly as a static Lucide icon's do,
 *  so it stands in for one without any other change. The flight is the tokens' own, through
 *  `useMorph`, which is what lands a reader who asked for stillness on the end glyph with nothing
 *  interpolated.
 *
 *  Two glyphs interpolate when their strokes correspond. Where they do not, the strokes would have to
 *  travel more than a third of the icon to ink the other glyph has nowhere near, so the icon
 *  crossfades instead: the leaving glyph scales to a quarter, blurs 4px and fades while the arriving
 *  one does the reverse, on the smooth spring, inside the same box.
 *
 *  `label` is for an icon that carries meaning, and names the state it is in now rather than the
 *  change it is making. Without one the icon is decoration and stays out of the accessibility tree.
 */
function IconMorph({ icon, label, className, ...props }: Omit<React.ComponentProps<"svg">, "children"> & { icon: LucideIcon; label?: string }) {
  const well = React.useRef<SVGGElement>(null)
  const pose = React.useRef<Subpath[] | null>(null)
  const drawn = React.useRef<LucideIcon | null>(null)
  const run = React.useRef(0)
  const flight = React.useRef<{ duration: number; ease: (t: number) => number }>(undefined)
  const [sampling, setSampling] = React.useState<LucideIcon | null>(null)
  const [paths, setPaths] = React.useState<string[]>([])
  const [leaving, setLeaving] = React.useState<Leaving[]>([])
  const layers = React.useRef<Leaving[]>([])
  const entering = React.useRef<Look | null>(null)
  const count = React.useRef(0)
  const fade = React.useRef<{ duration: number; easing: string }>(undefined)
  const { transition } = useMorph()
  const { timing } = useMorph({ spring: "smooth" })

  React.useLayoutEffect(() => {
    flight.current = transition
    fade.current = timing
  })

  React.useLayoutEffect(() => {
    const svg = well.current?.ownerSVGElement
    if (!svg || !fade.current) return
    const timing = { duration: fade.current.duration, easing: fade.current.easing }
    if (entering.current) {
      const from = entering.current
      entering.current = null
      for (const path of svg.querySelectorAll(":scope > path")) path.animate([from, shown()], timing)
    }
    for (const layer of layers.current) {
      const node = svg.querySelector(`[data-leaving="${layer.id}"]`)
      if (!node || node.getAnimations().length) continue
      node.animate([layer.from, hidden(svg)], { ...timing, fill: "forwards" }).onfinish = () => {
        layers.current = layers.current.filter((one) => one !== layer)
        setLeaving(layers.current)
      }
    }
  })

  React.useLayoutEffect(() => () => cancelAnimationFrame(run.current), [])

  React.useLayoutEffect(() => {
    const host = well.current
    if (!host) return
    if (sampling) {
      glyphs.set(sampling, trace(host))
      setSampling(null)
      return
    }
    if (icon === drawn.current) return
    const known = glyphs.get(icon)
    if (!known) return setSampling(() => icon)
    const left = drawn.current
    drawn.current = icon

    const settle = (pairs: Pair[]) => {
      pose.current = pairs.map((pair) => ({ pts: pair.b, loop: pair.loop }))
      setPaths(pairs.map((pair) => draw(pair.b)))
    }
    const pairs = pose.current ? link(pose.current, known) : known.map((one): Pair => ({ a: one.pts, b: one.pts, loop: one.loop }))
    cancelAnimationFrame(run.current)
    const span = (flight.current?.duration ?? 0) * 1000
    if (!pose.current || span <= 0) return settle(pairs)

    const svg = host.ownerSVGElement
    if (svg && (fade.current?.duration ?? 0) > 0 && !corresponds(pose.current, known, pairs)) {
      const live = [...svg.querySelectorAll(":scope > path")]
      const back = layers.current.find((layer) => layer.icon === icon)
      const backNode = back && svg.querySelector(`[data-leaving="${back.id}"]`)
      const from = live[0] ? lookOf(live[0]) : shown()
      entering.current = backNode ? lookOf(backNode) : hidden(svg)
      for (const path of live) for (const animation of path.getAnimations()) animation.cancel()
      count.current += 1
      layers.current = [...layers.current.filter((layer) => layer !== back), { id: count.current, icon: left, paths: live.map((path) => path.getAttribute("d") ?? ""), from }]
      setLeaving(layers.current)
      return settle(known.map((one): Pair => ({ a: one.pts, b: one.pts, loop: one.loop })))
    }

    const curve = flight.current!.ease
    const began = performance.now()
    const step = () => {
      const t = Math.min(1, (performance.now() - began) / span)
      if (t >= 1) return settle(pairs)
      const eased = curve(t)
      const now = pairs.map((pair) => pair.a.map((value, index) => value + (pair.b[index] - value) * eased))
      pose.current = now.map((pts, index) => ({ pts, loop: pairs[index].loop }))
      setPaths(now.map(draw))
      run.current = requestAnimationFrame(step)
    }
    run.current = requestAnimationFrame(step)
  }, [icon, sampling])

  const Sampling = sampling
  return (
    <svg
      xmlns={svgNS}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-slot="icon-morph"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("lucide", className)}
      {...props}
    >
      <g ref={well} opacity="0" aria-hidden="true">
        {Sampling ? <Sampling width={24} height={24} /> : null}
      </g>
      {leaving.map((layer) => (
        <g key={layer.id} data-leaving={layer.id} aria-hidden="true">
          {layer.paths.map((d, index) => (
            <path key={index} d={d} />
          ))}
        </g>
      ))}
      {paths.map((d, index) => (
        <path key={index} d={d} />
      ))}
    </svg>
  )
}

export { IconMorph }
