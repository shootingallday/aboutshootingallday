import { useEffect, useRef, useState } from "react"

import { AnimatedNumber } from "@/components/ui/animated-number"
import { Button } from "@/components/ui/button"

const LOG = [310,-180,-240,420,150,-200,-120,380,95,-260,-150,510,-90,220,-310,140,260,-175,-60,330,-220,180,-140,90,470,-280,120,-110,240,-190,160,-230,350,-80,110,-270,200,-130,300,-160,75,-210,440,-100,130,-250,190,-70,280,-240,105,-150,360,-120,85,-200,230,-90,150,-170].map((v) => v * 2.5)
const START = 50000
const DD = 2000
const TARGET = 3000
const N = 400

type Path = { pts: number[]; state: "pass" | "blow" | "open" }

function deal(seed: number): Path[] {
  let s = seed
  const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
  return Array.from({ length: N }, () => {
    const t = LOG.slice()
    for (let i = t.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[t[i], t[j]] = [t[j], t[i]]
    }
    let eq = START
    let peak = START
    let state: Path["state"] = "open"
    const pts = [0]
    for (const p of t) {
      eq += p
      peak = Math.max(peak, eq)
      pts.push(eq - START)
      if (eq <= Math.min(peak - DD, START)) { state = "blow"; break }
      if (eq >= START + TARGET) { state = "pass"; break }
    }
    return { pts, state }
  })
}

export function Reshuffle() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [seed, setSeed] = useState(7)
  const [stats, setStats] = useState({ pass: 0, blow: 0, median: 0 })

  useEffect(() => {
    const cv = canvas.current!
    const ctx = cv.getContext("2d")!
    const paths = deal(seed)
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches
    const css = (n: string) => getComputedStyle(cv).getPropertyValue(n).trim()
    let raf = 0
    const draw = () => {
      cancelAnimationFrame(raf)
      const dpr = devicePixelRatio || 1
      const w = cv.clientWidth
      const h = cv.clientHeight
      cv.width = w * dpr
      cv.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const lo = -DD - 900
      const hi = TARGET + 1300
      const pad = 16
      const len = Math.max(...paths.map((p) => p.pts.length)) - 1
      const X = (i: number) => pad + (i / len) * (w - pad * 2)
      const Y = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (h - pad * 2)
      const colors = { pass: css("--gain-fill"), blow: css("--loss-fill"), open: css("--faint-foreground") }
      const frame = (upto: number) => {
        ctx.clearRect(0, 0, w, h)
        ctx.font = "11px " + css("--px-font-mono")
        ctx.fillStyle = css("--muted-foreground")
        ctx.lineWidth = 1
        for (const [v, label] of [[TARGET, "target +$3,000"], [0, "start $50,000"], [-DD, "floor −$2,000"]] as const) {
          ctx.strokeStyle = css("--border")
          ctx.setLineDash([3, 4])
          ctx.beginPath()
          ctx.moveTo(pad, Y(v))
          ctx.lineTo(w - pad, Y(v))
          ctx.stroke()
          ctx.fillText(label, w - pad - ctx.measureText(label).width, Y(v) - 6)
        }
        ctx.setLineDash([])
        const shown = paths.slice(0, upto)
        ctx.globalCompositeOperation = document.documentElement.classList.contains("dark") ? "lighter" : "source-over"
        for (const p of shown) {
          ctx.globalAlpha = document.documentElement.classList.contains("dark") ? 0.2 : 0.13
          ctx.strokeStyle = colors[p.state]
          ctx.beginPath()
          p.pts.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))))
          ctx.stroke()
        }
        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = "source-over"
        const pass = shown.filter((p) => p.state === "pass").length
        const blow = shown.filter((p) => p.state === "blow").length
        const lengths = shown.map((p) => p.pts.length - 1).sort((a, b) => a - b)
        setStats({ pass: pass / Math.max(1, shown.length), blow: blow / Math.max(1, shown.length), median: lengths[lengths.length >> 1] ?? 0 })
      }
      if (reduce) return frame(paths.length)
      let n = 0
      const step = () => {
        n = Math.min(paths.length, n + 6)
        frame(n)
        if (n < paths.length) raf = requestAnimationFrame(step)
      }
      step()
    }
    draw()
    addEventListener("resize", draw)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener("resize", draw)
    }
  }, [seed])

  return (
    <figure className="m-0 overflow-hidden rounded-dialog border border-border bg-card shadow-md">
      <canvas ref={canvas} role="img" aria-label="Four hundred account equity paths from reshuffling the same sixty trades. Paths that reach the profit target are green, paths that hit the trailing drawdown floor are red." className="block aspect-[16/9] w-full" />
      <dl className="m-0 grid grid-cols-3 border-t border-border">
        <div className="p-4 sm:p-5">
          <dt className="text-[length:var(--px-text-xs)] text-muted-foreground">Passed</dt>
          <dd className="m-0 text-[length:var(--px-text-2xl)] font-semibold tabular-nums text-gain"><AnimatedNumber value={stats.pass} format={{ style: "percent", minimumFractionDigits: 0, maximumFractionDigits: 0 }} tint={false} widest={1} /></dd>
        </div>
        <div className="border-s border-border p-4 sm:p-5">
          <dt className="text-[length:var(--px-text-xs)] text-muted-foreground">Blown</dt>
          <dd className="m-0 text-[length:var(--px-text-2xl)] font-semibold tabular-nums text-loss"><AnimatedNumber value={stats.blow} format={{ style: "percent", minimumFractionDigits: 0, maximumFractionDigits: 0 }} tint={false} widest={1} /></dd>
        </div>
        <div className="border-s border-border p-4 sm:p-5">
          <dt className="text-[length:var(--px-text-xs)] text-muted-foreground">Median trades</dt>
          <dd className="m-0 text-[length:var(--px-text-2xl)] font-semibold tabular-nums"><AnimatedNumber value={stats.median} format={{ minimumFractionDigits: 0, maximumFractionDigits: 0 }} tint={false} widest={60} /></dd>
        </div>
      </dl>
      <figcaption className="flex items-center justify-between gap-3 border-t border-border bg-muted px-4 py-3 text-[length:var(--px-text-xs)] text-muted-foreground sm:px-5">
        <span>60 sample trades, dealt 400 ways against a $50K eval with a $2K trailing drawdown. Only the order changes.</span>
        <Button size="sm" variant="outline" onClick={() => setSeed((s) => s + 1)}>Deal again</Button>
      </figcaption>
    </figure>
  )
}
