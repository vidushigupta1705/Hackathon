import { createHmac, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { repositories } from "@/db/schema";
import { analyzePR, getGithubToken, getSetting } from "@/lib/store";
import { postPRComment, upsertPull } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = (await getSetting("webhook_secret")) || process.env.GITHUB_WEBHOOK_SECRET;
  if (secret) {
    const sig = req.headers.get("x-hub-signature-256") ?? "";
    const expected = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  const event = req.headers.get("x-github-event");
  if (event === "ping") return NextResponse.json({ ok: true, pong: true });
  if (event !== "pull_request") return NextResponse.json({ ok: true, ignored: event });

  const payload = JSON.parse(raw) as { action: string; number: number; repository: { full_name: string } };
  if (!["opened", "synchronize", "reopened"].includes(payload.action)) return NextResponse.json({ ok: true, ignored: payload.action });
  const [repo] = await db.select().from(repositories).where(eq(repositories.fullName, payload.repository.full_name));
  if (!repo) return NextResponse.json({ ok: true, ignored: "repository not connected" }, { status: 202 });

  const token = await getGithubToken();
  const prId = await upsertPull(token, repo, payload.number);
  const analysis = await analyzePR(prId);
  let commented = false;
  if ((await getSetting("auto_comment")) === "1" && token) {
    await postPRComment(prId);
    commented = true;
  }
  return NextResponse.json({ ok: true, prId, risk: analysis?.risk.score ?? null, commented });
}
