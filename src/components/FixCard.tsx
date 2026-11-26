"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Fix } from "@/lib/analyzer/types";
import { Badge, PatchBlock } from "./ui";

const small = "rounded-[4px] border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors disabled:opacity-45";

export default function FixCard({ fix, prId, status = "pending" }: { fix: Fix; prId?: number; status?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState(status);
  const [copied, setCopied] = useState(false);

  async function set(next: string) {
    if (!prId) return;
    setBusy(true);
    setLocal(next);
    await fetch(`/api/prs/${prId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "fix", fixId: fix.id, status: next }) });
    setBusy(false);
    router.refresh();
  }

  return (
    <div
      className={`border p-3.5 ${
        local === "approved" ? "border-ok/40 bg-ok/[0.03]" : local === "rejected" ? "border-line bg-transparent opacity-55" : "border-line bg-sunken/40"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge tone={local === "approved" ? "ok" : "neutral"}>{fix.role === "producer" ? "fix in this PR" : "fix in dependent repo"}</Badge>
            <span className="font-mono text-[10.5px] text-faint">
              {fix.repoName.split("/").pop()}/{fix.file}:{fix.line}
            </span>
          </div>
          <div className="mt-2 text-[12.5px] font-medium text-fg">{fix.title}</div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{fix.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {local !== "pending" && <Badge tone={local === "approved" ? "ok" : "neutral"}>{local}</Badge>}
          {fix.patch && (
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(fix.patch);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className={`${small} border-line-strong text-muted hover:border-white/25 hover:text-fg`}
            >
              {copied ? "copied" : "copy patch"}
            </button>
          )}
          {prId && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => set(local === "approved" ? "pending" : "approved")}
                className={`${small} border-ok/40 text-ok hover:bg-ok/10`}
              >
                {local === "approved" ? "unapprove" : "approve"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => set(local === "rejected" ? "pending" : "rejected")}
                className={`${small} border-line-strong text-faint hover:text-muted`}
              >
                {local === "rejected" ? "restore" : "dismiss"}
              </button>
            </>
          )}
        </div>
      </div>
      {fix.patch && (
        <div className="mt-3">
          <PatchBlock patch={fix.patch} />
        </div>
      )}
    </div>
  );
}
