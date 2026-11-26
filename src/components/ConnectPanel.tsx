"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, CardHeader, btn, field } from "./ui";

interface GhRepo {
  fullName: string;
  description: string | null;
  private: boolean;
  language: string | null;
}

export default function ConnectPanel({ hasToken, connected }: { hasToken: boolean; connected: string[] }) {
  const router = useRouter();
  const [repos, setRepos] = useState<GhRepo[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState<"" | "list" | "connect">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState("");

  async function load() {
    setBusy("list");
    setMsg(null);
    const r = await fetch("/api/github/repos");
    const j = await r.json();
    setBusy("");
    if (!r.ok) setMsg({ ok: false, text: j.error });
    else setRepos(j.repos);
  }

  async function connect() {
    const list = [...sel, ...manual.split(/[\s,]+/).filter((x) => /^[\w.-]+\/[\w.-]+$/.test(x))];
    if (!list.length) return setMsg({ ok: false, text: "Select repositories or enter owner/name." });
    setBusy("connect");
    setMsg(null);
    const r = await fetch("/api/github/connect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ repos: [...new Set(list)] }) });
    const j = await r.json();
    setBusy("");
    setMsg({
      ok: r.ok,
      text: r.ok ? `Connected ${j.connected.length} repositor${j.connected.length === 1 ? "y" : "ies"}${j.errors.length ? ` — ${j.errors.join("; ")}` : ""}` : (j.errors ?? [j.error]).join("; "),
    });
    if (r.ok) {
      setSel(new Set());
      setManual("");
      router.refresh();
    }
  }

  const shown = (repos ?? []).filter((r) => r.fullName.toLowerCase().includes(filter.toLowerCase()));

  return (
    <Card className="overflow-hidden">
      <CardHeader
        eyebrow="sources"
        title="Connect GitHub repositories"
        subtitle="Select every repository that belongs to one project. Private repositories are read with your access token."
      />
      <div className="space-y-4 p-4 md:p-5">
        {!hasToken && (
          <div className="flex gap-2.5 border border-line bg-sunken px-3 py-2.5">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
            <p className="text-[11.5px] leading-relaxed text-muted">
              No GitHub token configured. Public repositories can be entered manually below; private repos and higher rate limits need a token.{" "}
              <a href="/settings" className="text-fg underline decoration-line-strong underline-offset-2 hover:text-signal">
                Add one in Settings
              </a>
              .
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2.5">
          <button type="button" onClick={load} disabled={!hasToken || busy !== ""} className={btn.secondary}>
            {busy === "list" ? "Loading…" : repos ? "Reload my repositories" : "Browse my repositories"}
          </button>
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="owner/repo, owner/another-repo"
            aria-label="Repository names"
            className={`${field} min-w-[240px] flex-1`}
          />
          <button type="button" onClick={connect} disabled={busy !== ""} className={btn.primary}>
            {busy === "connect" ? "Fetching & analysing…" : `Connect${sel.size ? ` (${sel.size})` : ""}`}
          </button>
        </div>
        {msg && <div className={`font-mono text-[10.5px] ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</div>}
        {repos && (
          <div>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="filter repositories"
              aria-label="Filter repositories"
              className={`${field} mb-2`}
            />
            <div className="max-h-72 divide-y divide-line overflow-auto border border-line">
              {shown.map((r) => (
                <label key={r.fullName} className="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-white/[0.025]">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-[#c8f542]"
                    checked={sel.has(r.fullName)}
                    onChange={(e) => {
                      const n = new Set(sel);
                      if (e.target.checked) n.add(r.fullName);
                      else n.delete(r.fullName);
                      setSel(n);
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[11.5px] text-fg">
                      {r.fullName}
                      {r.private && <span className="ml-2 text-[9.5px] uppercase tracking-[0.1em] text-faint">private</span>}
                      {connected.includes(r.fullName) && <span className="ml-2 text-[9.5px] uppercase tracking-[0.1em] text-ok">connected</span>}
                    </span>
                    <span className="block truncate text-[11px] text-faint">{r.description ?? "—"}</span>
                  </span>
                  <span className="font-mono text-[10px] text-faint">{r.language}</span>
                </label>
              ))}
              {shown.length === 0 && <div className="px-3 py-6 text-center font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">no repositories</div>}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
