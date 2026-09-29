import { useEffect, useRef, useState } from "react"
import { ArrowRightIcon, ArrowUpRightIcon, MailIcon } from "lucide-react"

import { Background } from "@/components/ui/background"
import { BorderBeam } from "@/components/ui/border-beam"
import { CandlestickChart } from "@/components/ui/candlestick-chart"
import { OrderBook } from "@/components/ui/order-book"
import { TextScramble } from "@/components/ui/text-scramble"
import { TickerTape } from "@/components/ui/ticker-tape"
import { INSTRUMENTS, quoteOf, usePriceStream } from "@/lib/price-stream"
import { bookOf, useCandles } from "@/lib/terminal-demo"
import { Reshuffle } from "./reshuffle"

const GITHUB = "https://github.com/shootingallday"
const X = "https://x.com/"
const EMAIL = "mailto:jomar@pxjournals.com"

function GithubIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-4"><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" /></svg>
}

function XIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-4"><path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12Z" /></svg>
}

const link = "inline-flex h-11 items-center gap-2 rounded-control border border-border bg-card px-4 font-medium text-foreground shadow-sm transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"

function Tape() {
  const feed = usePriceStream()
  const quotes = feed.quotes.map(({ symbol, venue, price, open, range, fraction }) => ({ symbol, venue, price, reference: open, range, fraction }))
  return <TickerTape label="Futures" quotes={quotes} speed={28} className="w-full border-b border-border bg-card/70 px-2 backdrop-blur" />
}

function Desk() {
  const feed = usePriceStream()
  const quote = quoteOf(feed, "NQ")
  const nq = INSTRUMENTS.find((i) => i.symbol === "NQ")!
  const candles = useCandles("NQ")
  const { bids, asks } = bookOf(feed, quote, 7, 40)
  return (
    <div className="relative overflow-hidden rounded-dialog border border-border bg-card shadow-lg">
      <BorderBeam />
      <div className="flex items-center justify-between border-b border-border px-4 py-3 text-[length:var(--px-text-sm)]">
        <span className="font-semibold">NQ · the desk</span>
        <span className="font-mono text-[length:var(--px-text-xs)] text-muted-foreground">simulated feed</span>
      </div>
      <div className="grid items-start gap-0 md:grid-cols-[1fr_16rem]">
        <CandlestickChart candles={candles} label="NQ, one-minute candles" range={nq.range} fraction={nq.fraction} size="lg" className="p-3" />
        <div className="hidden border-s border-border p-3 md:block">
          <OrderBook symbol={quote.symbol} venue={quote.venue} bids={bids} asks={asks} last={quote.price} range={quote.range} maxSize={40} fraction={quote.fraction} depth={7} />
        </div>
      </div>
    </div>
  )
}

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(now)
  return <span className="tabular-nums">{time} CT · CME</span>
}

const LOG = [
  { host: "mac", repo: "reshuffle", state: "done", note: "payout projection, proof attached" },
  { host: "mac", repo: "rewind", state: "working", note: "market replay scrubber" },
  { host: "jd-pc", repo: "market-order", state: "working", note: "broker reconnect on drop" },
  { host: "jd-pc", repo: "px-journals", state: "review", note: "second model reading the diff" },
  { host: "mac", repo: "shootingallday", state: "done", note: "this page" },
]

function Agents() {
  const box = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return setShown(LOG.length)
    let timer = 0
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      const next = (n: number) => { setShown(n); if (n < LOG.length) timer = window.setTimeout(() => next(n + 1), 420) }
      next(1)
    }, { threshold: 0.5 })
    io.observe(box.current!)
    return () => { io.disconnect(); clearTimeout(timer) }
  }, [])
  const running = LOG.filter((l) => l.state === "working").length
  return (
    <div ref={box} aria-hidden="true" className="crt overflow-hidden rounded-dialog bg-[#0b0c0a] font-mono text-[12.5px] leading-[1.9] text-[var(--px-gray-100)] shadow-lg ring-1 ring-white/10">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5 text-[11px] tracking-[0.08em] text-white/55 uppercase">
        <span>px-agents v1</span>
        <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-[var(--px-brand-300)] shadow-[0_0_8px_var(--px-brand-300)]" />{running} running</span>
      </div>
      <div className="min-h-[15rem] overflow-x-auto px-5 pt-4 pb-5 whitespace-pre">
        <div className="text-white/45">$ fleet status</div>
        {LOG.slice(0, shown).map((l) => (
          <div key={l.repo}>
            <span className={l.state === "done" ? "text-[var(--px-brand-300)]" : l.state === "working" ? "text-[var(--px-amber-300)]" : "text-white/45"}>{l.state === "done" ? "✓" : l.state === "working" ? "◐" : "·"}</span>
            {"  "}<span className="text-[#7fb0ff]">{l.host.padEnd(6)}</span>{l.repo.padEnd(16)}<span className="text-white/60">{l.note}</span>
          </div>
        ))}
        <div className="text-white/45">$ <span className="caret">▌</span></div>
      </div>
    </div>
  )
}

const OSS = [
  {
    name: "propfirm-calc",
    version: "v0.2.0",
    href: `${GITHUB}/propfirm-calc`,
    body: "The prop firm rule math most journals get subtly wrong: trailing drawdown floor, consistency rule, payout eligibility, position sizing, payout projection.",
    install: "pip install propfirm-calc",
    tags: ["Python", "No dependencies", "MIT"],
  },
  {
    name: "reshuffle",
    version: "v0.1.0",
    href: `${GITHUB}/reshuffle`,
    body: "Monte Carlo from your own trade log. It deals your trades again in orders that never happened and tells you how often the account passes, blows, and how deep it dips first.",
    install: "npm install @shootingallday/reshuffle",
    tags: ["TypeScript", "Uses propfirm-calc's math"],
  },
  {
    name: "Market Order",
    version: null,
    href: `${GITHUB}/MarketOrder`,
    body: "The live execution engine. It watches the market in real time, spots a setup as it forms, places the entry, and manages the position to its exit.",
    install: null,
    tags: ["Live trading", "Broker API"],
  },
]

const FLOW = [
  { stage: "Research", name: "Rewind", body: "Backtester and market replay for NQ and ES. Rust, written from scratch.", open: false },
  { stage: "Live", name: "Market Order", body: "Runs the setup Rewind proved against a live feed and takes the trade.", open: true },
  { stage: "Review", name: "PX Journals", body: "Trading journal that reads your fills straight from your broker.", open: false },
]

function Heading({ kicker, title, body }: { kicker: string; title: string; body: string }) {
  return (
    <div className="mb-10 grid max-w-2xl gap-3">
      <p className="m-0 font-mono text-[length:var(--px-text-sm)] text-[color:var(--brand-accent)]">{kicker}</p>
      <h2 className="m-0 text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.05] font-bold tracking-[-0.03em] text-balance">{title}</h2>
      <p className="m-0 text-[length:var(--px-text-lg)] text-muted-foreground text-pretty">{body}</p>
    </div>
  )
}

export default function App() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Tape />
      <header className="relative isolate overflow-hidden">
        <Background pattern="shader" className="-z-10 opacity-60" />
        <div className="mx-auto grid max-w-6xl gap-12 px-5 pt-10 pb-20 lg:grid-cols-[5fr_7fr] lg:items-center lg:pt-16 lg:pb-28">
          <div>
            <p className="m-0 flex items-center gap-2 font-mono text-[length:var(--px-text-sm)] text-muted-foreground">
              <span className="size-2 rounded-full bg-[color:var(--brand-accent)] shadow-[0_0_12px_var(--brand-accent)]" aria-hidden="true" />
              shootingallday
              <span className="hidden text-faint-foreground sm:inline">· <Clock /></span>
            </p>
            <h1 className="mt-6 mb-0 text-[clamp(2.75rem,7vw,5.25rem)] leading-[0.98] font-bold tracking-[-0.045em] text-balance">
              <TextScramble>I trade futures.</TextScramble>{" "}
              <span className="text-muted-foreground">Then I build the tools I trade with.</span>
            </h1>
            <p className="mt-6 mb-0 max-w-xl text-[length:var(--px-text-lg)] text-muted-foreground text-pretty">
              I'm Jomar. I trade NQ and ES on prop firm accounts and write the software around it: the rule math, the risk simulations, the execution engine, the backtester and the journal. Three of them are open source, and most of the code is written by AI agents I run.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#open-source" className="inline-flex h-11 items-center gap-2 rounded-control bg-foreground px-5 font-semibold text-background shadow-md transition-transform active:translate-y-px">See the projects<ArrowRightIcon className="size-4" /></a>
              <a href={GITHUB} className={link}><GithubIcon />GitHub</a>
              <a href={X} className={link}><XIcon />X</a>
            </div>
          </div>
          <Desk />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5">
        <section id="try" className="border-t border-border py-20 lg:py-28">
          <Heading kicker="Try it · reshuffle" title="A passing eval and a blown one can be the same trades." body="Same 60 trades, 400 different orders, run through a prop firm's trailing drawdown. Deal it again and watch the odds move." />
          <Reshuffle />
        </section>

        <section id="open-source" className="border-t border-border py-20 lg:py-28">
          <Heading kicker="Open source" title="Three tools for funded futures accounts." body="Each one does one job and gets the prop firm rules exactly right." />
          <ul className="m-0 list-none border-t border-border p-0">
            {OSS.map((p, i) => (
              <li key={p.name} className="group relative isolate border-b border-border">
                <span aria-hidden="true" className="absolute inset-y-0 start-0 -z-10 w-0 bg-[color-mix(in_oklab,var(--brand-accent)_10%,transparent)] transition-[width] duration-500 ease-out group-hover:w-full motion-reduce:transition-none" />
                <div className="grid gap-4 py-8 md:grid-cols-[1fr_22rem] md:items-end md:py-10">
                  <div>
                    <p className="m-0 font-mono text-[11px] tracking-[0.1em] text-muted-foreground uppercase">0{i + 1} · {p.tags[0]}{p.version ? ` · ${p.version}` : ""}</p>
                    <h3 className="mt-2 mb-0 text-[clamp(2.75rem,8vw,6.5rem)] leading-[0.95] font-bold tracking-[-0.045em]">
                      <a href={p.href} className="inline-flex items-start gap-3 no-underline after:absolute after:inset-0 after:content-['']">{p.name}<ArrowUpRightIcon className="mt-2 size-6 text-muted-foreground transition-transform group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-[color:var(--brand-accent)] md:size-8" /></a>
                    </h3>
                  </div>
                  <div className="grid gap-3">
                    <p className="m-0 text-muted-foreground">{p.body}</p>
                    {p.install ? <code className="relative z-10 block overflow-x-auto rounded-control bg-muted px-3 py-2 font-mono text-[length:var(--px-text-xs)] whitespace-nowrap"><span className="text-faint-foreground">$ </span>{p.install}</code> : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section id="system" className="border-t border-border py-20 lg:py-28">
          <Heading kicker="The system" title="Prove the edge, trade it, then look back honestly." body="Two of these are still private while I build them." />
          <ol className="m-0 grid list-none gap-4 p-0 md:grid-cols-3">
            {FLOW.map((s, i) => (
              <li key={s.name} className="relative rounded-card border border-border bg-card p-6">
                <p className="m-0 font-mono text-[length:var(--px-text-xs)] text-muted-foreground">{s.stage}</p>
                <h3 className="mt-2 mb-0 text-[length:var(--px-text-xl)] font-semibold">{s.name}</h3>
                <p className="mt-2 mb-0 text-muted-foreground">{s.body}</p>
                <span className={`mt-4 inline-block rounded-pill px-2 text-[length:var(--px-text-xs)] ${s.open ? "bg-primary-soft text-foreground" : "bg-muted text-muted-foreground"}`}>{s.open ? "Open source" : "In progress"}</span>
                {i < FLOW.length - 1 ? <ArrowRightIcon aria-hidden="true" className="absolute top-1/2 -end-5 hidden size-5 -translate-y-1/2 text-faint-foreground md:block" /> : null}
              </li>
            ))}
          </ol>
        </section>

        <section id="agents" className="border-t border-border py-20 lg:py-28">
          <div className="grid gap-10 lg:grid-cols-[5fr_6fr] lg:items-center">
            <div>
              <Heading kicker="How I build" title="A fleet of AI agents, on two machines." body="Agents pick up tickets, hand work to each other, get reviewed by a second model, and ship with proof attached. I decide what gets built and check the proof." />
              <span className="inline-block rounded-pill border border-dashed border-border px-3 py-0.5 text-[length:var(--px-text-xs)] text-muted-foreground">Full write-up coming soon</span>
            </div>
            <Agents />
          </div>
        </section>

        <section className="border-t border-border py-20 lg:py-28">
          <p className="m-0 max-w-4xl text-[clamp(1.5rem,3vw,2.25rem)] leading-[1.3] font-medium tracking-[-0.02em] text-pretty">
            Most trading tools are multi-asset retail products with prop firm support bolted on. <span className="text-muted-foreground">Mine start from futures and prop firm rules, because that's what I trade.</span>
          </p>
        </section>
      </main>

      <footer id="contact" className="border-t border-border">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 py-16 md:grid-cols-[1fr_auto] md:items-end">
          <h2 className="m-0 text-[clamp(2.5rem,6vw,4.5rem)] leading-none font-bold tracking-[-0.04em]">Say hi.</h2>
          <div className="flex flex-wrap gap-3">
            <a href={GITHUB} className={link}><GithubIcon />GitHub</a>
            <a href={X} className={link}><XIcon />X</a>
            <a href={EMAIL} className={link}><MailIcon className="size-4" />Email</a>
          </div>
          <p className="m-0 text-[length:var(--px-text-xs)] text-faint-foreground md:col-span-2">Nothing here is trading advice. The market data and the reshuffle chart are simulated, not my account.</p>
        </div>
      </footer>
    </div>
  )
}
