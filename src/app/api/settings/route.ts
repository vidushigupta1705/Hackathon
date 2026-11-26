import { NextResponse } from "next/server";
import { deleteSetting, setSetting } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { githubToken?: string | null; autoComment?: boolean; webhookSecret?: string };
  if (body.githubToken !== undefined) {
    if (body.githubToken) {
      const res = await fetch("https://api.github.com/user", { headers: { authorization: `Bearer ${body.githubToken}`, "user-agent": "devimpact" } }).catch(() => null);
      if (!res || !res.ok) return NextResponse.json({ error: "GitHub rejected this token (or GitHub is unreachable)." }, { status: 400 });
      const u = (await res.json()) as { login: string };
      await setSetting("github_token", body.githubToken);
      await setSetting("github_login", u.login);
    } else {
      await deleteSetting("github_token");
      await deleteSetting("github_login");
    }
  }
  if (body.autoComment !== undefined) await setSetting("auto_comment", body.autoComment ? "1" : "0");
  if (body.webhookSecret !== undefined) {
    if (body.webhookSecret) await setSetting("webhook_secret", body.webhookSecret);
    else await deleteSetting("webhook_secret");
  }
  return NextResponse.json({ ok: true });
}
