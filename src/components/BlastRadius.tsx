import type { PRAnalysis } from "@/lib/analyzer/types";

const COL_W = 296;
const BOX_W = 250;
const GAP = 18;
const HEAD = 26;

const label = (s: string) => (s === "<module>" ? "module scope" : s);
const pct = (c: number) => `${Math.round(c * 100)}%`;

const levelRule = {
  origin: "#c8f542",
  direct: "#ff7a68",
  indirect: "#e8a94b",
} as const;

const levelName = { origin: "origin", direct: "direct", indirect: "transitive" } as const;

export default function BlastRadius({ analysis }: { analysis: PRAnalysis }) {
  const repos = analysis.repos;
  const origin = repos.find((r) => r.level === "origin");
  const others = repos.filter((r) => r.level !== "origin");
  if (!origin || others.length === 0) {
    return (
      <div className="border-t border-line px-5 py-9">
        <div className="eyebrow mb-2">no propagation</div>
        <div className="text-[12.5px] text-muted">No downstream repository is affected by these changes.</div>
      </div>
    );
  }

  const symbolsOf = (repoId: number) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const n of analysis.affected) {
      if (n.repoId !== repoId || n.file === "*") continue;
      if (seen.has(n.symbol)) continue;
      seen.add(n.symbol);
      out.push(n.symbol);
    }
    return out;
  };

  const cols = new Map<number, typeof repos>();
  for (const r of repos) {
    const hop = r.level === "origin" ? 0 : Math.max(1, r.hop);
    cols.set(hop, [...(cols.get(hop) ?? []), r]);
  }
  const hops = [...cols.keys()].sort((a, b) => a - b);

  const pos = new Map<number, { x: number; y: number; h: number }>();
  let totalH = 0;
  for (const hop of hops) {
    let y = 0;
    for (const r of cols.get(hop)!) {
      const syms = Math.min(4, symbolsOf(r.repoId).length);
      const h = 82 + syms * 19 + (symbolsOf(r.repoId).length > 4 ? 16 : 0);
      pos.set(r.repoId, { x: hops.indexOf(hop) * COL_W, y, h });
      y += h + GAP;
    }
    totalH = Math.max(totalH, y - GAP);
  }
  const totalW = hops.length * COL_W - (COL_W - BOX_W);

  // links parent repo -> child repo
  const changeRepo = new Map(analysis.changes.map((c) => [c.id, c.repoId]));
  const links = new Set<string>();
  for (const n of analysis.affected) {
    const parentSym = n.via.length >= 2 ? n.via[n.via.length - 2] : null;
    let parent = changeRepo.get(n.changeId) ?? origin.repoId;
    if (parentSym) {
      const p = analysis.affected.find((a) => a.changeId === n.changeId && a.symbol === parentSym);
      if (p) parent = p.repoId;
    }
    if (parent !== n.repoId && pos.has(parent) && pos.has(n.repoId)) links.add(`${parent}>${n.repoId}`);
  }

  const hopLabel = (hop: number) => (hop === 0 ? "origin" : hop === 1 ? "direct dependents" : `hop ${hop} · transitive`);

  return (
    <div className="overflow-x-auto border-t border-line px-4 py-5 md:px-5 md:py-6">
      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2">
        {(["origin", "direct", "indirect"] as const).map((level) => (
          <span key={level} className="flex items-center gap-2">
            <span className="h-2 w-[2px]" style={{ background: levelRule[level] }} />
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">{levelName[level]}</span>
          </span>
        ))}
        <span className="hidden h-3 w-px bg-line sm:block" />
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">dashed = reached through another repository</span>
      </div>

      <div className="relative" style={{ width: totalW, height: totalH + HEAD, minWidth: totalW }}>
        <div className="absolute left-0 top-0 flex" style={{ width: totalW }}>
          {hops.map((hop) => (
            <div key={hop} className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint" style={{ width: COL_W }}>
              {hopLabel(hop)}
            </div>
          ))}
        </div>

        <svg className="absolute left-0" width={totalW} height={totalH + HEAD} style={{ top: 0 }} aria-hidden>
          <defs>
            <marker id="blast-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#6f6d64" />
            </marker>
          </defs>
          {[...links].map((l) => {
            const [a, b] = l.split(">").map(Number);
            const pa = pos.get(a)!;
            const pb = pos.get(b)!;
            const x1 = pa.x + BOX_W;
            const y1 = pa.y + HEAD + 34;
            const x2 = pb.x;
            const y2 = pb.y + HEAD + 34;
            const back = x2 <= x1;
            const d = back
              ? `M ${pa.x + BOX_W / 2} ${pa.y + HEAD + pa.h} C ${pa.x + BOX_W / 2} ${pa.y + HEAD + pa.h + 34}, ${pb.x + BOX_W / 2} ${
                  pb.y + HEAD + pb.h + 34
                }, ${pb.x + BOX_W / 2} ${pb.y + HEAD + pb.h}`
              : `M ${x1} ${y1} C ${x1 + 44} ${y1}, ${x2 - 44} ${y2}, ${x2} ${y2}`;
            return (
              <path
                key={l}
                d={d}
                fill="none"
                stroke="#6f6d64"
                strokeOpacity="0.55"
                strokeWidth="1"
                markerEnd="url(#blast-arrow)"
                strokeDasharray={back ? "3 3" : undefined}
              />
            );
          })}
        </svg>

        {repos.map((r) => {
          const p = pos.get(r.repoId)!;
          const syms = symbolsOf(r.repoId);
          return (
            <div
              key={r.repoId}
              className="absolute flex flex-col border border-line bg-panel"
              style={{ left: p.x, top: p.y + HEAD, width: BOX_W, height: p.h, borderLeft: `2px solid ${levelRule[r.level]}` }}
            >
              <div className="flex items-baseline justify-between gap-2 px-2.5 pt-2">
                <span className="truncate font-mono text-[12px] text-fg">{r.name.split("/").pop()}</span>
                {r.level !== "origin" && <span className="num text-[10px] text-faint">{pct(r.confidence)}</span>}
              </div>
              <div className="px-2.5 pt-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-faint">
                {levelName[r.level]}
                {r.level !== "origin" && ` · hop ${r.hop}`}
              </div>
              {r.level !== "origin" ? (
                <div className="mt-1 flex items-center gap-2 px-2.5 font-mono text-[10.5px]">
                  <span className="text-danger">{r.confirmed}</span>
                  <span className="text-faint">confirmed</span>
                  <span className="text-warn">{r.potential}</span>
                  <span className="text-faint">potential</span>
                </div>
              ) : (
                <div className="mt-1 px-2.5 font-mono text-[10.5px] text-muted">
                  {analysis.changes.length} change{analysis.changes.length === 1 ? "" : "s"} in this PR
                </div>
              )}
              <ul className="mt-1.5 space-y-0 px-2.5 pb-2">
                {syms.slice(0, 4).map((s) => (
                  <li key={s} className="truncate font-mono text-[10.5px] leading-[1.8] text-muted">
                    <span className="text-faint">ƒ </span>
                    {label(s)}
                  </li>
                ))}
                {syms.length > 4 && <li className="font-mono text-[10px] text-faint">+{syms.length - 4} more</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
