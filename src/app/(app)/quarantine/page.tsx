import Link from "next/link";
import QuarantineClient from "@/components/QuarantineClient";
import { Badge, PageHeader, btn } from "@/components/ui";
import { loadBoard } from "@/lib/quarantine";

export const dynamic = "force-dynamic";

export default async function QuarantinePage() {
  const board = await loadBoard();
  return (
    <>
      <PageHeader
        eyebrow="out-of-domain guard"
        title="Quarantine"
        desc="Names reach the pipeline from pull requests, the simulator and live judge input. Each surface form is embedded before routing: if nothing clears the similarity floor, or the winner is too close to call, the input stops here. A single label teaches the store for every later request."
        actions={
          <>
            <Badge tone="accent">{board.dims}-d · local embeddings</Badge>
            <Link href="/simulate" className={btn.secondary}>
              Try an input
            </Link>
          </>
        }
      />
      <QuarantineClient initial={board} />
    </>
  );
}
