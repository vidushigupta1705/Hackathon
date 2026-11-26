import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { repositories } from "@/db/schema";
import { analyzeOpenPRs, deleteRepo, getGithubToken } from "@/lib/store";
import { connectGithubRepo, upsertPull } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await deleteRepo(Number(id));
  await analyzeOpenPRs();
  return NextResponse.json({ ok: true });
}

// Re-sync a GitHub repository (files, branches, commits, PRs) or analyse a specific PR number.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { number?: number };
  const [repo] = await db.select().from(repositories).where(eq(repositories.id, Number(id)));
  if (!repo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (repo.provider !== "github") return NextResponse.json({ error: "Demo repositories are static snapshots" }, { status: 400 });
  const token = await getGithubToken();
  try {
    if (body.number) await upsertPull(token, repo, Number(body.number));
    else await connectGithubRepo(token, repo.fullName);
    await analyzeOpenPRs();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
