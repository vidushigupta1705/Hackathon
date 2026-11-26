"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, Card, CardHeader, btn, field } from "./ui";

export default function SettingsForm({
  login,
  hasEnvToken,
  autoComment,
  hasSecret,
}: {
  login: string | null;
  hasEnvToken: boolean;
  autoComment: boolean;
  hasSecret: boolean;
}) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  async function save(body: unknown, okText: string) {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg({ ok: r.ok, text: r.ok ? okText : j.error ?? "Failed" });
    if (r.ok) {
      setToken("");
      setSecret("");
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <CardHeader
          eyebrow="credentials"
          title="GitHub access"
          subtitle="A personal access token — classic with repo scope, or fine-grained with Contents, Pull requests and Metadata — lets DevImpact read private repositories and comment on pull requests."
          right={
            login ? (
              <Badge tone="ok">connected as @{login}</Badge>
            ) : hasEnvToken ? (
              <Badge tone="neutral">GITHUB_TOKEN env</Badge>
            ) : (
              <Badge tone="neutral">not connected</Badge>
            )
          }
        />
        <div className="space-y-3 p-4 md:p-5">
          <div className="flex flex-wrap items-end gap-2.5">
            <div className="min-w-[260px] flex-1">
              <label htmlFor="gh-token" className="eyebrow mb-1.5 block">
                token
              </label>
              <input
                id="gh-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_… or github_pat_…"
                className={field}
              />
            </div>
            <button type="button" disabled={busy || !token} onClick={() => save({ githubToken: token }, "Token verified and saved.")} className={btn.primary}>
              Verify & save
            </button>
            {login && (
              <button type="button" disabled={busy} onClick={() => save({ githubToken: null }, "Token removed.")} className={btn.danger}>
                Remove
              </button>
            )}
          </div>
          {msg && <div className={`font-mono text-[10.5px] ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</div>}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader eyebrow="automation" title="Pull request automation" subtitle="Analyse every new or updated pull request through a GitHub webhook." />
        <div className="space-y-4 p-4 md:p-5">
          <div>
            <div className="eyebrow mb-1.5">payload url</div>
            <code className="block overflow-x-auto border border-line bg-sunken px-3 py-2 font-mono text-[11px] text-signal/80">{origin}/api/webhooks/github</code>
            <p className="mt-1.5 font-mono text-[10px] text-faint">
              content type application/json · event: pull requests · runs on opened / synchronize / reopened
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2.5">
            <div className="min-w-[260px] flex-1">
              <label htmlFor="gh-secret" className="eyebrow mb-1.5 block">
                webhook secret
              </label>
              <input
                id="gh-secret"
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={hasSecret ? "configured — enter a new value to replace" : "recommended"}
                className={field}
              />
            </div>
            <button type="button" disabled={busy || !secret} onClick={() => save({ webhookSecret: secret }, "Webhook secret saved.")} className={btn.secondary}>
              Save secret
            </button>
          </div>
          <label className="flex cursor-pointer items-start gap-3 border-t border-line pt-4">
            <input
              type="checkbox"
              className="mt-0.5 h-3.5 w-3.5 accent-[#c8f542]"
              checked={autoComment}
              onChange={(e) => save({ autoComment: e.target.checked }, e.target.checked ? "Auto-comment enabled." : "Auto-comment disabled.")}
            />
            <span>
              <span className="block text-[12.5px] text-fg">Post the impact summary automatically</span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-faint">
                Off by default. You can always review and post a comment by hand from the pull request page.
              </span>
            </span>
          </label>
        </div>
      </Card>
    </div>
  );
}
