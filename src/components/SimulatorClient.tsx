"use client";

import { useMemo, useState } from "react";
import type { PRAnalysis } from "@/lib/analyzer/types";
import type { EntityOption } from "@/lib/quarantine-types";
import type { Resolution } from "@/lib/resolver/resolve";
import AnalysisView from "./AnalysisView";
import QuarantinePanel from "./QuarantinePanel";
import { Badge, Card, CardHeader, btn, field } from "./ui";

export interface SimSymbol {
  name: string;
  kind: string;
  params: { name: string; type: string }[];
  returnType: string;
  fields: string[];
}
export interface SimRepo {
  id: number;
  fullName: string;
  symbols: SimSymbol[];
  deps: string[];
}

export default function SimulatorClient({ repos, entities }: { repos: SimRepo[]; entities: EntityOption[] }) {
  const [repoId, setRepoId] = useState(repos[0]?.id ?? 0);
  const repo = repos.find((r) => r.id === repoId);
  const [symbol, setSymbol] = useState("");
  const [action, setAction] = useState("remove");
  const [newName, setNewName] = useState("");
  const [paramIndex, setParamIndex] = useState(0);
  const [newType, setNewType] = useState("string");
  const [paramName, setParamName] = useState("options");
  const [newPath, setNewPath] = useState("/v2");
  const [field_, setField] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<PRAnalysis | null>(null);
  const [probeText, setProbeText] = useState("");
  const [probeAction, setProbeAction] = useState("remove");
  const [probeBusy, setProbeBusy] = useState(false);
  const [probeErr, setProbeErr] = useState("");
  const [probeRefusal, setProbeRefusal] = useState<{ resolution: Resolution; id: number | null } | null>(null);
  const [probeAnalysis, setProbeAnalysis] = useState<PRAnalysis | null>(null);
  const [probeRouted, setProbeRouted] = useState<{ query: string; symbol: string; kind: string; repoName: string } | null>(null);

  const entries = useMemo(
    () => [
      ...(repo?.symbols.map((s) => ({ key: s.name, label: `${s.name}  ·  ${s.kind}`, sym: s as SimSymbol | null })) ?? []),
      ...(repo?.deps.map((d) => ({ key: `dep:${d}`, label: `${d}  ·  dependency`, sym: null })) ?? []),
    ],
    [repo],
  );
  const current = symbol || entries[0]?.key || "";
  const entry = entries.find((e) => e.key === current);
  const isDep = current.startsWith("dep:");
  const kind = isDep ? "dependency" : entry?.sym?.kind ?? "function";
  const actions = useMemo(() => {
    if (isDep) return [["upgrade_dep", "Upgrade to next major version"]];
    if (kind === "route") return [["remove", "Remove this endpoint"], ["route_path", "Move to a different path"]];
    if (["interface", "type", "enum"].includes(kind)) return [["remove", "Delete this type"], ...(entry?.sym?.fields.length ? [["remove_field", "Remove a field"]] : [])];
    return [
      ["remove", "Remove it"],
      ["rename", "Rename it"],
      ...(entry?.sym?.params.length ? [["param_type", "Change a parameter type"]] : []),
      ["add_param", "Add a new required parameter"],
      ...(kind !== "class" ? [["return_type", "Change the return type"]] : []),
    ];
  }, [isDep, kind, entry]);
  const act = actions.some((a) => a[0] === action) ? action : actions[0][0];
  const sym = entry?.sym;

  const question = (() => {
    const n = isDep ? current.slice(4) : current;
    switch (act) {
      case "remove":
        return `What happens if I remove \`${n}\`?`;
      case "rename":
        return `What happens if I rename \`${n}\` to \`${newName || "…"}\`?`;
      case "param_type":
        return `What happens if parameter \`${sym?.params[paramIndex]?.name}\` of \`${n}\` becomes \`${newType}\`?`;
      case "add_param":
        return `What happens if \`${n}\` gets a new required parameter \`${paramName}\`?`;
      case "return_type":
        return `What happens if \`${n}\` returns \`${newType}\`?`;
      case "route_path":
        return `What happens if \`${n}\` moves to \`${newPath}\`?`;
      case "remove_field":
        return `What happens if \`${n}.${field_ || sym?.fields[0]}\` is removed?`;
      default:
        return `What happens if I upgrade \`${n}\` to the next major version?`;
    }
  })();

  async function run() {
    setBusy(true);
    setErr("");
    const s = isDep ? current.slice(4) : current;
    const body: Record<string, unknown> =
      act === "rename"
        ? { type: act, symbol: s, newName }
        : act === "param_type"
          ? { type: act, symbol: s, paramIndex, newType }
          : act === "add_param"
            ? { type: act, symbol: s, name: paramName, paramType: newType }
            : act === "return_type"
              ? { type: act, symbol: s, newType }
              : act === "route_path"
                ? { type: act, symbol: s, newPath }
                : act === "remove_field"
                  ? { type: act, symbol: s, field: field_ || sym?.fields[0] }
                  : { type: act, symbol: s };
    const r = await fetch("/api/simulate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ repoId, action: body }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setErr(j.error ?? "Simulation failed");
      setResult(null);
    } else setResult(j.analysis);
  }

  async function routeProbe(text = probeText, act = probeAction) {
    if (!text.trim()) return;
    setProbeBusy(true);
    setProbeErr("");
    const r = await fetch("/api/simulate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repoId, query: text, action: { type: act } }),
    });
    const j = await r.json().catch(() => ({}));
    setProbeBusy(false);
    if (r.status === 422 && j.quarantined) {
      setProbeRefusal({ resolution: j.resolution, id: j.quarantineId ?? null });
      setProbeRouted(null);
      setProbeAnalysis(null);
      return;
    }
    if (!r.ok) {
      setProbeErr(j.error ?? "Simulation failed");
      setProbeRefusal(null);
      setProbeRouted(null);
      setProbeAnalysis(null);
      return;
    }
    setProbeRefusal(null);
    setProbeRouted({
      query: j.resolution?.query ?? text,
      symbol: j.resolved?.symbol ?? "",
      kind: j.resolved?.kind ?? "",
      repoName: j.resolved?.repoName ?? "",
    });
    setProbeAnalysis(j.analysis);
  }

  if (!repos.length) return null;

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-signal/25">
        <CardHeader
          eyebrow="unseen input · resolver"
          title="Route any name"
          subtitle="Type a surface form the dropdown does not offer — a typo, snake_case, a qualified path, or something out of domain. The resolver embeds it, compares it with every target, and refuses instead of guessing when the score is not decisive."
          right={<Badge tone="accent">{entities.length} targets · 256-d</Badge>}
        />
        <div className="grid gap-3 p-4 md:grid-cols-[1fr_210px_auto] md:items-end md:p-5">
          <label className="block min-w-0">
            <span className="eyebrow mb-1.5 block">surface form</span>
            <input
              className={field}
              value={probeText}
              onChange={(e) => setProbeText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void routeProbe();
                }
              }}
              placeholder="chargeCostumer"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <label className="block">
            <span className="eyebrow mb-1.5 block">action</span>
            <select className={field} value={probeAction} onChange={(e) => setProbeAction(e.target.value)}>
              <option value="remove">Remove it</option>
              <option value="upgrade_dep">Upgrade dependency</option>
            </select>
          </label>
          <button type="button" className={btn.primary} onClick={() => void routeProbe()} disabled={probeBusy || !probeText.trim()}>
            {probeBusy ? "Resolving…" : "Route & simulate"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5 md:px-5">
          <span className="eyebrow">try</span>
          {["chargeCostumer", "getUser", "sendSlackMessage"].map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setProbeText(example);
                setProbeRefusal(null);
                setProbeAnalysis(null);
                setProbeRouted(null);
              }}
              className="rounded-[3px] border border-line px-1.5 py-1 font-mono text-[10px] text-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              {example}
            </button>
          ))}
          <span className="ml-auto font-mono text-[10px] text-faint">scoped to {repo?.fullName ?? "this repository"}</span>
        </div>
        {probeErr && <div className="border-t border-line px-4 py-3 font-mono text-[10.5px] text-danger md:px-5">{probeErr}</div>}
        {probeRefusal && (
          <div className="border-t border-line">
            <QuarantinePanel
              key={`probe-${probeRefusal.id ?? probeRefusal.resolution.query}`}
              resolution={probeRefusal.resolution}
              quarantineId={probeRefusal.id}
              entities={entities.filter((e) => e.repoId === repoId)}
              onMapped={() => void routeProbe()}
            />
          </div>
        )}
      </Card>

      {probeRouted && probeAnalysis && (
        <div className="flex flex-wrap items-center gap-2 rounded-[6px] border border-signal/25 bg-signal/[0.03] px-4 py-2.5">
          <Badge tone="accent">routed</Badge>
          <span className="break-all font-mono text-[11px] text-muted">{probeRouted.query}</span>
          <span className="text-faint">→</span>
          <span className="break-all font-mono text-[11px] text-fg">{probeRouted.symbol}</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-faint">{probeRouted.kind}</span>
          <span className="ml-auto font-mono text-[10px] text-faint">{probeRouted.repoName}</span>
        </div>
      )}
      {probeAnalysis && <AnalysisView analysis={probeAnalysis} />}

      <Card className="overflow-hidden">
        <CardHeader
          eyebrow="hypothesis"
          title="Propose a change"
          subtitle="Nothing is modified. DevImpact applies the change to an in-memory copy of the repository and recomputes the impact."
        />
        <div className="grid gap-4 p-4 md:grid-cols-2 md:p-5 xl:grid-cols-4">
          <label className="block">
            <span className="eyebrow mb-1.5 block">repository</span>
            <select
              className={field}
              value={repoId}
              onChange={(e) => {
                setRepoId(Number(e.target.value));
                setSymbol("");
                setResult(null);
                setProbeRefusal(null);
                setProbeAnalysis(null);
                setProbeRouted(null);
                setProbeErr("");
              }}
            >
              {repos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.fullName}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="eyebrow mb-1.5 block">function · endpoint · type · dependency</span>
            <select
              className={field}
              value={current}
              onChange={(e) => {
                setSymbol(e.target.value);
                setResult(null);
              }}
            >
              {entries.map((e) => (
                <option key={e.key} value={e.key}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="eyebrow mb-1.5 block">action</span>
            <select className={field} value={act} onChange={(e) => setAction(e.target.value)}>
              {actions.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <div>
            {act === "rename" && (
              <label className="block">
                <span className="eyebrow mb-1.5 block">new name</span>
                <input className={field} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="newName" />
              </label>
            )}
            {act === "param_type" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="eyebrow mb-1.5 block">parameter</span>
                  <select className={field} value={paramIndex} onChange={(e) => setParamIndex(Number(e.target.value))}>
                    {sym?.params.map((p, i) => (
                      <option key={p.name} value={i}>
                        {p.name}: {p.type || "any"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="eyebrow mb-1.5 block">new type</span>
                  <input className={field} value={newType} onChange={(e) => setNewType(e.target.value)} />
                </label>
              </div>
            )}
            {act === "add_param" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="eyebrow mb-1.5 block">name</span>
                  <input className={field} value={paramName} onChange={(e) => setParamName(e.target.value)} />
                </label>
                <label className="block">
                  <span className="eyebrow mb-1.5 block">type</span>
                  <input className={field} value={newType} onChange={(e) => setNewType(e.target.value)} />
                </label>
              </div>
            )}
            {act === "return_type" && (
              <label className="block">
                <span className="eyebrow mb-1.5 block">new return type</span>
                <input className={field} value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="Promise<User | null>" />
              </label>
            )}
            {act === "route_path" && (
              <label className="block">
                <span className="eyebrow mb-1.5 block">new path</span>
                <input className={field} value={newPath} onChange={(e) => setNewPath(e.target.value)} placeholder="/v2/orders/:id" />
              </label>
            )}
            {act === "remove_field" && (
              <label className="block">
                <span className="eyebrow mb-1.5 block">field</span>
                <select className={field} value={field_ || sym?.fields[0]} onChange={(e) => setField(e.target.value)}>
                  {sym?.fields.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-sunken/50 px-4 py-3 md:px-5">
          <div className="min-w-0">
            <div className="eyebrow mb-1.5">question</div>
            <div className="break-words font-mono text-[12px] text-fg">{question.replace(/`/g, "")}</div>
          </div>
          <button type="button" onClick={run} disabled={busy || (act === "rename" && !newName)} className={btn.primary}>
            {busy ? "Simulating…" : "Simulate impact"}
          </button>
        </div>
        {err && <div className="border-t border-line px-4 py-3 font-mono text-[10.5px] text-danger md:px-5">{err}</div>}
      </Card>
      {result &&
        (result.changes.length === 0 ? (
          <Card className="px-5 py-10">
            <div className="eyebrow mb-2">no difference</div>
            <div className="text-[12.5px] text-muted">That change produces no detectable API difference.</div>
          </Card>
        ) : (
          <AnalysisView analysis={result} />
        ))}
    </div>
  );
}
