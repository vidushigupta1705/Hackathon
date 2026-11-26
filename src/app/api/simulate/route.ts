import { NextResponse } from "next/server";
import { buildAnalysis, simulate, type SimAction } from "@/lib/engine";
import { resolveInput } from "@/lib/quarantine";
import { kindsForAction } from "@/lib/resolver/resolve";
import { loadGraph } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * The simulator accepts any surface form, not just an exact key from the dropdown. Names go
 * through the embedding resolver first: a confident match is canonicalised and simulated, and
 * everything else is refused into the quarantine bucket with scored candidates.
 *
 *   { "repoId": 3, "query": "chargeCostumer", "action": { "type": "remove" } }
 *   { "repoId": 3, "action": { "type": "param_type", "symbol": "chargeCustomer", ... } }
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { repoId?: unknown; action?: Partial<SimAction> & Record<string, unknown>; query?: unknown }
    | null;
  if (!body) return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });

  const actionType = typeof body.action?.type === "string" ? body.action.type : "remove";
  const rawQuery =
    typeof body.action?.symbol === "string"
      ? body.action.symbol
      : typeof body.query === "string"
        ? body.query
        : "";
  if (!rawQuery.trim()) {
    return NextResponse.json({ error: "A symbol, endpoint or dependency name is required." }, { status: 400 });
  }

  const repoId = Number.isFinite(Number(body.repoId)) && Number(body.repoId) > 0 ? Number(body.repoId) : undefined;
  const kinds = kindsForAction(actionType);

  const resolution = await resolveInput(rawQuery, {
    repoId,
    kinds,
    persist: true,
    context: { action: actionType, source: "simulate" },
  });

  if (resolution.status === "refused" || !resolution.entity) {
    return NextResponse.json(
      {
        quarantined: true,
        quarantineId: resolution.quarantineId,
        resolution,
        hint: "Map this input once with POST /api/quarantine, then send the same request again.",
      },
      { status: 422 },
    );
  }

  const entity = resolution.entity;
  const action = {
    ...(body.action ?? {}),
    type: actionType,
    symbol: entity.symbol,
  } as SimAction;

  const { graph } = await loadGraph();
  const sim = simulate(graph, entity.repoId, action);
  if (sim.error) {
    return NextResponse.json({ error: sim.error, resolved: entity, resolution }, { status: 400 });
  }

  const analysis = await buildAnalysis(graph, entity.repoId, sim.changes, { llm: false, head: sim.head });
  return NextResponse.json({
    analysis,
    resolved: entity,
    resolution: {
      query: resolution.query,
      confidence: resolution.confidence,
      learned: resolution.learned,
      reason: resolution.reason,
    },
  });
}
