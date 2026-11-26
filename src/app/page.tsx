import type { ReactNode } from "react";
import Link from "next/link";
import { IconArrowRight, IconCheck } from "@/components/Icons";
import Logo from "@/components/Logo";
import HeroDiagram from "@/components/landing/HeroDiagram";
import { DiffArt, MapArt, TraceArt } from "@/components/landing/StepArt";
import { BlastArt, FixArt, GraphArt, HealthArt, SimArt, TestArt } from "@/components/landing/TileArt";
import { btn } from "@/components/ui";

const NAV = [
  { href: "#why", label: "Why" },
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
];

const GAP_POINTS = [
  {
    n: "01",
    title: "CI stops at the repo boundary",
    body: "A pull request in user-service runs user-service tests. It never runs order-service, which is where the failure will happen.",
  },
  {
    n: "02",
    title: "Types do not cross repositories",
    body: "A shared User shape is imported by package name, vendored, or spoken over HTTP. The compiler only ever sees one copy of it.",
  },
  {
    n: "03",
    title: "The breaking line belongs to someone else",
    body: "The call that fails sits in a repository another team owns. Nothing in the review points at it, so it ships.",
  },
];

const STEPS = [
  {
    n: "01",
    name: "Map",
    art: <MapArt />,
    body: "Parse imports, package manifests, function calls and HTTP contracts into one dependency graph across every connected repository.",
    meta: "imports · package deps · HTTP contracts",
  },
  {
    n: "02",
    name: "Diff",
    art: <DiffArt />,
    body: "Classify what the pull request actually changed: signatures, parameter and return types, removed exports, route paths, dependency majors.",
    meta: "signature · type · export · route · major",
  },
  {
    n: "03",
    name: "Trace",
    art: <TraceArt />,
    body: "Walk the graph from each change. Every downstream node gets a verdict, a confidence score, the reason it is affected and a patch to consider.",
    meta: "verdict · confidence · reason · patch",
  },
];

const FINDINGS = [
  {
    repo: "billing-service",
    file: "src/billing.ts",
    line: "37",
    verdict: "Confirmed",
    confidence: "95%",
    tone: "danger" as const,
    reason: "eraseCustomer still calls deleteUser, which this PR renames to removeUser.",
  },
  {
    repo: "order-service",
    file: "src/orders.ts",
    line: "22",
    verdict: "Confirmed",
    confidence: "95%",
    tone: "danger" as const,
    reason: "createOrder passes a numeric userId where id now expects a string.",
  },
  {
    repo: "billing-service",
    file: "src/billing.ts",
    line: "16",
    verdict: "Confirmed",
    confidence: "95%",
    tone: "danger" as const,
    reason: "chargeCustomer passes a numeric userId straight into getUser().",
  },
  {
    repo: "web-gateway",
    file: "src/checkout.ts",
    line: "5",
    verdict: "Potential",
    confidence: "76%",
    tone: "warn" as const,
    reason: "quickCheckout calls createOrder, which is affected at depth 1. No call site proves the failure yet.",
  },
];

const PRINCIPLES = [
  {
    n: "01",
    title: "Inferred is never confirmed",
    body: "A link found by convention rather than a parsed call site is labelled potential risk and capped at low confidence. It never inherits the certainty of a proven finding.",
  },
  {
    n: "02",
    title: "Nothing changes without approval",
    body: "Suggested fixes are patches attached to a review. DevImpact never writes to a repository, opens a commit or edits a file on its own.",
  },
  {
    n: "03",
    title: "Every verdict carries its reasoning",
    body: "Each finding names the file, the line and the mechanism that connects it to the change. If that reason cannot be written, the finding is not presented as proven.",
  },
];

const TONE_CLASS = {
  danger: "text-danger",
  warn: "text-warn",
} as const;

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px w-6 bg-line-strong" />
      <span className="eyebrow">{children}</span>
    </div>
  );
}

function Tile({
  title,
  art,
  meta,
  className = "",
  children,
}: {
  title: string;
  art: React.ReactNode;
  meta: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`group bg-panel p-5 transition-colors hover:bg-white/[0.015] md:p-6 ${className}`}>
      <div className="mb-4 border-b border-line pb-4">{art}</div>
      <h3 className="text-[13.5px] font-medium tracking-[-0.005em] text-fg">{title}</h3>
      <p className="mt-1.5 max-w-lg text-[11.5px] leading-relaxed text-muted">{children}</p>
      <div className="mt-3 font-mono text-[9.5px] uppercase tracking-[0.12em] text-faint">{meta}</div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="bg-ink text-fg">
      <header className="sticky top-0 z-40 border-b border-line bg-ink/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between gap-6 px-5 md:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="DevImpact home">
            <Logo size={21} className="text-signal" />
            <span className="text-[14px] font-medium tracking-[-0.01em]">DevImpact</span>
          </Link>
          <nav className="hidden items-center gap-7 md:flex" aria-label="Sections">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="text-[12.5px] text-muted transition-colors hover:text-fg">
                {n.label}
              </a>
            ))}
          </nav>
          <Link href="/dashboard" className={btn.primary}>
            Open dashboard
            <IconArrowRight size={14} />
          </Link>
        </div>
      </header>

      {/* ---------------------------------------------------------------- hero */}
      <section className="grain relative overflow-hidden border-b border-line">
        <div className="pointer-events-none absolute inset-0 instrument-grid" aria-hidden />
        <div className="relative mx-auto max-w-[1180px] px-5 pb-12 pt-14 md:px-8 md:pb-16 md:pt-24">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-end lg:gap-12">
            <div className="lg:col-span-8">
              <div className="rise flex items-center gap-3" style={{ animationDelay: "0ms" }}>
                <span className="h-px w-8 bg-signal/45" />
                <span className="eyebrow text-signal/80">cross-repository impact analysis</span>
              </div>
              <h1
                className="rise mt-6 font-serif text-[clamp(2.6rem,6.6vw,5rem)] leading-[0.95] tracking-[-0.022em] text-fg"
                style={{ animationDelay: "90ms" }}
              >
                Know what a pull request <em className="italic text-signal">really breaks</em> — before you merge it.
              </h1>
            </div>
            <div className="lg:col-span-4 lg:pb-1">
              <p className="rise text-[13px] leading-relaxed text-muted" style={{ animationDelay: "200ms" }}>
                DevImpact reads every repository in a system, maps what calls what, and traces each pull request&apos;s
                blast radius to the call sites that will fail.
              </p>
              <div className="rise mt-6 flex flex-wrap gap-2.5" style={{ animationDelay: "280ms" }}>
                <Link href="/dashboard" className={btn.primary}>
                  Explore the live demo
                  <IconArrowRight size={14} />
                </Link>
                <a href="#how" className={btn.secondary}>
                  See how it works
                </a>
              </div>
              <p
                className="rise mt-4 font-mono text-[9.5px] uppercase tracking-[0.12em] text-faint"
                style={{ animationDelay: "340ms" }}
              >
                Loads a 4-repo demo project · no sign-up
              </p>
            </div>
          </div>

          <div className="rise mt-10 md:mt-14" style={{ animationDelay: "420ms" }}>
            <HeroDiagram />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ the gap */}
      <section id="why" className="scroll-mt-20 border-b border-line">
        <div className="mx-auto max-w-[1180px] px-5 py-14 md:px-8 md:py-20">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-4">
              <SectionLabel>The gap</SectionLabel>
              <p className="mt-6 max-w-xs text-[12px] leading-relaxed text-muted">
                Every tool you have looks inside one repository. Dependencies run across four.
              </p>
            </div>
            <div className="lg:col-span-8">
              <h2 className="font-serif text-[clamp(1.75rem,3.6vw,2.9rem)] leading-[1.1] tracking-[-0.015em] text-fg">
                The tests pass in the repository that changed. The break lands in the repository that didn&apos;t.
              </h2>
              <p className="mt-6 max-w-xl text-[12.5px] leading-relaxed text-muted">
                That is not a testing failure. It is a missing map: the failure is real, deterministic and one
                <span className="text-fg"> import, package or HTTP call </span>away from the diff.
              </p>

              <div className="mt-10 grid gap-px border border-line bg-line md:grid-cols-3">
                {GAP_POINTS.map((p) => (
                  <div key={p.n} className="bg-panel p-4 md:p-5">
                    <div className="num text-[10px] text-signal/70">{p.n}</div>
                    <h3 className="mt-3 text-[12.5px] font-medium leading-snug text-fg">{p.title}</h3>
                    <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{p.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- how it works */}
      <section id="how" className="scroll-mt-20 border-b border-line">
        <div className="mx-auto max-w-[1180px] px-5 py-14 md:px-8 md:py-20">
          <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <SectionLabel>How it works</SectionLabel>
              <h2 className="mt-6 max-w-2xl font-serif text-[clamp(1.75rem,3.6vw,2.9rem)] leading-[1.08] tracking-[-0.015em] text-fg">
                Three passes over the same change.
              </h2>
            </div>
            <p className="max-w-xs text-[11.5px] leading-relaxed text-muted">
              Detection is deterministic. The same diff produces the same verdicts on every run, with or without a
              language model in the loop.
            </p>
          </div>

          <div className="mt-12 grid gap-px border border-line bg-line lg:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="flex flex-col bg-panel p-5 md:p-6">
                <div className="flex items-baseline gap-3">
                  <span className="num text-[11px] text-signal/70">{s.n}</span>
                  <h3 className="font-serif text-[24px] leading-none text-fg">{s.name}</h3>
                </div>
                <div className="mt-5 border border-line bg-sunken/40 p-2">{s.art}</div>
                <p className="mt-5 text-[11.5px] leading-relaxed text-muted">{s.body}</p>
                <div className="mt-auto pt-4 font-mono text-[9.5px] uppercase tracking-[0.12em] text-faint">{s.meta}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ show don't tell */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-[1180px] px-5 py-14 md:px-8 md:py-20">
          <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <SectionLabel>The demo pull request</SectionLabel>
              <h2 className="mt-6 max-w-2xl font-serif text-[clamp(1.75rem,3.6vw,2.9rem)] leading-[1.08] tracking-[-0.015em] text-fg">
                One line changed. Three repositories affected.
              </h2>
            </div>
            <p className="max-w-xs text-[11.5px] leading-relaxed text-muted">
              The pull request passes its own suite. The breakage lands in the two services that depend on it, and
              reaches a third through them.
            </p>
          </div>

          <div className="mt-12 grid overflow-hidden rounded-[6px] border border-line lg:grid-cols-2">
            <div className="border-b border-line bg-panel lg:border-b-0 lg:border-r">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                <span className="font-mono text-[10.5px] text-muted">user-service / src/types.ts</span>
                <span className="font-mono text-[10.5px] text-faint">
                  <span className="text-ok">+2</span> <span className="text-danger">−2</span>
                </span>
              </div>
              <pre className="overflow-x-auto bg-sunken px-0 py-3 font-mono text-[11.5px] leading-[1.85]">
                <div className="px-4 text-signal/50">@@ -1,7 +1,7 @@ src/types.ts</div>
                <div className="px-4 text-faint"> export interface User {"{"}</div>
                <div className="bg-danger/[0.07] px-4 text-danger">−  id: number;</div>
                <div className="bg-ok/[0.06] px-4 text-ok">+  id: string;</div>
                <div className="px-4 text-faint">   email: string;</div>
                <div className="px-4 text-faint">   name: string;</div>
                <div className="px-4 text-faint">   role: &quot;admin&quot; | &quot;member&quot;;</div>
                <div className="px-4 text-signal/50">@@ -18,7 +18,7 @@ src/users.ts</div>
                <div className="bg-danger/[0.07] px-4 text-danger">−export async function deleteUser(id: number): Promise&lt;void&gt; {"{"}</div>
                <div className="bg-ok/[0.06] px-4 text-ok">+export async function removeUser(id: string): Promise&lt;void&gt; {"{"}</div>
                <div className="px-4 text-faint">   store.delete(id);</div>
                <div className="px-4 text-faint"> {"}"}</div>
              </pre>
              <div className="flex items-center gap-2 border-t border-line px-4 py-2.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-faint">
                <IconCheck size={12} className="text-ok" />
                user-service ci · 24 tests passing
              </div>
            </div>

            <div className="bg-panel">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                <span className="font-mono text-[10.5px] text-muted">downstream findings</span>
                <span className="font-mono text-[10.5px] text-faint">
                  <span className="text-danger">3 confirmed</span> · <span className="text-warn">1 potential</span>
                </span>
              </div>
              <div>
                {FINDINGS.map((f) => (
                  <div key={`${f.repo}-${f.line}`} className="border-b border-line px-4 py-3 last:border-b-0">
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${f.tone === "danger" ? "bg-danger" : "bg-warn"}`} />
                      <span className="font-mono text-[11px] text-fg">
                        {f.repo}/{f.file}
                      </span>
                      <span className="font-mono text-[10px] text-faint">:{f.line}</span>
                      <span className={`ml-auto font-mono text-[9.5px] uppercase tracking-[0.1em] ${TONE_CLASS[f.tone]}`}>
                        {f.verdict}
                      </span>
                      <span className="num w-9 text-right font-mono text-[10px] text-muted">{f.confidence}</span>
                    </div>
                    <p className="mt-1 pl-[18px] text-[11.5px] leading-relaxed text-muted">{f.reason}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 border-t border-line px-4 py-2.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-faint">
                <span className="h-1.5 w-1.5 rounded-full bg-warn" />
                confidence measured per call site, not per repository
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- features */}
      <section id="features" className="scroll-mt-20 border-b border-line">
        <div className="mx-auto max-w-[1180px] px-5 py-14 md:px-8 md:py-20">
          <SectionLabel>Features</SectionLabel>
          <div className="mt-6 grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
            <h2 className="max-w-2xl font-serif text-[clamp(1.75rem,3.6vw,2.9rem)] leading-[1.08] tracking-[-0.015em] text-fg">
              Built for the parts of the system you don&apos;t own.
            </h2>
            <p className="max-w-xs text-[11.5px] leading-relaxed text-muted">
              Six surfaces over the same graph. Each one answers a question a reviewer actually asks.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-[6px] border border-line bg-line md:grid-cols-12">
            <Tile className="md:col-span-7" title="Blast radius" art={<BlastArt />} meta="transitive depth · confidence decay">
              A change propagates through calls and HTTP contracts, not just direct dependents. You get the whole
              downstream set, with breadth and depth in one readable diagram.
            </Tile>
            <Tile className="md:col-span-5" title="Dependency graph" art={<GraphArt />} meta="repository · file · function">
              Zoom from four repositories to the exact symbol. Select a node to see what it depends on, what depends on
              it, and every cycle in between.
            </Tile>
            <Tile className="md:col-span-4" title="What-if simulator" art={<SimArt />} meta="in-memory · nothing written">
              Ask what happens if you remove getUser(), change a route path or bump a major. The answer is computed
              against the real graph, not guessed.
            </Tile>
            <Tile className="md:col-span-4" title="Fix suggestions" art={<FixArt />} meta="approval required">
              Every finding that can be repaired ships with a patch, as a diff you can copy, approve or dismiss. Nothing
              is applied automatically.
            </Tile>
            <Tile className="md:col-span-4" title="Repository health" art={<HealthArt />} meta="coverage · outdated · churn">
              Coverage gaps, stale dependencies, breaking-change frequency and complexity, scored per repository so you
              know where the next break will come from.
            </Tile>
            <Tile className="md:col-span-12" title="Test targeting" art={<TestArt />} meta="must run · should run · missing">
              The suites that already exercise the affected symbols, ordered by priority — and the symbols with no test
              at all, which is where a passing build stops meaning very much.
            </Tile>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------- honest by design */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-[1180px] px-5 py-14 md:px-8 md:py-20">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-4">
              <SectionLabel>Honest by design</SectionLabel>
              <h2 className="mt-6 max-w-sm font-serif text-[clamp(1.6rem,2.9vw,2.3rem)] leading-[1.12] tracking-[-0.015em] text-fg">
                Precision is a promise about what we don&apos;t claim.
              </h2>
              <p className="mt-5 max-w-xs text-[11.5px] leading-relaxed text-muted">
                A tool that overstates its confidence is worse than no tool. These three rules are enforced in the
                engine, not in the copy.
              </p>
            </div>
            <div className="lg:col-span-8">
              <div className="divide-y divide-line border-y border-line">
                {PRINCIPLES.map((p) => (
                  <div key={p.n} className="grid gap-3 py-5 sm:grid-cols-[56px_1fr] sm:gap-6">
                    <div className="num text-[10px] text-signal/70">{p.n}</div>
                    <div>
                      <h3 className="text-[13px] font-medium text-fg">{p.title}</h3>
                      <p className="mt-1.5 max-w-2xl text-[11.5px] leading-relaxed text-muted">{p.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- final CTA */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="relative mx-auto max-w-[1180px] px-5 py-20 md:px-8 md:py-28">
          <div className="flex items-center gap-3">
            <span className="h-1.5 w-1.5 rounded-full bg-signal" />
            <span className="eyebrow">acme commerce · demo project</span>
          </div>
          <h2 className="mt-6 max-w-3xl font-serif text-[clamp(2.1rem,5vw,4rem)] leading-[0.98] tracking-[-0.02em] text-fg">
            Merge with the whole system <em className="italic text-signal">in view.</em>
          </h2>
          <div className="mt-8 flex flex-wrap items-center gap-5">
            <Link href="/dashboard" className={btn.primary}>
              Open the dashboard
              <IconArrowRight size={14} />
            </Link>
            <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-faint">
              4 repositories · 5 open pull requests · no sign-up
            </span>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- footer */}
      <footer>
        <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-5 py-10 md:flex-row md:items-center md:justify-between md:px-8">
          <div className="flex items-center gap-2.5">
            <Logo size={18} className="text-signal" />
            <span className="text-[12.5px] font-medium text-fg">DevImpact</span>
            <span className="ml-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-faint">cross-repository impact</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {[...NAV, { href: "/dashboard", label: "Dashboard" }, { href: "/graph", label: "Dependency graph" }].map((n) => (
              <Link key={n.href} href={n.href} className="text-[11.5px] text-muted transition-colors hover:text-fg">
                {n.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
