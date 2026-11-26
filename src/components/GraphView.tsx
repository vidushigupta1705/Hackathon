"use client";

import { useMemo, useState } from "react";

export interface GRepo {
  id: number;
  name: string;
  fullName: string;
  health?: number;
}
export interface GEdge {
  kind: string;
  fromRepo: number;
  fromFile: string;
  fromSymbol: string;
  toRepo: number;
  toFile: string;
  toSymbol: string;
  line: number;
  text: string;
}

type Level = "repo" | "file" | "function";
interface GNode {
  id: string;
  repoId: number;
  label: string;
  sub: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface AggEdge {
  a: string;
  b: string;
  count: number;
  kinds: Set<string>;
  items: GEdge[];
}

const KIND_COLOR: Record<string, string> = { http: "#c8f542", call: "#b9b6aa", import: "#56544c" };
const REPO_COLORS = ["#c8f542", "#b9b6aa", "#7f9c88", "#b59872", "#8b8ea0", "#a67d72", "#6e8f9a", "#b3a35f"];
const INK = "#0c0c0b";
const PANEL = "#121110";
const TEXT = "#ebe9e3";
const MUTED = "#9c9a92";
const FAINT = "#7d7b73";

function clip(cx: number, cy: number, tx: number, ty: number, w: number, h: number) {
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const t = Math.min(dx !== 0 ? w / 2 / Math.abs(dx) : Infinity, dy !== 0 ? h / 2 / Math.abs(dy) : Infinity);
  return { x: cx + dx * t, y: cy + dy * t };
}

export default function GraphView({ repos, edges }: { repos: GRepo[]; edges: GEdge[] }) {
  const [level, setLevel] = useState<Level>("repo");
  const [crossOnly, setCrossOnly] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [impact, setImpact] = useState(true);
  const [q, setQ] = useState("");

  const repoIdx = useMemo(() => new Map(repos.map((r, i) => [r.id, i])), [repos]);

  const model = useMemo(() => {
    const idFor = (repoId: number, file: string, sym: string) => (level === "repo" ? `r${repoId}` : level === "file" ? `f${repoId}|${file}` : `s${repoId}|${file}|${sym}`);
    const labelFor = (repoId: number, file: string, sym: string): [string, string] =>
      level === "repo" ? [repos.find((r) => r.id === repoId)?.name ?? "?", ""] : level === "file" ? [file.split("/").pop()!, file] : [sym === "<module>" ? "(module)" : sym, file];
    const nodes = new Map<string, GNode>();
    const add = (repoId: number, file: string, sym: string) => {
      const id = idFor(repoId, file, sym);
      if (!nodes.has(id)) {
        const [label, sub] = labelFor(repoId, file, sym);
        nodes.set(id, { id, repoId, label, sub, x: 0, y: 0, w: 0, h: 0 });
      }
      return id;
    };
    if (level === "repo") for (const r of repos) add(r.id, "", "");
    const agg = new Map<string, AggEdge>();
    for (const e of edges) {
      if (crossOnly && e.fromRepo === e.toRepo) continue;
      if (level === "function" && e.kind === "import") continue;
      const a = add(e.fromRepo, e.fromFile, e.fromSymbol);
      const b = add(e.toRepo, e.toFile, e.toSymbol);
      if (a === b) continue;
      const k = `${a}>${b}`;
      const cur = agg.get(k) ?? { a, b, count: 0, kinds: new Set<string>(), items: [] };
      cur.count++;
      cur.kinds.add(e.kind);
      cur.items.push(e);
      agg.set(k, cur);
    }
    // layout
    let width = 900;
    let height = 520;
    const list = [...nodes.values()];
    if (level === "repo") {
      const cx = 450;
      const cy = 265;
      const R = list.length > 1 ? 195 : 0;
      list.forEach((n, i) => {
        const ang = (i / list.length) * Math.PI * 2 - Math.PI / 2;
        n.w = 170;
        n.h = 54;
        n.x = cx + Math.cos(ang) * R * 1.55 - n.w / 2;
        n.y = cy + Math.sin(ang) * R - n.h / 2;
      });
    } else {
      const CW = 280;
      const byRepo = new Map<number, GNode[]>();
      for (const n of list) (byRepo.get(n.repoId) ?? byRepo.set(n.repoId, []).get(n.repoId)!).push(n);
      const groups = [...byRepo.entries()].sort((a, b) => (repoIdx.get(a[0]) ?? 0) - (repoIdx.get(b[0]) ?? 0));
      const cols = groups.length > 4 ? 3 : Math.min(2, Math.max(1, groups.length));
      const rowH: number[] = [];
      groups.forEach(([, ns], gi) => {
        const row = Math.floor(gi / cols);
        rowH[row] = Math.max(rowH[row] ?? 0, 44 + ns.length * 34 + 12);
      });
      groups.forEach(([, ns], gi) => {
        const row = Math.floor(gi / cols);
        const col = gi % cols;
        const x0 = 20 + col * (CW + 120);
        const y0 = 20 + rowH.slice(0, row).reduce((s, h) => s + h + 36, 0);
        ns.sort((a, b) => a.label.localeCompare(b.label)).forEach((n, i) => {
          n.x = x0 + 10;
          n.y = y0 + 44 + i * 34;
          n.w = CW - 20;
          n.h = 26;
        });
      });
      width = 40 + cols * (CW + 120) - 100;
      height = 40 + rowH.reduce((s, h) => s + h + 36, 0);
    }
    const clusters =
      level === "repo"
        ? []
        : [...new Set(list.map((n) => n.repoId))].map((rid) => {
            const ns = list.filter((n) => n.repoId === rid);
            const minX = Math.min(...ns.map((n) => n.x)) - 10;
            const minY = Math.min(...ns.map((n) => n.y)) - 44;
            const maxY = Math.max(...ns.map((n) => n.y + n.h)) + 12;
            return { rid, x: minX, y: minY, w: ns[0].w + 20, h: maxY - minY };
          });
    return { nodes, agg: [...agg.values()], width, height, clusters };
  }, [level, crossOnly, edges, repos, repoIdx]);

  // downstream impact: everything that (transitively) depends on the selected node
  const impacted = useMemo(() => {
    const set = new Set<string>();
    if (!selected) return set;
    const rev = new Map<string, string[]>();
    for (const e of model.agg) (rev.get(e.b) ?? rev.set(e.b, []).get(e.b)!).push(e.a);
    const stack = [selected];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const p of rev.get(cur) ?? []) if (!set.has(p) && p !== selected) {
        set.add(p);
        stack.push(p);
      }
    }
    return set;
  }, [selected, model.agg]);

  const mutual = useMemo(() => new Set(model.agg.filter((e) => model.agg.some((o) => o.a === e.b && o.b === e.a)).map((e) => `${e.a}>${e.b}`)), [model.agg]);
  const sel = selected ? model.nodes.get(selected) : null;
  const outgoing = model.agg.filter((e) => e.a === selected);
  const incoming = model.agg.filter((e) => e.b === selected);
  const color = (rid: number) => REPO_COLORS[(repoIdx.get(rid) ?? 0) % REPO_COLORS.length];
  const match = (n: GNode) => !q || `${n.label} ${n.sub}`.toLowerCase().includes(q.toLowerCase());

  function path(e: AggEdge) {
    const A = model.nodes.get(e.a)!;
    const B = model.nodes.get(e.b)!;
    if (level === "repo") {
      const ax = A.x + A.w / 2, ay = A.y + A.h / 2, bx = B.x + B.w / 2, by = B.y + B.h / 2;
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const nx = -(by - ay), ny = bx - ax;
      const len = Math.hypot(nx, ny) || 1;
      const off = mutual.has(`${e.a}>${e.b}`) ? 34 : 0;
      const cx = mx + (nx / len) * off, cy = my + (ny / len) * off;
      const s = clip(ax, ay, cx, cy, A.w + 4, A.h + 4);
      const t = clip(bx, by, cx, cy, B.w + 10, B.h + 10);
      return { d: `M ${s.x} ${s.y} Q ${cx} ${cy} ${t.x} ${t.y}`, lx: (s.x + 2 * cx + t.x) / 4, ly: (s.y + 2 * cy + t.y) / 4 };
    }
    const aRight = B.x + B.w / 2 > A.x + A.w / 2 + 5;
    const sameCol = Math.abs(A.x - B.x) < 5;
    const sx = sameCol ? A.x + A.w : aRight ? A.x + A.w : A.x;
    const tx = sameCol ? B.x + B.w : aRight ? B.x : B.x + B.w;
    const sy = A.y + A.h / 2, ty = B.y + B.h / 2;
    const bulge = sameCol ? 70 : 60;
    const c1 = sameCol ? sx + bulge : aRight ? sx + bulge : sx - bulge;
    const c2 = sameCol ? tx + bulge : aRight ? tx - bulge : tx + bulge;
    return { d: `M ${sx} ${sy} C ${c1} ${sy}, ${c2} ${ty}, ${tx} ${ty}`, lx: (sx + tx) / 2, ly: (sy + ty) / 2 };
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <div className="overflow-hidden rounded-[6px] border border-line bg-panel">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-3 py-2.5 md:px-4">
          <div className="inline-flex border border-line-strong">
            {(["repo", "file", "function"] as Level[]).map((l) => (
              <button
                key={l}
                onClick={() => {
                  setLevel(l);
                  setSelected(null);
                }}
                aria-pressed={level === l}
                className={`border-r border-line-strong px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] last:border-r-0 transition-colors ${
                  level === l ? "bg-signal/[0.09] text-signal" : "text-muted hover:bg-white/[0.03] hover:text-fg"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">
            <input type="checkbox" checked={crossOnly} onChange={(e) => setCrossOnly(e.target.checked)} className="h-3 w-3 accent-[#c8f542]" /> cross-repo
          </label>
          <label className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">
            <input type="checkbox" checked={impact} onChange={(e) => setImpact(e.target.checked)} className="h-3 w-3 accent-[#c8f542]" /> blast radius
          </label>
          {level !== "repo" && (
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="filter nodes"
              aria-label="Filter nodes"
              className="ml-auto w-40 rounded-[4px] border border-line-strong bg-sunken px-2 py-1.5 font-mono text-[11px] text-fg outline-none placeholder:text-faint focus:border-signal/55"
            />
          )}
        </div>
        <div className="overflow-auto p-3">
          {model.nodes.size === 0 ? (
            <div className="py-24 text-center font-mono text-[11px] uppercase tracking-[0.1em] text-faint">No dependencies found at this level.</div>
          ) : (
            <svg width={model.width} height={model.height} viewBox={`0 0 ${model.width} ${model.height}`} className="mx-auto select-none" onClick={() => setSelected(null)}>
              <defs>
                {Object.entries(KIND_COLOR).map(([k, c]) => (
                  <marker key={k} id={`ah-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M0,0 L10,5 L0,10 z" fill={c} />
                  </marker>
                ))}
                <marker id="ah-cycle" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M0,0 L10,5 L0,10 z" fill="#ff7a68" />
                </marker>
              </defs>
              {model.clusters.map((c) => (
                <g key={c.rid}>
                  <rect x={c.x} y={c.y} width={c.w} height={c.h} rx="4" fill="rgba(235,233,227,0.014)" stroke={color(c.rid)} strokeOpacity="0.28" />
                  <text x={c.x + 12} y={c.y + 24} fill={color(c.rid)} fontSize="9.5" fontFamily="ui-monospace, monospace" letterSpacing="1.4">
                    {(repos.find((r) => r.id === c.rid)?.name ?? "").toUpperCase()}
                  </text>
                </g>
              ))}
              {model.agg.map((e) => {
                const p = path(e);
                const cyc = mutual.has(`${e.a}>${e.b}`);
                const kind = e.kinds.has("http") ? "http" : e.kinds.has("call") ? "call" : "import";
                const incident = !selected || e.a === selected || e.b === selected || (impact && impacted.has(e.a) && (impacted.has(e.b) || e.b === selected));
                const stroke = cyc ? "#ff7a68" : KIND_COLOR[kind];
                return (
                  <g key={`${e.a}>${e.b}`} opacity={incident ? 1 : 0.1}>
                    <path
                      d={p.d}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={Math.min(3.5, 1 + e.count * 0.25)}
                      strokeDasharray={cyc ? "5 3" : kind === "http" ? "7 4" : undefined}
                      markerEnd={`url(#ah-${cyc ? "cycle" : kind})`}
                      strokeOpacity="0.8"
                    />
                    {level === "repo" && (
                      <text
                        x={p.lx}
                        y={p.ly - 4}
                        fill={MUTED}
                        fontSize="9.5"
                        fontFamily="ui-monospace, monospace"
                        textAnchor="middle"
                        style={{ paintOrder: "stroke" }}
                        stroke={INK}
                        strokeWidth="3"
                      >
                        {e.count}
                      </text>
                    )}
                  </g>
                );
              })}
              {[...model.nodes.values()].map((n) => {
                const isSel = n.id === selected;
                const isImp = impact && impacted.has(n.id);
                const dim = (selected && !isSel && !isImp && !model.agg.some((e) => (e.a === selected && e.b === n.id) || (e.b === selected && e.a === n.id))) || !match(n);
                return (
                  <g key={n.id} transform={`translate(${n.x},${n.y})`} opacity={dim ? 0.25 : 1} onClick={(ev) => { ev.stopPropagation(); setSelected(n.id); }} className="cursor-pointer">
                    <rect
                      width={n.w}
                      height={n.h}
                      rx={4}
                      fill={isSel ? "rgba(200,245,66,0.10)" : isImp ? "rgba(232,169,75,0.09)" : PANEL}
                      stroke={isSel ? "#c8f542" : isImp ? "#e8a94b" : color(n.repoId)}
                      strokeOpacity={isSel ? 1 : isImp ? 0.9 : 0.55}
                      strokeWidth={isSel ? 1.5 : 1}
                    />
                    {level === "repo" ? (
                      <>
                        <text x={n.w / 2} y={23} textAnchor="middle" fill={TEXT} fontSize="12" fontWeight="500">{n.label}</text>
                        <text x={n.w / 2} y={40} textAnchor="middle" fill={FAINT} fontSize="9" fontFamily="ui-monospace, monospace" letterSpacing="0.8">
                          {repos.find((r) => r.id === n.repoId)?.health !== undefined ? `HEALTH ${repos.find((r) => r.id === n.repoId)!.health}` : ""}
                        </text>
                      </>
                    ) : (
                      <text x={9} y={17} fill={TEXT} fontSize="11" fontFamily="ui-monospace, monospace">{n.label.length > 36 ? n.label.slice(0, 35) + "…" : n.label}</text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line px-4 py-2.5">
          {[
            ["#c8f542", "HTTP contract"],
            ["#b9b6aa", "function call"],
            ["#56544c", "import"],
            ["#ff7a68", "circular dependency"],
          ].map(([c, l]) => (
            <span key={l} className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-faint">
              <span className="inline-block h-[2px] w-4" style={{ background: c }} />
              {l}
            </span>
          ))}
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-faint">
            <span className="inline-block h-2.5 w-2.5 border border-warn/70 bg-warn/10" /> in blast radius of selection
          </span>
        </div>
      </div>

      <aside className="h-fit overflow-hidden rounded-[6px] border border-line bg-panel">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="eyebrow">inspector</span>
          {sel && <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">{level} level</span>}
        </div>
        {!sel ? (
          <div className="px-4 py-8 text-[12px] leading-relaxed text-muted">
            Select a node to see what it depends on, what depends on it, and everything downstream that a change would reach.
          </div>
        ) : (
          <div className="space-y-4 px-4 py-4">
            <div>
              <div className="break-words font-mono text-[12.5px] text-fg">{sel.label}</div>
              <div className="mt-1 font-mono text-[10.5px] text-faint">
                {level === "repo" ? repos.find((r) => r.id === sel.repoId)?.fullName : `${repos.find((r) => r.id === sel.repoId)?.name} · ${sel.sub}`}
              </div>
            </div>
            <div className="grid grid-cols-3 border border-line">
              <div className="border-r border-line px-2 py-2.5">
                <div className="num text-[15px] text-fg">{outgoing.length}</div>
                <div className="eyebrow mt-1">depends</div>
              </div>
              <div className="border-r border-line px-2 py-2.5">
                <div className="num text-[15px] text-fg">{incoming.length}</div>
                <div className="eyebrow mt-1">used by</div>
              </div>
              <div className={`px-2 py-2.5 ${impacted.size > 0 ? "bg-warn/[0.06]" : ""}`}>
                <div className={`num text-[15px] ${impacted.size > 0 ? "text-warn" : "text-fg"}`}>{impacted.size}</div>
                <div className="eyebrow mt-1">blast</div>
              </div>
            </div>
            {impacted.size > 0 && (
              <div className="text-[11.5px] leading-relaxed text-muted">
                If <span className="font-mono text-fg">{sel.label}</span> changes, these may be affected:{" "}
                <span className="font-mono text-warn">
                  {[...impacted]
                    .map((id) => model.nodes.get(id)?.label)
                    .slice(0, 8)
                    .join(", ")}
                  {impacted.size > 8 ? "…" : ""}
                </span>
              </div>
            )}
            {[
              { title: "Depends on", list: outgoing, key: "b" as const },
              { title: "Used by", list: incoming, key: "a" as const },
            ].map((sec) => (
              <div key={sec.title}>
                <div className="eyebrow mb-2 border-t border-line pt-3">{sec.title}</div>
                {sec.list.length === 0 && <div className="font-mono text-[11px] text-faint">—</div>}
                <div className="space-y-2">
                  {sec.list.map((e) => {
                    const other = model.nodes.get(e[sec.key])!;
                    return (
                      <div key={e.a + e.b} className="border border-line bg-sunken p-2.5">
                        <button onClick={() => setSelected(other.id)} className="break-words text-left font-mono text-[11.5px] text-fg hover:text-signal">
                          {other.label}
                        </button>
                        <div className="mt-1 font-mono text-[10px] text-faint">
                          {repos.find((r) => r.id === other.repoId)?.name} · {[...e.kinds].join("/")} ×{e.count}
                        </div>
                        <div className="mt-1.5 space-y-1">
                          {e.items.slice(0, 3).map((it, i) => (
                            <div key={i} className="truncate font-mono text-[10px] text-faint" title={it.text}>
                              {it.fromFile}:{it.line} <span className="text-muted">{it.text.trim()}</span>
                            </div>
                          ))}
                          {e.items.length > 3 && <div className="font-mono text-[10px] text-faint">+{e.items.length - 3} more</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
