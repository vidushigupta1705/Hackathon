import { isAnalyzablePath } from "./store";

const API = "https://api.github.com";

async function gh<T>(path: string, token: string | null, accept = "application/vnd.github+json", init?: RequestInit): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : API + path, {
    ...init,
    headers: {
      accept,
      "x-github-api-version": "2022-11-28",
      "user-agent": "devimpact",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status}: ${text.slice(0, 200) || res.statusText}`);
  }
  if (accept.includes("raw")) return (await res.text()) as unknown as T;
  return (await res.json()) as T;
}

export interface GhRepo {
  full_name: string;
  name: string;
  description: string | null;
  private: boolean;
  language: string | null;
  default_branch: string;
  html_url: string;
  updated_at: string;
}

export async function listUserRepos(token: string): Promise<GhRepo[]> {
  return gh<GhRepo[]>("/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member", token);
}

async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

export async function fetchRepoSnapshot(token: string | null, fullName: string) {
  const meta = await gh<GhRepo>(`/repos/${fullName}`, token);
  const [branches, commits] = await Promise.all([
    gh<{ name: string }[]>(`/repos/${fullName}/branches?per_page=30`, token).catch(() => []),
    gh<{ sha: string; commit: { message: string; author: { name: string; date: string } } }[]>(`/repos/${fullName}/commits?per_page=15&sha=${meta.default_branch}`, token).catch(() => []),
  ]);
  const tree = await gh<{ tree: { path: string; type: string; sha: string; size?: number }[] }>(`/repos/${fullName}/git/trees/${meta.default_branch}?recursive=1`, token);
  const picked = tree.tree
    .filter((t) => t.type === "blob" && isAnalyzablePath(t.path) && !t.path.endsWith(".d.ts") && (t.size ?? 0) < 150_000)
    .slice(0, 250);
  const files = await pool(picked, 8, async (t) => {
    const blob = await gh<{ content: string; encoding: string }>(`/repos/${fullName}/git/blobs/${t.sha}`, token);
    return { path: t.path, content: Buffer.from(blob.content, "base64").toString("utf8") };
  });
  return {
    meta,
    branches: branches.map((b) => b.name),
    commits: commits.map((c) => ({ sha: c.sha.slice(0, 7), message: c.commit.message.split("\n")[0], author: c.commit.author?.name ?? "unknown", date: c.commit.author?.date ?? new Date().toISOString() })),
    files,
  };
}

export interface GhPull {
  number: number;
  title: string;
  body: string | null;
  user: { login: string };
  head: { ref: string; sha: string };
  base: { ref: string };
  state: string;
}

export async function fetchPullWithFiles(token: string | null, fullName: string, number: number) {
  const pr = await gh<GhPull>(`/repos/${fullName}/pulls/${number}`, token);
  const files = await gh<{ filename: string; status: string; previous_filename?: string }[]>(`/repos/${fullName}/pulls/${number}/files?per_page=100`, token);
  const out: { path: string; status: "added" | "modified" | "removed"; content: string | null }[] = [];
  const wanted = files.filter((f) => isAnalyzablePath(f.filename) || (f.previous_filename && isAnalyzablePath(f.previous_filename)));
  await pool(wanted, 6, async (f) => {
    if (f.status === "renamed" && f.previous_filename) out.push({ path: f.previous_filename, status: "removed", content: null });
    if (f.status === "removed") {
      out.push({ path: f.filename, status: "removed", content: null });
      return;
    }
    const content = await gh<string>(`/repos/${fullName}/contents/${encodeURI(f.filename)}?ref=${pr.head.sha}`, token, "application/vnd.github.raw");
    out.push({ path: f.filename, status: f.status === "added" ? "added" : "modified", content });
  });
  return { pr, files: out };
}

export async function listOpenPulls(token: string | null, fullName: string): Promise<GhPull[]> {
  return gh<GhPull[]>(`/repos/${fullName}/pulls?state=open&per_page=10`, token);
}

export async function postPrComment(token: string, fullName: string, number: number, body: string): Promise<string> {
  const r = await gh<{ html_url: string }>(`/repos/${fullName}/issues/${number}/comments`, token, "application/vnd.github+json", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body }),
  });
  return r.html_url;
}
