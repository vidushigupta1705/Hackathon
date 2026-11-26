import { NextResponse } from "next/server";
import { EMBED_DIMS } from "@/lib/resolver/embed";
import { getFeed } from "@/lib/resolver/telemetry";
import { DEFAULT_THRESHOLDS, getThresholds, getThresholdsUpdatedAt, resetThresholds, setThresholds } from "@/lib/resolver/thresholds";

export const dynamic = "force-dynamic";

/**
 * The vector inspector's data source.
 *
 *   GET  /api/telemetry?limit=40   → recent decisions, each with its three nearest matches,
 *                                    raw cosine scores, embedding/retrieval milliseconds
 *                                    and the thresholds used.
 *   POST /api/telemetry { "auto": 0.7, "floor": 0.4 }   → live threshold update
 *   POST /api/telemetry { "reset": true }               → back to the defaults
 */
export async function GET(req: Request) {
  const limit = Number(new URL(req.url).searchParams.get("limit"));
  return NextResponse.json(
    {
      dims: EMBED_DIMS,
      thresholds: getThresholds(),
      defaults: DEFAULT_THRESHOLDS,
      updatedAt: getThresholdsUpdatedAt(),
      ...getFeed(Number.isFinite(limit) && limit > 0 ? limit : 40),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });

  if (body.reset === true) {
    return NextResponse.json({
      thresholds: resetThresholds(),
      defaults: DEFAULT_THRESHOLDS,
      dims: EMBED_DIMS,
      updatedAt: getThresholdsUpdatedAt(),
    });
  }

  const result = setThresholds(body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({
    thresholds: result.thresholds,
    defaults: DEFAULT_THRESHOLDS,
    dims: EMBED_DIMS,
    updatedAt: getThresholdsUpdatedAt(),
  });
}
