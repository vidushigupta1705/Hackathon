import { NextResponse } from "next/server";
import { resolveInput } from "@/lib/quarantine";
import { kindsForAction } from "@/lib/resolver/resolve";

export const dynamic = "force-dynamic";

/**
 * Route an arbitrary surface form onto a graph entity.
 *
 *   POST /api/resolve { "query": "charg_costumer", "repoId": 3 }
 *
 * 200 → resolved, with the canonical entity and the score that earned it.
 * 422 → refused. `bucket` says why (out_of_domain | low_confidence | ambiguous) and
 *       `quarantineId` can be handed to POST /api/quarantine to label it once.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { query?: unknown; repoId?: unknown; action?: unknown; persist?: unknown }
    | null;
  if (!body || typeof body.query !== "string") {
    return NextResponse.json({ error: "`query` must be a string." }, { status: 400 });
  }

  const repoId = Number.isFinite(Number(body.repoId)) && Number(body.repoId) > 0 ? Number(body.repoId) : undefined;
  const action = typeof body.action === "string" ? body.action : undefined;
  const kinds = action ? kindsForAction(action) : undefined;

  const resolution = await resolveInput(body.query, {
    repoId,
    kinds,
    persist: body.persist !== false,
    context: { source: "resolve", action: action ?? null },
  });

  return NextResponse.json(
    { ...resolution, quarantined: resolution.status === "refused" },
    { status: resolution.status === "refused" ? 422 : 200 },
  );
}
