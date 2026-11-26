import { NextResponse } from "next/server";
import { analyzeOpenPRs, getGithubToken } from "@/lib/store";
import { connectGithubRepo } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const { repos } = (await req.json().catch(() => ({}))) as { repos?: string[] };
  if (!repos?.length) return NextResponse.json({ error: "Select at least one repository" }, { status: 400 });
  const token = await getGithubToken();
  const connected: string[] = [];
  const errors: string[] = [];
  for (const full of repos.slice(0, 10)) {
    try {
      const row = await connectGithubRepo(token, full.trim());
      connected.push(row.fullName);
    } catch (e) {
      errors.push(`${full}: ${(e as Error).message}`);
    }
  }
  if (connected.length) await analyzeOpenPRs();
  return NextResponse.json({ connected, errors }, { status: connected.length ? 200 : 502 });
}
