import { NextResponse } from "next/server";
import { analyzePR, upsertFixStatus } from "@/lib/store";
import { postPRComment } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

// body: { action: "analyze" } | { action: "fix", fixId, status } | { action: "comment" }
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const prId = Number(id);
  const body = (await req.json().catch(() => ({}))) as { action?: string; fixId?: string; status?: string };
  try {
    if (body.action === "fix" && body.fixId && body.status) {
      if (!["pending", "approved", "rejected"].includes(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      await upsertFixStatus(prId, body.fixId, body.status);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "comment") {
      const c = await postPRComment(prId);
      return NextResponse.json({ ok: true, comment: c });
    }
    const analysis = await analyzePR(prId);
    if (!analysis) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
