import { NextResponse } from "next/server";
import { loadBoard, mapQuarantine, rejectQuarantine } from "@/lib/quarantine";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await loadBoard());
}

/**
 * One-shot label. A judge either maps the input to a canonical entity or declares it out of
 * domain; both are stored as an alias and enter the live vector store before this responds.
 *
 *   POST /api/quarantine { "id": 12, "action": "map", "entityId": "function|3|src/billing.ts|chargeCustomer" }
 *   POST /api/quarantine { "id": 12, "action": "reject" }
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { id?: unknown; action?: unknown; entityId?: unknown }
    | null;
  if (!body) return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });

  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "`id` must be the numeric quarantine entry id." }, { status: 400 });
  }

  if (body.action === "reject") {
    const result = await rejectQuarantine(id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, action: "reject", learned: { raw: result.raw, key: result.key }, board: result.board });
  }

  if (body.action === "map") {
    if (typeof body.entityId !== "string" || !body.entityId) {
      return NextResponse.json({ error: "`entityId` is required when action is `map`." }, { status: 400 });
    }
    const result = await mapQuarantine(id, body.entityId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({
      ok: true,
      action: "map",
      entity: result.entity,
      learned: { raw: result.raw, key: result.key },
      board: result.board,
    });
  }

  return NextResponse.json({ error: "`action` must be `map` or `reject`." }, { status: 400 });
}
