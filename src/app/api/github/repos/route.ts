import { NextResponse } from "next/server";
import { listUserRepos } from "@/lib/github";
import { getGithubToken } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = await getGithubToken();
  if (!token) return NextResponse.json({ error: "No GitHub token configured. Add one in Settings." }, { status: 400 });
  try {
    const repos = await listUserRepos(token);
    return NextResponse.json({
      repos: repos.map((r) => ({ fullName: r.full_name, description: r.description, private: r.private, language: r.language, updatedAt: r.updated_at })),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
