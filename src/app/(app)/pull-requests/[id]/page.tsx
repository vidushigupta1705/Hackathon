import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { pullRequests, repositories } from "@/db/schema";
import { ApiButton, PRCommentPanel } from "@/components/Actions";
import AnalysisView from "@/components/AnalysisView";
import { Badge, Card, PageHeader, relTime } from "@/components/ui";
import { buildPrComment } from "@/lib/analyzer/explain";
import type { PRAnalysis } from "@/lib/analyzer/types";
import { getComments, getFixStatuses } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function PRDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db
    .select({ pr: pullRequests, repo: repositories })
    .from(pullRequests)
    .innerJoin(repositories, eq(pullRequests.repoId, repositories.id))
    .where(eq(pullRequests.id, Number(id)));
  if (!row) notFound();
  const { pr, repo } = row;
  const analysis = pr.analysis as PRAnalysis | null;
  const [fixStatus, comments] = await Promise.all([getFixStatuses(pr.id), getComments(pr.id)]);
  const approved = Object.values(fixStatus).filter((s) => s === "approved").length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/pull-requests" className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint transition-colors hover:text-fg">
          ← all pull requests
        </Link>
        <div className="flex items-center gap-2">
          <ApiButton url={`/api/prs/${pr.id}`} body={{ action: "analyze" }} label="Re-analyze" busyLabel="Analysing…" variant="secondary" />
        </div>
      </div>

      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/repositories/${repo.id}`} className="text-signal/75 hover:text-signal">
              {repo.fullName}
            </Link>
            <span className="text-line-strong">/</span>
            <span>#{pr.number}</span>
            <span className="text-line-strong">/</span>
            <span>{relTime(pr.createdAt)}</span>
          </span>
        }
        title={pr.title}
        desc={pr.body || undefined}
      />

      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[10.5px] text-faint">
        <span className="text-muted">{pr.headBranch}</span>
        <span className="text-line-strong">→</span>
        <span className="text-muted">{pr.baseBranch}</span>
        <span className="text-line-strong">/</span>
        <span>@{pr.author}</span>
        {pr.analyzedAt && (
          <>
            <span className="text-line-strong">/</span>
            <span>analysed {relTime(pr.analyzedAt)}</span>
          </>
        )}
        <Badge tone={pr.status === "open" ? "ok" : "neutral"}>{pr.status}</Badge>
      </div>

      {!analysis ? (
        <Card className="px-5 py-10">
          <div className="eyebrow mb-2">not analysed</div>
          <div className="text-[12.5px] text-muted">This pull request has not been analysed yet. Run the analyzer to map its blast radius.</div>
        </Card>
      ) : (
        <div className="space-y-4">
          <AnalysisView analysis={analysis} prId={pr.id} fixStatus={fixStatus} />
          <PRCommentPanel
            prId={pr.id}
            provider={repo.provider}
            approved={approved}
            preview={buildPrComment({ repo: repo.fullName, number: pr.number, analysis, fixStatus })}
            comments={comments.map((c) => ({ id: c.id, body: c.body, postedTo: c.postedTo, url: c.url, createdAt: c.createdAt.toISOString() }))}
          />
        </div>
      )}
    </>
  );
}
