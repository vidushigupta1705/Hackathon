"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Card, CardHeader, PatchBlock, btn, field, relTime } from "./ui";

export function ApiButton({
  url,
  body,
  label,
  busyLabel = "Working…",
  method = "POST",
  variant = "primary",
  confirmText,
  redirect,
}: {
  url: string;
  body?: unknown;
  label: string;
  busyLabel?: string;
  method?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  confirmText?: string;
  redirect?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const cls = variant === "primary" ? btn.primary : variant === "danger" ? btn.danger : variant === "secondary" ? btn.secondary : btn.secondary;
  async function run() {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErr(j.error ?? "Request failed");
      else if (redirect) router.push(redirect);
      else router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }
  return (
    <span className="inline-flex flex-col items-start gap-1.5">
      <button type="button" onClick={run} disabled={busy} className={cls}>
        {busy ? busyLabel : label}
      </button>
      {err && <span className="max-w-xs font-mono text-[10.5px] text-danger">{err}</span>}
    </span>
  );
}

export function AnalyzePRForm({ repos }: { repos: { id: number; fullName: string }[] }) {
  const router = useRouter();
  const [repoId, setRepoId] = useState(repos[0]?.id ?? 0);
  const [num, setNum] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (repos.length === 0) return null;
  async function run() {
    setBusy(true);
    setErr("");
    const r = await fetch(`/api/repos/${repoId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ number: Number(num) }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) setErr(j.error ?? "Failed");
    else {
      setNum("");
      router.refresh();
    }
  }
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0">
          <label htmlFor="pr-repo" className="eyebrow mb-1.5 block">
            repository
          </label>
          <select id="pr-repo" value={repoId} onChange={(e) => setRepoId(Number(e.target.value))} className={`${field} min-w-[220px]`}>
            {repos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.fullName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pr-number" className="eyebrow mb-1.5 block">
            number
          </label>
          <input
            id="pr-number"
            value={num}
            onChange={(e) => setNum(e.target.value.replace(/\D/g, ""))}
            placeholder="42"
            className={`${field} w-24`}
          />
        </div>
        <button type="button" disabled={busy || !num} onClick={run} className={btn.primary}>
          {busy ? "Fetching & analysing…" : "Analyze"}
        </button>
        {err && <span className="font-mono text-[10.5px] text-danger">{err}</span>}
      </div>
      <p className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.06em] text-faint">
        GitHub-connected repositories only · demo repositories ship with pre-loaded pull requests
      </p>
    </Card>
  );
}

export function PRCommentPanel({
  prId,
  preview,
  provider,
  comments,
  approved,
}: {
  prId: number;
  preview: string;
  provider: string;
  comments: { id: number; body: string; postedTo: string; url: string | null; createdAt: string }[];
  approved: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function post() {
    setBusy(true);
    setErr("");
    const r = await fetch(`/api/prs/${prId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "comment" }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) setErr(j.error ?? "Failed");
    else router.refresh();
  }
  return (
    <Card className="overflow-hidden">
      <CardHeader
        eyebrow="review output"
        title="Pull request comment"
        subtitle={
          provider === "github"
            ? "Read the generated summary, then post it to the GitHub pull request."
            : "Demo repository — comments are stored as previews. Connect a GitHub repo to post for real."
        }
        right={
          <button type="button" onClick={post} disabled={busy} className={btn.primary}>
            {busy ? "Posting…" : provider === "github" ? "Post to GitHub" : "Save preview"}
          </button>
        }
      />
      <div className="space-y-3 p-4 md:p-5">
        {err && <div className="font-mono text-[10.5px] text-danger">{err}</div>}
        <div className="font-mono text-[10.5px] text-faint">
          {approved} approved suggestion{approved === 1 ? "" : "s"} included
        </div>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap border border-line bg-sunken p-4 font-mono text-[11.5px] leading-[1.75] text-muted">
          {preview}
        </pre>
        {comments.length > 0 && (
          <div className="border-t border-line pt-3">
            <div className="eyebrow mb-2">history</div>
            {comments.map((c) => (
              <div key={c.id} className="flex items-center gap-2.5 py-1 font-mono text-[10.5px] text-faint">
                <Badge tone={c.postedTo === "github" ? "ok" : "neutral"}>{c.postedTo}</Badge>
                {relTime(c.createdAt)}
                {c.url && (
                  <a href={c.url} target="_blank" rel="noreferrer" className="text-muted underline decoration-line-strong underline-offset-2 hover:text-signal">
                    on GitHub
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

export { PatchBlock };
