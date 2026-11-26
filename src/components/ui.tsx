import type { ReactNode } from "react";

/* ------------------------------------------------------------------ surfaces */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[6px] border border-line bg-panel ${className}`}>{children}</div>;
}

export function CardHeader({
  title,
  subtitle,
  right,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-3 md:px-5">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h2 className="text-[13px] font-medium leading-tight tracking-[-0.005em] text-fg">{title}</h2>
        {subtitle && <p className="mt-1.5 max-w-3xl text-[12px] leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0 pt-0.5">{right}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------- badges */

const TONES: Record<string, string> = {
  danger: "text-danger border-danger/35 bg-danger/10",
  warn: "text-warn border-warn/35 bg-warn/10",
  ok: "text-ok border-ok/30 bg-ok/[0.08]",
  accent: "text-signal border-signal/35 bg-signal/[0.07]",
  neutral: "text-muted border-line-strong bg-transparent",
  // legacy tone names, collapsed onto the semantics above
  red: "text-danger border-danger/35 bg-danger/10",
  amber: "text-warn border-warn/35 bg-warn/10",
  orange: "text-warn border-warn/35 bg-warn/10",
  green: "text-ok border-ok/30 bg-ok/[0.08]",
  slate: "text-muted border-line-strong bg-transparent",
  blue: "text-muted border-line-strong bg-transparent",
  sky: "text-muted border-line-strong bg-transparent",
  violet: "text-muted border-line-strong bg-transparent",
};

export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: keyof typeof TONES | string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-[3px] border px-1.5 py-[3px] font-mono text-[10px] uppercase leading-none tracking-[0.08em] ${
        TONES[tone] ?? TONES.neutral
      } ${className}`}
    >
      {children}
    </span>
  );
}

export const riskTone = (level: string) => (level === "high" ? "danger" : level === "medium" ? "warn" : "ok");

export function RiskBadge({ level, score }: { level: string; score?: number }) {
  return (
    <Badge tone={riskTone(level)}>
      {score !== undefined && <span className="font-semibold tabular-nums">{score}</span>}
      <span>{level}</span>
    </Badge>
  );
}

export function VerdictBadge({ verdict }: { verdict?: string }) {
  if (verdict === "confirmed_breaking") return <Badge tone="danger">confirmed breaking</Badge>;
  if (verdict === "potential_risk") return <Badge tone="warn">potential risk</Badge>;
  return <Badge tone="ok">non-breaking</Badge>;
}

export function SevBadge({ sev }: { sev: string }) {
  const tone = sev === "critical" || sev === "high" ? "danger" : sev === "medium" ? "warn" : "neutral";
  return <Badge tone={tone}>{sev}</Badge>;
}

/* ---------------------------------------------------------------------- data */

export function ScoreRing({
  score,
  size = 120,
  label,
  invert = false,
}: {
  score: number;
  size?: number;
  label?: string;
  invert?: boolean;
}) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const good = invert ? score >= 70 : score <= 30;
  const mid = invert ? score >= 45 : score <= 70;
  const color = good ? "#5ecf92" : mid ? "#e8a94b" : "#ff7a68";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(235,233,227,0.09)" strokeWidth="2" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth="2"
          fill="none"
          strokeLinecap="butt"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(100, score) / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span className="num font-medium leading-none text-fg" style={{ fontSize: Math.max(11, size / 3.6) }}>
          {score}
        </span>
        {label && <span className="eyebrow" style={{ fontSize: Math.max(8, size / 14) }}>{label}</span>}
      </div>
    </div>
  );
}

export function Bar({
  value,
  max,
  tone = "neutral",
}: {
  value: number;
  max: number;
  tone?: "danger" | "warn" | "ok" | "accent" | "neutral" | "red" | "amber" | "green" | "violet";
}) {
  const map: Record<string, string> = {
    danger: "bg-danger",
    red: "bg-danger",
    warn: "bg-warn",
    amber: "bg-warn",
    ok: "bg-ok",
    green: "bg-ok",
    accent: "bg-signal",
    violet: "bg-signal",
    neutral: "bg-faint",
  };
  return (
    <div className="h-[3px] w-full bg-line">
      <div className={`h-full ${map[tone] ?? map.neutral}`} style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }} />
    </div>
  );
}

/* One ledger strip instead of four identical stat tiles. */
export function Ledger({
  items,
  className = "",
}: {
  items: { label: string; value: ReactNode; note?: ReactNode; tone?: "danger" | "warn" | "ok" | "accent" | "neutral" }[];
  className?: string;
}) {
  const colours: Record<string, string> = {
    danger: "text-danger",
    warn: "text-warn",
    ok: "text-ok",
    accent: "text-signal",
    neutral: "text-fg",
  };
  const cols = items.length >= 5 ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-5" : items.length === 4 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-3";
  return (
    <div className={`grid gap-px overflow-hidden rounded-[6px] border border-line bg-line ${cols} ${className}`}>
      {items.map((s, i) => (
        <div
          key={s.label}
          className={`bg-panel px-4 py-3.5 md:px-5 ${
            items.length % 2 === 1 && i === items.length - 1 ? "max-lg:col-span-2" : ""
          }`}
        >
          <div className="eyebrow">{s.label}</div>
          <div className={`num mt-2 text-[22px] leading-none font-medium md:text-[26px] ${colours[s.tone ?? "neutral"]}`}>
            {typeof s.value === "number" ? String(s.value).padStart(2, "0") : s.value}
          </div>
          {s.note && <div className="mt-2 text-[11px] leading-snug text-faint">{s.note}</div>}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- headers */

export function PageHeader({
  title,
  desc,
  actions,
  eyebrow,
}: {
  title: string;
  desc?: string;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="mb-6 border-b border-line pb-5 md:mb-8 md:pb-6">
      {eyebrow && <div className="eyebrow mb-3 text-signal/75">{eyebrow}</div>}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="font-serif text-[28px] leading-[1.06] tracking-[-0.012em] text-fg md:text-[36px]">{title}</h1>
          {desc && <p className="mt-2.5 max-w-2xl text-[12.5px] leading-relaxed text-muted">{desc}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Empty({
  title,
  children,
  eyebrow = "no data",
  actions,
}: {
  title: string;
  children?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="rounded-[6px] border border-line bg-panel px-6 py-12 md:py-16">
      <div className="mx-auto max-w-md">
        <div className="eyebrow mb-3">{eyebrow}</div>
        <div className="font-serif text-[21px] leading-tight text-fg">{title}</div>
        {children && <div className="mt-2.5 text-[12.5px] leading-relaxed text-muted">{children}</div>}
        {actions && <div className="mt-5 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- code */

export function PatchBlock({ patch, constrain = false }: { patch: string; constrain?: boolean }) {
  return (
    <pre
      className={`overflow-x-auto border border-line bg-sunken py-2 font-mono text-[11.5px] leading-[1.7] ${
        constrain ? "max-h-96 overflow-y-auto" : ""
      }`}
    >
      {patch.split("\n").map((l, i) => {
        const added = l.startsWith("+") && !l.startsWith("+++");
        const removed = l.startsWith("-") && !l.startsWith("---");
        const hunk = l.startsWith("@@");
        return (
          <div
            key={i}
            className={`whitespace-pre px-3 ${added ? "bg-ok/[0.06] text-ok" : removed ? "bg-danger/[0.06] text-danger" : hunk ? "text-signal/60" : "text-faint"}`}
          >
            {l || " "}
          </div>
        );
      })}
    </pre>
  );
}

/* ------------------------------------------------------------------- controls */

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-[5px] bg-signal px-3.5 py-2 text-[12.5px] font-medium text-ink transition-colors hover:bg-[#d5fb63] disabled:opacity-45 disabled:hover:bg-signal",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-[5px] border border-line-strong px-3.5 py-2 text-[12.5px] font-medium text-fg transition-colors hover:border-white/25 hover:bg-white/[0.04] disabled:opacity-45",
  quiet:
    "inline-flex items-center justify-center gap-2 rounded-[5px] px-2.5 py-1.5 text-[12px] text-muted transition-colors hover:bg-white/[0.04] hover:text-fg disabled:opacity-45",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-[5px] border border-danger/35 px-3.5 py-2 text-[12.5px] font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-45",
};

export const field =
  "w-full rounded-[5px] border border-line-strong bg-sunken px-2.5 py-2 font-mono text-[12px] text-fg outline-none transition-colors placeholder:text-faint focus:border-signal/55";

export const label = "block font-mono text-[10px] uppercase tracking-[0.14em] text-faint";

/* ------------------------------------------------------------------- helpers */

export function relTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export const short = (full: string) => full.split("/").pop() ?? full;
